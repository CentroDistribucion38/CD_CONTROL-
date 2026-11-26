/**
 * TIEMPOS GPS · A QUIÉN LE LLEGAN LOS AVISOS.
 *   GET  → lo mío (si estoy en la lista, qué tipos y cuántos equipos tengo) y, para quien puede escoger, todas las personas.
 *   POST {usuario, tipos[]} → pone o quita a alguien (tipos vacío = sin avisos). Solo superadmin o quien edita Tiempos GPS.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { misPermisos } from "@/lib/permisos";

export const dynamic = "force-dynamic";
const RUTA = "/traspasos/tiempos-gps";
const TIPOS = ["parado", "espera", "llego", "salio"] as const;

async function quien() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sin sesión." }, { status: 401 }) };
  const p = await misPermisos();
  if (!p.manda && !p.puedeVer(RUTA)) return { error: NextResponse.json({ error: "Sin permiso." }, { status: 403 }) };
  const db = clienteDeServicio();
  if (!db) return { error: NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }, { status: 503 }) };
  return { user, db, escoge: p.manda || p.puedeEditar(RUTA) };
}
const falta = (m: string) => /gps_alerta|push_suscripciones|schema cache|does not exist/i.test(m);

export async function GET() {
  const q = await quien();
  if ("error" in q) return q.error;
  const [d, s] = await Promise.all([
    q.db.from("gps_alerta_destinatarios").select("usuario, tipos, activo"),
    q.db.from("push_suscripciones").select("usuario"),
  ]);
  if (d.error) return NextResponse.json({ error: falta(d.error.message) ? "Falta correr 2026-11-gps-avisos.sql en Supabase." : d.error.message }, { status: falta(d.error.message) ? 409 : 500 });
  const dest = new Map(((d.data ?? []) as { usuario: string; tipos: string[]; activo: boolean }[]).map((x) => [x.usuario, x]));
  const equipos = new Map<string, number>();
  for (const x of (s.data ?? []) as { usuario: string }[]) equipos.set(x.usuario, (equipos.get(x.usuario) ?? 0) + 1);
  const mio = dest.get(q.user.id);
  let personas: { id: string; nombre: string; usuario: string; tipos: string[]; equipos: number }[] = [];
  if (q.escoge) {
    const { data } = await q.db.from("perfiles").select("id, nombre, usuario").order("nombre");
    personas = ((data ?? []) as { id: string; nombre: string | null; usuario: string | null }[]).map((x) => ({
      id: x.id, nombre: x.nombre || x.usuario || "—", usuario: x.usuario ?? "", tipos: dest.get(x.id)?.activo ? dest.get(x.id)!.tipos : [], equipos: equipos.get(x.id) ?? 0,
    }));
  }
  return NextResponse.json({ ok: true, escoge: q.escoge, yo: { id: q.user.id, tipos: mio?.activo ? mio.tipos : [], equipos: equipos.get(q.user.id) ?? 0 }, personas });
}

export async function POST(req: Request) {
  const q = await quien();
  if ("error" in q) return q.error;
  if (!q.escoge) return NextResponse.json({ error: "Solo el superadmin o quien edita Tiempos GPS escoge a quién le llegan los avisos." }, { status: 403 });
  let c: { usuario?: string; tipos?: string[] } = {};
  try { c = await req.json() } catch { return NextResponse.json({ error: "Datos ilegibles." }, { status: 400 }) }
  if (!c.usuario || !/^[0-9a-f-]{36}$/i.test(c.usuario)) return NextResponse.json({ error: "Falta la persona." }, { status: 400 });
  const tipos = (c.tipos ?? []).filter((t): t is (typeof TIPOS)[number] => (TIPOS as readonly string[]).includes(t));
  const r = tipos.length
    ? await q.db.from("gps_alerta_destinatarios").upsert({ usuario: c.usuario, tipos, activo: true }, { onConflict: "usuario" })
    : await q.db.from("gps_alerta_destinatarios").delete().eq("usuario", c.usuario);
  if (r.error) return NextResponse.json({ error: falta(r.error.message) ? "Falta correr 2026-11-gps-avisos.sql en Supabase." : r.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
