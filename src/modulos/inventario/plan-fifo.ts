import { createClient } from "@/lib/supabase/server";
import { porTandas } from "@/modulos/inventario/paginas";
import { cruzar } from "@/modulos/inventario/base-cruce";
import { diasConConteo } from "@/modulos/inventario/balance";
import type { Renglon } from "@/modulos/inventario/fefo";
import { esUbicacionFabrica } from "@/modulos/casco/ubicacion-sitio";

/**
 * EL PLAN DE DESPACHO FIFO — «si filtro 1, 2 o 3 SKU, qué módulos debo tomar cumpliendo el FIFO, cada renglón
 * ubicación por ubicación, y que se pueda imprimir».
 *
 * Lee el conteo ENVIADO de UN día (cruzado igual que La base: de cada persona vale su último recorrido) y se
 * queda con el ENVASE (sin cajas plásticas ni estibas de madera, igual que el FIFO del tablero). Cada renglón es
 * un material en un módulo (con su estado del envase y la fecha FIFO: desde cuándo está ahí). El orden de salida
 * lo pone la pantalla: el que lleva más tiempo en su sitio sale primero.
 */
export type Zona = "Fábrica" | "Bodega 38";
export type RenglonPlan = {
  id: string; ubicacion: string; zona: Zona; codigo: string; material: string;
  estibas: number; cajas: number; estado: string | null;
  fechaFifo: string | null; dias: number | null; capacidad: number | null;
};
export type MaterialPlan = { codigo: string; material: string; cajas: number; estibas: number; modulos: number; maxDias: number | null };
export type DatosPlan = {
  dias: string[]; dia: string | null; renglones: RenglonPlan[]; materiales: MaterialPlan[]; error: string | null;
};

const ESTIBA = "3500163";
const esCajaPlastica = (nombre: string | null | undefined) => /CAJA\s+PL/i.test(nombre ?? "");
const zonaDe = (u: string): Zona => (esUbicacionFabrica(u) ? "Fábrica" : "Bodega 38");
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a.slice(0, 10) + "T12:00:00Z")) / 86_400_000);

export async function planFifo(pDia?: string | null): Promise<DatosPlan> {
  const { dias, conteos, error } = await diasConConteo();
  const desc = [...dias].sort().reverse();
  const vacio: DatosPlan = { dias: desc, dia: null, renglones: [], materiales: [], error };
  if (!desc.length) return vacio;

  const dia = pDia && desc.includes(pDia) ? pDia : desc[0];
  const delDia = conteos.filter((c) => String(c.fecha_analisis).slice(0, 10) === dia);
  if (!delDia.length) return { ...vacio, dia };

  const supabase = await createClient();
  const { data, error: e1 } = await porTandas<Renglon>(delDia.map((c) => c.id), (t, d, h) =>
    supabase.from("v_conteo_fefo").select("*").in("conteo_id", t).eq("tipo_material", "ENVASE").order("id").range(d, h));
  if (e1) return { ...vacio, dia, error: e1 };

  const { vigentes } = cruzar(data, delDia);
  const renglones: RenglonPlan[] = [];
  for (const r of vigentes) {
    const codigo = String(r.codigo);
    if (codigo === ESTIBA || esCajaPlastica(r.material)) continue;
    const cajas = Number(r.total_cajas) || 0;
    const estibas = Number(r.total_estibas) || 0;
    if (cajas <= 0) continue;
    const ubic = (r.ubicacion ?? r.ubicacion_combinada ?? "").trim() || "—";
    const ff = r.fecha_fifo ? String(r.fecha_fifo).slice(0, 10) : null;
    renglones.push({
      id: String(r.id), ubicacion: ubic, zona: zonaDe(ubic), codigo, material: r.material ?? codigo,
      estibas, cajas, estado: r.estado_envase ?? null,
      fechaFifo: ff, dias: ff ? Math.max(0, diasEntre(ff, dia)) : null,
      capacidad: r.capacidad == null ? null : Number(r.capacidad),
    });
  }

  const m = new Map<string, MaterialPlan>();
  for (const r of renglones) {
    const x = m.get(r.codigo) ?? { codigo: r.codigo, material: r.material, cajas: 0, estibas: 0, modulos: 0, maxDias: null };
    x.cajas += r.cajas; x.estibas += r.estibas; x.modulos += 1;
    if (r.dias != null) x.maxDias = Math.max(x.maxDias ?? 0, r.dias);
    m.set(r.codigo, x);
  }
  const materiales = [...m.values()].sort((a, b) => b.cajas - a.cajas);
  return { dias: desc, dia, renglones, materiales, error: null };
}
