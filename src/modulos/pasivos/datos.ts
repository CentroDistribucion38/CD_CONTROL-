import { createClient } from "@/lib/supabase/server";
import { todas } from "@/modulos/inventario/paginas";
import { balanceDelDia, type FilaBalance } from "@/modulos/inventario/balance";

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
export function filasDeBalance(fecha: string, detalle: FilaBalance[]) {
  const filas: NuevaFila[] = [];
  const sinFactor: string[] = [];
  for (const f of detalle) {
    const m = DEL_BALANCE.find((x) => x.estado === f.estado && x.alcance === f.alcance);
    if (!m) continue;
    /* Lo que está en el casco y NO se contó no entra (como en BLOQUEADOS.xlsx): va como alerta en el balance. */
    if (!f.fisico_cajas) continue;
    if (f.unidades == null) { sinFactor.push(f.codigo); continue }
    filas.push({ fecha, ...m.a, codigo: f.codigo, unidades: f.unidades });
  }
  return { filas, sinFactor: [...new Set(sinFactor)] };
}

export async function balanceParaPasivos(fecha: string, casco?: string | null) {
  const b = await balanceDelDia(fecha, casco ?? null);
  if (b.fecha !== fecha) return { filas: [] as NuevaFila[], sinFactor: [] as string[], error: `No hay conteo enviado el ${fecha}.` };
  return { ...filasDeBalance(fecha, b.detalle), error: b.error };
}

export async function leerPasivos(desde: string, hasta: string) {
  const supabase = await createClient();
  const r = await todas<FilaPasivo>((d, h) => supabase.from("v_pasivos_base").select("*")
    .gte("fecha", desde).lte("fecha", hasta)
    .order("fecha", { ascending: false }).order("almacen").order("estado").order("causal").order("codigo").order("id")
    .range(d, h));
  return r;
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
