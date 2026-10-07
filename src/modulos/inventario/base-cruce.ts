import type { Renglon, ConteoFefo } from "./fefo";

/* ===================================================================
   LA BASE, CRUZADA

   Se escogen varios recorridos (los chips de arriba) y lo que se ve es UNA
   base, no la suma: si una ubicación se contó en dos recorridos, VALE EL
   ÚLTIMO que pasó por ella. Es la misma regla del tablero (`medirRiesgo`) y
   del Excel consolidado — tres sitios que dicen cosas distintas del mismo
   inventario serían peor que ninguno — pero aquí además se dice qué reemplazó
   a qué: «Reemplazó a -01 (9:12)» y «antes 216».

   «Último» se mide por cuándo se ENVIÓ el recorrido (si no, por su fecha).
   SE REEMPLAZA POR UBICACIÓN Y ZONA. Una ubicación tiene su sitio y, a veces,
   una zona dentro de él: la pila de envase en RETORNO, en BAJA, en LAVADO… (la
   «condición del envase» que se anota al contar). Son cosas distintas que
   conviven en el mismo módulo: volver a contar C02_DER con producto NO borra
   las 60 cajas sueltas que otro recorrido contó en «C02_DER RETORNO». Dentro de
   la misma ubicación y la misma zona sí se reemplaza ENTERA: el recorrido más
   nuevo manda, tenga o no el mismo material.
   =================================================================== */
export type Vigente = Renglon & {
  /** El recorrido más reciente de los que ESTE dejó sin valor en esa ubicación; null si nadie. */
  reemplaza: { conteoId: string; conteo: string; cuando: string | null } | null;
  /** Cajas que decía el recorrido reemplazado de ese mismo material en ese sitio; null si no había o no cambió. */
  antes: number | null;
};

export type Cruce = {
  /** Lo que vale: de cada ubicación, los renglones del recorrido más reciente. */
  vigentes: Vigente[];
  /** Lo que quedó sin valor por haberse vuelto a contar. */
  reemplazados: Renglon[];
  /** Cuántas ubicaciones se contaron en más de un recorrido. */
  repetidas: number;
  /** Por recorrido: en cuántas ubicaciones es el que vale habiendo reemplazado a otro, y a cuáles. */
  actualiza: Map<string, { ubicaciones: number; de: string[] }>;
};

const clave = (l: Renglon) => `${l.ubicacion_id ?? l.ubicacion ?? "—"}|${l.estado_envase ?? ""}`;
const num = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0 };

export function cruzar(lineas: Renglon[], conteos: ConteoFefo[]): Cruce {
  const cuando = new Map(conteos.map((c) => [c.id, c.enviado_en ?? c.fecha_analisis ?? ""]));
  const codigo = new Map(conteos.map((c) => [c.id, c.codigo]));
  const cuandoDe = (id: string) => cuando.get(id) ?? "";

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
  let repetidas = 0;

  for (const grupo of porSitio.values()) {
    /* El que vale: el de mayor «cuándo». A igualdad, el de código más alto, para que no dependa del orden de llegada. */
    const ids = [...grupo.keys()].sort((a, b) =>
      cuandoDe(b).localeCompare(cuandoDe(a)) || (codigo.get(b) ?? "").localeCompare(codigo.get(a) ?? "", "es", { numeric: true }));
    const gana = ids[0];
    const otros = ids.slice(1);
    for (const id of otros) reemplazados.push(...grupo.get(id)!);

    /* El más reciente de los reemplazados es «a quien reemplazó». */
    const previo = otros[0] ?? null;
    if (previo) {
      repetidas += 1;
      const a = actualiza.get(gana) ?? actualiza.set(gana, { ubicaciones: 0, de: [] }).get(gana)!;
      a.ubicaciones += 1;
      for (const o of otros) { const c = codigo.get(o); if (c && !a.de.includes(c)) a.de.push(c) }
    }
    const deAntes = previo ? grupo.get(previo)! : [];
    for (const l of grupo.get(gana)!) {
      const eran = deAntes.filter((x) => x.codigo === l.codigo);
      const antes = eran.length ? eran.reduce((s, x) => s + num(x.total_cajas), 0) : null;
      vigentes.push({
        ...l,
        reemplaza: previo ? { conteoId: previo, conteo: codigo.get(previo) ?? "", cuando: cuando.get(previo) || null } : null,
        antes: antes != null && antes !== num(l.total_cajas) ? antes : null,
      });
    }
  }
  return { vigentes, reemplazados, repetidas, actualiza };
}

/** «-03» de «FEFO-20261001-03»: lo que cabe en un chip. */
export const sufijoRecorrido = (codigo: string): string => {
  const m = /-(\d+)$/.exec(codigo);
  return m ? `-${m[1]}` : codigo;
};
