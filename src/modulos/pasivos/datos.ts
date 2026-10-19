import { createClient } from "@/lib/supabase/server";
import { todas } from "@/modulos/inventario/paginas";
import { balanceDelDia, type FilaBalance } from "@/modulos/inventario/balance";
import { esDueno } from "@/modulos/inventario/duenos";
import { esExcluido, excluye, type ReglaExcluidos } from "@/modulos/pasivos/excluidos";
import { leerExcluidos } from "@/modulos/pasivos/excluidos-leer";

/**
 * INVENTARIO · BALANCE · PASIVOS
 *
 * La hoja DATA de BLOQUEADOS.xlsx: una fila por fecha · estado · causal · código · almacén, en
 * unidades. Lo demás (descripción, caja, HL, cajas, año, mes, día, costo) lo calcula la base con el
 * Maestro de Pasivos (v_pasivos_base), igual que los BUSCARV del Excel.
 *
 * De dónde sale:
 *   · DEL BALANCE  — la diferencia en unidades de cada hoja del balance del día.
 *   · DE UN ARCHIVO — la baja proyectada y la rotura de línea (plantilla pasivos-plantilla.xlsx).
 */

export type FilaPasivo = {
  id: string; fecha: string; estado: string; causal: string; caja: string | null; codigo: string;
  descripcion: string; unidades: number; almacen: string; hl: number | null; cajas: number | null;
  anio: number; mes: number; dia: number; costo: number | null;
  origen: "balance" | "archivo" | "manual" | "historico"; archivo: string | null; nota: string | null; sin_maestro: boolean;
};
export type MaestroPasivo = {
  codigo: string; material: string | null; descripcion: string; familia: string | null;
  unidades_por_caja: number | null; plancha: number | null; alto: number | null; cajas_por_estiba: number | null;
  tipo: string | null; hl_unidad: number | null; caja: string | null; costo: number | null; activo: boolean;
};
export type NuevaFila = { fecha: string; estado: string; causal: string; codigo: string; unidades: number; almacen: string; nota?: string | null };

/** Cada hoja del balance, a qué estado · causal · almacén va en Pasivos (como en BLOQUEADOS.xlsx). */
export const DEL_BALANCE: { estado: string; alcance: string; a: { estado: string; causal: string; almacen: string } }[] = [
  { estado: "BAJA",       alcance: "SORTING",    a: { estado: "BAJA",   causal: "SORTING",    almacen: "AG18" } },
  { estado: "BAJA",       alcance: "PRESORTING", a: { estado: "BAJA",   causal: "PRESORTING", almacen: "AG22" } },
  { estado: "LAVADO",     alcance: "SORTING",    a: { estado: "LAVADO", causal: "LAVADO",     almacen: "AG18" } },
  { estado: "LAVADO",     alcance: "PRESORTING", a: { estado: "LAVADO", causal: "LAVADO",     almacen: "AG22" } },
  { estado: "EXTRASUCIO", alcance: "PRESORTING", a: { estado: "LAVADO", causal: "EXTRASUCIO", almacen: "AG22" } },
  { estado: "EXTRASUCIO", alcance: "SORTING",    a: { estado: "LAVADO", causal: "EXTRASUCIO", almacen: "AG18" } },
];

/** Las filas que el balance de ese día le da a Pasivos (la diferencia en unidades de cada material). */
export function filasDeBalance(fecha: string, detalle: FilaBalance[], regla?: ReglaExcluidos) {
  const filas: NuevaFila[] = [];
  const sinFactor: string[] = [];
  const excluidos = new Set<string>();
  for (const f of detalle) {
    /* LO REASIGNADO A ANDINA / HEINEKEN: nada queda por fuera. Cada código real va a la base con su causal ANDINA (o HEINEKEN), en BAJA,
       en el almacén de donde se contó (Fábrica = AG18, Bodega 38 = AG22), con sus unidades. */
    if (esDueno(f.codigo)) {
      const alm = f.alcance === "SORTING" ? "AG18" : "AG22";
      for (const x of f.provenientes ?? []) {
        if (regla ? excluye(regla, x.codigo, x.material) : esExcluido(x.codigo, x.material)) { excluidos.add(x.codigo); continue }
        if (!x.cajas) continue;
        if (x.unidades == null) { sinFactor.push(x.codigo); continue }
        filas.push({ fecha, estado: "BAJA", causal: f.codigo, codigo: x.codigo, unidades: Math.round(x.unidades), almacen: alm,
          nota: `Reasignado a ${f.codigo} en el Balance · ${Math.round(x.cajas).toLocaleString("es-CO")} cajas · ${x.ubicacion}` });
      }
      continue;
    }
    const m = DEL_BALANCE.find((x) => x.estado === f.estado && x.alcance === f.alcance);
    if (!m) continue;
    /* Envases nuevos (barril, 412644, 412671, 412707) y la estiba 3500163: no van en Pasivos. */
    if (regla ? excluye(regla, f.codigo, f.material) : esExcluido(f.codigo, f.material)) { excluidos.add(f.codigo); continue }
    /* Lo que está en el casco y NO se contó no entra (como en BLOQUEADOS.xlsx): va como alerta en el balance. */
    if (!f.fisico_cajas) continue;
    if (f.unidades == null) { sinFactor.push(f.codigo); continue }
    /* Si parte de lo contado llegó por una reasignación del Balance (OTROS → BAJA…), queda dicho en la fila para poder comprobarlo. */
    const reas = f.reasignadas_cajas ?? 0;
    const nota = reas > 0 ? `Incluye ${Math.round(reas).toLocaleString("es-CO")} cajas reasignadas en el Balance${f.un_caja ? ` (${Math.round(reas * f.un_caja).toLocaleString("es-CO")} u)` : ""}` : null;
    filas.push({ fecha, ...m.a, codigo: f.codigo, unidades: f.unidades, ...(nota ? { nota } : {}) });
  }
  return { filas, sinFactor: [...new Set(sinFactor)], excluidos: [...excluidos] };
}

export async function balanceParaPasivos(fecha: string, casco?: string | null) {
  const [b, regla] = await Promise.all([balanceDelDia(fecha, casco ?? null), leerExcluidos("AG22")]);
  if (b.fecha !== fecha) return { filas: [] as NuevaFila[], sinFactor: [] as string[], excluidos: [] as string[], error: `No hay conteo enviado el ${fecha}.` };
  return { ...filasDeBalance(fecha, b.detalle, regla), error: b.error };
}

export async function leerPasivos(desde: string, hasta: string) {
  const supabase = await createClient();
  const regla = await leerExcluidos("AG22");
  const r = await todas<FilaPasivo>((d, h) => supabase.from("v_pasivos_base").select("*")
    .gte("fecha", desde).lte("fecha", hasta)
    .order("fecha", { ascending: false }).order("almacen").order("estado").order("causal").order("codigo").order("id")
    .range(d, h));
  /* Envases nuevos (barril, 412644, 412671, 412707) y la estiba 3500163: no cuentan en Pasivos aunque hayan quedado cargados. */
  return { ...r, data: r.data.filter((f) => !excluye(regla, f.codigo, f.descripcion)) };
}

/** Los días que tienen algo cargado (para el calendario). */
export async function diasConPasivos(): Promise<string[]> {
  const supabase = await createClient();
  const r = await todas<{ fecha: string }>((d, h) => supabase.from("pasivos_base").select("fecha").order("fecha").range(d, h));
  return [...new Set(r.data.map((x) => x.fecha))];
}

export async function leerMaestroPasivos() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pasivos_maestro").select("*").order("codigo");
  return { data: (data ?? []) as MaestroPasivo[], error: error?.message ?? null };
}

/* ---------------------------- EL HISTÓRICO ---------------------------- */
/** La suma de un pedazo de la base (un almacén, una causal…). */
export type SumaPasivos = { filas: number; unidades: number; cajas: number; hl: number; costo: number };
/** La foto de la base de un día, guardada con «Guardar el día» (tabla pasivos_cierres). */
export type ResumenPasivos = {
  total: SumaPasivos;
  almacenes: Record<string, SumaPasivos & { causales: Record<string, number> }>;
};
export type CierrePasivos = { fecha: string; resumen: ResumenPasivos; cerrado_en: string; cerrado_nombre: string | null };

const cero = (): SumaPasivos => ({ filas: 0, unidades: 0, cajas: 0, hl: 0, costo: 0 });
export function resumirPasivos(filas: FilaPasivo[]): ResumenPasivos {
  const r: ResumenPasivos = { total: cero(), almacenes: {} };
  for (const f of filas) {
    const a = (r.almacenes[f.almacen] ??= { ...cero(), causales: {} });
    for (const s of [r.total, a]) {
      s.filas++; s.unidades += Number(f.unidades) || 0; s.cajas += Number(f.cajas) || 0; s.hl += Number(f.hl) || 0; s.costo += Number(f.costo) || 0;
    }
    a.causales[f.causal] = (a.causales[f.causal] ?? 0) + (Number(f.unidades) || 0);
  }
  return r;
}

export async function leerCierresPasivos(): Promise<{ data: CierrePasivos[]; falta: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pasivos_cierres").select("fecha, resumen, cerrado_en, cerrado_nombre").order("fecha", { ascending: false }).limit(180);
  return { data: (data ?? []) as CierrePasivos[], falta: !!error && /pasivos_cierres|does not exist|PGRST205/i.test(`${error.code} ${error.message}`) };
}
