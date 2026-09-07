"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const txt = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const num = (f: FormData, k: string) => Number(f.get(k) ?? 0) || 0;

export async function crearProducto(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("productos").insert({
    sku: txt(formData, "sku"),
    codigo_barras: txt(formData, "codigo_barras"),
    nombre: txt(formData, "nombre"),
    categoria: txt(formData, "categoria"),
    unidad: txt(formData, "unidad") ?? "UND",
    costo_unitario: num(formData, "costo_unitario"),
    stock_min: num(formData, "stock_min"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/inventario/productos");
}

export async function crearBodega(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("bodegas").insert({
    codigo: txt(formData, "codigo"),
    nombre: txt(formData, "nombre"),
    direccion: txt(formData, "direccion"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/inventario/bodegas");
}

export async function registrarMovimiento(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tipo = txt(formData, "tipo");
  const { error } = await supabase.from("movimientos").insert({
    tipo,
    producto_id: txt(formData, "producto_id"),
    bodega_id: txt(formData, "bodega_id"),
    bodega_destino_id: tipo === "traslado" ? txt(formData, "bodega_destino_id") : null,
    cantidad: num(formData, "cantidad"),
    costo_unitario: num(formData, "costo_unitario"),
    referencia: txt(formData, "referencia"),
    nota: txt(formData, "nota"),
    usuario_id: user?.id ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/inventario/movimientos");
  revalidatePath("/inventario");
}

export async function crearConteo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("conteos")
    .insert({
      codigo: txt(formData, "codigo"),
      bodega_id: txt(formData, "bodega_id"),
      nota: txt(formData, "nota"),
      responsable_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const { error: errIniciar } = await supabase.rpc("iniciar_conteo", {
    p_conteo_id: data.id,
  });
  if (errIniciar) throw new Error(errIniciar.message);

  revalidatePath("/inventario/conteos");
  redirect(`/inventario/conteos/${data.id}`);
}

export async function guardarLinea(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const lineaId = txt(formData, "linea_id");
  const conteoId = txt(formData, "conteo_id");
  const bruto = formData.get("cantidad_contada");
  const cantidad =
    typeof bruto === "string" && bruto.trim() !== "" ? Number(bruto) : null;

  const { error } = await supabase
    .from("conteo_lineas")
    .update({
      cantidad_contada: cantidad,
      nota: txt(formData, "nota"),
      contado_por: user?.id ?? null,
      contado_en: cantidad === null ? null : new Date().toISOString(),
    })
    .eq("id", lineaId);

  if (error) throw new Error(error.message);
  revalidatePath(`/inventario/conteos/${conteoId}`);
}

export async function cerrarConteo(formData: FormData) {
  const supabase = await createClient();
  const conteoId = txt(formData, "conteo_id");
  const { error } = await supabase.rpc("cerrar_conteo", {
    p_conteo_id: conteoId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/inventario/conteos/${conteoId}`);
  revalidatePath("/inventario/conteos");
  revalidatePath("/inventario");
}
