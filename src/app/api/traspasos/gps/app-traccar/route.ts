/** La dirección que se pone en la app Traccar Client (con la clave). Solo para quien puede ver Compartir ubicación o Tiempos GPS. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const p = await misPermisos();
  if (!p.manda && !p.puedeVer("/traspasos/compartir-ubicacion") && !p.puedeVer("/traspasos/tiempos-gps")) return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const k = process.env.GPS_CLAVE_TRACCAR;
  if (!k || k.length < 12) return NextResponse.json({ ok: false, falta: "GPS_CLAVE_TRACCAR" });
  const base = new URL(req.url).origin;
  return NextResponse.json({ ok: true, url: `${base}/api/traspasos/gps/traccar?clave=${encodeURIComponent(k)}` });
}
