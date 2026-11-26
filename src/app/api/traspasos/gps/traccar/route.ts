/**
 * TIEMPOS GPS · LO QUE MANDA LA APP «TRACCAR CLIENT» (gratis, Android/iPhone), que sigue mandando la ubicación con el
 * celular bloqueado. No hace falta un servidor Traccar: la app le manda directo a CONTROL.
 *
 * En la app: URL del servidor = https://<CONTROL>/api/traspasos/gps/traccar?clave=<GPS_CLAVE_TRACCAR>
 *            Identificador del dispositivo = la PLACA del vehículo (ABC123).
 *
 * Acepta los dos formatos de la app: el nuevo (JSON: device_id + location.coords, velocidad en m/s, también una lista
 * de posiciones guardadas sin señal) y el viejo OsmAnd (id, lat, lon, timestamp, speed en nudos, bearing, accuracy),
 * por GET o POST. La clave va en la URL porque la app no inicia sesión.
 */
import { NextResponse } from "next/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { placaValida } from "@/modulos/traspasos/gps/celular";
import { procesarPosicion } from "@/modulos/traspasos/gps/entrada";
import { leer, PRECISION_MAX_M } from "@/modulos/traspasos/gps/osmand";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function claveOk(url: URL): boolean {
  const k = process.env.GPS_CLAVE_TRACCAR;
  return !!k && k.length >= 12 && url.searchParams.get("clave") === k;
}

async function recibir(req: Request) {
  const url = new URL(req.url);
  if (!claveOk(url)) return NextResponse.json({ error: "Clave incorrecta." }, { status: 401 });
  const db = clienteDeServicio();
  if (!db) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }, { status: 503 });

  let cuerpo: unknown = null;
  if (req.method === "POST") {
    const tipo = req.headers.get("content-type") ?? "";
    const texto = await req.text().catch(() => "");
    if (tipo.includes("json") || texto.trim().startsWith("{")) { try { cuerpo = JSON.parse(texto) } catch { cuerpo = null } }
    else if (texto) cuerpo = Object.fromEntries(new URLSearchParams(texto));
  }
  const leidas = leer(url.searchParams, cuerpo).sort((a, b) => a.fix.en.localeCompare(b.fix.en));
  if (!leidas.length) return NextResponse.json({ error: "No llegó ninguna posición." }, { status: 400 });
  if (!placaValida(leidas[0].placa)) return NextResponse.json({ error: "El identificador del dispositivo debe ser la placa (ABC123)." }, { status: 400 });

  let guardadas = 0;
  for (const l of leidas) {
    /* la app espera 200 aunque la posición no sirva: si no, la reintenta sin fin */
    if (l.fix.precision != null && l.fix.precision > PRECISION_MAX_M) continue;
    const r = await procesarPosicion(db, l.placa, l.fix);
    if (!r.ok && r.estado >= 500) return NextResponse.json({ error: r.error }, { status: r.estado });
    if (r.ok) guardadas++;
  }
  return NextResponse.json({ ok: true, guardadas });
}

export const GET = recibir;
export const POST = recibir;
