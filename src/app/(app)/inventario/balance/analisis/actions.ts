"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const RUTA = "/inventario/balance/analisis";
const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const SQL = "Falta correr supabase/migraciones/2026-10-analisis-diferencia.sql en Supabase.";
const falta = (m: string) => (/analisis_dif|does not exist|PGRST205/i.test(m) ? SQL : m);

type FilaIn = { tipo: string; lado: string; documento: string | null; codigo: string; unidades: number; caja_codigo: string | null; cajas: number | null };

/** SUBIR LA PLANTILLA DEL DÍA: ya validada en el navegador. Reemplaza lo que hubiera de ese día. */
export async function guardarNovedades(fecha: string, filasJson: string, archivo: string) {
  if (!esDia(fecha)) return { error: "La plantilla no trae una fecha válida." };
  let filas: FilaIn[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "No se pudo leer la plantilla." } }
  filas = (Array.isArray(filas) ? filas : []).filter((f) => f && String(f.codigo ?? "").trim() && ["CONTEO", "SAP", "NO SUMA"].includes(f.lado) && Number.isFinite(Number(f.unidades)));
  if (!filas.length) return { error: "La plantilla no trae filas válidas." };
  const supabase = await createClient();
  const d = await supabase.from("analisis_dif_novedades").delete().eq("fecha", fecha);
  if (d.error) return { error: falta(`${d.error.code} ${d.error.message}`) };
  const i = await supabase.from("analisis_dif_novedades").insert(filas.map((f) => ({
    fecha, tipo: String(f.tipo).slice(0, 80), lado: f.lado, documento: f.documento ? String(f.documento).slice(0, 60) : null,
    codigo: String(f.codigo).trim(), unidades: Math.round(Number(f.unidades) * 100) / 100,
    caja_codigo: f.caja_codigo ? String(f.caja_codigo) : null, cajas: f.cajas != null ? Number(f.cajas) : null, archivo: archivo.slice(0, 200),
  })));
  if (i.error) return { error: falta(`${i.error.code} ${i.error.message}`) };
  revalidatePath(RUTA);
  return { ok: true, filas: filas.length };
}

/** Quitar la plantilla de un día (para subirla de nuevo). */
export async function quitarNovedades(fecha: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("analisis_dif_novedades").delete().eq("fecha", fecha);
  if (error) return { error: falta(`${error.code} ${error.message}`) };
  revalidatePath(RUTA);
  return { ok: true };
}

/* ---------------- PASO 2: AJUSTES ---------------- */
const SQL2 = "Falta correr supabase/migraciones/2026-10-analisis-diferencia-ajustes.sql en Supabase.";
const falta2 = (m: string) => (/analisis_dif_(guardado|obs)|does not exist|PGRST205/i.test(m) ? SQL2 : m);

/** GUARDAR EL ANÁLISIS DEL DÍA: la foto con la que se arman los ajustes. Volver a guardar la reemplaza
 *  (las observaciones se quedan: van por código). */
export async function guardarAnalisis(fecha: string, filasJson: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  let filas: { codigo: string; sap: number; conteo: number }[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "No se pudo leer el análisis." } }
  if (!Array.isArray(filas) || !filas.length) return { error: "No hay análisis que guardar ese día." };
  const sap = filas.reduce((t, f) => t + (Number(f.sap) || 0), 0);
  const conteo = filas.reduce((t, f) => t + (Number(f.conteo) || 0), 0);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("analisis_dif_guardado")
    .upsert({ fecha, filas, sap, conteo, guardado_por: user?.id ?? null, guardado_en: new Date().toISOString() }, { onConflict: "fecha" });
  if (error) return { error: falta2(`${error.code} ${error.message}`) };
  revalidatePath(RUTA);
  return { ok: true };
}

/** LA OBSERVACIÓN DE UN CÓDIGO ese día (se guarda al salir del campo). */
export async function guardarObservacion(fecha: string, codigo: string, texto: string) {
  if (!esDia(fecha) || !codigo) return { error: "Datos inválidos." };
  const supabase = await createClient();
  const { error } = await supabase.from("analisis_dif_obs")
    .upsert({ fecha, codigo: codigo.slice(0, 30), observacion: texto.slice(0, 1000), actualizado_en: new Date().toISOString() }, { onConflict: "fecha,codigo" });
  if (error) return { error: falta2(`${error.code} ${error.message}`) };
  return { ok: true };
}

/* ---------------- PASO 3: ANÁLISIS FINAL ---------------- */
const SQL3 = "Falta correr supabase/migraciones/2026-10-analisis-diferencia-final.sql en Supabase.";
const falta3 = (m: string) => (/comp_hecha|ajuste_hecho|final|42703|PGRST204/i.test(m) ? SQL3 : falta2(m));

/** LO QUE YA SE HIZO EN SAP de un código: la compensación (sí/no) y cuánto del ajuste (null = nada). */
export async function guardarHecho(fecha: string, codigo: string, comp: boolean, ajuste: number | null) {
  if (!esDia(fecha) || !codigo) return { error: "Datos inválidos." };
  const supabase = await createClient();
  const { error } = await supabase.from("analisis_dif_obs").upsert({
    fecha, codigo: codigo.slice(0, 30), comp_hecha: comp,
    ajuste_hecho: ajuste == null || !Number.isFinite(ajuste) ? null : Math.round(ajuste * 100) / 100,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: "fecha,codigo" });
  if (error) return { error: falta3(`${error.code} ${error.message}`) };
  revalidatePath(RUTA);
  return { ok: true };
}

/** GUARDAR EL ANÁLISIS FINAL: la foto de cómo quedó SAP con lo hecho. Va al histórico. */
export async function guardarFinal(fecha: string, filasJson: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  let filas: unknown[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "No se pudo leer el análisis final." } }
  if (!Array.isArray(filas) || !filas.length) return { error: "No hay análisis final que guardar." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("analisis_dif_guardado")
    .update({ final: filas, final_en: new Date().toISOString(), final_por: user?.id ?? null }).eq("fecha", fecha).select("fecha");
  if (error) return { error: falta3(`${error.code} ${error.message}`) };
  if (!data?.length) return { error: "Primero guarda el análisis de ese día (paso 1)." };
  revalidatePath(RUTA);
  return { ok: true };
}

/* ---------------- LO DEMÁS PARA EL INFORME DEL CIERRE ----------------
   «Que tenga absolutamente todo»: los precios (valor $), la recurrencia de los últimos 30 días guardados y el
   día contra el anterior. Se pide al armar el informe, no con la página. */
export async function extrasInforme(fecha: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const [{ leerPrecios, leerHistorico }, { recurrencias, contraAnterior }] = await Promise.all([
    import("@/modulos/inventario/analisis-ajustes"), import("@/modulos/inventario/analisis-extra"),
  ]);
  const [precios, h] = await Promise.all([leerPrecios(), leerHistorico()]);
  const det = h.detalle.filter((f) => f.fecha <= fecha);
  return { precios, recurrencia: recurrencias(det, fecha, 30, 3), ayer: contraAnterior(det, fecha) };
}
