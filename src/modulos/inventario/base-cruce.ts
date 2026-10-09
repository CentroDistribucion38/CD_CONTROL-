import type { Renglon, ConteoFefo } from "./fefo";

/* ===================================================================
   LA BASE, CRUZADA

   Se escogen varios recorridos (los chips de arriba) y lo que se ve es UNA
   base. Es la misma regla del tablero (`medirRiesgo`) y del Excel
   consolidado — tres sitios que dicen cosas distintas del mismo inventario
   serían peor que ninguno.

   LA REGLA, POR UBICACIÓN Y ZONA:
     · Si la MISMA PERSONA vuelve a contar esa ubicación, su conteo nuevo
       REEMPLAZA al suyo anterior (está corrigiendo). Se dice qué reemplazó a
       qué: «Reemplazó a -01 (9:12)» y «antes 216».
     · Si la cuentan PERSONAS DISTINTAS, SE SUMAN y se ven los dos renglones,
       cada uno con su nombre: «un usuario agregó 6 y otro 40; no me debe
       borrar el anterior, se suman pero se ven los dos registros».
   La persona es quien ENVIÓ el recorrido (si no, el responsable).
   «Último» se mide por cuándo se ENVIÓ el recorrido (si no, por su fecha).

   La ZONA es la «condición del envase» que se anota al contar (RETORNO,
   BAJA, LAVADO…): volver a contar C02_DER con producto NO borra las 60 cajas
   sueltas que se contaron en «C02_DER RETORNO».
   =================================================================== */
export type Vigente = Renglon & {
  /** El recorrido más reciente DE LA MISMA PERSONA que este dejó sin valor en esa ubicación; null si nadie. */
  reemplaza: { conteoId: string; conteo: string; cuando: string | null } | null;
  /** Cajas que decía el recorrido reemplazado de ese mismo material en ese sitio; null si no había o no cambió. */
  antes: number | null;
  /** Las OTRAS personas que también contaron esta ubicación y zona y que se suman con esta; vacío si nadie. */
  con?: string[];
};

export type Cruce = {
  /** Lo que vale: de cada ubicación, el recorrido más reciente DE CADA PERSONA (se suman entre personas). */
  vigentes: Vigente[];
  /** Lo que quedó sin valor porque la misma persona lo volvió a contar. */
  reemplazados: Renglon[];
  /** Cuántas ubicaciones se volvieron a contar (por la misma persona). */
  repetidas: number;
  /** Cuántas ubicaciones contaron dos o más personas (y por eso se suman). */
  compartidas: number;
  /** Por recorrido: en cuántas ubicaciones es el que vale habiendo reemplazado a otro, y a cuáles. */
  actualiza: Map<string, { ubicaciones: number; de: string[] }>;
};

const clave = (l: Renglon) => `${l.ubicacion_id ?? l.ubicacion ?? "—"}|${l.estado_envase ?? ""}`;
const num = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0 };

export function cruzar(lineas: Renglon[], conteos: ConteoFefo[]): Cruce {
  const cuando = new Map(conteos.map((c) => [c.id, c.enviado_en ?? c.fecha_analisis ?? ""]));
  const codigo = new Map(conteos.map((c) => [c.id, c.codigo]));
  /* QUIÉN: el mismo nombre que la pantalla usa en el filtro «Envió». Sin nombre, cada recorrido es
     «alguien distinto» (se suma): perder un conteo es peor que verlo dos veces y poder quitarlo. */
  const persona = new Map(conteos.map((c) => [c.id, (c.envio_nombre ?? c.responsable ?? "").trim() || `#${c.id}`]));
  const cuandoDe = (id: string) => cuando.get(id) ?? "";
  const quienDe = (id: string) => persona.get(id) ?? `#${id}`;

  /* Por ubicación: qué recorridos pasaron y con qué renglones. */
  const porSitio = new Map<string, Map<string, Renglon[]>>();
  for (const l of lineas) {
    const k = clave(l);
    const m = porSitio.get(k) ?? porSitio.set(k, new Map()).get(k)!;
    (m.get(l.conteo_id) ?? m.set(l.conteo_id, []).get(l.conteo_id)!).push(l);
  }

  const vigentes: Vigente[] = [];
  const reemplazados: Renglon[] = [];
  const actualiza = new Map<string, { ubicaciones: number; de: string[] }>();
  let repetidas = 0, compartidas = 0;

  for (const grupo of porSitio.values()) {
    /* Los recorridos de esta ubicación, del más nuevo al más viejo (a igualdad, el de código más alto). */
    const ids = [...grupo.keys()].sort((a, b) =>
      cuandoDe(b).localeCompare(cuandoDe(a)) || (codigo.get(b) ?? "").localeCompare(codigo.get(a) ?? "", "es", { numeric: true }));

    /* Y SEPARADOS POR PERSONA: de cada una vale su recorrido más nuevo. */
    const porPersona = new Map<string, string[]>();
    for (const id of ids) (porPersona.get(quienDe(id)) ?? porPersona.set(quienDe(id), []).get(quienDe(id))!).push(id);
    const personas = [...porPersona.keys()];
    if (personas.length > 1) compartidas += 1;
    let hubo = false;

    for (const [quien, suyos] of porPersona) {
      const gana = suyos[0];
      const otros = suyos.slice(1);
      for (const id of otros) reemplazados.push(...grupo.get(id)!);
      const previo = otros[0] ?? null;
      if (previo) {
        hubo = true;
        const a = actualiza.get(gana) ?? actualiza.set(gana, { ubicaciones: 0, de: [] }).get(gana)!;
        a.ubicaciones += 1;
        for (const o of otros) { const c = codigo.get(o); if (c && !a.de.includes(c)) a.de.push(c) }
      }
      const deAntes = previo ? grupo.get(previo)! : [];
      const con = personas.filter((p) => p !== quien).map((p) => (p.startsWith("#") ? "otro recorrido sin nombre" : p));
      for (const l of grupo.get(gana)!) {
        const eran = deAntes.filter((x) => x.codigo === l.codigo);
        const antes = eran.length ? eran.reduce((s, x) => s + num(x.total_cajas), 0) : null;
        vigentes.push({
          ...l,
          reemplaza: previo ? { conteoId: previo, conteo: codigo.get(previo) ?? "", cuando: cuando.get(previo) || null } : null,
          antes: antes != null && antes !== num(l.total_cajas) ? antes : null,
          con,
        });
      }
    }
    if (hubo) repetidas += 1;
  }
  return { vigentes, reemplazados, repetidas, compartidas, actualiza };
}

/** «-03» de «FEFO-20261001-03»: lo que cabe en un chip. */
export const sufijoRecorrido = (codigo: string): string => {
  const m = /-(\d+)$/.exec(codigo);
  return m ? `-${m[1]}` : codigo;
};
