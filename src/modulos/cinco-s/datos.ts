/**
 * 5S — LO QUE SE LEE DE LA BASE (servidor). Una lectura arma el maestro (reglas, áreas, responsables, checklist);
 * otra, las inspecciones. Si falta correr el SQL, se dice con `falta` y la pantalla lo explica.
 */
import { createClient } from "@/lib/supabase/server";
import type { Area5S, Inspeccion5S, Punto5S, Responsable5S } from "./cinco-s";

export type Maestro5S = {
  falta: boolean; error: string | null;
  meta: number; areas: Area5S[]; responsables: Responsable5S[]; puntos: Punto5S[];
};

const esFalta = (e: { message: string; code?: string }) =>
  e.code === "42P01" || /does not exist|no existe|schema cache/i.test(e.message);

export async function leerMaestro5S(): Promise<Maestro5S> {
  const sb = await createClient();
  const [r, a, s, p] = await Promise.all([
    sb.from("s5_reglas").select("meta").eq("id", 1).maybeSingle(),
    sb.from("s5_areas").select("*").order("orden").order("nombre"),
    sb.from("s5_responsables").select("*").order("nombre"),
    sb.from("s5_puntos").select("*").order("orden"),
  ]);
  const e = a.error ?? p.error ?? s.error ?? r.error;
  if (e) return { falta: esFalta(e), error: esFalta(e) ? null : e.message, meta: 90, areas: [], responsables: [], puntos: [] };
  return {
    falta: false, error: null,
    meta: Number(r.data?.meta ?? 90),
    areas: ((a.data ?? []) as Area5S[]).map((x) => ({ ...x, meta: x.meta == null ? null : Number(x.meta) })),
    responsables: (s.data ?? []) as Responsable5S[],
    puntos: ((p.data ?? []) as Punto5S[]).map((x) => ({ ...x, peso: Number(x.peso) })),
  };
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
