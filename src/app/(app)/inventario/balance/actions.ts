"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { consolidadoDelDia, diasConConteo } from "@/modulos/inventario/balance";
import { balanceParaPasivos } from "@/modulos/pasivos/datos";

const normEstado = (e: string | null | undefined) => {
  const t = (e ?? "").trim().toUpperCase();
  return t.includes("EXTRASUCIO") ? "EXTRASUCIO" : t.includes("LAVADO") ? "LAVADO" : t.includes("BAJA") ? "BAJA" : t;
};

/**
 * ALINEAR LA BASE DE PASIVOS con el Balance de ese día, después de reasignar estados.
 * La base guarda una foto de lo que el Balance dijo cuando se hizo «Traer del balance»; si luego se pasa algo de
 * OTROS a BAJA (o se quita), esa foto queda vieja. Aquí se vuelve a traer SOLO si ese día ya se había traído del
 * balance, no es un día histórico y no está cerrado. Reemplaza únicamente las filas de origen «balance»
 * (lo del archivo y lo manual no se toca). Devuelve cuántas filas quedaron, o null si no hizo nada.
 */
async function alinearPasivos(fecha: string): Promise<number | null> {
  try {
    const supabase = await createClient();
    const cuenta = (origen: string) => supabase.from("pasivos_base").select("id", { count: "exact", head: true }).eq("fecha", fecha).eq("origen", origen);
    const [{ count: hist }, { count: ya }, cierre] = await Promise.all([
      cuenta("historico"), cuenta("balance"),
      supabase.from("pasivos_cierres").select("fecha").eq("fecha", fecha).limit(1),
    ]);
    if (hist || !ya || (cierre.data ?? []).length) return null;
    const { filas, error } = await balanceParaPasivos(fecha);
    if (error && !filas.length) return null;
    const { error: eB } = await supabase.from("pasivos_base").delete().eq("fecha", fecha).eq("origen", "balance");
    if (eB) return null;
    if (filas.length) {
      const { error: eI } = await supabase.from("pasivos_base").insert(filas.map((f) => ({ ...f, origen: "balance" })));
      if (eI) return null;
    }
    revalidatePath("/inventario/balance/pasivos");
    return filas.length;
  } catch { return null }
}

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
  return { ok: true, pasivos: await alinearPasivos(fecha) };
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
  return { ok: true, pasivos: await alinearPasivos(fecha) };
}

/**
 * REASIGNAR DESDE LA HOJA «CONSOLIDADO» — por renglones exactos del conteo (una o varias líneas
 * escogidas), no por material completo. Si el estado nuevo es el mismo con que se contó, se quita la
 * reasignación (vuelve a como se contó); si no, queda la nueva.
 */
export async function reasignarRenglones(fd: FormData) {
  const fecha = String(fd.get("fecha") ?? "");
  const estado_nuevo = String(fd.get("estado_nuevo") ?? "").trim().toUpperCase();
  const motivo = (fd.get("motivo") as string) || null;
  let pedidos: string[] = [];
  try { pedidos = JSON.parse(String(fd.get("ids") ?? "[]")) } catch { /* nada */ }
  if (!fecha || !estado_nuevo || !pedidos.length) return { error: "Faltan datos" };

  const supabase = await createClient();
  const { conteos } = await diasConConteo();
  const { vigentes } = await consolidadoDelDia(fecha, conteos);
  const pedidosSet = new Set(pedidos);
  const rs = vigentes.filter((r) => pedidosSet.has(r.id));
  if (!rs.length) return { error: "Esas líneas ya no están en el consolidado del día" };

  const ids = rs.map((r) => r.id);
  const { data: ya } = await supabase.from("balance_reclasificaciones")
    .select("conteo_envase_id, estado_nuevo, creado_en").in("conteo_envase_id", ids).order("creado_en");
  const actual = new Map<string, string>();
  for (const x of ya ?? []) actual.set(x.conteo_envase_id, x.estado_nuevo);

  const vuelven = rs.filter((r) => normEstado(r.estado_envase) === estado_nuevo).map((r) => r.id);
  const mover = rs.filter((r) => normEstado(r.estado_envase) !== estado_nuevo && (actual.get(r.id) ?? "") !== estado_nuevo);

  if (vuelven.length) {
    const { error } = await supabase.from("balance_reclasificaciones").delete().in("conteo_envase_id", vuelven);
    if (error) return { error: error.message };
  }
  if (mover.length) {
    const { error } = await supabase.from("balance_reclasificaciones").insert(mover.map((r) => ({
      conteo_envase_id: r.id, estado_original: actual.get(r.id) ?? normEstado(r.estado_envase), estado_nuevo, motivo })));
    if (error) return { error: error.message };
  }
  revalidatePath("/inventario/balance");
  return { ok: true, movidos: mover.length + vuelven.length, pasivos: await alinearPasivos(fecha) };
}
