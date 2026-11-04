"use server";

import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";

/**
 * MODO FISCAL · el PIN se revisa AQUÍ y en la base, nunca en el navegador.
 * El PIN no está escrito en ninguna pantalla ni en el código de la página: vive cifrado en la tabla
 * modo_fiscal_pin y solo lo comparan las funciones de la base. Tras 5 PIN malos seguidos se bloquea 5 minutos.
 */
export type RespuestaPin = "ok" | "mal" | "bloqueado" | "no_admin" | "falta" | "error";

const TRADUCE: Record<string, RespuestaPin> = { ok: "ok", mal: "mal", bloqueado: "bloqueado", no_admin: "no_admin" };

export async function abrirModoFiscal(pin: string): Promise<RespuestaPin> {
  const permisos = await misPermisos();
  if (!permisos.manda) return "no_admin";
  const { data, error } = await (await createClient()).rpc("modo_fiscal_pin_ok", { p_pin: String(pin ?? "").slice(0, 12) });
  if (error) return /does not exist|schema cache|Could not find/i.test(error.message) ? "falta" : "error";
  return TRADUCE[String(data)] ?? "error";
}

export async function guardarModoFiscal(
  pin: string, roles: string[], usuarios: string[],
): Promise<{ resultado: Exclude<RespuestaPin, "ok"> | "guardado" }> {
  const permisos = await misPermisos();
  if (!permisos.manda) return { resultado: "no_admin" };
  const limpio = (l: string[]) => [...new Set((l ?? []).map((x) => String(x)).filter(Boolean))].slice(0, 500);
  const { data, error } = await (await createClient()).rpc("modo_fiscal_guardar", {
    p_pin: String(pin ?? "").slice(0, 12), p_roles: limpio(roles), p_usuarios: limpio(usuarios),
  });
  if (error) return { resultado: /does not exist|schema cache|Could not find/i.test(error.message) ? "falta" : "error" };
  const r = String(data);
  return { resultado: r === "ok" ? "guardado" : (TRADUCE[r] as Exclude<RespuestaPin, "ok"> | undefined) ?? "error" };
}
