/**
 * PRODUCTO · ANÁLISIS DE DIFERENCIA — el conteo de Bavaria del inventario cíclico contra la existencia de SAP.
 *
 * «Otro módulo que será el análisis de diferencia, donde se toma el conteo de Bavaria y se compara con la
 *  existencia y se cruzan las dos, así como el análisis de diferencia que tenemos en el Balance: debe llevar la
 *  misma estructura. Esta sería la plantilla.»
 *
 * Por código, en unidades, dos lados (igual que el de Balance):
 *   CONTEO = lo que contó BAVARIA en el cíclico (todas sus hojas) + las novedades de la plantilla que suman al conteo.
 *   SAP    = la ZEXI PRODUCTO de la plantilla (la existencia) + las novedades que suman a SAP.
 *   DIFERENCIA = CONTEO − SAP.
 * Lo que contó el operador logístico no suma: se muestra al lado, para ver si la pareja coincidió.
 *
 * QUÉ CÓDIGOS ENTRAN: los productos de las FAMILIAS que se escogieron en las hojas del cíclico (si una hoja no
 * tiene familias, entran todos los productos), más lo que Bavaria haya contado aunque sea de otra familia. Así
 * la ZEXI entera puede subirse sin que todo lo que no se contó salga como faltante. Los envases y los códigos de
 * otras familias de la plantilla quedan en «No entran».
 *
 * Usa la misma forma de fila que el de Balance (FilaAnalisis), así los ajustes y el análisis final son la misma
 * cuenta (calcularAjustes / analisisFinal).
 */
import { createClient } from "@/lib/supabase/server";
import { mismaFamilia } from "./fiscal";
import type { FilaAnalisis, Partida } from "./analisis-dif";
import { calcularAjustes, ROTURA_PT, type FilaFinal, type Hecho } from "./compensa";
export { ROTURA_PT };

export const ZEXI_PRODUCTO = "ZEXI PRODUCTO";
export const CONTEO_BAVARIA = "CONTEO BAVARIA (cíclico)";

/** Por código: las cajas rotas y contaminadas del período, lo calculado en unidades y lo que vale (corregido o no). */
export type RoturaPT = { rotas: number; contaminadas: number; unidades: number; calculado: number; editado: boolean; nota: string | null; n: number };
export type RoturasProducto = { desde: string; hasta: string; porCodigo: Record<string, RoturaPT>; total: number; falta: string | null };

export type Ciclico = { id: string; nombre: string; fecha: string; estado: string; publicado: boolean; familias: string[]; hojas: number };
export type NovedadProducto = { tipo: string; lado: "CONTEO" | "SAP" | "NO SUMA"; documento: string | null; codigo: string; unidades: number; archivo: string | null; subido_en: string };
export type FilaProducto = FilaAnalisis & {
  /** Lo que contó el operador logístico (no suma): para ver si la pareja coincidió. null = no contó ese código. */
  ol: number | null;
  /** Unidades por caja (para leer la diferencia en cajas). */
  upc: number;
};
export type AnalisisProducto = {
  ciclico: Ciclico | null;
  filas: FilaProducto[];
  novedades: NovedadProducto[];
  carga: { archivo: string | null; filas: number; subido_en: string | null } | null;
  /** Códigos de la plantilla que no entran (envase u otra familia), con su tipo. */
  noEntran: { codigo: string; tipo: string; motivo: string }[];
  /** Cuántos renglones / códigos contó cada equipo. */
  contado: { bavaria: { codigos: number; unidades: number }; ol: { codigos: number; unidades: number } };
  maestroSistema: Record<string, { upc: number; cpe: number; caja: string | null }>;
  /** Lo que falta en la base para que la pantalla funcione completa. */
  falta: string | null;
  /** Roturas de producto terminado del período (por defecto del 1 del mes al día del cíclico), ya sumadas al CONTEO. */
  roturas?: RoturasProducto;
};

const SQL = "Falta correr supabase/migraciones/2026-11-producto-ciclico.sql en Supabase.";
const faltaSql = (m: string) => /prod_dif|inv_ciclico|tipo|does not exist|PGRST20[25]|42703|42883/i.test(m);

/** Los inventarios cíclicos (el más reciente primero), con sus familias y cuántas hojas. */
export async function ciclicos(): Promise<{ lista: Ciclico[]; falta: string | null }> {
  const supabase = await createClient();
  const f = await supabase.from("inv_fiscales").select("id, nombre, fecha, estado, publicado_en")
    .eq("tipo", "CICLICO").order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(200);
  if (f.error) return { lista: [], falta: faltaSql(f.error.message) ? SQL : f.error.message };
  const ids = (f.data ?? []).map((x) => x.id as string);
  const h = ids.length ? await supabase.from("inv_fiscal_hojas").select("fiscal_id, familias").in("fiscal_id", ids).limit(5000) : { data: [], error: null };
  const fams = new Map<string, Set<string>>(), nh = new Map<string, number>();
  for (const x of (h.data ?? []) as { fiscal_id: string; familias: string[] | null }[]) {
    nh.set(x.fiscal_id, (nh.get(x.fiscal_id) ?? 0) + 1);
    const s = fams.get(x.fiscal_id) ?? new Set<string>();
    for (const fa of x.familias ?? []) if (fa?.trim()) s.add(fa.trim());
    fams.set(x.fiscal_id, s);
  }
  return {
    lista: (f.data ?? []).map((x) => ({
      id: x.id as string, nombre: x.nombre as string, fecha: String(x.fecha).slice(0, 10), estado: x.estado as string,
      publicado: !!x.publicado_en, familias: [...(fams.get(x.id as string) ?? [])], hojas: nh.get(x.id as string) ?? 0,
    })),
    falta: null,
  };
}

type Producto = { sku: string; nombre: string; familia: string | null; unidades_por_caja: number | null; cajas_por_estiba: number | null; tipo_material: string | null; envase_sku?: string | null };

export async function armarAnalisisProducto(c: Ciclico | null, rDesde?: string, rHasta?: string): Promise<AnalisisProducto> {
  const vacio: AnalisisProducto = { ciclico: c, filas: [], novedades: [], carga: null, noEntran: [], contado: { bavaria: { codigos: 0, unidades: 0 }, ol: { codigos: 0, unidades: 0 } }, maestroSistema: {}, falta: null };
  const supabase = await createClient();
  const pr = await supabase.from("productos").select("sku, nombre, familia, unidades_por_caja, cajas_por_estiba, tipo_material").limit(5000);
  const productos = new Map(((pr.data ?? []) as Producto[]).map((p) => [String(p.sku), p]));
  const maestroSistema: AnalisisProducto["maestroSistema"] = {};
  for (const p of productos.values()) maestroSistema[p.sku] = { upc: Number(p.unidades_por_caja) || 1, cpe: Number(p.cajas_por_estiba) || 0, caja: null };
  if (!c) return { ...vacio, maestroSistema };

  const [cnt, nov] = await Promise.all([
    supabase.rpc("inv_ciclico_conteo", { p_fiscal: c.id }),
    supabase.from("prod_dif_novedades").select("tipo, lado, documento, codigo, unidades, archivo, subido_en").eq("fiscal_id", c.id).order("id").limit(20000),
  ]);
  if (cnt.error || nov.error) {
    const m = (cnt.error ?? nov.error)!.message;
    return { ...vacio, maestroSistema, falta: faltaSql(m) ? SQL : m };
  }
  const contado = (cnt.data ?? []) as { equipo: string; hoja: number; ubicacion: string; sku: string; material: string; familia: string | null; unidades: number | string; unidades_por_caja: number | string }[];
  const novedades = ((nov.data ?? []) as NovedadProducto[]).map((x) => ({ ...x, unidades: Number(x.unidades) || 0 }));

  /* LAS FAMILIAS DEL CÍCLICO: si alguna hoja no tiene, entran todos los productos. */
  const conFamilia = c.familias.length > 0;
  const esDelCiclico = (sku: string) => {
    const p = productos.get(sku);
    if (!p) return true;                                           // un código que el maestro no conoce: se muestra, no se esconde
    if ((p.tipo_material ?? "PRODUCTO") !== "PRODUCTO") return false;
    return !conFamilia || c.familias.some((f) => mismaFamilia(f, p.familia));
  };

  type Acum = { conteo: Map<string, number>; sap: Map<string, number>; ubic: Map<string, number>; ol: number | null };
  const por = new Map<string, Acum>();
  const acum = (sku: string) => por.get(sku) ?? por.set(sku, { conteo: new Map(), sap: new Map(), ubic: new Map(), ol: null }).get(sku)!;
  const suma = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  const tot = { bavaria: { codigos: new Set<string>(), unidades: 0 }, ol: { codigos: new Set<string>(), unidades: 0 } };
  for (const r of contado) {
    const u = Number(r.unidades) || 0, sku = String(r.sku);
    if (r.equipo === "BAVARIA") {
      const a = acum(sku);
      suma(a.conteo, CONTEO_BAVARIA, u);
      suma(a.ubic, r.ubicacion, u);
      tot.bavaria.codigos.add(sku); tot.bavaria.unidades += u;
    } else if (r.equipo === "OL") {
      const a = acum(sku);
      a.ol = (a.ol ?? 0) + u;
      tot.ol.codigos.add(sku); tot.ol.unidades += u;
    }
  }

  const noEntran: AnalisisProducto["noEntran"] = [];
  for (const x of novedades) {
    if (x.lado === "NO SUMA") continue;
    const sku = String(x.codigo);
    /* Lo que Bavaria contó entra siempre; lo demás, si es producto de las familias del cíclico. */
    if (!tot.bavaria.codigos.has(sku) && !esDelCiclico(sku)) {
      const p = productos.get(sku);
      noEntran.push({ codigo: sku, tipo: x.tipo, motivo: p && (p.tipo_material ?? "PRODUCTO") !== "PRODUCTO" ? "envase" : `familia ${p?.familia ?? "—"}` });
      continue;
    }
    const a = acum(sku);
    const nombre = x.documento ? `${x.tipo} · ${x.documento}` : x.tipo;
    suma(x.lado === "SAP" ? a.sap : a.conteo, nombre, x.unidades);
  }

  /* LAS ROTURAS DE PRODUCTO TERMINADO (Quiebra en sitio): lo que se rompió o se contaminó ya no está en la bodega y SAP todavía
     lo tiene, así que suma al CONTEO de su código. Igual que la ROTURA EN SITIO del análisis de Balance: del 1 del mes al día
     del cíclico, o el rango que se escoja; cajas (rotas + contaminadas) × unidades por caja del producto; si alguien corrigió
     la cantidad de un código en este cíclico (prod_dif_roturas), vale lo corregido. */
  const esDia = (x?: string) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? "");
  const roHasta = esDia(rHasta) ? rHasta! : c.fecha;
  const roDesdeIn = esDia(rDesde) ? rDesde! : `${c.fecha.slice(0, 7)}-01`;
  const roDesde = roDesdeIn <= roHasta ? roDesdeIn : roHasta;
  const roturas: RoturasProducto = { desde: roDesde, hasta: roHasta, porCodigo: {}, total: 0, falta: null };
  {
    const [rr, ro] = await Promise.all([
      supabase.rpc("prod_dif_roturas_pt", { p_desde: roDesde, p_hasta: roHasta }),
      supabase.from("prod_dif_roturas").select("codigo, unidades, nota").eq("fiscal_id", c.id),
    ]);
    if (rr.error || ro.error) roturas.falta = /prod_dif_roturas|does not exist|PGRST20[25]|42883/i.test(`${(rr.error ?? ro.error)!.code} ${(rr.error ?? ro.error)!.message}`)
      ? "Para que sumen las roturas de producto terminado falta correr supabase/migraciones/2026-11-producto-roturas.sql en Supabase."
      : `No se pudieron leer las roturas: ${(rr.error ?? ro.error)!.message}`;
    const sobre = new Map(((ro.error ? [] : ro.data ?? []) as { codigo: string; unidades: number; nota: string | null }[]).map((x) => [String(x.codigo), x]));
    const calc = new Map<string, { rotas: number; contaminadas: number; n: number }>();
    for (const r of ((rr.error ? [] : rr.data ?? []) as { codigo: string; rotas: number; contaminadas: number; reportes: number }[])) {
      calc.set(String(r.codigo).trim(), { rotas: Number(r.rotas) || 0, contaminadas: Number(r.contaminadas) || 0, n: Number(r.reportes) || 0 });
    }
    for (const k of new Set([...calc.keys(), ...sobre.keys()])) {
      if (!tot.bavaria.codigos.has(k) && !esDelCiclico(k)) continue;     // solo el producto del cíclico (o lo que Bavaria contó)
      if (!productos.has(k) && !sobre.has(k)) continue;                   // sin maestro no hay unidades por caja
      const a = calc.get(k), o = sobre.get(k);
      const upc = Number(productos.get(k)?.unidades_por_caja) || 1;
      const cu = Math.round(((a?.rotas ?? 0) + (a?.contaminadas ?? 0)) * upc);
      const val = o ? Number(o.unidades) || 0 : cu;
      roturas.porCodigo[k] = { rotas: a?.rotas ?? 0, contaminadas: a?.contaminadas ?? 0, unidades: val, calculado: cu, editado: !!o, nota: o?.nota ?? null, n: a?.n ?? 0 };
      roturas.total += val;
      if (val) suma(acum(k).conteo, ROTURA_PT, val);
    }
  }

  const lista = (m: Map<string, number>): Partida[] => [...m].filter(([, v]) => v !== 0).map(([nombre, cantidad]) => ({ nombre, cantidad }));
  const s = (m: Map<string, number>) => [...m.values()].reduce((t, v) => t + v, 0);
  const famOrden = (f: string | null | undefined) => {
    const i = c.familias.findIndex((x) => mismaFamilia(x, f));
    return i < 0 ? 99 : i;
  };
  const filas: FilaProducto[] = [...por].map(([codigo, a]) => {
    const p = productos.get(codigo);
    const sap = s(a.sap), conteo = s(a.conteo);
    const familia = (p?.familia ?? "").trim() || "Sin familia";
    return {
      familia, orden: famOrden(p?.familia), codigo, descripcion: p?.nombre ?? "— (no está en el maestro)",
      sap, conteo, diferencia: conteo - sap,
      deSap: lista(a.sap), deConteo: lista(a.conteo),
      ubicaciones: [...a.ubic].map(([ubicacion, cantidad]) => ({ ubicacion, cantidad })).sort((x, y) => x.ubicacion.localeCompare(y.ubicacion, "es", { numeric: true })),
      ol: a.ol, upc: Number(p?.unidades_por_caja) || 1,
    };
  }).sort((x, y) => x.orden - y.orden || x.familia.localeCompare(y.familia, "es") || x.codigo.localeCompare(y.codigo, "es", { numeric: true }));

  const ult = novedades.reduce<NovedadProducto | null>((m, x) => (!m || x.subido_en > m.subido_en ? x : m), null);
  return {
    ciclico: c, filas, novedades, noEntran: dedupe(noEntran), maestroSistema, falta: null, roturas,
    carga: novedades.length ? { archivo: ult?.archivo ?? null, filas: novedades.length, subido_en: ult?.subido_en ?? null } : null,
    contado: {
      bavaria: { codigos: tot.bavaria.codigos.size, unidades: tot.bavaria.unidades },
      ol: { codigos: tot.ol.codigos.size, unidades: tot.ol.unidades },
    },
  };
}
const dedupe = (xs: AnalisisProducto["noEntran"]) => [...new Map(xs.map((x) => [`${x.codigo}|${x.tipo}`, x])).values()];

/* ---------------- PASO 2 y 3: LO GUARDADO, LOS AJUSTES Y EL FINAL ---------------- */
export type GuardadoProducto = { fiscal_id: string; fecha: string; guardado_en: string; guardado_por: string | null; sap: number; conteo: number; filas: FilaProducto[] };

export async function leerAjustesProducto(fiscalId: string) {
  const supabase = await createClient();
  const [g, o] = await Promise.all([
    supabase.from("prod_dif_guardado").select("*").eq("fiscal_id", fiscalId).maybeSingle(),
    supabase.from("prod_dif_obs").select("codigo, observacion, ajuste_hecho").eq("fiscal_id", fiscalId),
  ]);
  const err = g.error ?? o.error;
  if (err) return { guardado: null, filas: [], final: null, falta: faltaSql(err.message) ? SQL : err.message };
  const obs: Record<string, string> = {}, hechos: Record<string, Hecho> = {};
  for (const x of (o.data ?? []) as { codigo: string; observacion: string; ajuste_hecho: number | null }[]) {
    obs[x.codigo] = x.observacion;
    hechos[x.codigo] = { comp: true, ajuste: x.ajuste_hecho == null ? null : Number(x.ajuste_hecho) };
  }
  const gd = g.data as (Omit<GuardadoProducto, "guardado_por"> & { guardado_por: string | null; final?: FilaFinal[] | null; final_en?: string | null }) | null;
  let quien: string | null = null;
  if (gd?.guardado_por) {
    const p = await supabase.from("perfiles").select("usuario, nombre").eq("id", gd.guardado_por).maybeSingle();
    const pp = p.data as { usuario: string | null; nombre: string | null } | null;
    quien = pp?.nombre || pp?.usuario || null;
  }
  const guardado: GuardadoProducto | null = gd ? { ...gd, fecha: String(gd.fecha).slice(0, 10), sap: Number(gd.sap), conteo: Number(gd.conteo), guardado_por: quien } : null;
  return {
    guardado,
    filas: guardado ? calcularAjustes(guardado.filas, obs, hechos) : [],
    final: gd?.final_en ? { en: gd.final_en, filas: gd.final ?? [] } : null,
    falta: null as string | null,
  };
}

/** EL HISTÓRICO: cada cíclico guardado con sus totales. */
export type DiaProducto = { fiscalId: string; nombre: string; fecha: string; guardadoEn: string; sap: number; conteo: number; diferencia: number; codigos: number; conDif: number; final: { diferencia: number; pendientes: number } | null };
export async function historicoProducto(): Promise<{ dias: DiaProducto[]; falta: string | null }> {
  const supabase = await createClient();
  const g = await supabase.from("prod_dif_guardado").select("fiscal_id, fecha, filas, sap, conteo, guardado_en, final, final_en").order("fecha", { ascending: false }).limit(200);
  if (g.error) return { dias: [], falta: faltaSql(g.error.message) ? SQL : g.error.message };
  const ids = (g.data ?? []).map((x) => x.fiscal_id as string);
  const f = ids.length ? await supabase.from("inv_fiscales").select("id, nombre").in("id", ids) : { data: [] };
  const nombre = new Map(((f.data ?? []) as { id: string; nombre: string }[]).map((x) => [x.id, x.nombre]));
  return {
    falta: null,
    dias: ((g.data ?? []) as { fiscal_id: string; fecha: string; filas: FilaProducto[]; sap: number; conteo: number; guardado_en: string; final: FilaFinal[] | null; final_en: string | null }[]).map((x) => ({
      fiscalId: x.fiscal_id, nombre: nombre.get(x.fiscal_id) ?? "—", fecha: String(x.fecha).slice(0, 10), guardadoEn: x.guardado_en,
      sap: Number(x.sap), conteo: Number(x.conteo), diferencia: Number(x.conteo) - Number(x.sap),
      codigos: (x.filas ?? []).length, conDif: (x.filas ?? []).filter((r) => Number(r.diferencia) !== 0).length,
      final: x.final_en && x.final ? { diferencia: x.final.reduce((t, r) => t + (Number(r.difFinal) || 0), 0), pendientes: x.final.filter((r) => Number(r.difFinal) !== 0).length } : null,
    })),
  };
}
