import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaestroHL } from "./medidas";

/**
 * EL MAESTRO DE LOS HL: por código, unidades por caja y HL por unidad (Maestro de Pasivos).
 *
 * Sirve para el servidor (la pantalla de análisis) y para el navegador (el Excel): recibe el
 * cliente que cada uno ya tiene. Si la persona no puede leer ese maestro (la base solo lo deja
 * ver a quien tiene Pasivos, Cuadre o —con 2026-11-roturas-ver-maestro-hl.sql— Roturas), NO es un
 * error: el mapa sale vacío y los HL se dicen «sin dato» en vez de inventarse.
 */
export async function leerMaestroHL(supabase: SupabaseClient): Promise<MaestroHL> {
  const m: MaestroHL = new Map();
  try {
    for (let d = 0; d < 30000; d += 1000) {
      const { data, error } = await supabase.from("pasivos_maestro").select("codigo, unidades_por_caja, hl_unidad")
        .order("codigo").range(d, d + 999);
      if (error || !data?.length) break;
      for (const x of data as { codigo: string; unidades_por_caja: number | string | null; hl_unidad: number | string | null }[]) {
        m.set(String(x.codigo).trim(), {
          upc: x.unidades_por_caja == null ? null : Number(x.unidades_por_caja) || null,
          hl: x.hl_unidad == null ? null : Number(x.hl_unidad),
        });
      }
      if (data.length < 1000) break;
    }
  } catch { /* sin permiso o sin tabla: se sigue sin HL */ }
  return m;
}
