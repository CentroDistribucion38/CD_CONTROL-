import { createClient } from "@/lib/supabase/server";
import { cargarFiscales } from "../../fiscal/datos";

/** Los cíclicos (como el fiscal) y, por id de hoja, cuándo se envió su conteo. */
export async function cargarControlCiclico() {
  const r = await cargarFiscales("CICLICO");
  if ("fallo" in r) return r;
  const ids = r.datos.fiscales.map((f) => f.id);
  const cerradas: Record<string, string> = {};
  if (ids.length) {
    const { data } = await (await createClient()).from("inv_fiscal_hojas").select("id, cerrada_en").in("fiscal_id", ids).not("cerrada_en", "is", null);
    for (const h of (data ?? []) as { id: string; cerrada_en: string }[]) cerradas[h.id] = h.cerrada_en;
  }
  return { datos: { ...r.datos, cerradas } };
}
