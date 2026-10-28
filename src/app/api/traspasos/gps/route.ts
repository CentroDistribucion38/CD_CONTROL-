/**
 * TIEMPOS GPS — el puente con Traccar.
 *   GET  /api/traspasos/gps                       → { conectado }   (¿están puestas las llaves de Traccar?)
 *   POST /api/traspasos/gps {accion:"sincronizar"} → lee posiciones nuevas, saca entradas y salidas de las zonas y las guarda
 *   POST /api/traspasos/gps {accion:"zonas"}       → trae las geocercas de Traccar como zonas (necesita permiso de editar)
 *
 * Con la sesión de quien pide (RLS): la llave de servicio no se usa. La pantalla llama «sincronizar»
 * cada pocos segundos mientras está abierta; como las posiciones se piden desde la última que se procesó,
 * lo que pasó con la pantalla cerrada se reconstruye con su hora real.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispositivos, geocercas, recorrido, traccarConfigurado, ultimasPosiciones } from "@/modulos/traspasos/gps/traccar";
import { procesarPosiciones, type EstadoVehiculo, type Posicion, type Zona } from "@/modulos/traspasos/gps/motor";
import { zonaDeTraccar, type Punto } from "@/modulos/traspasos/gps/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANTALLA = "/traspasos/tiempos-gps";
/** Si un equipo no tiene nada procesado, se mira hasta cuántas horas atrás. */
const HORAS_ATRAS = 12;
const NUDO = 1.852;   // nudos → km/h

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  return NextResponse.json({ conectado: traccarConfigurado() });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const { data: nivel } = await supabase.rpc("mi_nivel", { p_seccion: PANTALLA });
  if (!nivel || nivel === "ninguno") return NextResponse.json({ error: "No tienes permiso para esta pantalla." }, { status: 403 });
  if (!traccarConfigurado()) return NextResponse.json({ conectado: false });

  let cuerpo: { accion?: string } = {};
  try { cuerpo = await req.json() } catch { /* sin cuerpo */ }

  try {
    /* ---------------------------------------------------------------- zonas desde Traccar */
    if (cuerpo.accion === "zonas") {
      if (nivel !== "editar") return NextResponse.json({ error: "Traer las zonas necesita permiso de editar." }, { status: 403 });
      const cercas = await geocercas();
      let nuevas = 0, omitidas = 0;
      for (const g of cercas) {
        const poli = zonaDeTraccar(g.area);
        if (!poli) { omitidas++; continue }
        const { data: ya } = await supabase.from("gps_zonas").select("id").eq("traccar_id", g.id).maybeSingle();
        if (ya) { omitidas++; continue }
        const { error } = await supabase.from("gps_zonas").insert({ nombre: g.name, poligono: poli, origen: "traccar", traccar_id: g.id });
        if (error) { omitidas++; continue }
        nuevas++;
      }
      return NextResponse.json({ conectado: true, nuevas, omitidas, total: cercas.length });
    }

    /* ---------------------------------------------------------------- sincronizar */
    const [zr, er, devs, ultimas] = await Promise.all([
      supabase.from("gps_zonas").select("id, nombre, color, poligono").eq("activa", true),
      supabase.from("gps_estado").select("fix_en, zona_id, gps_vehiculos!inner(traccar_id)"),
      dispositivos(), ultimasPosiciones(),
    ]);
    if (zr.error) return NextResponse.json({ error: zr.error.message }, { status: 500 });
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
      return NextResponse.json({ error: falta ? "Falta correr 2026-10-traspasos-gps.sql en Supabase." : error.message }, { status: falta ? 409 : 500 });
    }
    return NextResponse.json({ conectado: true, equipos: devs.length, posiciones: posiciones.length, ...(res as object) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo hablar con Traccar." }, { status: 502 });
  }
}
