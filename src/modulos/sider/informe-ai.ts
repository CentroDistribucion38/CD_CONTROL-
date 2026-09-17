import { createClient } from "@/lib/supabase/server";
import type { Revision } from "./ai";

/**
 * SIDER · AI — EL INFORME.
 *
 * QUÉ CONTESTA. Cuánto se le está cobrando a los socios, POR QUÉ, y a
 * quién hay que llamar. Nada más. El Excel traía cincuenta y ocho
 * columnas por fila y ninguna pantalla que dijera eso.
 *
 * NADA SE RECALCULA AQUÍ. El índice, el no-abono y los hectolitros los
 * hace `v_sider_ai` con las nueve categorías que cobran. Esta capa
 * AGRUPA: por semana, por defecto, por socio, por envase. Si volviera a
 * dividir defectos entre revisadas, bastaría un redondeo distinto para
 * que el informe y la orden de cobro dijeran cifras diferentes del mismo
 * día — que es exactamente la enfermedad que tenía el archivo, con dos
 * columnas de «total defectos» que no coincidían en 252 de 296 filas.
 */

export type FiltroAi = {
  desde?: string; hasta?: string;
  socio?: string; envase?: string; canal?: string;
};

export type PorDefecto = {
  clave: string; nombre: string; cobra: boolean; orden: number | null;
  unidades: number; hl: number;
  /** Sobre el total revisado del período, que es como se lee un %. */
  pct: number;
};

export type PorSocio = {
  clave: string; nombre: string;
  revisiones: number; recibidas: number; revisadas: number;
  defectos: number; no_abono: number; hl: number; indice: number;
};

export type PorSemana = {
  /** El lunes de esa semana, para ordenar y rotular. */
  semana: string;
  revisiones: number; revisadas: number; defectos: number; indice: number;
};

const sinTablas = (m: string) =>
  m.includes("does not exist") || m.includes("schema cache") || m.includes("sider_ai_");

/* El lunes de la semana de una fecha. Se agrupa por semana y no por día
   —hay días con una sola revisión, y un índice de una muestra sube y
   baja por azar— ni por mes, que a cuatro meses daría cuatro puntos. */
function lunes(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;      // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * TODO EL INFORME, DE UNA CONSULTA Y MEDIA.
 *
 * Se traen las revisiones del rango y sus conteos, y se agrupa en
 * memoria. Cuatro meses de Barranquilla son 285 revisiones y unos dos
 * mil conteos: cabe de sobra, y traerlo entero es lo que permite que los
 * filtros de la pantalla respondan sin volver al servidor.
 *
 * EL TOPE VA ESCRITO. PostgREST contesta 1.000 filas por defecto y no
 * avisa; el día que el histórico pase de ahí, esto empezaría a mentir en
 * silencio. Con el límite puesto, si alguna vez vuelve exactamente el
 * número del límite, se sabe dónde mirar.
 */
export async function informeAi(f: FiltroAi = {}) {
  const supabase = await createClient();

  let q = supabase.from("v_sider_ai").select("*").order("fecha", { ascending: false }).limit(5000);
  if (f.desde)  q = q.gte("fecha", f.desde);
  if (f.hasta)  q = q.lte("fecha", f.hasta);
  if (f.socio)  q = q.eq("socio", f.socio);
  if (f.envase) q = q.eq("envase", f.envase);
  if (f.canal)  q = q.eq("canal", f.canal);

  const { data: rev, error } = await q;
  if (error) {
    return {
      falta: sinTablas(error.message),
      revisiones: [] as Revision[], defectos: [] as PorDefecto[],
      socios: [] as PorSocio[], semanas: [] as PorSemana[],
      total: vacio(),
    };
  }

  const revisiones = (rev ?? []) as Revision[];
  if (revisiones.length === 0) {
    return {
      falta: false, revisiones, defectos: [] as PorDefecto[],
      socios: [] as PorSocio[], semanas: [] as PorSemana[], total: vacio(),
    };
  }

  /* El detalle de ESAS revisiones. El `in` va con los ids ya filtrados:
     pedir todo y filtrar aquí sería traer el histórico entero para
     mostrar una semana. */
  const [{ data: det }, { data: defs }] = await Promise.all([
    supabase.from("v_sider_ai_detalle").select("*")
      .in("revision_id", revisiones.map((r) => r.id)).limit(20000),
    supabase.from("sider_ai_defectos").select("*").order("orden"),
  ]);

  /* ---------- EL TOTAL DEL PERÍODO ----------
     EL ÍNDICE DEL PERÍODO NO ES EL PROMEDIO DE LOS ÍNDICES. Es la suma
     de defectos sobre la suma de revisadas. Promediar porcentajes le da
     el mismo peso a una revisión de 200 botellas que a una de 4.104, y
     una sola muestra chica con un defecto mueve el número del mes. */
  const total = {
    revisiones: revisiones.length,
    recibidas: revisiones.reduce((a, r) => a + r.recibidas, 0),
    revisadas: revisiones.reduce((a, r) => a + r.revisadas, 0),
    defectos:  revisiones.reduce((a, r) => a + r.defectos, 0),
    otros:     revisiones.reduce((a, r) => a + r.otros, 0),
    no_abono:  revisiones.reduce((a, r) => a + r.no_abono, 0),
    hl:        revisiones.reduce((a, r) => a + Number(r.hl_defectos), 0),
    socios:    new Set(revisiones.map((r) => r.socio).filter(Boolean)).size,
    importadas: revisiones.filter((r) => (r as Revision & { origen?: string }).origen === "importado").length,
    indice: 0,
  };
  total.indice = total.revisadas > 0 ? total.defectos / total.revisadas : 0;

  /* ---------- POR DEFECTO ----------
     Los catorce, cobren o no. Los que no cobran se muestran aparte y
     rotulados: son botellas de verdad que alguien contó, y esconderlas
     haría que la suma de la pantalla no diera el total contado. */
  const mapaDef = new Map((defs ?? []).map((d) => [d.clave as string, d]));
  const acum = new Map<string, { unidades: number; hl: number }>();
  for (const d of det ?? []) {
    const x = acum.get(d.defecto) ?? { unidades: 0, hl: 0 };
    x.unidades += d.unidades;
    x.hl += Number(d.hl);
    acum.set(d.defecto, x);
  }
  const defectos: PorDefecto[] = [...acum.entries()].map(([clave, x]) => {
    const d = mapaDef.get(clave);
    return {
      clave,
      nombre: (d?.nombre as string) ?? clave,
      cobra: (d?.cobra as boolean) ?? false,
      orden: (d?.orden as number) ?? null,
      unidades: x.unidades,
      hl: x.hl,
      pct: total.revisadas > 0 ? x.unidades / total.revisadas : 0,
    };
  }).sort((a, b) => b.unidades - a.unidades);

  /* ---------- POR SOCIO ---------- */
  const porSocio = new Map<string, PorSocio>();
  for (const r of revisiones) {
    const k = r.socio ?? "—";
    const x = porSocio.get(k) ?? {
      clave: k, nombre: r.socio_nombre ?? "Sin socio",
      revisiones: 0, recibidas: 0, revisadas: 0, defectos: 0, no_abono: 0, hl: 0, indice: 0,
    };
    x.revisiones += 1;
    x.recibidas += r.recibidas;
    x.revisadas += r.revisadas;
    x.defectos += r.defectos;
    x.no_abono += r.no_abono;
    x.hl += Number(r.hl_defectos);
    porSocio.set(k, x);
  }
  const socios = [...porSocio.values()].map((x) => ({
    ...x, indice: x.revisadas > 0 ? x.defectos / x.revisadas : 0,
  })).sort((a, b) => b.no_abono - a.no_abono);

  /* ---------- POR SEMANA ----------
     En orden CRONOLÓGICO aunque la tabla venga al revés: una tendencia
     dibujada de derecha a izquierda se lee al revés sin que nadie lo
     note. */
  const porSemana = new Map<string, PorSemana>();
  for (const r of revisiones) {
    const k = lunes(r.fecha);
    const x = porSemana.get(k) ?? { semana: k, revisiones: 0, revisadas: 0, defectos: 0, indice: 0 };
    x.revisiones += 1;
    x.revisadas += r.revisadas;
    x.defectos += r.defectos;
    porSemana.set(k, x);
  }
  const semanas = [...porSemana.values()]
    .map((x) => ({ ...x, indice: x.revisadas > 0 ? x.defectos / x.revisadas : 0 }))
    .sort((a, b) => a.semana.localeCompare(b.semana));

  return { falta: false, revisiones, defectos, socios, semanas, total };
}

function vacio() {
  return {
    revisiones: 0, recibidas: 0, revisadas: 0, defectos: 0, otros: 0,
    no_abono: 0, hl: 0, socios: 0, importadas: 0, indice: 0,
  };
}

/** Lo que llena los filtros. Sale de lo que HAY, no de un maestro: un
 *  socio del maestro sin revisiones en el rango solo estorba en la
 *  lista. */
export async function opcionesAi() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_sider_ai")
    .select("socio, socio_nombre, envase, envase_nombre, canal, canal_nombre, fecha")
    .limit(5000);
  const filas = data ?? [];
  const uno = <T extends string>(k: T, n: T) => {
    const m = new Map<string, string>();
    for (const f of filas as Record<string, string | null>[]) {
      if (f[k]) m.set(f[k] as string, (f[n] as string) ?? (f[k] as string));
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  };
  const fechas = filas.map((f) => (f as { fecha: string }).fecha).sort();
  return {
    socios: uno("socio", "socio_nombre"),
    envases: uno("envase", "envase_nombre"),
    canales: uno("canal", "canal_nombre"),
    primera: fechas[0] ?? null,
    ultima: fechas[fechas.length - 1] ?? null,
  };
}
