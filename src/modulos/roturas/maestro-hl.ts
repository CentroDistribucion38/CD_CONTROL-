import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaestroHL } from "./medidas";
import type { MaterialLibro } from "./libro-roturas";

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

/**
 * EL CATÁLOGO PARA LA HOJA «MAESTRO» DEL EXCEL: todos los SKU del maestro de Inventario con su nombre, tipo,
 * unid. por caja y los precios por botella con que se cobra (el envase: el suyo en EER, el asociado en producto
 * terminado; el producto: el suyo). Es lo que deja cambiar el SKU en el Excel y que el cobro se recalcule.
 * Si no se puede leer, sale vacío y el libro usa solo los SKU que trae.
 */
export async function leerCatalogoLibro(supabase: SupabaseClient, hl?: MaestroHL | null): Promise<MaterialLibro[]> {
  try {
    const mats: { clave: string; nombre: string; tipo: "producto_terminado" | "eer" }[] = [];
    const prods: { sku: string; precio_botella: number | string | null; envase_sku: string | null; unidades_x_caja: number | null }[] = [];
    for (let d = 0; d < 20000; d += 1000) {
      const { data, error } = await supabase.from("v_roturas_materiales_maestro").select("clave, nombre, tipo").order("clave").range(d, d + 999);
      if (error || !data?.length) break;
      mats.push(...(data as typeof mats));
      if (data.length < 1000) break;
    }
    for (let d = 0; d < 20000; d += 1000) {
      const { data, error } = await supabase.from("productos").select("sku, precio_botella, envase_sku, unidades_x_caja").order("sku").range(d, d + 999);
      if (error || !data?.length) break;
      prods.push(...(data as typeof prods));
      if (data.length < 1000) break;
    }
    const p = new Map(prods.map((x) => [String(x.sku).trim(), x]));
    const num = (v: number | string | null | undefined) => (v == null || v === "" ? null : Number(v));
    return mats.map((m) => {
      const k = String(m.clave).trim(), pr = p.get(k);
      const env = m.tipo === "eer" ? pr : pr?.envase_sku ? p.get(String(pr.envase_sku).trim()) : undefined;
      const h = hl?.get(k);
      return {
        sku: k, nombre: m.nombre, tipo: m.tipo,
        upc: num(pr?.unidades_x_caja) || h?.upc || null, hl: h?.hl ?? null,
        precioEnvase: num(env?.precio_botella), precioProducto: m.tipo === "eer" ? null : num(pr?.precio_botella),
      };
    });
  } catch { return [] }
}
