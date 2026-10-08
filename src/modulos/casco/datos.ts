import { createClient } from "@/lib/supabase/server";

/**
 * LO QUE LEE LA PANTALLA DE CASCO DE VIDRIO.
 *
 * Las cantidades son ESTIBAS y el HL lo calcula la base al guardar (ver
 * supabase/migraciones/2026-10-casco-de-vidrio.sql). Aquí solo se
 * arman las listas que ofrecen los desplegables: los sitios y los
 * materiales, con el HL de UNA estiba para que la pantalla pueda
 * mostrar el HL mientras se teclea. El que se guarda es el de la base.
 */

export type SitioCasco = {
  clave: string;
  nombre: string;
  /** Rótulo de la segunda cantidad («Extrasucio con baja»), o null si ese sitio no la lleva. */
  baja_rotulo: string | null;
  orden: number | null;
};

export type MaterialCasco = {
  sku: string;
  nombre: string;
  /** HL de una estiba; null si el maestro no trae botellas por estiba o HL. */
  hl_estiba: number | null;
  /** Sale de entrada en el desplegable (los envases y los que ya se han registrado). */
  corto: boolean;
};

function sinTablas(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache");
}

export async function sitiosCasco(): Promise<{ lista: SitioCasco[]; sinTabla: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("casco_ubicaciones").select("clave, nombre, baja_rotulo, orden")
    .eq("activo", true).order("orden", { ascending: true, nullsFirst: false });
  if (error) return { lista: [], sinTabla: sinTablas(error.message) };
  return { lista: (data ?? []) as SitioCasco[], sinTabla: false };
}

/**
 * LOS MATERIALES: el maestro de inventario MÁS los cajones del Excel
 * (ANDINA, HEINEKEN, EXPORTACION, OTROS). No hay una segunda lista de
 * productos: el nombre sale del maestro.
 *
 * `hl_estiba` se calcula igual que en la base (`casco_hl_estiba`):
 * botellas por estiba (o cajas por estiba × botellas por caja) por HL
 * de una botella (o contenido en cc / 100.000).
 */
export async function materialesCasco(): Promise<MaterialCasco[]> {
  const supabase = await createClient();
  const [prods, extras, usados] = await Promise.all([
    supabase.from("productos")
      .select("sku, nombre, tipo_material, unidades_por_caja, cajas_por_estiba, unidades_por_estiba, contenido, hl")
      .eq("activo", true).order("nombre").limit(3000),
    supabase.from("casco_extras").select("sku, nombre, unidades_por_estiba, hl_unidad").eq("activo", true),
    supabase.from("casco_registros").select("sku").limit(6000),
  ]);
  const yaUsados = new Set((usados.data ?? []).map((r) => String(r.sku)));

  const out: MaterialCasco[] = [];
  for (const e of extras.data ?? []) {
    out.push({ sku: e.sku as string, nombre: e.nombre as string, corto: true,
      hl_estiba: Number(e.unidades_por_estiba) * Number(e.hl_unidad) });
  }
  for (const p of prods.data ?? []) {
    const botellas = p.unidades_por_estiba != null ? Number(p.unidades_por_estiba)
      : p.cajas_por_estiba != null && p.unidades_por_caja != null
        ? Number(p.cajas_por_estiba) * Number(p.unidades_por_caja) : null;
    const hlBotella = p.hl != null ? Number(p.hl) : p.contenido != null ? Number(p.contenido) / 100000 : null;
    out.push({
      sku: p.sku as string, nombre: p.nombre as string,
      hl_estiba: botellas && hlBotella ? botellas * hlBotella : null,
      corto: p.tipo_material === "ENVASE" || yaUsados.has(String(p.sku)),
    });
  }
  return out;
}

/**
 * LOS PUESTOS YA USADOS (columna «Ubicaciones»), para ofrecerlos en el desplegable junto a los
 * de `PUESTOS_BASE`. Si la migración 2026-10-casco-puesto-calidad.sql no se ha corrido, la
 * columna no existe y esto devuelve vacío en vez de romper la pantalla.
 */
export async function puestosUsados(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("casco_registros").select("puesto").not("puesto", "is", null).limit(6000);
  if (error) return [];
  return [...new Set((data ?? []).map((r) => String(r.puesto)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}
