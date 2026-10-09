import { createClient } from "@/lib/supabase/server";
import { porTandas, todas } from "@/modulos/inventario/paginas";
import { DE_FABRICA, esUbicacionFabrica } from "./ubicacion-sitio";

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
/* «En Bodega no solo es BAJA: es BAJA y EXTRASUCIO.» */
export const ESTADO_POR_CENTRO: Record<string, string[]> = { AG18: ["LAVADO"], AG22: ["BAJA", "EXTRASUCIO"] };

/* Y cada tabla solo con lo suyo: Fábrica (FABRICA_…) en AG18, lo de Bodega en AG22 (ubicacion-sitio.ts). */

export type UbicacionesInventario = {
  /** El día del último inventario enviado (el más reciente de los dos estados). */
  fecha: string;
  /** centro (AG18, AG22) → del día más reciente que trae algo en ese estado, sku → «C04_IZQ - C05_DER». */
  porCentro: Record<string, { fecha: string; mapa: Record<string, string> }>;
};

type R = {
  codigo: string; ubicacion: string | null; ubicacion_combinada: string | null;
  calle: string | null; estado_envase: string | null;
};

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

/** Las ubicaciones de unos renglones, en una línea, por calle y sin la palabra del estado. */
export function lineaDeUbicaciones(rs: R[]): string {
  const nombres = new Set<string>();
  for (const x of rs) {
    const estado = (x.estado_envase ?? "").trim().toUpperCase();
    const base = (x.ubicacion ?? x.ubicacion_combinada ?? "").trim();
    const comb = (x.ubicacion_combinada ?? base).trim();
    /* Lo que la ubicación combinada trae después del nombre («BAJA», «BAJA Andina»). La palabra del
       estado sobra —la tabla ya es de ese estado—; lo que queda se deja entre paréntesis:
       «P_16_IZQ BAJA Andina» → «P_16_IZQ (Andina)». */
    const zona = comb.startsWith(base) ? comb.slice(base.length).trim() : "";
    const resto = zona.toUpperCase().startsWith(estado) ? zona.slice(estado.length).trim() : zona;
    const nombre = base && resto ? `${base} (${resto})` : base || comb;
    if (nombre) nombres.add(nombre);
  }
  return [...nombres].sort(natural).join(" - ");
}

/**
 * Agrupa los renglones por centro de Control y material. CADA ESTADO TOMA SU PROPIO ÚLTIMO DÍA:
 * si el recorrido de hoy no pasó por la zona de BAJA, «el último inventario» de BAJA es el del día
 * que sí pasó, y no una lista vacía que dejaría la columna sin nada.
 */
export function armarPorCentro(rs: (R & { fecha: string })[]): UbicacionesInventario["porCentro"] {
  const out: UbicacionesInventario["porCentro"] = {};
  for (const [centro, estados] of Object.entries(ESTADO_POR_CENTRO)) {
    /* Cada estado con SU último día (BAJA del día que se contó BAJA, EXTRASUCIO del suyo), y se juntan. */
    const porSku = new Map<string, R[]>();
    let fecha = "";
    for (const estado of estados) {
      const suyos = rs.filter((x) => (x.estado_envase ?? "").trim().toUpperCase() === estado && String(x.codigo ?? "").trim()
        && esUbicacionFabrica(x.ubicacion ?? x.ubicacion_combinada) === DE_FABRICA[centro]);
      const dia = suyos.reduce((m, x) => (x.fecha > m ? x.fecha : m), "");
      if (!dia) continue;
      if (dia > fecha) fecha = dia;
      for (const x of suyos) {
        if (x.fecha !== dia) continue;
        const sku = String(x.codigo).trim();
        (porSku.get(sku) ?? porSku.set(sku, []).get(sku)!).push(x);
      }
    }
    if (!fecha) continue;
    const mapa: Record<string, string> = {};
    for (const [sku, xs] of porSku) {
      const linea = lineaDeUbicaciones(xs);
      if (linea) mapa[sku] = linea;
    }
    out[centro] = { fecha, mapa };
  }
  return out;
}

/** Cuántos días hacia atrás se buscan inventarios enviados. */
const DIAS_ATRAS = 45;

/**
 * Los inventarios enviados de las últimas semanas. Con la sesión de quien mira (RLS): si su rol no ve
 * el inventario, devuelve null y Control sigue igual que siempre, con las ubicaciones a mano.
 */
export async function ubicacionesDelInventario(): Promise<UbicacionesInventario | null> {
  try {
    const supabase = await createClient();
    const { data: ult, error } = await supabase.from("v_conteos_fefo").select("fecha_analisis, bodega_id")
      .eq("estado", "cerrado").not("fecha_analisis", "is", null)
      .order("fecha_analisis", { ascending: false }).limit(1);
    if (error || !ult?.length) return null;
    const ultima = String(ult[0].fecha_analisis).slice(0, 10);
    const desde = new Date(Date.parse(ultima + "T12:00:00Z") - DIAS_ATRAS * 86400000).toISOString().slice(0, 10);
    const { data: cs, error: eC } = await todas<{ id: string; fecha_analisis: string }>((d, h) => supabase.from("v_conteos_fefo")
      .select("id, fecha_analisis").eq("bodega_id", ult[0].bodega_id).eq("estado", "cerrado")
      .gte("fecha_analisis", desde).lte("fecha_analisis", ultima).order("id").range(d, h));
    if (eC || !cs.length) return null;
    const diaDe = new Map(cs.map((c) => [c.id, String(c.fecha_analisis).slice(0, 10)]));
    /* El estado se compara sin mayúsculas ni espacios aquí, no en la consulta: «Baja» o «BAJA »
       también cuentan. */
    const { data: rs, error: eR } = await porTandas<R & { conteo_id: string }>(cs.map((c) => c.id), (t, d, h) => supabase.from("v_conteo_fefo")
      .select("conteo_id, codigo, ubicacion, ubicacion_combinada, calle, estado_envase")
      .in("conteo_id", t).not("estado_envase", "is", null)
      .order("id").range(d, h));
    if (eR) return null;
    return { fecha: ultima, porCentro: armarPorCentro(rs.map((x) => ({ ...x, fecha: diaDe.get(x.conteo_id) ?? "" }))) };
  } catch {
    return null;
  }
}
