"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const txt = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const num = (f: FormData, k: string) => Number(f.get(k) ?? 0) || 0;

function refrescar() {
  revalidatePath("/quiebra");
  revalidatePath("/inicio");
}

export async function reportarQuiebra(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cantidad = num(formData, "cantidad");
  if (cantidad <= 0) throw new Error("La cantidad debe ser mayor que cero.");

  const { error } = await supabase.from("quiebras").insert({
    producto_id: txt(formData, "producto_id"),
    bodega_id: txt(formData, "bodega_id"),
    causa_id: txt(formData, "causa_id"),
    cantidad,
    lote: txt(formData, "lote"),
    nota: txt(formData, "nota"),
    estado: "reportada",
    reportado_por: user?.id ?? null,
  });

  if (error) throw new Error(error.message);

  refrescar();
  redirect("/quiebra");
}

export async function aprobarQuiebra(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("aprobar_quiebra", {
    p_quiebra_id: txt(formData, "quiebra_id"),
    p_nota: txt(formData, "nota_resolucion"),
  });
  if (error) throw new Error(error.message);

  refrescar();
  revalidatePath("/inventario");
  revalidatePath("/inventario/movimientos");
}

export async function rechazarQuiebra(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rechazar_quiebra", {
    p_quiebra_id: txt(formData, "quiebra_id"),
    p_nota: txt(formData, "nota_resolucion"),
  });
  if (error) throw new Error(error.message);

  refrescar();
}

export async function crearCausa(formData: FormData) {
  const supabase = await createClient();
  const codigo = txt(formData, "codigo");
  const { error } = await supabase.from("causas_quiebra").insert({
    codigo: codigo?.toUpperCase(),
    nombre: txt(formData, "nombre"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/quiebra/causas");
}

export async function alternarCausa(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("causas_quiebra")
    .update({ activo: formData.get("activo") === "true" })
    .eq("id", txt(formData, "causa_id"));
  if (error) throw new Error(error.message);
  revalidatePath("/quiebra/causas");
}
