import { createClient } from "@/lib/supabase/server";
import type { Causal } from "./hallazgos";

/**
 * LO QUE LEE LA PANTALLA DE AVERÍAS.
 *
 * Todo sale de `v_averias`, que es donde se calculan los días de la
 * baja y los que faltan para vencer. Tres pantallas calculando «se
 * vence pronto» por su cuenta son tres sitios donde se puede calcular
 * distinto, y el día que cambie la regla se arreglan dos.
 */

export type AveriaFila = {
  id: string;
  codigo: string;
  fecha: string;
  ubicacion: string;
  producto_sku: string;
  producto: string;
  cajas: number;
  unidades: number;
  vence: string | null;
  causal: Causal;
  causal_nombre: string;
  externa: boolean;
  reporto: string;
  documento: string | null;
  documento_en: string | null;
  nota: string | null;
  creado_por: string | null;
  creado_en: string;
  anulada_en: string | null;
  motivo_anulacion: string | null;
  pendiente_baja: boolean;
  dias_baja: number | null;
  dias_para_vencer: number | null;
  fotos: number;
};

export type CausalFila = {
  clave: string; nombre: string; externa: boolean; activo: boolean; orden: number | null;
};

/** El producto como lo ofrece el desplegable: del maestro de inventario. */
export type ProductoFila = { sku: string; nombre: string };

function sinTablas(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache");
}

export async function averias(limite = 1000):
  Promise<{ lista: AveriaFila[]; sinTabla: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_averias").select("*")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) return { lista: [], sinTabla: sinTablas(error.message) };
  return { lista: (data ?? []) as AveriaFila[], sinTabla: false };
}

export async function unaAveria(id: string): Promise<AveriaFila | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("v_averias").select("*").eq("id", id).maybeSingle();
  return (data as AveriaFila) ?? null;
}

export async function causales(soloActivas = true) {
  const supabase = await createClient();
  let q = supabase.from("averias_causales").select("clave, nombre, externa, activo, orden");
  if (soloActivas) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as CausalFila[];
}

/**
 * EL DESPLEGABLE DE PRODUCTOS SALE DEL MAESTRO DE INVENTARIO, igual que
 * el de roturas. No hay una segunda lista de productos para averías:
 * un material que existe en dos tablas se edita en una y se queda viejo
 * en la otra.
 */
export async function productosDeAverias(): Promise<ProductoFila[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("productos")
    .select("sku, nombre").eq("activo", true).order("nombre").limit(2000);
  return (data ?? []) as ProductoFila[];
}

/**
 * LAS UBICACIONES QUE YA SE HAN USADO, para proponerlas al registrar.
 *
 * NO ES UN MAESTRO, y por eso no hay tabla: es lo que ya se tecleó
 * antes. Un maestro de ubicaciones obligaría a darlas de alta antes de
 * poder registrar una avería en una calle nueva, y eso es exactamente
 * cómo se pierde el registro de algo que ya pasó.
 *
 * Proponerlas sí evita que la misma calle se escriba de cuatro formas
 * —«A03 M12», «a03-m12», «A3 · M12»—, que es lo que revienta el
 * hallazgo de concentración por calle.
 */
export async function ubicacionesUsadas(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("v_averias")
    .select("ubicacion").order("fecha", { ascending: false }).limit(500);
  const vistas = new Set<string>();
  for (const f of (data ?? []) as { ubicacion: string }[]) vistas.add(f.ubicacion);
  return [...vistas].sort();
}
