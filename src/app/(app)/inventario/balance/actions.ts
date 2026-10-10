"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * RECLASIFICAR — mover un envase de un estado a otro.
 *
 * Busca la fila en fefo_lineas por código + fecha (la del conteo
 * cerrado más reciente de esa fecha). Inserta en balance_reclasificaciones
 * con el envase_id (uuid) correspondiente.
 */
export async function reclasificar(fd: FormData) {
  const codigo = fd.get("codigo") as string;
  const fecha = fd.get("fecha") as string;
  const estado_original = fd.get("estado_original") as string;
  const estado_nuevo = fd.get("estado_nuevo") as string;
  const motivo = (fd.get("motivo") as string) || null;

  if (!codigo || !fecha || !estado_original || !estado_nuevo) {
    return { error: "Faltan datos" };
  }
  if (estado_original === estado_nuevo) {
    return { error: "El estado nuevo es igual al actual" };
  }

  const supabase = await createClient();

  /* fefo_lineas.codigo es bigint, el form manda texto → comparar directo.
     fefo_conteos.fecha es date (no timestamptz). */
  const { data: envase, error: errEnv } = await supabase
    .from("fefo_lineas")
    .select("id, conteo_id, fefo_conteos!inner(fecha, estado)")
    .eq("codigo", codigo)
    .eq("fefo_conteos.estado", "cerrado")
    .eq("fefo_conteos.fecha", fecha)
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (errEnv || !envase) {
    /* Intento alternativo: buscar solo por código y estado_envase. */
    const { data: env2 } = await supabase
      .from("fefo_lineas")
      .select("id")
      .eq("codigo", codigo)
      .eq("estado_envase", estado_original)
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!env2) return { error: "No se encontró el envase en el conteo" };

    const { error: errIns } = await supabase
      .from("balance_reclasificaciones")
      .insert({
        conteo_envase_id: env2.id,
        estado_original,
        estado_nuevo,
        motivo,
      });

    if (errIns) return { error: errIns.message };
    revalidatePath("/inventario/balance");
    return { ok: true };
  }

  const { error: errIns } = await supabase
    .from("balance_reclasificaciones")
    .insert({
      conteo_envase_id: envase.id,
      estado_original,
      estado_nuevo,
      motivo,
    });

  if (errIns) return { error: errIns.message };
  revalidatePath("/inventario/balance");
  return { ok: true };
}

/**
 * QUITAR RECLASIFICACIÓN — devolver el envase a su estado original.
 */
export async function quitarReclasificacion(fd: FormData) {
  const id = Number(fd.get("id"));
  if (!id) return { error: "Falta el id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("balance_reclasificaciones")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/inventario/balance");
  return { ok: true };
}
