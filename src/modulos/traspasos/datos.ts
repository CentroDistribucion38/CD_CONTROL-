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
  turno: string;
  turno_orden: number;
  tipo: string | null;
  tipo_nombre: string | null;
  placa: string | null;
  origen: string | null;
  origen_nombre: string | null;
  destino: string | null;
  destino_nombre: string | null;
  /** El punto todavía no está en el maestro: se escribió a mano. */
  origen_suelto: boolean;
  destino_suelto: boolean;
  /** Cuántos viajes representa la línea. Casi siempre 1. */
  viajes: number;
  vacio: boolean;
  /** La carga, opcional: el plan se mide en viajes, no en canastas. */
  carga: number | null;
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

export type Control = {
  fecha: string;
  turno: string;
  turno_orden: number;
  tipo: string;
  tipo_nombre: string;
  tipo_orden: number | null;
  plan_id: string | null;
  planeado: number;
  vacios_planeados: number;
  nota: string | null;
  /** Contado sobre los viajes registrados. Nadie lo escribe. */
  cumplido: number;
  registros: number;
  carga: number;
  placas: number;
  /** De lo PLANEADO, cuánto se hizo. Nunca pasa del plan. */
  adheridos: number;
  /** Lo que se pasó del plan o no estaba en él. */
  adicionales: number;
  faltan: number;
  /** Se movió y nadie lo había planeado. */
  sin_planear: boolean;
  /** Mide si el PLAN se cumplió. Tope 100%. */
  adherencia: number | null;
  /** Mide si se movió lo que había que mover, adicionales incluidos. */
  cumplimiento: number | null;
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
export async function control(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_control").select("*")
    .eq("fecha", fecha)
    .order("turno_orden", { ascending: true })
    .order("tipo_orden", { ascending: true, nullsFirst: false });
  if (error) return { filas: [] as Control[], falta: sinTablas(error.message) };
  return { filas: (data ?? []) as Control[], falta: false };
}

/** Un rango, para el control. Mismo criterio: se filtra en la base. */
export async function controlRango(desde: string, hasta: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_control").select("*")
    .gte("fecha", desde).lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("turno_orden", { ascending: true })
    .order("tipo_orden", { ascending: true, nullsFirst: false });
  if (error) return { filas: [] as Control[], falta: sinTablas(error.message) };
  return { filas: (data ?? []) as Control[], falta: false };
}

/** Los viajes vacíos de un rango. Van aparte porque no llevan tipo:
 *  un viaje sin carga no mueve un material. */
export async function vaciosRango(desde: string, hasta: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_traspasos_viajes").select("fecha, turno, viajes")
    .eq("vacio", true).eq("estado", "registrado")
    .gte("fecha", desde).lte("fecha", hasta);
  return ((data ?? []) as { fecha: string; turno: string; viajes: number }[])
    .reduce((a, v) => a + v.viajes, 0);
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


export type PlanLinea = {
  id: string; fecha: string; turno: string; tipo: string;
  planeado: number; publicado: boolean;
};

/**
 * EL PLAN DE UN DÍA, publicado y borrador por separado.
 *
 * Van aparte y no mezclados porque la pantalla tiene que poder decir
 * "esto es lo que está vigente" y "esto es lo que estás armando". Si
 * llegaran juntos, la rejilla tendría que adivinar cuál pinta.
 */
export async function planDelDia(fecha: string) {
  const supabase = await createClient();
  const [pl, vac] = await Promise.all([
    supabase.from("traspasos_plan")
      .select("id, fecha, turno, tipo, planeado, publicado")
      .eq("fecha", fecha).eq("estado", "registrado"),
    supabase.from("traspasos_plan_vacios").select("turno, vacios").eq("fecha", fecha),
  ]);
  const lineas = (pl.data ?? []) as PlanLinea[];
  return {
    falta: !!pl.error && sinTablas(pl.error.message),
    publicadas: lineas.filter((l) => l.publicado),
    borrador: lineas.filter((l) => !l.publicado),
    vacios: (vac.data ?? []) as { turno: string; vacios: number }[],
  };
}

/** Las placas de los últimos siete días, la más reciente primero. Es lo
 *  que convierte teclear una placa en tocar un botón. */
export async function placasRecientes(limite = 8) {
  const supabase = await createClient();
  const { data } = await supabase.from("v_traspasos_placas")
    .select("placa, veces, ultima").order("ultima", { ascending: false }).limit(limite);
  return (data ?? []) as { placa: string; veces: number; ultima: string }[];
}

/** Las rutas que más se repiten en el último mes. */
export async function rutasFrecuentes(limite = 6) {
  const supabase = await createClient();
  const { data } = await supabase.from("v_traspasos_rutas")
    .select("origen, destino, veces").order("veces", { ascending: false }).limit(limite);
  return (data ?? []) as { origen: string; destino: string; veces: number }[];
}

/**
 * EL PROMEDIO DE LO QUE DE VERDAD SALIÓ el mismo día de la semana, en
 * las últimas cuatro semanas.
 *
 * Es lo REAL y no lo planeado a propósito: el plan de los lunes
 * anteriores puede haber estado mal, y copiar un plan malo cuatro veces
 * seguidas es como se institucionaliza un error.
 */
export async function promedioDelDia(fecha: string) {
  const supabase = await createClient();
  /* getUTCDay sobre el mediodía: la fecha suelta se interpreta como
     medianoche UTC, que en Colombia es el día anterior. */
  const d = new Date(fecha + "T12:00:00").getUTCDay();
  const iso = d === 0 ? 7 : d;
  const { data } = await supabase.from("v_traspasos_promedio")
    .select("turno, tipo, promedio, dias").eq("dia_semana", iso);
  return (data ?? []) as { turno: string; tipo: string; promedio: number; dias: number }[];
}
