/** La dirección que se pone en la app Traccar Client (con la clave). Solo para quien puede ver Compartir ubicación o Tiempos GPS. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { claveTraccar } from "@/modulos/traspasos/gps/clave-app";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const p = await misPermisos();
  if (!p.manda && !p.puedeVer("/traspasos/compartir-ubicacion") && !p.puedeVer("/traspasos/tiempos-gps")) return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const db = clienteDeServicio();
  if (!db) return NextResponse.json({ ok: false, falta: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." });
  const k = await claveTraccar(db);
  if (!k) return NextResponse.json({ ok: false, falta: "Falta correr 2026-11-config-servidor.sql en Supabase." });
  const base = new URL(req.url).origin;
  return NextResponse.json({ ok: true, url: `${base}/api/traspasos/gps/traccar?clave=${encodeURIComponent(k)}` });
}
