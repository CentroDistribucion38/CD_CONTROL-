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

/** LOS 311 DE LA MB51 (hoja «311 MB51» de la plantilla): reemplaza lo que hubiera de ese día. Sirven para cruzarlos con la ZEXI en «Partidas de los 311». */
export async function guardarMb51(fecha: string, filasJson: string, archivo: string) {
  if (!esDia(fecha)) return { error: "La plantilla no trae una fecha válida." };
  let filas: { almacen: string; codigo: string; cantidad: number; documento: string | null; hora: string | null }[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "No se pudo leer la hoja 311 MB51." } }
  filas = (Array.isArray(filas) ? filas : []).filter((f) => f && /^AG\d{2}$/.test(String(f.almacen)) && /^\d+$/.test(String(f.codigo)) && Number.isFinite(Number(f.cantidad)) && Number(f.cantidad) !== 0);
  const supabase = await createClient();
  const d = await supabase.from("analisis_dif_mb51").delete().eq("fecha", fecha);
  if (d.error) return { error: /analisis_dif_mb51|does not exist|PGRST205/i.test(d.error.message) ? "Falta correr supabase/migraciones/2026-11-analisis-diferencia-mb51.sql en Supabase." : d.error.message };
  if (filas.length) {
    const i = await supabase.from("analisis_dif_mb51").insert(filas.map((f) => ({
      fecha, almacen: f.almacen, codigo: String(f.codigo), cantidad: Math.round(Number(f.cantidad) * 100) / 100,
      documento: f.documento ? String(f.documento).slice(0, 60) : null, hora: f.hora ? String(f.hora).slice(0, 20) : null, archivo: archivo.slice(0, 200),
    })));
    if (i.error) return { error: i.error.message };
  }
  revalidatePath(RUTA);
  return { ok: true, filas: filas.length };
}

/** Quitar la plantilla de un día (para subirla de nuevo). */
export async function quitarNovedades(fecha: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("analisis_dif_novedades").delete().eq("fecha", fecha);
  if (error) return { error: falta(`${error.code} ${error.message}`) };
  await supabase.from("analisis_dif_mb51").delete().eq("fecha", fecha); // si la tabla aún no existe, no pasa nada
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

/* ---------------- CONTRA LOS INVENTARIOS FISCALES ----------------
   «Una página nueva que compare con los dos últimos inventarios fiscales (con botón Cambiar fechas).»
   Los fiscales salen de `inv_fiscales` (los anteriores al día del análisis, el más reciente primero) y,
   para cada uno, se dice si ese día tiene análisis de diferencia guardado: sin él no hay con qué comparar.
   También van los demás días guardados, por si se quiere comparar con uno que no fue fiscal. */
export async function fiscalesParaComparar(fecha: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const supabase = await createClient();
  const [f, g] = await Promise.all([
    supabase.from("inv_fiscales").select("nombre, fecha").lt("fecha", fecha).order("fecha", { ascending: false }).limit(60),
    supabase.from("analisis_dif_guardado").select("fecha").lt("fecha", fecha).order("fecha", { ascending: false }).limit(400),
  ]);
  const guardados = new Set(((g.data ?? []) as { fecha: string }[]).map((x) => x.fecha));
  /* Un día con dos fiscales (pasa si se abrió uno de prueba) es UNA fecha: se juntan los nombres. */
  const porDia = new Map<string, string[]>();
  for (const x of (f.data ?? []) as { nombre: string; fecha: string }[]) porDia.set(x.fecha, [...(porDia.get(x.fecha) ?? []), x.nombre]);
  const fiscales = [...porDia].map(([d, nombres]) => ({ fecha: d, nombre: nombres.join(" / "), conAnalisis: guardados.has(d) }));
  const otros = [...guardados].filter((d) => !porDia.has(d)).sort((a, b) => b.localeCompare(a));
  return { fiscales, otros, falta: !!f.error };
}

/** El análisis guardado de cada día pedido (con lo marcado como hecho), para la página de los fiscales. */
export async function analisisDeDias(fechas: string[]) {
  const dias = [...new Set(fechas)].filter(esDia).slice(0, 2);
  const { leerAjustes } = await import("@/modulos/inventario/analisis-ajustes");
  const r = await Promise.all(dias.map(async (d) => {
    const a = await leerAjustes(d);
    return { fecha: d, filas: a.guardado ? a.filas : null };
  }));
  return r;
}

/* ---------------- CÓMO VA EMPACADO CADA PRODUCTO ----------------
   Hay productos que van en cartón y no en caja plástica. Se define aquí, producto por producto, y queda para siempre:
   «carton» → no suma caja plástica; «plastica» → suma la caja escogida; «sin» → vuelve a la regla de siempre. */
const SQL4 = "Falta correr supabase/migraciones/2026-10-analisis-diferencia-empaque.sql en Supabase.";
const falta4 = (m: string) => (/analisis_dif_empaque|does not exist|PGRST205/i.test(m) ? SQL4 : m);

export async function guardarEmpaque(sku: string, empaque: "carton" | "plastica" | "sin", caja: string | null) {
  const codigo = String(sku ?? "").trim();
  if (!codigo) return { error: "Falta el producto." };
  const supabase = await createClient();
  if (empaque === "sin") {
    const { error } = await supabase.from("analisis_dif_empaque").delete().eq("sku", codigo);
    if (error) return { error: falta4(`${error.code} ${error.message}`) };
  } else {
    if (empaque === "plastica" && !String(caja ?? "").trim()) return { error: "Escoge la caja plástica en la que va." };
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("analisis_dif_empaque").upsert({
      sku: codigo, empaque: empaque === "carton" ? "CARTON" : "PLASTICA", caja: empaque === "plastica" ? String(caja).trim() : null,
      actualizado_por: user?.id ?? null, actualizado_en: new Date().toISOString(),
    }, { onConflict: "sku" });
    if (error) return { error: falta4(`${error.code} ${error.message}`) };
  }
  revalidatePath(RUTA);
  return { ok: true };
}


/* LAS ROTURAS EN SITIO que suman al conteo: la cantidad se puede corregir por día y código. `null` vuelve a lo calculado. */
const falta5 = (m: string) => (/analisis_dif_roturas|does not exist|PGRST205/i.test(m) ? "Falta correr supabase/migraciones/2026-11-analisis-diferencia-roturas.sql en Supabase." : m);

export async function guardarRotura(fecha: string, codigo: string, unidades: number | null, nota?: string | null) {
  const cod = String(codigo ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !cod) return { error: "Falta el día o el código." };
  const supabase = await createClient();
  if (unidades == null) {
    const { error } = await supabase.from("analisis_dif_roturas").delete().eq("fecha", fecha).eq("codigo", cod);
    if (error) return { error: falta5(`${error.code} ${error.message}`) };
  } else {
    if (!Number.isFinite(unidades) || unidades < 0) return { error: "La cantidad tiene que ser un número de cero en adelante." };
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("analisis_dif_roturas").upsert({
      fecha, codigo: cod, unidades: Math.round(unidades), nota: nota?.trim() || null,
      actualizado_por: user?.id ?? null, actualizado_en: new Date().toISOString(),
    }, { onConflict: "fecha,codigo" });
    if (error) return { error: falta5(`${error.code} ${error.message}`) };
  }
  revalidatePath(RUTA);
  return { ok: true };
}
