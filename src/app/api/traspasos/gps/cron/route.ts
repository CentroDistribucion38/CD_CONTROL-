/**
 * TIEMPOS GPS — el reloj de fondo.
 *   GET|POST /api/traspasos/gps/cron   con   Authorization: Bearer <GPS_CRON_SECRET>
 *
 * Lo llama un reloj cada minuto (pg_cron de Supabase, o el cron de Vercel) para que las entradas y
 * salidas de las zonas se registren AUNQUE NADIE tenga la pantalla abierta. No hay sesión de usuario:
 * se protege con una clave secreta propia y escribe con la llave de servicio, así que ANTES de hacer
 * nada comprueba esa clave. Sin la clave puesta en Vercel, esta ruta responde 503 y no hace nada.
 *
 * Variables en Vercel: GPS_CRON_SECRET (la inventas tú, larga y al azar), SUPABASE_SERVICE_ROLE_KEY
 * (ya existe, la usa Admin → Usuarios) y las de Traccar.
 * (Vercel Cron manda solo «Authorization: Bearer $CRON_SECRET»: si lo usas, pon el mismo valor en CRON_SECRET.)
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { traccarConfigurado } from "@/modulos/traspasos/gps/traccar";
import { sincronizarGps } from "@/modulos/traspasos/gps/sincronizar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function igual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function atender(req: Request) {
  const secretos = [process.env.GPS_CRON_SECRET, process.env.CRON_SECRET].filter((s): s is string => !!s && s.length >= 16);
  if (secretos.length === 0) return NextResponse.json({ error: "Falta GPS_CRON_SECRET en Vercel." }, { status: 503 });
  const dado = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!dado || !secretos.some((s) => igual(dado, s))) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  if (!traccarConfigurado()) return NextResponse.json({ conectado: false });
  const supabase = clienteDeServicio();
  if (!supabase) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }, { status: 503 });

  try {
    const r = await sincronizarGps(supabase);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
    return NextResponse.json({ conectado: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo hablar con Traccar." }, { status: 502 });
  }
}

export const GET = atender;
export const POST = atender;
