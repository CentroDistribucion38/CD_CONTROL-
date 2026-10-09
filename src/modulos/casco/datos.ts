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
  /** Código del almacén en SAP (AG22, AG18, AG07, CA22): con él la hoja de baja encuentra su tabla. */
  centro?: string | null;
};

export type MaterialCasco = {
  sku: string;
  nombre: string;
  /** HL de una estiba; null si el maestro no trae botellas por estiba o HL. */
  hl_estiba: number | null;
  /** Botellas por estiba (para pasar UNIDADES a ESTIBAS); null si el maestro no la trae. */
  botellas_estiba: number | null;
  /** Sale de entrada en el desplegable (los envases y los que ya se han registrado). */
  corto: boolean;
  /** Es un ENVASE (tipo de material ENVASE en el maestro) o un cajón del casco (ANDINA, HEINEKEN…).
   *  Movimiento solo ofrece estos: el casco es envase, no producto. */
  envase?: boolean;
};

function sinTablas(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache");
}

/* LOS NOMBRES DE SAP POR CLAVE. Si todavía no se corrió 2026-10-casco-registrar-baja.sql (la base conserva «Bodega 38»,
   «Fábrica»…), la pantalla igual muestra el nombre que corresponde. Cuando la base ya trae `centro`, manda la base. */
const SAP: Record<string, { centro: string; nombre: string }> = {
  "BODEGA 38": { centro: "AG22", nombre: "AG22 EER Barranquilla" },
  "FABRICA": { centro: "AG18", nombre: "AG18 EER Fábrica" },
  "CARNAVAL": { centro: "AG07", nombre: "AG07 Alm. Bodega Carnaval" },
  "CARNAVAL PALMAR": { centro: "CA22", nombre: "CA22 ERR Atlántico" },
};

export async function sitiosCasco(): Promise<{ lista: SitioCasco[]; sinTabla: boolean }> {
  const supabase = await createClient();
  const leer = (cols: string) => supabase
    .from("casco_ubicaciones").select(cols)
    .eq("activo", true).order("orden", { ascending: true, nullsFirst: false });
  let { data, error } = await leer("clave, nombre, baja_rotulo, orden, centro");
  /* SIN LA COLUMNA `centro` (falta correr 2026-10-casco-registrar-baja.sql) Control sigue funcionando. */
  if (error && /centro/i.test(error.message)) ({ data, error } = await leer("clave, nombre, baja_rotulo, orden"));
  if (error) return { lista: [], sinTabla: sinTablas(error.message) };
  const lista = ((data ?? []) as unknown as SitioCasco[]).map((x) =>
    !x.centro && SAP[x.clave] ? { ...x, ...SAP[x.clave] } : x);
  return { lista, sinTabla: false };
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

  /* UN «CAJÓN» DE CASCO CON EL MISMO CÓDIGO QUE UN MATERIAL DEL MAESTRO MANDA SOBRE SU FACTOR (igual que en la base:
     `casco_hl_estiba` mira primero casco_extras). Es como las botellas de 250 cc miden 1.350 por estiba en el Excel
     aunque el maestro de inventario diga 38 por caja. */
  const deProds = new Set((prods.data ?? []).map((p) => String(p.sku)));
  const factorExtra = new Map((extras.data ?? []).map((e) => [String(e.sku), e]));
  const out: MaterialCasco[] = [];
  for (const e of extras.data ?? []) {
    if (deProds.has(String(e.sku))) continue;     // este sale abajo, con el nombre y el «corto» del maestro
    out.push({ sku: e.sku as string, nombre: e.nombre as string, corto: true, envase: true,
      hl_estiba: Number(e.unidades_por_estiba) * Number(e.hl_unidad),
      botellas_estiba: Number(e.unidades_por_estiba) || null });
  }
  for (const p of prods.data ?? []) {
    const x = factorExtra.get(String(p.sku));
    if (x) {
      out.push({
        sku: p.sku as string, nombre: p.nombre as string,
        hl_estiba: Number(x.unidades_por_estiba) * Number(x.hl_unidad),
        botellas_estiba: Number(x.unidades_por_estiba) || null,
        corto: p.tipo_material === "ENVASE" || yaUsados.has(String(p.sku)),
        envase: true,
      });
      continue;
    }
    const botellas = p.unidades_por_estiba != null ? Number(p.unidades_por_estiba)
      : p.cajas_por_estiba != null && p.unidades_por_caja != null
        ? Number(p.cajas_por_estiba) * Number(p.unidades_por_caja) : null;
    const hlBotella = p.hl != null ? Number(p.hl) : p.contenido != null ? Number(p.contenido) / 100000 : null;
    out.push({
      sku: p.sku as string, nombre: p.nombre as string,
      hl_estiba: botellas && hlBotella ? botellas * hlBotella : null,
      botellas_estiba: botellas || null,
      corto: p.tipo_material === "ENVASE" || yaUsados.has(String(p.sku)),
      envase: p.tipo_material === "ENVASE",
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
