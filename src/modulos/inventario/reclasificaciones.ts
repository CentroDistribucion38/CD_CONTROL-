import { createClient } from "@/lib/supabase/server";
import { porTandas } from "@/modulos/inventario/paginas";

/**
 * LO QUE SE RECLASIFICA EN EL BALANCE, EN LA BASE — «para cuando baje y exporte el consolidado se
 * vea como en realidad es».
 *
 * El Balance no toca el conteo: guarda en `balance_reclasificaciones` (por renglón del conteo) el
 * estado nuevo. Aquí se le pone ese estado a cada renglón —la última reclasificación manda— y en la
 * nota queda de dónde venía («Balance: LAVADO → BAJA · motivo»), para que se sepa que no se contó así.
 * Si la tabla no existe o no se puede leer, los renglones salen tal como se contaron.
 */
type Reclas = { conteo_envase_id: string; estado_original: string; estado_nuevo: string; motivo: string | null; creado_en: string };
type ConEstado = { id: string; estado_envase: string | null; nota: string | null };

export async function conReclasificaciones<T extends ConEstado>(lineas: T[]): Promise<T[]> {
  if (!lineas.length) return lineas;
  const supabase = await createClient();
  const { data, error } = await porTandas<Reclas>(lineas.map((l) => l.id), (t, d, h) =>
    supabase.from("balance_reclasificaciones").select("conteo_envase_id, estado_original, estado_nuevo, motivo, creado_en")
      .in("conteo_envase_id", t).order("creado_en").range(d, h), 200);
  if (error || !data.length) return lineas;
  const ultima = new Map<string, Reclas>();
  for (const r of data) ultima.set(String(r.conteo_envase_id), r);
  return lineas.map((l) => {
    const r = ultima.get(String(l.id));
    if (!r) return l;
    const contado = (l.estado_envase ?? "").trim() || r.estado_original;
    const marca = `Balance: ${contado.toUpperCase()} → ${r.estado_nuevo}${r.motivo ? ` · ${r.motivo}` : ""}`;
    return { ...l, estado_envase: r.estado_nuevo, nota: l.nota ? `${marca} | ${l.nota}` : marca };
  });
}
