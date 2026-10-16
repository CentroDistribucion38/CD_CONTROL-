"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";

/**
 * GESTIÓN · 5 WHY Y PLAN DE ACCIÓN. Todo vive dentro de «Disparadores»: quien tenga esa pantalla en «editar» puede
 * tomar un disparador, escribir los 5 por qué y la causa raíz, armar el plan y cerrarlo.
 * Estados: PENDIENTE (sin análisis) → EN ANÁLISIS (con responsable) → CERRADO (causa raíz + todas las acciones hechas).
 */
const RUTA = "/gestion/disparadores";
const msj = (m: string) => (/does not exist|schema cache|Could not find/i.test(m)
  ? "Falta crear las tablas del 5 Why: corre supabase/migraciones/2026-10-gestion-5why-plan.sql en Supabase."
  : m);
const refrescar = () => { revalidatePath("/gestion", "layout"); };
const fechaOk = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f ?? "") && !Number.isNaN(Date.parse(f + "T12:00:00Z"));

type Ctx = { supabase: Awaited<ReturnType<typeof createClient>>; uid: string | null };
async function quien(): Promise<{ error: string } | Ctx> {
  const permisos = await misPermisos();
  if (!permisos.puedeEditar(RUTA)) return { error: "No tienes permiso para gestionar disparadores." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, uid: user?.id ?? null };
}

type Resp = { ok?: boolean; error?: string };

/** Toma el disparador (lo pasa a EN ANÁLISIS) o guarda el avance: responsable, los 5 por qué y la causa raíz. */
export async function guardarAnalisis(f: { disparador_id: string; responsable: string; porques: string[]; causa_raiz: string }): Promise<Resp> {
  const q = await quien(); if ("error" in q) return { error: q.error };
  const responsable = (f.responsable ?? "").trim();
  if (responsable.length < 2) return { error: "Escribe quién es el responsable del análisis." };
  const p = Array.from({ length: 5 }, (_, k) => (f.porques?.[k] ?? "").trim());
  /* Es una cadena: no se puede responder el 3 sin haber respondido el 2. */
  for (let k = 1; k < 5; k++) if (p[k] && !p[k - 1]) return { error: `Responde el por qué ${k} antes del ${k + 1}.` };
  const { data: d, error: e0 } = await q.supabase.from("gestion_disparadores").select("estado").eq("id", f.disparador_id).maybeSingle();
  if (e0) return { error: msj(e0.message) };
  if (!d || d.estado !== "activo") return { error: "Ese disparador ya no está activo." };
  const fila = {
    disparador_id: f.disparador_id, responsable,
    porque1: p[0], porque2: p[1], porque3: p[2], porque4: p[3], porque5: p[4],
    causa_raiz: (f.causa_raiz ?? "").trim(), actualizado_en: new Date().toISOString(),
  };
  const { data: ya } = await q.supabase.from("gestion_analisis").select("disparador_id").eq("disparador_id", f.disparador_id).maybeSingle();
  const { error } = ya
    ? await q.supabase.from("gestion_analisis").update(fila).eq("disparador_id", f.disparador_id)
    : await q.supabase.from("gestion_analisis").insert({ ...fila, iniciado_por: q.uid });
  if (error) return { error: msj(error.message) };
  refrescar();
  return { ok: true };
}

/** Una acción del plan. Con `id` la corrige; sin `id` la crea. */
export async function guardarAccion(f: { id?: string; disparador_id: string; accion: string; responsable: string; fecha_limite: string }): Promise<Resp> {
  const q = await quien(); if ("error" in q) return { error: q.error };
  const accion = (f.accion ?? "").trim(), responsable = (f.responsable ?? "").trim();
  if (accion.length < 5) return { error: "Describe la acción (mínimo unas palabras)." };
  if (responsable.length < 2) return { error: "Escribe quién la hace." };
  if (!fechaOk(f.fecha_limite)) return { error: "Escoge la fecha límite." };
  const { data: a } = await q.supabase.from("gestion_analisis").select("disparador_id").eq("disparador_id", f.disparador_id).maybeSingle();
  if (!a) return { error: "Primero toma el disparador (guarda el responsable del análisis)." };
  const { error } = f.id
    ? await q.supabase.from("gestion_acciones").update({ accion, responsable, fecha_limite: f.fecha_limite }).eq("id", f.id).eq("estado", "abierta")
    : await q.supabase.from("gestion_acciones").insert({ disparador_id: f.disparador_id, accion, responsable, fecha_limite: f.fecha_limite, creado_por: q.uid });
  if (error) return { error: msj(error.message) };
  refrescar();
  return { ok: true };
}

/** Marca una acción como hecha (o la reabre). */
export async function marcarAccion(id: string, hecha: boolean): Promise<Resp> {
  const q = await quien(); if ("error" in q) return { error: q.error };
  const { error } = await q.supabase.from("gestion_acciones")
    .update({ estado: hecha ? "hecha" : "abierta", hecha_en: hecha ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { error: msj(error.message) };
  refrescar();
  return { ok: true };
}

export async function quitarAccion(id: string): Promise<Resp> {
  const q = await quien(); if ("error" in q) return { error: q.error };
  const { error } = await q.supabase.from("gestion_acciones").delete().eq("id", id).eq("estado", "abierta");
  if (error) return { error: msj(error.message) };
  refrescar();
  return { ok: true };
}

/**
 * CIERRE. Solo cierra si hay causa raíz, al menos una acción y TODAS las acciones están hechas; la nota dice cómo se
 * verificó que el indicador volvió a la meta.
 */
export async function cerrarDisparador(id: string, nota: string): Promise<Resp> {
  const q = await quien(); if ("error" in q) return { error: q.error };
  const verificacion = (nota ?? "").trim();
  if (verificacion.length < 5) return { error: "Cuenta cómo se verificó que el indicador volvió a la meta." };
  const [a, ac] = await Promise.all([
    q.supabase.from("gestion_analisis").select("causa_raiz").eq("disparador_id", id).maybeSingle(),
    q.supabase.from("gestion_acciones").select("estado").eq("disparador_id", id),
  ]);
  if (a.error || ac.error) return { error: msj((a.error ?? ac.error)!.message) };
  if (!a.data || (a.data.causa_raiz ?? "").trim().length < 10) return { error: "Falta escribir la causa raíz." };
  const acciones = ac.data ?? [];
  if (!acciones.length) return { error: "Falta el plan de acción: agrega al menos una acción." };
  if (acciones.some((x) => x.estado !== "hecha")) return { error: "Todavía hay acciones sin hacer." };
  const { error } = await q.supabase.from("gestion_disparadores")
    .update({ estado: "cerrado", nota: verificacion, cerrado_en: new Date().toISOString(), cerrado_por: q.uid })
    .eq("id", id).eq("estado", "activo");
  if (error) return { error: msj(error.message) };
  refrescar();
  return { ok: true };
}
