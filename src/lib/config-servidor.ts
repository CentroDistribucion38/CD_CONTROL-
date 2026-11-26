/**
 * CONFIGURACIÓN DEL SERVIDOR GUARDADA EN LA BASE (tabla app_config, solo llave de servicio).
 * Para claves que el servidor puede generar solo: la primera vez que se piden se crean y se guardan; después se leen.
 * Si existe la variable de entorno equivalente en Vercel, esa manda.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const cache = new Map<string, string>();

/** Lee la clave; si no existe la genera con `crear`, la guarda y la devuelve. null si falta la tabla (SQL sin correr). */
export async function asegurarConfig(db: SupabaseClient, clave: string, crear: () => string): Promise<string | null> {
  const c = cache.get(clave);
  if (c) return c;
  const r = await db.from("app_config").select("valor").eq("clave", clave).maybeSingle();
  if (r.error) return null;
  if (r.data?.valor) { cache.set(clave, r.data.valor as string); return r.data.valor as string }
  const valor = crear();
  /* si dos peticiones la crean a la vez, gana la primera: se vuelve a leer */
  await db.from("app_config").insert({ clave, valor });
  const again = await db.from("app_config").select("valor").eq("clave", clave).maybeSingle();
  const v = (again.data?.valor as string | undefined) ?? null;
  if (v) cache.set(clave, v);
  return v;
}
