/** La clave de la dirección de Traccar Client: la de Vercel (GPS_CLAVE_TRACCAR) o, si no está, una que se genera sola y queda en app_config. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { asegurarConfig } from "@/lib/config-servidor";
import { claveAleatoria } from "@/lib/push";

export async function claveTraccar(db: SupabaseClient): Promise<string | null> {
  const k = process.env.GPS_CLAVE_TRACCAR;
  if (k && k.length >= 12) return k;
  return asegurarConfig(db, "gps_clave_traccar", claveAleatoria);
}
