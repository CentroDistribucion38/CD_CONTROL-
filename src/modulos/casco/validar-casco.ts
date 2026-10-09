import { createClient } from "@/lib/supabase/server";
import { sitiosCasco } from "./datos";
import { armarUbicaciones, COLUMNAS_CENTRO, ubicacionDeFila, type RenglonUbic } from "./ubicaciones-armar";

/**
 * LA VALIDACIÓN CASCO ↔ CONTEO, PARA EL ANÁLISIS DEL EXCEL.
 *
 * «Del 3501226 tengo 1 estiba en Inventario casco de vidrio, pero en el conteo está como EXTRASUCIO:
 *  en el informe la ubicación va vacía, y en el Excel, en el Análisis, como comentario.»
 *
 * Toma los renglones del conteo que se está exportando y el último registro del Casco (Fábrica y
 * Bodega) hasta ese día, y devuelve una línea por cada material que no cuadra. Si el rol no ve el
 * Casco, o falta la tabla, devuelve null y el Excel sale como siempre.
 */
export type AvisoCasco = { almacen: string; fecha: string; cod: string; material: string; comentario: string };

export async function validarCasco(
  renglones: (Omit<RenglonUbic, "fecha"> & { conteo_id: string; material?: string })[],
  diaDeConteo: Map<string, string>,
  hasta: string,
): Promise<AvisoCasco[] | null> {
  try {
    const sitios = await sitiosCasco();
    if (sitios.sinTabla) return null;
    const u = armarUbicaciones(renglones.map((x) => ({ ...x, fecha: diaDeConteo.get(x.conteo_id) ?? "" })));
    const nombres = new Map(renglones.map((x) => [String(x.codigo), x.material ?? ""]));
    const supabase = await createClient();
    const out: AvisoCasco[] = [];
    for (const s of sitios.lista) {
      const centro = (s.centro ?? "").toUpperCase();
      if (!COLUMNAS_CENTRO[centro]) continue;
      const { data: ult } = await supabase.from("v_casco").select("fecha")
        .eq("ubicacion", s.clave).lte("fecha", hasta).order("fecha", { ascending: false }).limit(1);
      const dia = ult?.[0]?.fecha as string | undefined;
      if (!dia) continue;
      const { data: rs } = await supabase.from("v_casco").select("sku, inventario, baja")
        .eq("ubicacion", s.clave).eq("fecha", dia).order("sku");
      for (const r of (rs ?? []) as { sku: string; inventario: number | null; baja: number | null }[]) {
        const v = ubicacionDeFila(u, centro, r.sku, Number(r.inventario ?? 0), Number(r.baja ?? 0), s.baja_rotulo ?? undefined);
        for (const a of v?.avisos ?? []) out.push({ almacen: s.nombre, fecha: dia, cod: r.sku, material: nombres.get(r.sku) ?? "", comentario: a });
      }
    }
    return out;
  } catch {
    return null;
  }
}
