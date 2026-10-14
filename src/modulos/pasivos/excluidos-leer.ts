import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { excluye, porDefecto, type AmbitoExcluidos, type PanelExcluidos, type ReglaExcluidos } from "@/modulos/pasivos/excluidos";

/**
 * LO ESCOGIDO EN EL TOOLBOX DE EXCLUIDOS (tabla excluidos_sku), una vez por petición.
 * Si la tabla todavía no existe (falta correr el SQL), se sigue con la regla de siempre.
 */
export const leerExcluidos = cache(async (ambito: AmbitoExcluidos): Promise<ReglaExcluidos> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("excluidos_sku").select("codigo, fuera").eq("ambito", ambito);
  const elecciones: Record<string, boolean> = {};
  for (const r of (data ?? []) as { codigo: string; fuera: boolean }[]) elecciones[String(r.codigo).trim()] = !!r.fuera;
  return { ambito, elecciones, faltaSql: !!error && /excluidos_sku|does not exist|PGRST205/i.test(`${error.code} ${error.message}`) };
});

/**
 * EL PANEL: todos los SKU que se pueden escoger (maestro de Pasivos + productos + los que vinieron hoy),
 * cuál es de los de siempre, cuál queda fuera y cuál apareció en el cuadre de hoy.
 */
export function panelExcluidos(
  regla: ReglaExcluidos,
  catalogo: Iterable<{ codigo: string; nombre: string | null | undefined }>,
  hoy: Iterable<string>,
): PanelExcluidos {
  const nombres = new Map<string, string>();
  for (const x of catalogo) {
    const c = String(x.codigo ?? "").trim();
    if (!c) continue;
    if (!nombres.has(c) || (!nombres.get(c) && x.nombre)) nombres.set(c, String(x.nombre ?? ""));
  }
  for (const c of Object.keys(regla.elecciones)) if (!nombres.has(c)) nombres.set(c, "");
  const deHoy = new Set([...hoy].map(String));
  for (const c of deHoy) if (!nombres.has(c)) nombres.set(c, "");
  const skus = [...nombres].map(([codigo, nombre]) => ({
    codigo, nombre, porDefecto: porDefecto(regla.ambito, codigo, nombre), fuera: excluye(regla, codigo, nombre), hoy: deHoy.has(codigo),
  })).sort((a, b) => Number(b.fuera) - Number(a.fuera) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  return { ambito: regla.ambito, faltaSql: regla.faltaSql, skus, hoy: [...deHoy].sort() };
}
