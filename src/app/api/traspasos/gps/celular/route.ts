/**
 * TIEMPOS GPS — la posición que manda el celular del conductor.
 *   POST /api/traspasos/gps/celular  {placa, lat, lng, precision?, velocidad?, rumbo?}
 *
 * Exige sesión y permiso en «Compartir ubicación». Lo que escribe lo hace con la llave de servicio (el
 * conductor no necesita permiso sobre las tablas del GPS), pero SOLO después de comprobar la sesión y el
 * permiso aquí mismo, y solo puede reportar posiciones: no lee ni cambia nada más.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { limpiarPlaca, placaValida, registrarCelular } from "@/modulos/traspasos/gps/celular";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PANTALLA = "/traspasos/compartir-ubicacion";
const PRECISION_MAX_M = 200;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const { data: nivel } = await supabase.rpc("mi_nivel", { p_seccion: PANTALLA });
  if (!nivel || nivel === "ninguno") return NextResponse.json({ error: "No tienes permiso para compartir ubicación." }, { status: 403 });

  let c: { placa?: unknown; lat?: unknown; lng?: unknown; precision?: unknown; velocidad?: unknown; rumbo?: unknown } = {};
  try { c = await req.json() } catch { return NextResponse.json({ error: "Datos ilegibles." }, { status: 400 }) }
  const placa = limpiarPlaca(String(c.placa ?? ""));
  const lat = Number(c.lat), lng = Number(c.lng);
  if (!placaValida(placa)) return NextResponse.json({ error: "Escribe la placa del vehículo (ej. ABC123)." }, { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ error: "Ubicación inválida." }, { status: 400 });
  const precision = Number(c.precision);
  if (Number.isFinite(precision) && precision > PRECISION_MAX_M) return NextResponse.json({ ok: false, debil: true, error: `Señal débil (±${Math.round(precision)} m). Espera a tener mejor GPS.` });

  const db = clienteDeServicio();
  if (!db) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }, { status: 503 });
  const vel = Number(c.velocidad), rum = Number(c.rumbo);
  const r = await registrarCelular(db, {
    placa, lat, lng, en: new Date().toISOString(),
    velocidad: Number.isFinite(vel) && vel >= 0 ? vel : null, rumbo: Number.isFinite(rum) && rum >= 0 ? rum : null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
  return NextResponse.json({ ok: true, zona: r.zona, entradas: r.entradas, salidas: r.salidas });
}
