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

export type Linea   = {
  linea: number; tren: string; centro_coste: string;
  activo: boolean; orden: number | null;
};
export type Maquina = { item: number; nombre: string; activo: boolean; orden: number | null };
export type Envase  = {
  material: string; descripcion: string; peso_kg: number;
  activo: boolean; orden: number | null;
};

export type Sku = {
  sku: string; descripcion: string; corto: string | null; envase: string;
  activo: boolean; orden: number | null;
};

/** Cuánto se usa cada cosa del maestro. Sale de v_rotlinea_uso. */
export type Uso = {
  clase: "envase" | "maquina" | "linea" | "sku";
  clave: string; registros: number; unidades: number; ultima: string;
};

/** Una firma de turno, con lo que dice la tabla hoy al lado. */
export type Firma = {
  fecha: string; linea: number; turno: number;
  firmado_por: string | null; firmado_nombre: string | null; firmado_usuario: string | null;
  firmado_en: string; nota: string | null;
  firmadas: number; kg_firmados: number; pesadas: number;
  unidades_hoy: number; kg_hoy: number; cambio_despues: boolean;
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

/**
 * LAS CUATRO LISTAS del maestro, y opcionalmente cuánto se usa cada una.
 *
 * El uso NO se pide siempre: la pantalla de registrar no lo necesita y
 * es un recorrido sobre los 24.000 registros. Solo la del maestro lo
 * pide, que es donde hace falta para poder decir «esto no se puede
 * borrar porque lo nombran 1.865 registros».
 */
export async function maestros({ conUso = false } = {}) {
  const supabase = await createClient();
  const [l, m, e, s, u] = await Promise.all([
    supabase.from("rotlinea_lineas").select("*").order("orden", { nullsFirst: false }),
    supabase.from("rotlinea_maquinas").select("*").order("orden", { nullsFirst: false }),
    supabase.from("rotlinea_envases").select("*").order("orden", { nullsFirst: false }),
    supabase.from("rotlinea_skus").select("*").order("orden", { nullsFirst: false }),
    conUso ? supabase.from("v_rotlinea_uso").select("*")
           : Promise.resolve({ data: [], error: null }),
  ]);
  const vacio = {
    lineas: [] as Linea[], maquinas: [] as Maquina[],
    envases: [] as Envase[], skus: [] as Sku[], uso: [] as Uso[],
  };
  if (l.error) return { falta: sinTablas(l.error.message), ...vacio };
  return {
    falta: false,
    lineas: (l.data ?? []) as Linea[],
    maquinas: (m.data ?? []) as Maquina[],
    envases: (e.data ?? []) as Envase[],
    skus: (s.data ?? []) as Sku[],
    /* Si la vista del uso todavía no existe —falta correr su migración—
       la pantalla sale igual, solo que sin los conteos: media pantalla
       es mejor que una pantalla en blanco. */
    uso: (u.error ? [] : (u.data ?? [])) as Uso[],
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
  const [{ data, error }, fir] = await Promise.all([
    supabase.from("v_rotlinea")
      .select("linea, turno, envase, envase_nombre, toma, maquina, kg, und, baja")
      .eq("fecha", fecha),
    supabase.from("v_rotlinea_firmas").select("*").eq("fecha", fecha),
  ]);
  if (error) return { falta: sinTablas(error.message), pesadas: [] as Pesada[],
                      firmas: [] as Firma[], filas: [] };

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

  /* Si la tabla de firmas todavía no existe —falta correr su
     migración— la pantalla sale igual, solo que sin firmas. Media
     pantalla es mejor que una pantalla en blanco. */
  return { falta: false, pesadas, filas, firmas: (fir.error ? [] : (fir.data ?? [])) as Firma[] };
}
