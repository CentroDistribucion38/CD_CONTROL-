import { createClient } from "@/lib/supabase/server";

/**
 * LO QUE LEE EL MÓDULO DE ACCIONES.
 *
 * Todo sale de las vistas v_acciones, v_acciones_carga y v_acciones_area,
 * que ya traen calculado lo que antes cada pantalla calculaba por su
 * cuenta: si está vencida, cuántos días lleva, cuántas veces pasó eso en
 * esa zona. Que lo calcule la base una sola vez es lo que impide que dos
 * pantallas del mismo módulo muestren números distintos.
 *
 * `falta: true` significa que todavía no se corrió acciones.sql. Se
 * devuelve en vez de reventar para que la pantalla pueda decir qué hacer
 * en vez de mostrar un error de Postgres.
 */

export type Accion = {
  id: string;
  codigo: string;
  tipo: "correctiva" | "preventiva";
  titulo: string;
  descripcion: string | null;
  motivo: string;
  motivo_nombre: string;
  motivo_critico: boolean;
  area: string;
  area_nombre: string;
  zona: string | null;
  zona_nombre: string | null;
  zona_proceso: string | null;
  ubicacion: string | null;
  lat: number | null;
  lng: number | null;
  precision_m: number | null;
  prioridad: "alta" | "media" | "baja";
  plazo: string | null;
  vence_en: string;
  estado: "abierta" | "cerrada" | "verificada" | "reabierta" | "anulada";
  viva: boolean;
  vencida: boolean;
  horas_restantes: number;
  dias: number;
  /** El equipo que responde: Easy, Summar. Es lo que no cambia cuando la
   *  gente del OL rota. La persona es opcional debajo de él. */
  equipo: string | null;
  equipo_nombre: string | null;
  responsable: string | null;
  /** Ni equipo ni persona. "Easy sin persona" NO es sin dueño. */
  sin_dueno: boolean;
  asignada_por: string | null;
  asignada_en: string | null;
  reportada_por: string | null;
  reportada_en: string;
  que_se_hizo: string | null;
  cerrada_por: string | null;
  cerrada_en: string | null;
  efectiva: boolean | null;
  nota_verificacion: string | null;
  verificada_por: string | null;
  verificada_en: string | null;
  auto_verificada: boolean;
  causa_raiz: string | null;
  responsable_proceso: string | null;
  comentarios: number;
  fotos: number;
  origenes: number;
  veces_aqui: number;
};

export type Zona = {
  codigo: string;
  nombre: string;
  proceso: string | null;
  area: string;
  lat: number | null;
  lng: number | null;
  activo: boolean;
  orden: number | null;
};

export type Motivo = {
  clave: string;
  nombre: string;
  area: string | null;
  critico: boolean;
  orden: number | null;
  activo: boolean;
};

export type Area = { clave: string; nombre: string; orden: number | null; activo: boolean };

export type Carga = {
  id: string;
  usuario: string | null;
  nombre: string | null;
  rol: string;
  abiertas: number;
  vencidas: number;
  por_verificar: number;
  saturado: boolean;
};

export type PorArea = {
  area: string;
  area_nombre: string;
  orden: number | null;
  total: number;
  abiertas: number;
  vencidas: number;
  verificadas: number;
  efectivas: number;
  pct: number | null;
};

/** Un módulo sin tablas contesta siempre lo mismo; se reconoce por esto. */
function sinTablas(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache");
}

/**
 * Las acciones. El límite existe porque esta lista se pinta entera: sin
 * él, el día que haya cuatro mil acciones la pantalla tarda diez segundos
 * en dibujar algo que nadie va a leer hasta el final.
 */
export async function acciones(limite = 500) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_acciones")
    .select("*")
    .order("vence_en", { ascending: true })
    .limit(limite);
  if (error) return { acciones: [] as Accion[], falta: sinTablas(error.message) };
  return { acciones: (data ?? []) as Accion[], falta: false };
}

/** Solo las que todavía tienen algo que hacer. Es la lista del turno. */
export async function accionesVivas(limite = 400) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_acciones")
    .select("*")
    .in("estado", ["abierta", "reabierta"])
    .order("vence_en", { ascending: true })
    .limit(limite);
  if (error) return { acciones: [] as Accion[], falta: sinTablas(error.message) };
  return { acciones: (data ?? []) as Accion[], falta: false };
}

/** Las cerradas esperando que alguien vaya a mirar si sirvió. */
export async function accionesPorVerificar(limite = 200) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_acciones")
    .select("*")
    .eq("estado", "cerrada")
    /* Las más viejas primero: la que lleva nueve días esperando
       verificación es la que está falseando el indicador del mes. */
    .order("cerrada_en", { ascending: true })
    .limit(limite);
  if (error) return { acciones: [] as Accion[], falta: sinTablas(error.message) };
  return { acciones: (data ?? []) as Accion[], falta: false };
}

/** Lo de una persona. Vivo primero, y dentro de eso lo que vence antes. */
export async function misAcciones(uid: string, limite = 200) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_acciones")
    .select("*")
    .eq("responsable", uid)
    .neq("estado", "anulada")
    .order("vence_en", { ascending: true })
    .limit(limite);
  if (error) return { acciones: [] as Accion[], falta: sinTablas(error.message) };
  return { acciones: (data ?? []) as Accion[], falta: false };
}

export async function zonas() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("acciones_zonas")
    .select("codigo, nombre, proceso, area, lat, lng, activo, orden")
    .order("orden", { ascending: true, nullsFirst: false })
    .order("codigo");
  return (data ?? []) as Zona[];
}

/**
 * Los motivos ACTIVOS: los que se pueden escoger al reportar.
 * El maestro usa motivosTodos(), que también trae los desactivados —si no,
 * una vez desactivado un motivo desaparecería de la pantalla donde se
 * vuelve a activar, y no habría forma de recuperarlo sin entrar a la base.
 */
export async function motivos() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("acciones_motivos")
    .select("clave, nombre, area, critico, orden, activo")
    .eq("activo", true)
    .order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Motivo[];
}

export async function motivosTodos() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("acciones_motivos")
    .select("clave, nombre, area, critico, orden, activo")
    .order("orden", { ascending: true, nullsFirst: false })
    .order("clave");
  return (data ?? []) as Motivo[];
}

export async function areas() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("acciones_areas")
    .select("clave, nombre, orden, activo")
    .eq("activo", true)
    .order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Area[];
}

/**
 * LOS EQUIPOS QUE RESPONDEN — Easy, Summar.
 *
 * No son usuarios de la aplicación: son los operadores logísticos. Una
 * acción se le asigna al EQUIPO, que es el que responde y el que no
 * cambia cuando la gente de adentro rota, y opcionalmente a una persona
 * dentro de él.
 */
export async function equipos(soloActivos = true) {
  const supabase = await createClient();
  let q = supabase.from("acciones_equipos").select("clave, nombre, orden, activo");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as { clave: string; nombre: string; orden: number | null; activo: boolean }[];
}

export async function areasTodas() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("acciones_areas")
    .select("clave, nombre, orden, activo")
    .order("orden", { ascending: true, nullsFirst: false })
    .order("clave");
  return (data ?? []) as Area[];
}

/** Cuántas acciones cuelgan de cada zona y de cada motivo.
 *  Es lo que decide si se puede BORRAR o solo desactivar: borrar una zona
 *  que ya tiene acciones se llevaría por delante el histórico con el que
 *  se cuenta la reincidencia, y la base lo va a rechazar de todas formas.
 *  Saberlo antes permite decirlo con palabras en vez de mostrar el error
 *  de la llave foránea. */
export async function usoDelMaestro() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_acciones")
    .select("zona, motivo, equipo").limit(5000);
  const zonas: Record<string, number> = {};
  const motivos: Record<string, number> = {};
  const equipos: Record<string, number> = {};
  for (const f of (data ?? []) as
       { zona: string | null; motivo: string; equipo: string | null }[]) {
    if (f.zona) zonas[f.zona] = (zonas[f.zona] ?? 0) + 1;
    motivos[f.motivo] = (motivos[f.motivo] ?? 0) + 1;
    if (f.equipo) equipos[f.equipo] = (equipos[f.equipo] ?? 0) + 1;
  }
  return { zonas, motivos, equipos };
}

/** Cuánto tiene encima cada quien. Es lo que se mira ANTES de asignar. */
export async function carga() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_acciones_carga")
    .select("*")
    .order("abiertas", { ascending: true });
  return (data ?? []) as Carga[];
}

/** Las barras de "Cumplimiento por área" del tablero. */
export async function porArea() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_acciones_area")
    .select("*")
    .order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as PorArea[];
}

/** Los plazos y los parámetros, para que las pantallas no los adivinen. */
export async function parametros() {
  const supabase = await createClient();
  const [p, pl] = await Promise.all([
    supabase.from("acciones_parametros").select("clave, valor"),
    supabase.from("acciones_plazos").select("prioridad, horas, etiqueta"),
  ]);
  const par: Record<string, number> = {};
  for (const f of (p.data ?? []) as { clave: string; valor: number }[]) {
    par[f.clave] = Number(f.valor);
  }
  const plazos: Record<string, { horas: number; etiqueta: string }> = {};
  for (const f of (pl.data ?? []) as { prioridad: string; horas: number; etiqueta: string }[]) {
    plazos[f.prioridad] = { horas: f.horas, etiqueta: f.etiqueta };
  }
  return { par, plazos };
}

/** El hilo de varias acciones de una vez: uno por fila serían cien consultas. */
export async function hilo(ids: string[]) {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("acciones_hilo")
    .select("id, accion_id, texto, escrito_por, escrito_en")
    .in("accion_id", ids)
    .order("escrito_en", { ascending: true });
  return (data ?? []) as {
    id: string; accion_id: string; texto: string;
    escrito_por: string | null; escrito_en: string;
  }[];
}

/* =====================================================================
   LA EVIDENCIA DE UNA ACCIÓN — las fotos y el seguimiento.

   Va por su propia consulta y no pegada a la lista a propósito: firmar
   quinientas URL para que alguien mire una es trabajo que se paga en
   espera. Se pide cuando alguien abre la acción, no antes.
   ===================================================================== */

export type FotoAccion = {
  ranura: "hallazgo" | "cierre";
  ruta: string;
  url: string | null;
  tomada_en: string | null;
  lat: number | null;
  lng: number | null;
  precision_m: number | null;
  subida_por: string | null;
  subida_en: string;
};

export type Comentario = {
  id: string;
  texto: string;
  escrito_por: string | null;
  escrito_en: string;
  /* Las marcas. El hilo sigue siendo solo-agrega para todo el mundo
     menos el administrador, y cuando él toca algo QUEDA ESCRITO: un
     hilo que se puede reescribir sin marca no es un registro, es un
     borrador. */
  texto_original: string | null;
  editado_en: string | null;
  editado_por: string | null;
  borrado_en: string | null;
  borrado_por: string | null;
};

export async function evidenciaDeAccion(id: string) {
  const supabase = await createClient();

  const [f, h] = await Promise.all([
    supabase.from("acciones_fotos")
      .select("ranura, ruta, tomada_en, lat, lng, precision_m, subida_por, subida_en")
      .eq("accion_id", id)
      .order("subida_en", { ascending: true }),
    supabase.from("acciones_hilo")
      .select("id, texto, escrito_por, escrito_en, texto_original, " +
              "editado_en, editado_por, borrado_en, borrado_por")
      .eq("accion_id", id)
      .order("escrito_en", { ascending: true }),
  ]);

  if (f.error) return { fotos: [] as FotoAccion[], hilo: [] as Comentario[], falta: sinTablas(f.error.message) };

  const filas = (f.data ?? []) as Omit<FotoAccion, "url">[];

  /* Las URL se firman de a una y en paralelo. Vencen en minutos: que un
     intermediario las guarde no tiene sentido y sí tiene riesgo, y por
     eso la ruta que las sirve manda no-store. */
  const urls = await Promise.all(
    filas.map(async (x) => {
      const { data } = await supabase.storage.from("acciones").createSignedUrl(x.ruta, 600);
      return data?.signedUrl ?? null;
    })
  );

  return {
    fotos: filas.map((x, i) => ({ ...x, url: urls[i] })) as FotoAccion[],
    /* `as unknown as` y no un cast directo: PostgREST tipa la respuesta
       de un select con cadena larga como un tipo genérico que TypeScript
       no reconoce como compatible. El error era del tipado de la
       librería, no de los datos. */
    hilo: (h.data ?? []) as unknown as Comentario[],
    falta: false,
  };
}
