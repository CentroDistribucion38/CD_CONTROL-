"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { consolidadoDelDia, diasConConteo } from "@/modulos/inventario/balance";

const normEstado = (e: string | null | undefined) => {
  const t = (e ?? "").trim().toUpperCase();
  return t.includes("EXTRASUCIO") ? "EXTRASUCIO" : t.includes("LAVADO") ? "LAVADO" : t.includes("BAJA") ? "BAJA" : t;
};

/** Los renglones del consolidado de ese día de ese material (con sus ids). */
async function renglones(codigo: string, fecha: string) {
  const { conteos } = await diasConConteo();
  const { vigentes } = await consolidadoDelDia(fecha, conteos);
  return vigentes.filter((r) => String(r.codigo) === codigo);
}

/**
 * RECLASIFICAR — mover un material de un estado a otro en el consolidado de ese día.
 * Se guarda por renglón del conteo (su id) en balance_reclasificaciones.
 */
export async function reclasificar(fd: FormData) {
  const codigo = String(fd.get("codigo") ?? "");
  const fecha = String(fd.get("fecha") ?? "");
  const estado_original = String(fd.get("estado_original") ?? "");
  const estado_nuevo = String(fd.get("estado_nuevo") ?? "");
  const motivo = (fd.get("motivo") as string) || null;
  if (!codigo || !fecha || !estado_original || !estado_nuevo) return { error: "Faltan datos" };
  if (estado_original === estado_nuevo) return { error: "El estado nuevo es igual al actual" };

  const supabase = await createClient();
  const rs = await renglones(codigo, fecha);
  /* Los renglones que HOY están en el estado original (ya reclasificados o tal como se contaron). */
  const ids = rs.map((r) => r.id);
  const { data: ya } = ids.length
    ? await supabase.from("balance_reclasificaciones").select("conteo_envase_id, estado_nuevo, creado_en").in("conteo_envase_id", ids).order("creado_en")
    : { data: [] as { conteo_envase_id: string; estado_nuevo: string }[] };
  const actual = new Map<string, string>();
  for (const x of ya ?? []) actual.set(x.conteo_envase_id, x.estado_nuevo);
  const mover = rs.filter((r) => (actual.get(r.id) ?? normEstado(r.estado_envase)) === estado_original);
  if (!mover.length) return { error: "No se encontró ese material con ese estado en el consolidado del día" };

  const { error } = await supabase.from("balance_reclasificaciones").insert(
    mover.map((r) => ({ conteo_envase_id: r.id, estado_original, estado_nuevo, motivo })));
  if (error) return { error: error.message };
  revalidatePath("/inventario/balance");
  return { ok: true };
}

/** QUITAR RECLASIFICACIÓN — el material vuelve a como se contó ese día. */
export async function quitarReclasificacion(fd: FormData) {
  const codigo = String(fd.get("codigo") ?? "");
  const fecha = String(fd.get("fecha") ?? "");
  if (!codigo || !fecha) return { error: "Faltan datos" };
  const supabase = await createClient();
  const ids = (await renglones(codigo, fecha)).map((r) => r.id);
  if (!ids.length) return { error: "No se encontró el material en el consolidado del día" };
  const { error } = await supabase.from("balance_reclasificaciones").delete().in("conteo_envase_id", ids);
  if (error) return { error: error.message };
  revalidatePath("/inventario/balance");
  return { ok: true };
}
