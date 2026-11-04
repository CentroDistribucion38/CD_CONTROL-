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

export type DatosModoFiscal = {
  roles: { clave: string; nombre: string; manda: boolean }[];
  perfiles: { id: string; usuario: string | null; nombre: string | null; rol: string | null; activo: boolean | null }[];
  inicial: { roles: string[]; usuarios: string[] };
};

/**
 * Abre el cuadro del Modo FISCAL: comprueba el PIN y, solo si es el bueno, entrega los roles, las personas y a quién
 * está activado hoy. Sin el PIN no sale ningún dato.
 */
export async function traerModoFiscal(pin: string): Promise<{ resultado: RespuestaPin; datos?: DatosModoFiscal }> {
  const resultado = await abrirModoFiscal(pin);
  if (resultado !== "ok") return { resultado };
  const supabase = await createClient();
  const [r, p, d] = await Promise.all([
    supabase.from("roles").select("clave, nombre, manda").order("orden", { nullsFirst: false }).order("nombre"),
    supabase.from("perfiles").select("id, usuario, nombre, rol, activo").order("nombre"),
    supabase.from("modo_fiscal_destinos").select("tipo, clave"),
  ]);
  if (d.error) return { resultado: "falta" };
  const dest = (d.data ?? []) as { tipo: string; clave: string }[];
  return {
    resultado: "ok",
    datos: {
      roles: (r.data ?? []) as DatosModoFiscal["roles"],
      perfiles: (p.data ?? []) as DatosModoFiscal["perfiles"],
      inicial: { roles: dest.filter((x) => x.tipo === "rol").map((x) => x.clave), usuarios: dest.filter((x) => x.tipo === "usuario").map((x) => x.clave) },
    },
  };
}
