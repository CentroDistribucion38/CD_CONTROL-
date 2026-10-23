"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { esAmbitoExcluidos, porDefecto } from "@/modulos/pasivos/excluidos";
import { estaBalanceada } from "@/modulos/inventario/cuadre";
import { armarCuadre, esAlmacen, type Almacen, type BalanceoGuardado, type MovFila, type ZexiFila } from "@/modulos/inventario/cuadre";

const SQL_OTROS = "Falta correr supabase/migraciones/2026-10-cuadre-sap-otros.sql en Supabase.";
const SQL_HIST = "Falta correr supabase/migraciones/2026-10-cuadre-sap-historial.sql en Supabase.";
const SQL_311 = "Falta correr supabase/migraciones/2026-10-cuadre-sap-311-ag22.sql en Supabase.";
const faltaSql = (m: string) => (/ajustes311|movs_sap/.test(m) ? SQL_311 : /cierre|cerrado/.test(m) ? SQL_HIST : /otros/.test(m) ? SQL_OTROS : m);

/**
 * LO QUE SE GUARDA DEL CUADRE SAP: el ZEXI (paso 1), las estibas del almacén y el interruptor del
 * pend. baja (solo AG18), los movimientos / la ZEXI nueva (paso 3) y el balanceo guardado.
 * Un renglón por día y almacén (AG18 o AG22).
 */
const RUTA = "/inventario/balance/cuadre";
const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const alm = (a?: string): Almacen => (esAlmacen(a) ? a : "AG18");

async function poner(fecha: string, almacen: Almacen, campos: Record<string, unknown>) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("cuadre_sap").upsert(
    { fecha, almacen, ...campos, actualizado_en: new Date().toISOString() },
    { onConflict: "fecha,almacen" });
  if (error) return { error: faltaSql(error.message) };
  revalidatePath(RUTA);
  return { ok: true };
}

/** PASO 1 · el ZEXI de SAP de ese almacén (en AG22, su Bloqueado). Reemplaza el que hubiera. */
export async function guardarZexi(fecha: string, filasJson: string, archivo: string, almacen?: string) {
  const a = alm(almacen);
  let filas: ZexiFila[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "El archivo no se pudo leer." } }
  filas = filas.filter((f) => f.codigo && Number.isFinite(Number(f.cantidad)));
  if (!filas.length) return { error: `El ZEXI no trae materiales de ${a}.` };
  return poner(fecha, a, { zexi: filas, zexi_archivo: archivo, zexi_en: new Date().toISOString() });
}

/** Las estibas de madera del almacén (se digitan) y si se suma el pend. baja. Solo AG18. */
export async function guardarOpciones(fecha: string, estibas: number | null, sumarPend: boolean) {
  return poner(fecha, "AG18", { estibas_almacen: estibas, sumar_pend_baja: sumarPend });
}

/** PASO 3 · lo movido en SAP (de la ZEXI nueva o del archivo del 311). Reemplaza lo que hubiera. */
export async function guardarMovimientos(fecha: string, filasJson: string, archivo: string, almacen?: string) {
  const a = alm(almacen);
  let filas: MovFila[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "El archivo no se pudo leer." } }
  filas = filas.filter((f) => f.codigo && Number.isFinite(Number(f.cantidad)));
  if (!filas.length) return { error: `El archivo no trae movimientos de ${a}.` };
  const r = await poner(fecha, a, { movimientos: filas, mov_archivo: archivo, mov_en: new Date().toISOString() });
  return r.error ? r : regrabarSiEstaGuardado(fecha, a);
}

/** Si el día ya estaba guardado (por ejemplo, hasta el paso 2), lo guardado se pone al día solo con la
 *  ZEXI nueva: así el histórico pasa de «falta validar» a «balanceado» / «pendientes» sin otro clic. */
async function regrabarSiEstaGuardado(fecha: string, almacen: Almacen) {
  const supabase = await createClient();
  const { data } = await supabase.from("cuadre_sap").select("cerrado_en").eq("fecha", fecha).eq("almacen", almacen).maybeSingle();
  if (!(data as { cerrado_en?: string | null } | null)?.cerrado_en) return { ok: true };
  return guardarBalanceo(fecha, almacen);
}

/** Quitar los movimientos (para volver a subirlos o rehacer el paso 2). */
export async function quitarMovimientos(fecha: string, almacen?: string) {
  const a = alm(almacen);
  const r = await poner(fecha, a, { movimientos: null, mov_archivo: null, mov_en: null });
  return r.error ? r : regrabarSiEstaGuardado(fecha, a);
}

/** AG22 · LOS 311 QUE SE APLICAN A LA ZEXI DE LAS 6 AM. Llegan las claves «AG18|código» que se marcaron en el toolbox; la suma o resta sale sola de lo que se hizo en cada almacén. */
export async function guardarAjustes311(fecha: string, clavesJson: string) {
  let claves: string[] = [];
  try { claves = JSON.parse(clavesJson) } catch { return { error: "No se pudo leer la selección." } }
  claves = [...new Set((Array.isArray(claves) ? claves : []).map(String).filter((c) => /^(AG18|AG17|AG16)\|[\w.\-]{1,40}$/.test(c)))];
  const r = await poner(fecha, "AG22", { ajustes311: claves.length ? claves : null });
  return r.error ? r : regrabarSiEstaGuardado(fecha, "AG22");
}

/** AG22 · EL ARCHIVO DE MOVIMIENTOS DE SAP (311): lo que entró o salió de AG22, por material, ya leído en el navegador. Reemplaza el anterior y se aplica solo a la ZEXI. */
export async function guardarMovsSap(fecha: string, filasJson: string, archivo: string) {
  let filas: MovFila[] = [];
  try { filas = JSON.parse(filasJson) } catch { return { error: "El archivo no se pudo leer." } }
  filas = filas.filter((f) => f.codigo && Number.isFinite(Number(f.cantidad)));
  if (!filas.length) return { error: "El archivo no trae movimientos de AG22." };
  const r = await poner(fecha, "AG22", { movs_sap: { archivo: String(archivo).slice(0, 200), en: new Date().toISOString(), filas } });
  return r.error ? r : regrabarSiEstaGuardado(fecha, "AG22");
}

/** Quitar el archivo de movimientos de SAP: la ZEXI vuelve a las partidas escogidas (o a la de las 6 AM sola). */
export async function quitarMovsSap(fecha: string) {
  const r = await poner(fecha, "AG22", { movs_sap: null });
  return r.error ? r : regrabarSiEstaGuardado(fecha, "AG22");
}

/** OTROS (Andina…): a qué envase se suma una línea del conteo (solo AG18). Volver al código con que se
 *  contó la quita de la lista (es lo de siempre); «NO» = no sumar. */
export async function asignarOtros(fecha: string, id: string, destino: string, contado: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("cuadre_sap").select("otros").eq("fecha", fecha).eq("almacen", "AG18").maybeSingle();
  if (error) return { error: /otros/.test(error.message) ? SQL_OTROS : error.message };
  const otros = { ...(((data as { otros?: Record<string, string> | null } | null)?.otros) ?? {}) };
  if (!destino || destino === contado) delete otros[id]; else otros[id] = destino;
  return poner(fecha, "AG18", { otros: Object.keys(otros).length ? otros : null });
}

/**
 * GUARDAR EL BALANCEO DEL DÍA — congela cómo quedó el cuadre de ese día y almacén (se arma otra vez
 * aquí, en el servidor, con lo que hay en este momento) para el histórico. Volver a guardar lo reemplaza.
 */
export async function guardarBalanceo(fecha: string, almacen?: string) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const a = alm(almacen);
  const c = await armarCuadre(fecha, a);
  if (c.faltaSql) return { error: "Falta correr supabase/migraciones/2026-10-cuadre-sap.sql en Supabase." };
  if (c.fecha !== fecha) return { error: a === "AG22" ? "Ese día no tiene nada en la base de Pasivos." : "Ese día no tiene conteos enviados." };
  const g = c.guardado;
  if (!g?.zexi?.length) return { error: "Sube primero la ZEXI de SAP de ese día: sin ella no hay balanceo que guardar." };
  const cero = (v: number | null) => v != null && Math.abs(v) < 0.5;
  const conSap = c.filas.filter((f) => f.sap != null);
  const cierre: BalanceoGuardado = {
    resumen: {
      materiales: c.filas.length, conSap: conSap.length, conMov: !!g.movimientos?.length,
      cuadran: conSap.filter((f) => cero(f.dif)).length,
      balanceados: conSap.filter((f) => estaBalanceada(f)).length,
      pendientes: conSap.filter((f) => !estaBalanceada(f)).length,
      entran: conSap.filter((f) => !cero(f.dif) && (f.dif ?? 0) < 0).length,
      salen: conSap.filter((f) => !cero(f.dif) && (f.dif ?? 0) > 0).length,
    },
    filas: c.filas.map(({ grupo, codigo, material, total, sap, dif, movido, sapDespues, queda, enLibre, estadoOk }) => ({ grupo, codigo, material, total, sap, dif, movido, sapDespues, queda, enLibre: enLibre ?? null, estadoOk: estadoOk ?? null })),
    aplicados: c.aplicados,
    zexi_archivo: g.zexi_archivo, mov_archivo: g.mov_archivo, estibas_almacen: g.estibas_almacen, sumar_pend_baja: g.sumar_pend_baja,
  };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: yo } = user ? await supabase.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle() : { data: null };
  return poner(fecha, a, { cierre, cerrado_en: new Date().toISOString(), cerrado_por: user?.id ?? null, cerrado_nombre: yo?.nombre || yo?.usuario || null });
}

/**
 * EL TOOLBOX DE EXCLUIDOS: guarda qué SKU quedan fuera de ese ámbito (AG18 = cuadre AG18; AG22 = cuadre
 * AG22 y Pasivos). Llega la lista de lo que el usuario dejó distinto a lo de siempre; se guarda solo eso,
 * así «Volver a lo de siempre» es guardar una lista vacía.
 */
export async function guardarExcluidos(ambito: string, eleccionesJson: string) {
  if (!esAmbitoExcluidos(ambito)) return { error: "Almacén inválido." };
  let el: { codigo: string; nombre?: string | null; fuera: boolean }[] = [];
  try { el = JSON.parse(eleccionesJson) } catch { return { error: "No se pudo leer la selección." } }
  const vistos = new Set<string>();
  const filas = (Array.isArray(el) ? el : [])
    .map((x) => ({ codigo: String(x?.codigo ?? "").trim(), nombre: x?.nombre ? String(x.nombre).slice(0, 200) : null, fuera: !!x?.fuera }))
    .filter((x) => /^[\w.\-]{1,40}$/.test(x.codigo) && !vistos.has(x.codigo) && vistos.add(x.codigo))
    .filter((x) => x.fuera !== porDefecto(ambito, x.codigo, x.nombre))
    .map((x) => ({ ambito, ...x }));
  const supabase = await createClient();
  const SQL_EXC = "Falta correr supabase/migraciones/2026-10-excluidos-sku.sql en Supabase.";
  const falta = (m: string) => (/excluidos_sku|does not exist|PGRST205/i.test(m) ? SQL_EXC : m);
  const d = await supabase.from("excluidos_sku").delete().eq("ambito", ambito);
  if (d.error) return { error: falta(`${d.error.code} ${d.error.message}`) };
  if (filas.length) {
    const i = await supabase.from("excluidos_sku").insert(filas);
    if (i.error) return { error: falta(`${i.error.code} ${i.error.message}`) };
  }
  revalidatePath(RUTA);
  revalidatePath("/inventario/balance/pasivos");
  return { ok: true, cambios: filas.length };
}
