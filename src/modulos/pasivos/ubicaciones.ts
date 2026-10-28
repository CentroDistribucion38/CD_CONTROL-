import { createClient } from "@/lib/supabase/server";
import { porTandas, todas } from "@/modulos/inventario/paginas";
import { lineaDeUbicaciones, type RenglonUbic } from "@/modulos/casco/ubicaciones-armar";
import { esUbicacionFabrica, almacenDeRenglon } from "@/modulos/casco/ubicacion-sitio";

/**
 * DÓNDE ESTÁ CADA PASIVO EN LA BODEGA — «en Bodega 38 y Fábrica hay que agregar una columna con
 * ubicación, para ver dónde está eso; lo mismo que en casco de vidrio».
 *
 * Sale del CONTEO del día del informe (el último cerrado hasta ese día, si ese día no hubo): sus
 * renglones por estado del envase, Fábrica = ubicaciones FABRICA_… (AG18) y Bodega = las demás
 * (AG22), igual que el balance. Cada pasivo toma las ubicaciones del estado que le corresponde:
 *   BAJA · SORTING / PRESORTING → BAJA      LAVADO · LAVADO → LAVADO      LAVADO · EXTRASUCIO → EXTRASUCIO
 * Lo que no viene del conteo (rotura de línea, baja proyectada…) no tiene ubicación (ver
 * `estadoDelConteo` en informe.ts, que la pantalla también usa).
 */
export type UbicPasivos = {
  /** El día del conteo de donde salen (puede ser anterior al del informe). */
  fecha: string | null;
  /** «AG22|BAJA|3500005» → «P_13_IZQ - P_17_DER». */
  mapa: Record<string, string>;
};

const diaSiguiente = (iso: string) => new Date(Date.parse(iso + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);

export async function ubicacionesParaPasivos(dia: string): Promise<UbicPasivos> {
  const nada: UbicPasivos = { fecha: null, mapa: {} };
  try {
    const supabase = await createClient();
    const { data: ult, error } = await supabase.from("v_conteos_fefo").select("fecha_analisis, bodega_id")
      .eq("estado", "cerrado").not("fecha_analisis", "is", null).lt("fecha_analisis", diaSiguiente(dia))
      .order("fecha_analisis", { ascending: false }).limit(1);
    if (error || !ult?.length) return nada;
    const fecha = String(ult[0].fecha_analisis).slice(0, 10);
    const { data: cs, error: eC } = await todas<{ id: string }>((d, h) => supabase.from("v_conteos_fefo")
      .select("id").eq("bodega_id", ult[0].bodega_id).eq("estado", "cerrado")
      .gte("fecha_analisis", fecha).lt("fecha_analisis", diaSiguiente(fecha)).order("id").range(d, h));
    if (eC || !cs.length) return nada;
    const { data: rs, error: eR } = await porTandas<Omit<RenglonUbic, "fecha">>(cs.map((c) => c.id), (t, d, h) => supabase.from("v_conteo_fefo")
      .select("codigo, ubicacion, ubicacion_combinada, calle, estado_envase")
      .in("conteo_id", t).not("estado_envase", "is", null).order("id").range(d, h));
    if (eR) return nada;
    const grupos = new Map<string, RenglonUbic[]>();
    for (const x of rs) {
      const estado = (x.estado_envase ?? "").trim().toUpperCase(), sku = String(x.codigo ?? "").trim();
      if (!estado || !sku) continue;
      /* EXPORTACION (AG17) y BTS (AG16) tienen sus propios almacenes; FABRICA es AG18 y lo demás AG22. */
      const alm = almacenDeRenglon(x);
      const almacen = alm === "AG22" && esUbicacionFabrica(x.ubicacion ?? x.ubicacion_combinada) ? "AG18" : alm;
      const k = `${almacen}|${estado}|${sku}`;
      (grupos.get(k) ?? grupos.set(k, []).get(k)!).push({ ...x, fecha });
    }
    const mapa: Record<string, string> = {};
    for (const [k, xs] of grupos) { const l = lineaDeUbicaciones(xs); if (l) mapa[k] = l }
    return { fecha, mapa };
  } catch {
    return nada;
  }
}
