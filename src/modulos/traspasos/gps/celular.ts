/**
 * TIEMPOS GPS SIN TRACCAR — la posición la manda el celular del conductor.
 *
 * El conductor abre «Compartir ubicación» en CONTROL, escribe la placa y deja la pantalla encendida: el
 * celular manda su posición cada pocos segundos. Aquí se hace lo mismo que con Traccar: ver si entró o salió
 * de una zona y guardarlo con gps_registrar(). Cada placa recibe un número propio NEGATIVO (los de Traccar son
 * positivos), así los dos orígenes conviven sin pisarse.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { procesarPosiciones, type EstadoVehiculo, type Zona } from "./motor";
import type { Punto } from "./geo";

export const limpiarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const placaValida = (p: string) => /^[A-Z0-9]{5,7}$/.test(p);

/** Número fijo y negativo para una placa (hash FNV-1a). */
export function idDeCelular(placa: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < placa.length; i++) { h ^= placa.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return -((h % 2_000_000_000) + 1);
}

export type EntradaCelular = { placa: string; lat: number; lng: number; velocidad: number | null; rumbo: number | null; en: string };
export type ResultadoCelular =
  | { ok: true; zona: string | null; entradas: number; salidas: number }
  | { ok: false; estado: number; error: string };

export async function registrarCelular(db: SupabaseClient, e: EntradaCelular): Promise<ResultadoCelular> {
  const id = idDeCelular(e.placa);
  const [zr, er] = await Promise.all([
    db.from("gps_zonas").select("id, nombre, color, poligono").eq("activa", true),
    db.from("gps_estado").select("fix_en, zona_id, gps_vehiculos!inner(traccar_id)").eq("gps_vehiculos.traccar_id", id).limit(1),
  ]);
  if (zr.error) return { ok: false, estado: /gps_zonas|schema cache|does not exist/i.test(zr.error.message) ? 409 : 500, error: /gps_zonas|schema cache|does not exist/i.test(zr.error.message) ? "Falta correr 2026-10-traspasos-gps.sql en Supabase." : zr.error.message };
  const zonas: Zona[] = (zr.data ?? []).map((z) => ({ id: z.id as string, nombre: z.nombre as string, color: z.color as string, poligono: z.poligono as Punto[] }));
  const previos: EstadoVehiculo[] = ((er.data ?? []) as { fix_en: string; zona_id: string | null }[]).map((x) => ({ vehiculo: id, zonaId: x.zona_id, fixEn: x.fix_en }));

  const { eventos, estados } = procesarPosiciones(zonas, previos, [{ vehiculo: id, lat: e.lat, lng: e.lng, en: e.en, velocidad: e.velocidad, rumbo: e.rumbo }]);
  const est = estados.get(id);
  const { data: res, error } = await db.rpc("gps_registrar", {
    p_vehiculos: [{ traccar_id: id, nombre: e.placa, placa: e.placa }],
    p_eventos: eventos.map((v) => ({ traccar_id: v.vehiculo, zona_id: v.zonaId, tipo: v.tipo, en: v.en })),
    p_estados: est && Number.isFinite(est.lat) && est.fixEn ? [{ traccar_id: id, lat: est.lat, lng: est.lng, velocidad: est.velocidad, rumbo: est.rumbo, fix_en: est.fixEn, zona_id: est.zonaId }] : [],
  });
  if (error) {
    const falta = /gps_registrar|schema cache|does not exist|no existe la funci/i.test(error.message);
    return { ok: false, estado: falta ? 409 : 500, error: falta ? "Falta correr 2026-10-traspasos-gps.sql en Supabase." : error.message };
  }
  const zona = est?.zonaId ? zonas.find((z) => z.id === est.zonaId)?.nombre ?? null : null;
  const r = res as { entradas?: number; salidas?: number } | null;
  return { ok: true, zona, entradas: r?.entradas ?? 0, salidas: r?.salidas ?? 0 };
}
