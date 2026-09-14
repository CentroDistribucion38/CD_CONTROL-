import { createClient } from "@/lib/supabase/server";

/**
 * LO QUE LEE EL MÓDULO DE TRASPASOS.
 *
 * Los viajes entre puntos: lo que se planea mover en un turno y lo que
 * de verdad se movió.
 *
 * EL CUMPLIDO NO SE LEE DE NINGÚN CAMPO: lo cuenta la vista
 * v_traspasos_seguimiento sobre los viajes registrados. Por eso aquí no
 * hay —ni puede haber— una función que "guarde el cumplido": si la
 * hubiera, volvería el problema del que salimos, dos números que hablan
 * de lo mismo y pueden contradecirse.
 *
 * `falta: true` significa que todavía no se corrió traspasos.sql. Se
 * devuelve en vez de reventar para que la pantalla pueda decir qué
 * hacer en vez de mostrar un error de Postgres.
 */

export type TipoViaje = {
  clave: string; nombre: string; activo: boolean; orden: number | null;
};

export type Punto = {
  clave: string; nombre: string; externo: boolean;
  activo: boolean; orden: number | null;
};

export type Viaje = {
  id: string;
  codigo: string | null;
  fecha: string;
  turno: number;
  tipo: string;
  tipo_nombre: string;
  placa: string;
  origen: string | null;
  origen_nombre: string | null;
  destino: string | null;
  destino_nombre: string | null;
  /** El punto todavía no está en el maestro: se escribió a mano. */
  origen_suelto: boolean;
  destino_suelto: boolean;
  cantidad: number;
  vacio: boolean;
  unidad: string | null;
  nota: string | null;
  hora: string;
  registrado_por: string | null;
  registrado_en: string;
  estado: "registrado" | "anulado";
  vale: boolean;
  motivo_anulacion: string | null;
  anulado_en: string | null;
  anulado_por: string | null;
};

export type Seguimiento = {
  fecha: string;
  turno: number;
  tipo: string;
  tipo_nombre: string;
  tipo_orden: number | null;
  plan_id: string | null;
  planeado: number;
  vacios_planeados: number;
  es_adicional: boolean;
  nota: string | null;
  /** Contado sobre los viajes registrados. Nadie lo escribe. */
  cumplido: number;
  vacios_hechos: number;
  cantidad: number;
  placas: number;
  faltan: number;
  de_mas: number;
  /** Se movió y nadie lo había planeado. */
  sin_planear: boolean;
  pct: number | null;
};

export type PuntoFaltante = { texto: string; veces: number; ultima: string };

function sinTablas(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache");
}

/** Hoy en hora de Colombia. El servidor está en UTC: sin esto, después
 *  de las 7 p. m. la pantalla propondría la fecha de mañana. */
export function hoyLocal() {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}

export async function tipos(soloActivos = true) {
  const supabase = await createClient();
  let q = supabase.from("traspasos_tipos").select("clave, nombre, activo, orden");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q.order("orden", { ascending: true, nullsFirst: false });
  if (error) return { tipos: [] as TipoViaje[], falta: sinTablas(error.message) };
  return { tipos: (data ?? []) as TipoViaje[], falta: false };
}

export async function puntos(soloActivos = true) {
  const supabase = await createClient();
  let q = supabase.from("traspasos_puntos")
    .select("clave, nombre, externo, activo, orden");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Punto[];
}

/**
 * Los viajes de un día. Se pide POR FECHA y no las últimas N: la
 * pregunta de esta pantalla es siempre "qué se movió hoy", y traer las
 * últimas 500 sin filtro obligaría a bajar semanas de viajes para
 * mostrar un turno.
 */
export async function viajesDelDia(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_viajes").select("*")
    .eq("fecha", fecha)
    .order("hora", { ascending: false });
  if (error) return { viajes: [] as Viaje[], falta: sinTablas(error.message) };
  return { viajes: (data ?? []) as Viaje[], falta: false };
}

/** El plan contra lo real, de un día. Es la pantalla del turno. */
export async function seguimiento(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_seguimiento").select("*")
    .eq("fecha", fecha)
    .order("turno", { ascending: true })
    .order("tipo_orden", { ascending: true, nullsFirst: false });
  if (error) return { filas: [] as Seguimiento[], falta: sinTablas(error.message) };
  return { filas: (data ?? []) as Seguimiento[], falta: false };
}

/** Un rango, para el análisis. Mismo criterio: se filtra en la base. */
export async function seguimientoRango(desde: string, hasta: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_seguimiento").select("*")
    .gte("fecha", desde).lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("turno", { ascending: true })
    .order("tipo_orden", { ascending: true, nullsFirst: false });
  if (error) return { filas: [] as Seguimiento[], falta: sinTablas(error.message) };
  return { filas: (data ?? []) as Seguimiento[], falta: false };
}

/**
 * LOS PUNTOS QUE SE ESCRIBIERON A MANO PORQUE NO ESTABAN EN LA LISTA.
 *
 * Es lo que convierte el texto suelto en maestro: lo que alguien
 * escribió nueve veces esta semana es un punto real que hay que
 * agregar. Sin esta lista, el "se puede escribir otro" sería una
 * puerta por la que el maestro se vacía solo.
 */
export async function puntosFaltantes() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_traspasos_puntos_faltantes").select("texto, veces, ultima");
  return (data ?? []) as PuntoFaltante[];
}

/** Cuántas veces se usó cada clave del maestro. Decide si se puede
 *  borrar o solo desactivar. La cuenta la hace la base. */
export async function usoDelMaestro() {
  const supabase = await createClient();
  const [t, po, pd] = await Promise.all([
    supabase.from("traspasos_viajes").select("tipo"),
    supabase.from("traspasos_viajes").select("origen"),
    supabase.from("traspasos_viajes").select("destino"),
  ]);
  const tipos: Record<string, number> = {};
  const pts: Record<string, number> = {};
  for (const f of (t.data ?? []) as { tipo: string }[]) {
    tipos[f.tipo] = (tipos[f.tipo] ?? 0) + 1;
  }
  for (const f of (po.data ?? []) as { origen: string | null }[]) {
    if (f.origen) pts[f.origen] = (pts[f.origen] ?? 0) + 1;
  }
  for (const f of (pd.data ?? []) as { destino: string | null }[]) {
    if (f.destino) pts[f.destino] = (pts[f.destino] ?? 0) + 1;
  }
  return { tipos, puntos: pts };
}
