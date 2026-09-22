import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * EL HISTORIAL DE USUARIOS, desde las rutas del servidor.
 *
 * Lo que se hace con la llave de servicio —crear, editar, nueva clave,
 * eliminar— no lleva sesión, así que la base no sabe quién fue: lo dice
 * la ruta, que ya comprobó la sesión y que quien pide administra.
 * Callado: si falta 2026-09-admin-historial.sql, la acción se hace igual.
 */
export type FilaHistorial = {
  a_quien?: string | null; nombre?: string | null; usuario?: string | null;
  accion: "creado" | "editado" | "rol" | "clave" | "eliminado";
  detalle?: Record<string, unknown>;
};
export async function anotar(admin: SupabaseClient, hechoPor: string, filas: FilaHistorial[]) {
  if (!filas.length) return;
  try {
    await admin.rpc("usuarios_historial_anotar", {
      p_hecho_por: hechoPor,
      p_filas: filas.map((f) => ({ ...f, a_quien: f.a_quien ?? "" })),
    });
  } catch { /* el historial nunca tumba la acción */ }
}
