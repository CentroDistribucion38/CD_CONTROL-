import { createClient } from "@/lib/supabase/server";
import { todas } from "@/modulos/inventario/paginas";
import type { Existente } from "./logica";

/** AG07 CARNAVAL · lo que se lee de Supabase (el maestro de productos, el corte, los saldos y los movimientos). */
/** AG07 vive DENTRO del Cuadre SAP: mismos permisos que el Cuadre (ver / editar). */
export const RUTA_CUADRE = "/inventario/balance/cuadre";
export const SQL_FALTA = "Falta correr supabase/migraciones/2026-10-carnaval-ag07.sql en Supabase.";
export const faltaTabla = (m: string) => /carnaval_|does not exist|schema cache/i.test(m);

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
