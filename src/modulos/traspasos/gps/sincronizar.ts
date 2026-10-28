/**
 * TIEMPOS GPS — lo que se hace cada vez que se mira a Traccar:
 * leer las posiciones nuevas desde la última que se procesó, sacar entradas y salidas de las zonas
 * y guardarlas con gps_registrar(). Lo llaman dos puertas:
 *   · la pantalla (con la sesión de quien la mira)
 *   · el reloj de fondo /api/traspasos/gps/cron (con la llave de servicio), para que se controle
 *     aunque nadie tenga la pantalla abierta.
 * Es seguro llamarlo repetido: solo procesa lo posterior a la última posición guardada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispositivos, recorrido, ultimasPosiciones } from "./traccar";
import { procesarPosiciones, type EstadoVehiculo, type Posicion, type Zona } from "./motor";
import type { Punto } from "./geo";

/** Si un equipo no tiene nada procesado, se mira hasta cuántas horas atrás. */
const HORAS_ATRAS = 12;
const NUDO = 1.852;   // nudos → km/h

export type ResultadoSync =
  | { ok: true; equipos: number; posiciones: number; entradas?: number; salidas?: number }
  | { ok: false; estado: number; error: string };

export async function sincronizarGps(supabase: SupabaseClient): Promise<ResultadoSync> {
  const [zr, er, devs, ultimas] = await Promise.all([
    supabase.from("gps_zonas").select("id, nombre, color, poligono").eq("activa", true),
    supabase.from("gps_estado").select("fix_en, zona_id, gps_vehiculos!inner(traccar_id)"),
    dispositivos(), ultimasPosiciones(),
  ]);
  if (zr.error) return { ok: false, estado: 500, error: zr.error.message };
  const zonas: Zona[] = (zr.data ?? []).map((z) => ({ id: z.id as string, nombre: z.nombre as string, color: z.color as string, poligono: z.poligono as Punto[] }));

  const previos: EstadoVehiculo[] = ((er.data ?? []) as unknown as { fix_en: string; zona_id: string | null; gps_vehiculos: { traccar_id: number } | { traccar_id: number }[] }[])
    .map((e) => ({ vehiculo: Number(Array.isArray(e.gps_vehiculos) ? e.gps_vehiculos[0].traccar_id : e.gps_vehiculos.traccar_id), zonaId: e.zona_id, fixEn: e.fix_en }));
  const previoDe = new Map(previos.map((p) => [p.vehiculo, p]));

  const ahora = new Date();
  const posiciones: Posicion[] = [];
  await Promise.all(ultimas.map(async (u) => {
    const p = previoDe.get(u.deviceId);
    if (p?.fixEn && new Date(u.fixTime) <= new Date(p.fixEn)) return;          // nada nuevo
    const desde = p?.fixEn ?? new Date(ahora.getTime() - HORAS_ATRAS * 3600_000).toISOString();
    let ruta = await recorrido(u.deviceId, desde, ahora.toISOString()).catch(() => []);
    if (ruta.length === 0) ruta = [u];
    for (const r of ruta) posiciones.push({ vehiculo: u.deviceId, lat: r.latitude, lng: r.longitude, en: new Date(r.fixTime).toISOString(), velocidad: r.speed * NUDO, rumbo: r.course });
  }));

  const { eventos, estados } = procesarPosiciones(zonas, previos, posiciones);

  /* Los equipos que ya se vieron en Traccar (con o sin posición nueva) quedan creados. */
  const vehiculos = devs.map((d) => ({ traccar_id: d.id, nombre: d.name, placa: /^[A-Za-z]{3}[\s-]?\d{3}$/.test(d.name.trim()) ? d.name.trim().toUpperCase().replace(/[\s-]/g, "") : null }));
  const estadosOut = [...estados.values()].filter((e) => Number.isFinite(e.lat) && e.fixEn).map((e) => ({
    traccar_id: e.vehiculo, lat: e.lat, lng: e.lng, velocidad: e.velocidad, rumbo: e.rumbo, fix_en: e.fixEn, zona_id: e.zonaId,
  }));
  const { data: res, error } = await supabase.rpc("gps_registrar", {
    p_vehiculos: vehiculos,
    p_eventos: eventos.map((e) => ({ traccar_id: e.vehiculo, zona_id: e.zonaId, tipo: e.tipo, en: e.en })),
    p_estados: estadosOut,
  });
  if (error) {
    const falta = /gps_registrar|schema cache|does not exist|no existe la funci/i.test(error.message);
    return { ok: false, estado: falta ? 409 : 500, error: falta ? "Falta correr 2026-10-traspasos-gps.sql en Supabase." : error.message };
  }
  return { ok: true, equipos: devs.length, posiciones: posiciones.length, ...(res as { entradas?: number; salidas?: number }) };
}
