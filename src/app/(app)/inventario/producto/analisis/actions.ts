"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/* LO QUE ESCRIBE EL ANÁLISIS DE DIFERENCIA DE PRODUCTO. Todo va por inventario cíclico (fiscal_id). */
const RUTA = "/inventario/producto/analisis";
const esId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const SQL = "Falta correr supabase/migraciones/2026-11-producto-ciclico.sql en Supabase.";
const falta = (m: string) => (/prod_dif|does not exist|PGRST20[25]|42703/i.test(m) ? SQL : m);

type FilaIn = { tipo: string; lado: string; documento: string | null; codigo: string; unidades: number };

/** SUBIR LA PLANTILLA (ya validada en el navegador): reemplaza la que tuviera ese cíclico. */
export async function guardarNovedadesProducto(fiscalId: string, filasJson: string, archivo: string) {
  if (!esId(fiscalId)) return { error: "Escoge el inventario cíclico." };
  let filas: FilaIn[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "No se pudo leer la plantilla." } }
  filas = (Array.isArray(filas) ? filas : []).filter((f) => f && String(f.codigo ?? "").trim() && ["CONTEO", "SAP", "NO SUMA"].includes(f.lado) && Number.isFinite(Number(f.unidades)));
  if (!filas.length) return { error: "La plantilla no trae filas válidas." };
  const supabase = await createClient();
  const d = await supabase.from("prod_dif_novedades").delete().eq("fiscal_id", fiscalId);
  if (d.error) return { error: falta(`${d.error.code} ${d.error.message}`) };
  const i = await supabase.from("prod_dif_novedades").insert(filas.map((f) => ({
    fiscal_id: fiscalId, tipo: String(f.tipo).slice(0, 80), lado: f.lado, documento: f.documento ? String(f.documento).slice(0, 60) : null,
    codigo: String(f.codigo).trim(), unidades: Math.round(Number(f.unidades) * 100) / 100, archivo: archivo.slice(0, 200),
  })));
  if (i.error) return { error: falta(`${i.error.code} ${i.error.message}`) };
  revalidatePath(RUTA);
  return { ok: true, filas: filas.length };
}

export async function quitarNovedadesProducto(fiscalId: string) {
  if (!esId(fiscalId)) return { error: "Escoge el inventario cíclico." };
  const supabase = await createClient();
  const { error } = await supabase.from("prod_dif_novedades").delete().eq("fiscal_id", fiscalId);
  if (error) return { error: falta(`${error.code} ${error.message}`) };
  revalidatePath(RUTA);
  return { ok: true };
}

/** GUARDAR EL ANÁLISIS: la foto con la que se arman los ajustes. Volver a guardar la reemplaza (las observaciones se quedan). */
export async function guardarAnalisisProducto(fiscalId: string, fecha: string, filasJson: string) {
  if (!esId(fiscalId) || !esDia(fecha)) return { error: "Escoge el inventario cíclico." };
  let filas: { sap: number; conteo: number }[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "No se pudo leer el análisis." } }
  if (!Array.isArray(filas) || !filas.length) return { error: "No hay análisis que guardar." };
  const sap = filas.reduce((t, f) => t + (Number(f.sap) || 0), 0);
  const conteo = filas.reduce((t, f) => t + (Number(f.conteo) || 0), 0);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("prod_dif_guardado").upsert(
    { fiscal_id: fiscalId, fecha, filas, sap, conteo, guardado_por: user?.id ?? null, guardado_en: new Date().toISOString() },
    { onConflict: "fiscal_id" });
  if (error) return { error: falta(`${error.code} ${error.message}`) };
  revalidatePath(RUTA);
  return { ok: true };
}

/** LA OBSERVACIÓN DE UN CÓDIGO (se guarda al salir del campo). */
export async function guardarObservacionProducto(fiscalId: string, codigo: string, texto: string) {
  if (!esId(fiscalId) || !codigo) return { error: "Datos inválidos." };
  const supabase = await createClient();
  const { error } = await supabase.from("prod_dif_obs").upsert(
    { fiscal_id: fiscalId, codigo: codigo.slice(0, 30), observacion: texto.slice(0, 1000), actualizado_en: new Date().toISOString() },
    { onConflict: "fiscal_id,codigo" });
  if (error) return { error: falta(`${error.code} ${error.message}`) };
  return { ok: true };
}

/** LO AJUSTADO EN SAP de un código, con su signo (null = nada). */
export async function guardarHechoProducto(fiscalId: string, codigo: string, ajuste: number | null) {
  if (!esId(fiscalId) || !codigo) return { error: "Datos inválidos." };
  const supabase = await createClient();
  const { error } = await supabase.from("prod_dif_obs").upsert({
    fiscal_id: fiscalId, codigo: codigo.slice(0, 30),
    ajuste_hecho: ajuste == null || !Number.isFinite(ajuste) ? null : Math.round(ajuste * 100) / 100,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: "fiscal_id,codigo" });
  if (error) return { error: falta(`${error.code} ${error.message}`) };
  revalidatePath(RUTA);
  return { ok: true };
}

/** GUARDAR EL ANÁLISIS FINAL: cómo quedó SAP con lo ajustado. Va al histórico. */
export async function guardarFinalProducto(fiscalId: string, filasJson: string) {
  if (!esId(fiscalId)) return { error: "Datos inválidos." };
  let filas: unknown[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "No se pudo leer el análisis final." } }
  if (!Array.isArray(filas) || !filas.length) return { error: "No hay análisis final que guardar." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("prod_dif_guardado")
    .update({ final: filas, final_en: new Date().toISOString(), final_por: user?.id ?? null }).eq("fiscal_id", fiscalId).select("fiscal_id");
  if (error) return { error: falta(`${error.code} ${error.message}`) };
  if (!data?.length) return { error: "Primero guarda el análisis (paso 1)." };
  revalidatePath(RUTA);
  return { ok: true };
}
