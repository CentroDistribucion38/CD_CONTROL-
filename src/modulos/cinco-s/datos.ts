/**
 * 5S — LO QUE SE LEE DE LA BASE (servidor). Una lectura arma el maestro (reglas, áreas, responsables, checklist);
 * otra, las inspecciones. Si falta correr el SQL, se dice con `falta` y la pantalla lo explica.
 */
import { createClient } from "@/lib/supabase/server";
import { FORMATO_5S, type Area5S, type Formato5S, type Hallazgo5S, type Inspeccion5S, type Programada5S, type Punto5S, type Responsable5S, type Seccion5S, type Zona5S } from "./cinco-s";

export type Maestro5S = {
  falta: boolean; error: string | null;
  meta: number; areas: Area5S[]; responsables: Responsable5S[]; puntos: Punto5S[]; zonas: Zona5S[];
  /** Qué se evalúa (5S, PTL…). Sin el SQL del paso 6 viene solo 5S, como antes. */
  formatos: Formato5S[];
};

const esFalta = (e: { message: string; code?: string }) =>
  e.code === "42P01" || /does not exist|no existe|schema cache/i.test(e.message);

export async function leerMaestro5S(): Promise<Maestro5S> {
  const sb = await createClient();
  const [r, a, s, p, z, fo, se] = await Promise.all([
    sb.from("s5_reglas").select("meta").eq("id", 1).maybeSingle(),
    sb.from("s5_areas").select("*").order("orden").order("nombre"),
    sb.from("s5_responsables").select("*").order("nombre"),
    sb.from("s5_puntos").select("*").order("orden"),
    /* Las zonas son del paso 2: si su SQL no se ha corrido, no hay zonas y todo lo demás sigue. */
    sb.from("s5_zonas").select("*").order("orden").order("nombre"),
    /* Formatos y secciones son del paso 6 (2026-11-cinco-s-6-formatos.sql). */
    sb.from("s5_formatos").select("*").order("orden").order("nombre"),
    sb.from("s5_secciones").select("*").order("orden"),
  ]);
  const e = a.error ?? p.error ?? s.error ?? r.error;
  if (e) return { falta: esFalta(e), error: esFalta(e) ? null : e.message, meta: 90, areas: [], responsables: [], puntos: [], zonas: [], formatos: [FORMATO_5S] };
  const secciones = (se.error ? [] : se.data ?? []) as (Seccion5S & { formato_id: string; activa: boolean })[];
  const formatos: Formato5S[] = fo.error || !fo.data?.length ? [FORMATO_5S]
    : (fo.data as Omit<Formato5S, "secciones">[]).map((f) => ({
        ...f, meta: f.meta == null ? null : Number(f.meta),
        secciones: secciones.filter((x) => x.formato_id === f.id && x.activa !== false)
          .map(({ clave, nombre, corto, que, jp, orden }) => ({ clave, nombre, corto, que, jp, orden })),
      }));
  return {
    falta: false, error: null,
    meta: Number(r.data?.meta ?? 90),
    areas: ((a.data ?? []) as Area5S[]).map((x) => ({ ...x, meta: x.meta == null ? null : Number(x.meta) })),
    responsables: (s.data ?? []) as Responsable5S[],
    puntos: ((p.data ?? []) as Punto5S[]).map((x) => ({ ...x, peso: Number(x.peso) })),
    zonas: z.error ? [] : (z.data ?? []) as Zona5S[],
    formatos,
  };
}

/** Solo los formatos con sus secciones (para el informe de una inspección). Sin el SQL del paso 6: solo 5S. */
export async function leerFormatos5S(): Promise<Formato5S[]> {
  const sb = await createClient();
  const [fo, se] = await Promise.all([
    sb.from("s5_formatos").select("*").order("orden"),
    sb.from("s5_secciones").select("*").order("orden"),
  ]);
  if (fo.error || !fo.data?.length) return [FORMATO_5S];
  const secciones = (se.data ?? []) as (Seccion5S & { formato_id: string; activa: boolean })[];
  return (fo.data as Omit<Formato5S, "secciones">[]).map((f) => ({
    ...f, meta: f.meta == null ? null : Number(f.meta),
    secciones: secciones.filter((x) => x.formato_id === f.id).map(({ clave, nombre, corto, que, jp, orden }) => ({ clave, nombre, corto, que, jp, orden })),
  }));
}

/** Las inspecciones, de la más nueva a la más vieja (hasta 2000: un año largo de auditorías semanales por área). */
export async function leerInspecciones5S(): Promise<{ falta: boolean; error: string | null; filas: Inspeccion5S[] }> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_s5_inspecciones").select("*")
    .order("fecha", { ascending: false }).order("creado", { ascending: false }).limit(2000);
  if (error) return { falta: esFalta(error), error: esFalta(error) ? null : error.message, filas: [] };
  return {
    falta: false, error: null,
    filas: ((data ?? []) as Inspeccion5S[]).map((x) => ({
      ...x, cumplimiento: Number(x.cumplimiento), meta: Number(x.meta),
      por_s: Object.fromEntries(Object.entries(x.por_s ?? {}).map(([k, v]) => [k, v == null ? null : Number(v)])),
    })),
  };
}

/** El nombre de quien entró: es el auditor de lo que inspeccione. */
export async function miNombre(): Promise<string> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return "";
  const { data } = await sb.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle();
  return (data?.nombre || data?.usuario || "").trim();
}

/** El cronograma con su estado calculado. `falta` = no se ha corrido el SQL del paso 2. */
export async function leerCronograma5S(): Promise<{ falta: boolean; error: string | null; filas: Programada5S[] }> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_s5_cronograma").select("*").order("desde").limit(3000);
  if (error) return { falta: esFalta(error), error: esFalta(error) ? null : error.message, filas: [] };
  return {
    falta: false, error: null,
    filas: ((data ?? []) as Programada5S[]).map((x) => ({
      ...x, cumplimiento: x.cumplimiento == null ? null : Number(x.cumplimiento), meta: x.meta == null ? null : Number(x.meta),
    })),
  };
}

/** Los puntos que no cumplieron (para «lo que más se repite» del Tablero). */
export async function leerNoCumple5S(): Promise<{ inspeccion_id: string; s: string; pregunta: string; zona: string | null; severidad: string | null }[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("s5_inspeccion_puntos").select("*").eq("resultado", "no_cumple").limit(5000);
  if (error) return [];
  return (data ?? []).map((x) => ({ inspeccion_id: x.inspeccion_id, s: x.s, pregunta: x.pregunta, zona: x.zona ?? null, severidad: x.severidad }));
}

/** Los hallazgos con su plan y estado (paso 3). `falta` = no se ha corrido 2026-11-cinco-s-3.sql. */
export async function leerHallazgos5S(): Promise<{ falta: boolean; error: string | null; filas: Hallazgo5S[] }> {
  const sb = await createClient();
  const { data, error } = await sb.from("v_s5_hallazgos").select("*")
    .order("fecha", { ascending: false }).order("orden").limit(3000);
  if (error) return { falta: esFalta(error), error: esFalta(error) ? null : error.message, filas: [] };
  return { falta: false, error: null, filas: (data ?? []) as Hallazgo5S[] };
}
