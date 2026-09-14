import { createClient } from "@/lib/supabase/server";

/**
 * ROTURA DE LÍNEA — lo que la pantalla necesita saber.
 *
 * Todo lo que se lee aquí sale de las vistas del módulo, nunca de las
 * tablas en crudo: las vistas ya traen los nombres puestos y ya
 * resolvieron el cruce con la producción. Si cada pantalla hiciera su
 * propio join, bastaría que una se olvidara del filtro de la baja para
 * que dos informes del mismo día dieran cifras distintas.
 */

export type Linea   = { linea: number; tren: string; centro_coste: string; activo: boolean };
export type Maquina = { item: number; nombre: string; activo: boolean; orden: number | null };
export type Envase  = {
  material: string; descripcion: string; peso_kg: number;
  activo: boolean; orden: number | null;
};

/** Una pesada ya guardada, resumida. */
export type Pesada = {
  linea: number; turno: number; envase: string; envase_nombre: string;
  toma: number; maquinas: number; kg: number; und: number;
  baja: boolean;
};

/** Cuántos kilos lleva cada máquina en ese turno, para pintar la rejilla. */
export type PorMaquina = { maquina: number; kg: number; und: number };

const sinTablas = (m: string) =>
  m.includes("does not exist") || m.includes("schema cache") || m.includes("rotlinea_");

/** Las tres listas que la pantalla necesita para poder escoger. */
export async function maestros() {
  const supabase = await createClient();
  const [l, m, e] = await Promise.all([
    supabase.from("rotlinea_lineas").select("*").order("orden", { nullsFirst: false }),
    supabase.from("rotlinea_maquinas").select("*").order("orden", { nullsFirst: false }),
    supabase.from("rotlinea_envases").select("*").order("orden", { nullsFirst: false }),
  ]);
  if (l.error) return { falta: sinTablas(l.error.message), lineas: [] as Linea[],
                        maquinas: [] as Maquina[], envases: [] as Envase[] };
  return {
    falta: false,
    lineas: (l.data ?? []) as Linea[],
    maquinas: (m.data ?? []) as Maquina[],
    envases: (e.data ?? []) as Envase[],
  };
}

/**
 * LO QUE YA LLEVA EL DÍA, agrupado por (línea, turno, envase, pesada).
 *
 * SE AGRUPA AQUÍ Y NO EN LA BASE porque son las filas de un día —unas
 * cuantas docenas— y agruparlas en el servidor obligaría a una vista
 * más, o a una consulta por cada combinación. Con un mes sería otra
 * historia; con un día, traer el detalle y sumarlo aquí es una sola ida.
 */
export async function delDia(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_rotlinea")
    .select("linea, turno, envase, envase_nombre, toma, maquina, kg, und, baja")
    .eq("fecha", fecha);
  if (error) return { falta: sinTablas(error.message), pesadas: [] as Pesada[], filas: [] };

  type F = {
    linea: number; turno: number; envase: string; envase_nombre: string;
    toma: number; maquina: number; kg: number; und: number; baja: boolean;
  };
  const filas = (data ?? []) as F[];

  const mapa = new Map<string, Pesada>();
  for (const f of filas) {
    const k = `${f.linea}|${f.turno}|${f.envase}|${f.toma}`;
    const p = mapa.get(k) ?? {
      linea: f.linea, turno: f.turno, envase: f.envase, envase_nombre: f.envase_nombre,
      toma: f.toma, maquinas: 0, kg: 0, und: 0, baja: true,
    };
    p.maquinas += 1;
    p.kg += Number(f.kg);
    p.und += Number(f.und);
    /* La pesada está dada de baja solo si TODAS sus filas lo están. A
       medias no es "dada de baja": es un pendiente que se ve entero. */
    p.baja = p.baja && f.baja;
    mapa.set(k, p);
  }
  const pesadas = [...mapa.values()].sort(
    (a, b) => a.linea - b.linea || a.turno - b.turno ||
              a.envase.localeCompare(b.envase) || a.toma - b.toma);

  return { falta: false, pesadas, filas };
}
