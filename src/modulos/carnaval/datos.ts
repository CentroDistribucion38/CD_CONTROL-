import { createClient } from "@/lib/supabase/server";
import { todas } from "@/modulos/inventario/paginas";
import type { CascoSitio, ContextoAuto, Existente } from "./logica";
import { sitiosCasco } from "@/modulos/casco/datos";

/** AG07 CARNAVAL · lo que se lee de Supabase (el maestro de productos, el corte, los saldos y los movimientos). */
/** AG07 vive DENTRO del Cuadre SAP: mismos permisos que el Cuadre (ver / editar). */
export const RUTA_CUADRE = "/inventario/balance/cuadre";
export const SQL_FALTA = "Falta correr supabase/migraciones/2026-10-carnaval-ag07.sql en Supabase.";
/* Solo cuando de verdad falta una tabla o columna (antes también contaba cualquier error que nombrara «carnaval_…», como un duplicado, y mostraba este aviso por error). */
export const faltaTabla = (m: string) => /does not exist|schema cache|could not find the/i.test(m);

export type Producto = { codigo: string; descripcion: string; und_por_pallet: number; cc: number; orden: number };
export type Movimiento = {
  id: string; fecha: string; tipo: "INICIAL" | "INGRESO" | "TRASIEGO" | "AJUSTE"; codigo: string; pallets: number; und: number | null;
  remision: string | null; placa: string | null; nota: string | null; anulado: boolean; anulado_motivo: string | null; creado_en: string;
  historial: { antes: unknown; despues: unknown; por: string; en: string }[];
};

export async function productosYCorte() {
  const supabase = await createClient();
  const [p, c] = await Promise.all([
    supabase.from("carnaval_productos").select("codigo, descripcion, und_por_pallet, cc, orden").order("orden"),
    supabase.from("carnaval_config").select("valor").eq("clave", "corte").maybeSingle(),
  ]);
  if (p.error) return { error: p.error.message, productos: [] as Producto[], corte: "" };
  const productos = (p.data ?? []).map((x) => ({ ...x, und_por_pallet: Number(x.und_por_pallet), cc: Number(x.cc), orden: Number(x.orden) })) as Producto[];
  return { error: null, productos, corte: (c.data?.valor as string | undefined) ?? "1900-01-01" };
}

/** Los ingresos de Peldar ya cargados (los vigentes), con su llave, para compararlos con el archivo de hoy. */
export async function ingresosCargados() {
  const supabase = await createClient();
  const r = await todas<{ id: string; clave: string; fecha: string; pallets: number; und: number | null }>((d, h) =>
    supabase.from("carnaval_movimientos").select("id, clave, fecha, pallets, und").eq("tipo", "INGRESO").eq("anulado", false).not("clave", "is", null).order("id").range(d, h));
  const filas: Existente[] = r.data.map((x) => ({ id: x.id, clave: x.clave, fecha: String(x.fecha), pallets: Number(x.pallets), und: x.und == null ? null : Number(x.und) }));
  return { error: r.error, filas };
}

/** Los ingresos de Peldar que alguien ANULÓ: la llave sigue ocupada, así que si el archivo los trae de nuevo se reactivan. */
export async function ingresosAnulados() {
  const supabase = await createClient();
  const r = await todas<{ id: string; clave: string; fecha: string; pallets: number; und: number | null }>((d, h) =>
    supabase.from("carnaval_movimientos").select("id, clave, fecha, pallets, und").eq("tipo", "INGRESO").eq("anulado", true).not("clave", "is", null).order("id").range(d, h));
  const filas: Existente[] = r.data.map((x) => ({ id: x.id, clave: x.clave, fecha: String(x.fecha), pallets: Number(x.pallets), und: x.und == null ? null : Number(x.und) }));
  return { error: r.error, filas };
}

export async function saldosA(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("carnaval_saldos", { p_fecha: fecha });
  const m = new Map<string, number>();
  for (const x of (data ?? []) as { codigo: string; pallets: number }[]) m.set(x.codigo, Number(x.pallets));
  return { error: error?.message ?? null, saldos: m };
}

export async function ultimosMovimientos(limite = 150) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("carnaval_movimientos")
    .select("id, fecha, tipo, codigo, pallets, und, remision, placa, nota, anulado, anulado_motivo, creado_en, historial")
    .order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(limite);
  return { error: error?.message ?? null, filas: ((data ?? []) as Movimiento[]).map((x) => ({ ...x, pallets: Number(x.pallets), und: x.und == null ? null : Number(x.und), fecha: String(x.fecha) })) };
}

/** El inventario diario guardado de un día (la hoja completa) y los días que tienen inventario. */
export async function inventarioDe(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("carnaval_existencias").select("fecha, secciones, validacion, foto_nombre, actualizado_en").eq("fecha", fecha).maybeSingle();
  return { error: error?.message ?? null, fila: data as { fecha: string; secciones: import("./logica").SeccionHoja[]; validacion: (import("./logica").FilaValidacion & { decision?: string })[]; foto_nombre: string | null; actualizado_en: string } | null };
}
export async function diasConInventario() {
  const supabase = await createClient();
  const { data } = await supabase.from("carnaval_existencias").select("fecha").order("fecha", { ascending: false }).limit(60);
  return ((data ?? []) as { fecha: string }[]).map((x) => String(x.fecha));
}

/** El último inventario guardado (de cualquier día): sirve de molde para leer la foto del siguiente. */
export async function ultimoInventario() {
  const supabase = await createClient();
  const { data } = await supabase.from("carnaval_existencias").select("secciones").order("fecha", { ascending: false }).limit(1).maybeSingle();
  return (data?.secciones ?? null) as import("./logica").SeccionHoja[] | null;
}

/**
 * EL MAESTRO DE SKU contra el que se amarra la hoja de inventario: el Maestro de Inventario (productos, el oficial), el de Pasivos
 * y, solo si un código no está en ninguno, los productos de Carnaval. Si un código está en varios, manda el primero de esa lista:
 * la descripción es la de CONTROL, no la de la hoja ni la de Carnaval.
 */
export type Sku = { codigo: string; descripcion: string };
export async function maestroSku(): Promise<Sku[]> {
  const supabase = await createClient();
  const [c, pa, pr] = await Promise.all([
    todas<{ codigo: string; descripcion: string }>((d, h) => supabase.from("carnaval_productos").select("codigo, descripcion").order("codigo").range(d, h)),
    todas<{ codigo: string; descripcion: string | null }>((d, h) => supabase.from("pasivos_maestro").select("codigo, descripcion").neq("activo", false).order("codigo").range(d, h)),
    todas<{ sku: string; nombre: string | null }>((d, h) => supabase.from("productos").select("sku, nombre").neq("activo", false).order("sku").range(d, h)),
  ]);
  const carnaval = c.error ? [] : c.data.map((x) => ({ codigo: String(x.codigo ?? "").trim(), descripcion: String(x.descripcion ?? "").trim() }));
  const pasivos = pa.error ? [] : pa.data.map((x) => ({ codigo: String(x.codigo ?? "").trim(), descripcion: String(x.descripcion ?? "").trim() }));
  const productos = pr.error ? [] : pr.data.map((x) => ({ codigo: String(x.sku ?? "").trim(), descripcion: String(x.nombre ?? "").trim() }));
  const visto = new Map<string, Sku>();
  for (const x of [...productos, ...pasivos, ...carnaval]) if (x.codigo && !visto.has(x.codigo)) visto.set(x.codigo, { codigo: x.codigo, descripcion: x.descripcion || x.codigo });
  return [...visto.values()];
}

/** Lo aprendido: «sección|nombre en la hoja» → código. Si la tabla aún no existe, vacío (se avisa al guardar). */
export async function equivalencias(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const r = await todas<{ seccion: string; concepto: string; codigo: string }>((d, h) =>
    supabase.from("carnaval_equivalencias").select("seccion, concepto, codigo").order("seccion").order("concepto").range(d, h));
  if (r.error) return {};
  return Object.fromEntries(r.data.map((x) => [`${x.seccion}|${x.concepto}`, x.codigo]));
}


/** El último saldo de Casco de vidrio (hasta ese día) de AG07 Alm. Bodega Carnaval y de CA22 ERR Atlántico. */
export async function cascoAl(fecha: string): Promise<Record<string, CascoSitio | null | undefined>> {
  const out: Record<string, CascoSitio | null | undefined> = {};
  const { lista, sinTabla } = await sitiosCasco();
  if (sinTabla || !lista.length) return out;                 // sin permiso o sin la tabla: no se toca lo que había
  const supabase = await createClient();
  for (const centro of ["AG07", "CA22"]) {
    const s = lista.find((x) => (x.centro ?? "").toUpperCase() === centro);
    if (!s) continue;
    const { data: u, error } = await supabase.from("v_casco").select("fecha").eq("ubicacion", s.clave).lte("fecha", fecha).order("fecha", { ascending: false }).limit(1);
    if (error) continue;
    const dia = u?.[0]?.fecha as string | undefined;
    if (!dia) { out[centro] = null; continue }
    const { data, error: e2 } = await supabase.from("v_casco").select("sku, descripcion, inventario").eq("ubicacion", s.clave).eq("fecha", dia).order("sku");
    if (e2) continue;
    out[centro] = { fecha: String(dia), nombre: s.nombre, filas: (data ?? []).map((r) => ({ sku: String(r.sku), descripcion: String(r.descripcion ?? r.sku), estibas: Number(r.inventario ?? 0) })).filter((r) => r.estibas !== 0) };
  }
  return out;
}

/** Lo que se trae solo para la hoja de un día: los pallets de la app y el casco de AG07 y CA22. */
export async function contextoAuto(fecha: string): Promise<{ error: string | null; ctx: ContextoAuto }> {
  const [pc, s, casco] = await Promise.all([productosYCorte(), saldosA(fecha), cascoAl(fecha)]);
  const error = pc.error ?? s.error;
  return { error, ctx: { fecha, pallets: Object.fromEntries(s.saldos), carnaval: pc.productos.map((p) => p.codigo), casco } };
}

/** La hoja de la que arranca un día sin guardar: la guardada más reciente antes de ese día (o, si no hay, la más cercana después). */
export async function hojaBase(fecha: string) {
  const supabase = await createClient();
  const antes = await supabase.from("carnaval_existencias").select("fecha, secciones").lt("fecha", fecha).order("fecha", { ascending: false }).limit(1).maybeSingle();
  if (antes.data) return { fecha: String(antes.data.fecha), secciones: antes.data.secciones as import("./logica").SeccionHoja[] };
  const despues = await supabase.from("carnaval_existencias").select("fecha, secciones").gt("fecha", fecha).order("fecha", { ascending: true }).limit(1).maybeSingle();
  return despues.data ? { fecha: String(despues.data.fecha), secciones: despues.data.secciones as import("./logica").SeccionHoja[] } : null;
}

/** Los pallets que todavía NO tienen entrada de mercancía en SAP (el archivo de Peldar los trae sin «INGRESO» o sin «Entrada de Mercancía»), por código, hasta un día. */
export async function pendientesEM(fecha: string) {
  const supabase = await createClient();
  const r = await todas<{ codigo: string; pallets: number }>((d, h) =>
    supabase.from("carnaval_movimientos").select("codigo, pallets").eq("tipo", "INGRESO").eq("anulado", false).eq("em_leida", true).lte("fecha", fecha)
      .or("entrada_mercancia.is.null,ingreso.is.null").order("id").range(d, h));
  const m = new Map<string, number>();
  for (const x of r.data) m.set(x.codigo, (m.get(x.codigo) ?? 0) + Number(x.pallets));
  /* Si todavía no se corrió el SQL de las columnas nuevas, no es un error: no hay pendientes que restar. */
  const falta = !!r.error && /em_leida|entrada_mercancia|ingreso|schema cache|does not exist/i.test(String(r.error));
  return { error: falta ? null : (r.error ? String(r.error) : null), faltaSql: falta, pendientes: m };
}

/** La ZEXI de AG07 (con AG71) que se subió al Cuadre SAP ese día. */
export async function zexiAg07(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("carnaval_zexi").select("filas, archivo, actualizado_en").eq("fecha", fecha).maybeSingle();
  return { error: error?.message ?? null, zexi: data as { filas: import("./logica").ZexiAlm[]; archivo: string | null; actualizado_en: string } | null };
}

/** Unidades por caja y cajas por estiba de cada SKU: el maestro de Pasivos manda y, si no está, el de Inventario (como el Cuadre de AG18). */
export async function factoresSku() {
  const supabase = await createClient();
  const [pas, prod] = await Promise.all([
    todas<{ codigo: string; unidades_por_caja: number | null; cajas_por_estiba: number | null }>((d, h) => supabase.from("pasivos_maestro").select("codigo, unidades_por_caja, cajas_por_estiba").order("codigo").range(d, h)),
    todas<{ sku: string; unidades_por_caja: number | null; cajas_por_estiba: number | null }>((d, h) => supabase.from("productos").select("sku, unidades_por_caja, cajas_por_estiba").order("sku").range(d, h)),
  ]);
  const m = new Map<string, import("./logica").FactorSku>();
  for (const x of prod.data) m.set(String(x.sku), { upc: Number(x.unidades_por_caja) || 1, cpe: Number(x.cajas_por_estiba) || 0 });
  for (const x of pas.data) { const a = m.get(String(x.codigo)); m.set(String(x.codigo), { upc: Number(x.unidades_por_caja) || a?.upc || 1, cpe: Number(x.cajas_por_estiba) || a?.cpe || 0 }) }
  return { error: pas.error ? String(pas.error) : prod.error ? String(prod.error) : null, factores: m };
}
