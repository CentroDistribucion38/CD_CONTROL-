"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { balanceParaPasivos, leerPasivos, resumirPasivos, type NuevaFila, type MaestroPasivo } from "@/modulos/pasivos/datos";
import { DESCUENTO_ESTANDAR, esExcluido } from "@/modulos/pasivos/excluidos";

const RUTA = "/inventario/balance/pasivos";
const esDia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * TRAER DEL BALANCE — la diferencia en unidades de cada hoja del balance de ese día. Lo que ya se había
 * traído del balance ESE día se reemplaza (no se duplica); lo del archivo y lo manual no se toca.
 */
export async function traerDelBalance(fecha: string, casco?: string | null) {
  if (!esDia(fecha)) return { error: "Escoge el día del balance." };
  const supabase = await createClient();
  /* Un día que ya está cargado del Excel (HISTÓRICO) no se vuelve a traer: quedaría doble. */
  const { count } = await supabase.from("pasivos_base").select("id", { count: "exact", head: true }).eq("fecha", fecha).eq("origen", "historico");
  if (count) return { error: `El ${fecha.split("-").reverse().join("/")} ya está cargado tal cual tu Excel (histórico). No se trae del balance para no duplicarlo.` };
  const { filas, sinFactor, excluidos, error } = await balanceParaPasivos(fecha, casco);
  if (error && !filas.length) return { error };
  const { error: eB } = await supabase.from("pasivos_base").delete().eq("fecha", fecha).eq("origen", "balance");
  if (eB) return { error: eB.message };
  if (filas.length) {
    const { error: eI } = await supabase.from("pasivos_base").insert(filas.map((f) => ({ ...f, origen: "balance" })));
    if (eI) return { error: eI.message };
  }
  revalidatePath(RUTA);
  return { ok: true, filas: filas.length, sinFactor, excluidos };
}

/**
 * SUBIR EL ARCHIVO PLANO (baja proyectada, rotura de línea). Si ya había filas de ARCHIVO con la misma
 * fecha y causal, se reemplazan: subir dos veces el mismo archivo no duplica.
 */
export async function subirArchivo(filasJson: string, archivo: string) {
  let filas: NuevaFila[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "El archivo no se pudo leer." } }
  filas = filas.filter((f) => esDia(f.fecha) && f.codigo && f.estado && f.causal && f.almacen && Number.isFinite(Number(f.unidades)));
  if (!filas.length) return { error: "El archivo no trae filas válidas." };
  const supabase = await createClient();
  /* Envases nuevos (barril, 412644, 412671, 412707) y la estiba 3500163: no se suben. El barril se reconoce por el nombre del maestro. */
  const codigosArchivo = [...new Set(filas.map((f) => String(f.codigo)))];
  const { data: nombres } = await supabase.from("pasivos_maestro").select("codigo, descripcion").in("codigo", codigosArchivo);
  const nombreDe = new Map(((nombres ?? []) as { codigo: string; descripcion: string | null }[]).map((m) => [String(m.codigo), m.descripcion]));
  const fuera = codigosArchivo.filter((c) => esExcluido(c, nombreDe.get(c)));
  if (fuera.length) {
    filas = filas.filter((f) => !fuera.includes(String(f.codigo)));
    if (!filas.length) return { error: `Ese archivo solo trae códigos que no van en Pasivos (${fuera.join(", ")}: envases nuevos / estiba). No se subió nada.` };
  }
  /* Los días que ya están cargados del Excel (HISTÓRICO) no se suben otra vez. */
  const fechas = [...new Set(filas.map((f) => f.fecha))];
  const { data: hist } = await supabase.from("pasivos_base").select("fecha").in("fecha", fechas).eq("origen", "historico").limit(1000);
  const yaHist = new Set((hist ?? []).map((h) => h.fecha as string));
  if (yaHist.size) {
    filas = filas.filter((f) => !yaHist.has(f.fecha));
    if (!filas.length) return { error: `Esas fechas ya están cargadas tal cual tu Excel (histórico): ${[...yaHist].join(", ")}. No se subió nada.` };
  }
  const pares = [...new Set(filas.map((f) => `${f.fecha}|${f.causal}`))];
  for (const p of pares) {
    const [fecha, causal] = p.split("|");
    const { error } = await supabase.from("pasivos_base").delete().eq("fecha", fecha).eq("causal", causal).eq("origen", "archivo");
    if (error) return { error: error.message };
  }
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from("pasivos_base").insert(filas.slice(i, i + 500).map((f) => ({
      fecha: f.fecha, estado: f.estado, causal: f.causal, codigo: String(f.codigo), unidades: Number(f.unidades),
      almacen: f.almacen, nota: f.nota || null, origen: "archivo", archivo,
    })));
    if (error) return { error: error.message };
  }
  revalidatePath(RUTA);
  return { ok: true, filas: filas.length, excluidos: fuera };
}

/** BORRAR las filas marcadas. */
export async function borrarFilas(idsJson: string) {
  let ids: string[] = [];
  try { ids = JSON.parse(idsJson) } catch { /* nada */ }
  if (!ids.length) return { error: "No hay filas marcadas." };
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("pasivos_base").delete().in("id", ids.slice(i, i + 200));
    if (error) return { error: error.message };
  }
  revalidatePath(RUTA);
  return { ok: true, filas: ids.length };
}

/* ---------------------------- MAESTRO ---------------------------- */
const num = (v: unknown) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export async function guardarMaestro(filaJson: string) {
  let f: Partial<MaestroPasivo> = {};
  try { f = JSON.parse(filaJson) } catch { return { error: "Datos inválidos." } }
  const codigo = String(f.codigo ?? "").trim();
  if (!codigo || !String(f.descripcion ?? "").trim()) return { error: "El código y la descripción son obligatorios." };
  const supabase = await createClient();
  const { error } = await supabase.from("pasivos_maestro").upsert({
    codigo, material: String(f.material ?? "").trim() || codigo, descripcion: String(f.descripcion).trim(),
    familia: f.familia || null, unidades_por_caja: num(f.unidades_por_caja), plancha: num(f.plancha), alto: num(f.alto),
    cajas_por_estiba: num(f.cajas_por_estiba), tipo: f.tipo || null, hl_unidad: num(f.hl_unidad),
    caja: f.caja ? String(f.caja).trim() : null, costo: num(f.costo), activo: f.activo ?? true, actualizado_en: new Date().toISOString(),
  }, { onConflict: "codigo" });
  if (error) return { error: error.message };
  revalidatePath(RUTA); revalidatePath(RUTA + "/maestro");
  return { ok: true };
}

export async function borrarMaestro(codigo: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pasivos_maestro").delete().eq("codigo", codigo);
  if (error) return { error: error.message };
  revalidatePath(RUTA + "/maestro");
  return { ok: true };
}

/**
 * GUARDAR EL DÍA — la foto de la base de ese día para el histórico (por almacén y causal). Volver a
 * guardar el mismo día la reemplaza. Después sigue el Cuadre SAP (AG18 y AG22).
 */
export async function guardarDiaPasivos(fecha: string) {
  if (!esDia(fecha)) return { error: "Escoge un solo día." };
  const { data, error } = await leerPasivos(fecha, fecha);
  if (error) return { error };
  if (!data.length) return { error: "Ese día no tiene nada en la base." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: yo } = user ? await supabase.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle() : { data: null };
  const { error: e } = await supabase.from("pasivos_cierres").upsert({
    fecha, resumen: resumirPasivos(data), cerrado_en: new Date().toISOString(), cerrado_por: user?.id ?? null,
    cerrado_nombre: yo?.nombre || yo?.usuario || null,
  }, { onConflict: "fecha" });
  if (e) return { error: /pasivos_cierres|does not exist|PGRST205/i.test(e.message) ? "Falta correr supabase/migraciones/2026-10-pasivos-cierres.sql en Supabase." : e.message };
  revalidatePath(RUTA);
  return { ok: true, filas: data.length };
}

/**
 * LA CASILLA DEL DESCUENTO ESTÁNDAR (3500005 · AG22): `valor` > 0 lo pone (un renglón manual en negativo
 * ese día; si ya había, lo reemplaza); null o 0 lo quita.
 */
export async function descuentoEstandar(fecha: string, valor: number | null) {
  if (!esDia(fecha)) return { error: "Escoge un solo día." };
  const d = DESCUENTO_ESTANDAR;
  const supabase = await createClient();
  const { error: e1 } = await supabase.from("pasivos_base").delete()
    .eq("fecha", fecha).eq("codigo", d.codigo).eq("almacen", d.almacen).eq("origen", "manual").like("nota", `${d.nota}%`);
  if (e1) return { error: e1.message };
  if (valor && valor > 0) {
    const { error: e2 } = await supabase.from("pasivos_base").insert({
      fecha, estado: d.estado, causal: d.causal, codigo: d.codigo, unidades: -Math.abs(Math.round(valor)),
      almacen: d.almacen, origen: "manual", nota: d.nota,
    });
    if (e2) return { error: e2.message };
  }
  revalidatePath(RUTA);
  return { ok: true };
}
