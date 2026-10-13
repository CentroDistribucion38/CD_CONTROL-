"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ALMACEN_CUADRE, armarCuadre, type BalanceoGuardado, type MovFila, type ZexiFila } from "@/modulos/inventario/cuadre";

const SQL_OTROS = "Falta correr supabase/migraciones/2026-10-cuadre-sap-otros.sql en Supabase.";
const SQL_HIST = "Falta correr supabase/migraciones/2026-10-cuadre-sap-historial.sql en Supabase.";
const faltaSql = (m: string) => (/cierre|cerrado/.test(m) ? SQL_HIST : /otros/.test(m) ? SQL_OTROS : m);

/**
 * LO QUE SE GUARDA DEL CUADRE SAP: el ZEXI (paso 1), las estibas del almacén y el interruptor del
 * pend. baja, y los movimientos 311 bajados de SAP (paso 3). Un renglón por día y almacén.
 */
const RUTA = "/inventario/balance/cuadre";
const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

async function poner(fecha: string, campos: Record<string, unknown>) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("cuadre_sap").upsert(
    { fecha, almacen: ALMACEN_CUADRE, ...campos, actualizado_en: new Date().toISOString() },
    { onConflict: "fecha,almacen" });
  if (error) return { error: faltaSql(error.message) };
  revalidatePath(RUTA);
  return { ok: true };
}

/** PASO 1 · el ZEXI de SAP: el stock de AG18 de ese día. Reemplaza el que hubiera. */
export async function guardarZexi(fecha: string, filasJson: string, archivo: string) {
  let filas: ZexiFila[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "El archivo no se pudo leer." } }
  filas = filas.filter((f) => f.codigo && Number.isFinite(Number(f.cantidad)));
  if (!filas.length) return { error: "El ZEXI no trae materiales de AG18." };
  return poner(fecha, { zexi: filas, zexi_archivo: archivo, zexi_en: new Date().toISOString() });
}

/** Las estibas de madera del almacén (se digitan) y si se suma el pend. baja. */
export async function guardarOpciones(fecha: string, estibas: number | null, sumarPend: boolean) {
  return poner(fecha, { estibas_almacen: estibas, sumar_pend_baja: sumarPend });
}

/** PASO 3 · los movimientos 311 bajados de SAP (neto en AG18 por material). Reemplaza los que hubiera. */
export async function guardarMovimientos(fecha: string, filasJson: string, archivo: string) {
  let filas: MovFila[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "El archivo no se pudo leer." } }
  filas = filas.filter((f) => f.codigo && Number.isFinite(Number(f.cantidad)));
  if (!filas.length) return { error: "El archivo no trae movimientos de AG18." };
  return poner(fecha, { movimientos: filas, mov_archivo: archivo, mov_en: new Date().toISOString() });
}

/** Quitar los movimientos (para volver a subirlos o rehacer el paso 2). */
export async function quitarMovimientos(fecha: string) {
  return poner(fecha, { movimientos: null, mov_archivo: null, mov_en: null });
}

/** OTROS (Andina…): a qué envase se suma una línea del conteo. Volver al código con que se contó la
 *  quita de la lista (es lo de siempre); «NO» = no sumar. */
export async function asignarOtros(fecha: string, id: string, destino: string, contado: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("cuadre_sap").select("otros").eq("fecha", fecha).eq("almacen", ALMACEN_CUADRE).maybeSingle();
  if (error) return { error: /otros/.test(error.message) ? SQL_OTROS : error.message };
  const otros = { ...(((data as { otros?: Record<string, string> | null } | null)?.otros) ?? {}) };
  if (!destino || destino === contado) delete otros[id]; else otros[id] = destino;
  return poner(fecha, { otros: Object.keys(otros).length ? otros : null });
}

/**
 * GUARDAR EL BALANCEO DEL DÍA — congela cómo quedó el cuadre de ese día (se arma otra vez aquí, en el
 * servidor, con lo que hay en este momento) para el histórico. Volver a guardar lo reemplaza.
 */
export async function guardarBalanceo(fecha: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const c = await armarCuadre(fecha);
  if (c.faltaSql) return { error: "Falta correr supabase/migraciones/2026-10-cuadre-sap.sql en Supabase." };
  if (c.fecha !== fecha) return { error: "Ese día no tiene conteos enviados." };
  const g = c.guardado;
  if (!g?.zexi?.length) return { error: "Sube primero la ZEXI de SAP de ese día: sin ella no hay balanceo que guardar." };
  const cero = (v: number | null) => v != null && Math.abs(v) < 0.5;
  const conSap = c.filas.filter((f) => f.sap != null);
  const cierre: BalanceoGuardado = {
    resumen: {
      materiales: c.filas.length, conSap: conSap.length, conMov: !!g.movimientos?.length,
      cuadran: conSap.filter((f) => cero(f.dif)).length,
      balanceados: conSap.filter((f) => cero(f.queda)).length,
      pendientes: conSap.filter((f) => !cero(f.queda)).length,
    },
    filas: c.filas.map(({ grupo, codigo, material, total, sap, dif, movido, sapDespues, queda }) => ({ grupo, codigo, material, total, sap, dif, movido, sapDespues, queda })),
    aplicados: c.aplicados,
    zexi_archivo: g.zexi_archivo, mov_archivo: g.mov_archivo, estibas_almacen: g.estibas_almacen, sumar_pend_baja: g.sumar_pend_baja,
  };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: yo } = user ? await supabase.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle() : { data: null };
  return poner(fecha, { cierre, cerrado_en: new Date().toISOString(), cerrado_por: user?.id ?? null, cerrado_nombre: yo?.nombre || yo?.usuario || null });
}
