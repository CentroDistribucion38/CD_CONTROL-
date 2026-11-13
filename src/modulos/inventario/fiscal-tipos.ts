/**
 * FISCAL O CÍCLICO — separar las hojas de una persona por el tipo de su inventario.
 *
 * El cíclico de Producto usa las mismas tablas del fiscal (2026-11-producto-ciclico.sql le pone `tipo`). La
 * persona trae sus hojas con `inv_fiscal_mis_hojas` (de los dos tipos); aquí se le pregunta a la base de qué
 * tipo es cada inventario. El Contar de Inventario se queda con las FISCALES (si no, una hoja del cíclico la
 * dejaría «en modo fiscal») y el Contar de Producto con las CÍCLICAS.
 *
 * Si a la base le falta el SQL, la función no existe: todo es fiscal, como antes.
 */
import type { MiHojaBD } from "./fiscal";

type Cliente = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export async function separarPorTipo(supabase: Cliente, filas: MiHojaBD[]): Promise<{ fiscal: MiHojaBD[]; ciclico: MiHojaBD[]; conTipo: boolean }> {
  const ids = [...new Set(filas.map((f) => f.fiscal_id))];
  if (ids.length === 0) return { fiscal: [], ciclico: [], conTipo: true };
  const r = await supabase.rpc("inv_fiscal_tipos", { p_ids: ids });
  if (r.error || !Array.isArray(r.data)) return { fiscal: filas, ciclico: [], conTipo: false };
  const ciclicos = new Set((r.data as { id: string; tipo: string }[]).filter((x) => x.tipo === "CICLICO").map((x) => x.id));
  return {
    fiscal: filas.filter((f) => !ciclicos.has(f.fiscal_id)),
    ciclico: filas.filter((f) => ciclicos.has(f.fiscal_id)),
    conTipo: true,
  };
}
