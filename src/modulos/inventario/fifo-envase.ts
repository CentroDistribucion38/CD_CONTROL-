import { createClient } from "@/lib/supabase/server";
import { porTandas } from "@/modulos/inventario/paginas";
import { cruzar } from "@/modulos/inventario/base-cruce";
import { diasConConteo } from "@/modulos/inventario/balance";
import type { Renglon } from "@/modulos/inventario/fefo";
import { esUbicacionFabrica } from "@/modulos/casco/ubicacion-sitio";

/**
 * EL FIFO DEL ENVASE — «la tendencia del FIFO: qué envase se debería despachar primero, el que lleva tiempo
 * allí; dentro de un rango de fechas el inventario, cómo es el movimiento, y una gráfica del comportamiento
 * del envase por ubicaciones, a ver si se mantiene, cambia y demás».
 *
 * Lee los recorridos ENVIADOS de cada día del rango (cruzados igual que La base: de cada persona vale su
 * último recorrido) y se queda con el ENVASE (sin cajas plásticas ni estibas de madera).
 *   · EL ÚLTIMO DÍA del rango es la foto: días en la ubicación = ese día − la fecha FIFO del renglón (desde
 *     cuándo está ese material en esa posición; la pone la base al contar).
 *   · CADA DÍA: las cajas por material y zona (el movimiento) y, por ubicación, qué material había.
 * Una ubicación sin renglón un día es «sin registro»: el recorrido no pasó o estaba vacía.
 */
export type Zona = "Fábrica" | "Bodega 38";
export type LineaFifo = { ubicacion: string; zona: Zona; codigo: string; material: string; cajas: number; dias: number | null; fechaFifo: string | null };
export type PuntoSerie = { fecha: string; codigo: string; zona: Zona; cajas: number };
export type Celda = { codigo: string; cajas: number } | null;
export type UbicFifo = { ubicacion: string; zona: Zona; celdas: Celda[]; diasEnSitio: number | null };
export type MaterialFifo = { codigo: string; material: string };
export type DatosFifo = {
  dias: string[]; desde: string | null; hasta: string | null; rango: string[];
  lineas: LineaFifo[]; serie: PuntoSerie[]; ubicaciones: UbicFifo[]; materiales: MaterialFifo[]; error: string | null;
};

const TOPE_DIAS = 31;
const ESTIBA = "3500163";
const esCajaPlastica = (nombre: string | null | undefined) => /CAJA\s+PL/i.test(nombre ?? "");
const zonaDe = (u: string): Zona => (esUbicacionFabrica(u) ? "Fábrica" : "Bodega 38");
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a.slice(0, 10) + "T12:00:00Z")) / 86_400_000);

export async function fifoEnvase(pDesde?: string | null, pHasta?: string | null): Promise<DatosFifo> {
  const { dias, conteos, error } = await diasConConteo();
  const asc = [...dias].sort();
  const vacio: DatosFifo = { dias: asc, desde: null, hasta: null, rango: [], lineas: [], serie: [], ubicaciones: [], materiales: [], error };
  if (!asc.length) return vacio;

  /* El rango: lo pedido, o los últimos 7 días con conteo. Máximo 31 días con conteo. */
  let hasta = pHasta && /^\d{4}-\d{2}-\d{2}$/.test(pHasta) ? pHasta : asc[asc.length - 1];
  let desde = pDesde && /^\d{4}-\d{2}-\d{2}$/.test(pDesde) ? pDesde : asc[Math.max(0, asc.length - 7)];
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  let rango = asc.filter((d) => d >= desde && d <= hasta);
  if (rango.length > TOPE_DIAS) rango = rango.slice(-TOPE_DIAS);
  if (!rango.length) return { ...vacio, desde, hasta };

  const delRango = conteos.filter((c) => rango.includes(String(c.fecha_analisis).slice(0, 10)));
  const supabase = await createClient();
  const { data, error: e1 } = await porTandas<Renglon>(delRango.map((c) => c.id), (t, d, h) =>
    supabase.from("v_conteo_fefo").select("*").in("conteo_id", t).eq("tipo_material", "ENVASE").order("id").range(d, h));
  if (e1) return { ...vacio, desde, hasta, rango, error: e1 };

  const diaDe = new Map(delRango.map((c) => [c.id, String(c.fecha_analisis).slice(0, 10)]));
  const nombres = new Map<string, string>();
  const serie = new Map<string, PuntoSerie>();
  const porUbic = new Map<string, { zona: Zona; celdas: Map<string, Map<string, number>> }>();
  let lineas: LineaFifo[] = [];
  const ultimo = rango[rango.length - 1];

  for (const fecha of rango) {
    const cs = delRango.filter((c) => diaDe.get(c.id) === fecha);
    const ids = new Set(cs.map((c) => c.id));
    const { vigentes } = cruzar(data.filter((r) => ids.has(r.conteo_id)), cs);
    for (const r of vigentes) {
      const codigo = String(r.codigo);
      if (codigo === ESTIBA || esCajaPlastica(r.material)) continue;
      const cajas = Number(r.total_cajas) || 0;
      if (cajas <= 0) continue;
      const ubic = (r.ubicacion ?? r.ubicacion_combinada ?? "").trim() || "—";
      const zona = zonaDe(ubic);
      nombres.set(codigo, r.material ?? codigo);
      const ks = `${fecha}|${codigo}|${zona}`;
      const p = serie.get(ks) ?? { fecha, codigo, zona, cajas: 0 };
      p.cajas += cajas; serie.set(ks, p);
      const u = porUbic.get(ubic) ?? { zona, celdas: new Map() };
      const dia = u.celdas.get(fecha) ?? new Map<string, number>();
      dia.set(codigo, (dia.get(codigo) ?? 0) + cajas); u.celdas.set(fecha, dia); porUbic.set(ubic, u);
      if (fecha === ultimo) {
        const ff = r.fecha_fifo ? String(r.fecha_fifo).slice(0, 10) : null;
        lineas.push({ ubicacion: ubic, zona, codigo, material: r.material ?? codigo, cajas, dias: ff ? Math.max(0, diasEntre(ff, ultimo)) : null, fechaFifo: ff });
      }
    }
  }

  /* Por ubicación y día: el material que más cajas tenía (el que «manda» en esa celda). */
  const ubicaciones: UbicFifo[] = [...porUbic].map(([ubicacion, u]) => {
    const celdas: Celda[] = rango.map((f) => {
      const m = u.celdas.get(f);
      if (!m) return null;
      const [codigo, cajas] = [...m].sort((a, b) => b[1] - a[1])[0];
      return { codigo, cajas: [...m.values()].reduce((t, v) => t + v, 0) || cajas };
    });
    const suyas = lineas.filter((l) => l.ubicacion === ubicacion && l.dias != null);
    const diasEnSitio = suyas.length ? Math.max(...suyas.map((l) => l.dias!)) : null;
    return { ubicacion, zona: u.zona, celdas, diasEnSitio };
  });

  lineas = lineas.sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
  const totales = new Map<string, number>();
  for (const p of serie.values()) totales.set(p.codigo, (totales.get(p.codigo) ?? 0) + p.cajas);
  const materiales = [...totales].sort((a, b) => b[1] - a[1]).map(([codigo]) => ({ codigo, material: nombres.get(codigo) ?? codigo }));

  return { dias: asc, desde, hasta, rango, lineas, serie: [...serie.values()], ubicaciones, materiales, error: null };
}
