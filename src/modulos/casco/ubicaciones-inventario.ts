import { createClient } from "@/lib/supabase/server";
import { porTandas, todas } from "@/modulos/inventario/paginas";

/**
 * LAS UBICACIONES DE CONTROL SALEN DEL ÚLTIMO INVENTARIO.
 *
 * «Esas ubicaciones deben alimentarse del último inventario: si es AG18 EER Fábrica, del filtro
 *  LAVADO; si es AG22 EER Barranquilla, de lo que dice BAJA.»
 *
 * Es la misma lectura de la hoja «Ubicaciones por estado» del consolidado: del último día con
 * recorridos ENVIADOS, los renglones cuyo estado del envase es el de esa tabla, y por material
 * todas sus ubicaciones en una línea («C04_IZQ - C05_DER - D11_IZQ»), en orden de calle y sin la
 * palabra del estado repetida («C04_IZQ BAJA» con el filtro BAJA dice lo mismo dos veces).
 *
 * Solo las dos tablas que tienen un estado propio. Carnaval y Atlántico se siguen escribiendo a mano.
 */
export const ESTADO_POR_CENTRO: Record<string, string> = { AG18: "LAVADO", AG22: "BAJA" };

export type UbicacionesInventario = {
  /** El día del inventario del que salieron (fecha de análisis de los recorridos). */
  fecha: string;
  /** centro (AG18, AG22) → sku → «C04_IZQ - C05_DER». */
  porCentro: Record<string, Record<string, string>>;
};

type R = {
  codigo: string; ubicacion: string | null; ubicacion_combinada: string | null;
  calle: string | null; estado_envase: string | null;
};

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

/** Las ubicaciones de unos renglones, en una línea, por calle y sin la palabra del estado. */
export function lineaDeUbicaciones(rs: R[], estado: string): string {
  const nombres = new Set<string>();
  for (const x of rs) {
    const base = (x.ubicacion ?? x.ubicacion_combinada ?? "").trim();
    const comb = (x.ubicacion_combinada ?? base).trim();
    const zona = comb.startsWith(base) ? comb.slice(base.length).trim().toUpperCase() : "";
    const nombre = zona && zona !== estado ? comb : base;
    if (nombre) nombres.add(nombre);
  }
  return [...nombres].sort(natural).join(" - ");
}

/** Agrupa los renglones del inventario por centro de Control y material. */
export function armarPorCentro(rs: R[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [centro, estado] of Object.entries(ESTADO_POR_CENTRO)) {
    const porSku = new Map<string, R[]>();
    for (const x of rs) {
      if ((x.estado_envase ?? "").trim().toUpperCase() !== estado) continue;
      const sku = String(x.codigo ?? "").trim();
      if (!sku) continue;
      (porSku.get(sku) ?? porSku.set(sku, []).get(sku)!).push(x);
    }
    out[centro] = {};
    for (const [sku, xs] of porSku) {
      const linea = lineaDeUbicaciones(xs, estado);
      if (linea) out[centro][sku] = linea;
    }
  }
  return out;
}

/**
 * Del último día con recorridos enviados. Con la sesión de quien mira (RLS): si su rol no ve el
 * inventario, devuelve null y Control sigue igual que siempre, con las ubicaciones a mano.
 */
export async function ubicacionesDelInventario(): Promise<UbicacionesInventario | null> {
  try {
    const supabase = await createClient();
    const { data: ult, error } = await supabase.from("v_conteos_fefo").select("fecha_analisis, bodega_id")
      .eq("estado", "cerrado").not("fecha_analisis", "is", null)
      .order("fecha_analisis", { ascending: false }).limit(1);
    if (error || !ult?.length) return null;
    const fecha = String(ult[0].fecha_analisis).slice(0, 10);
    const { data: cs, error: eC } = await todas<{ id: string }>((d, h) => supabase.from("v_conteos_fefo").select("id")
      .eq("bodega_id", ult[0].bodega_id).eq("fecha_analisis", fecha).eq("estado", "cerrado").order("id").range(d, h));
    if (eC || !cs.length) return null;
    const { data: rs, error: eR } = await porTandas<R>(cs.map((c) => c.id), (t, d, h) => supabase.from("v_conteo_fefo")
      .select("codigo, ubicacion, ubicacion_combinada, calle, estado_envase")
      .in("conteo_id", t).in("estado_envase", Object.values(ESTADO_POR_CENTRO))
      .order("id").range(d, h));
    if (eR) return null;
    return { fecha, porCentro: armarPorCentro(rs) };
  } catch {
    return null;
  }
}
