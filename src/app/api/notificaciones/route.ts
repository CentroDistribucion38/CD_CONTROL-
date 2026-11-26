/**
 * AVISOS AL CELULAR · el equipo de cada persona.
 *   GET                                  → la llave pública (para que el navegador se suscriba) y si el servidor puede mandar.
 *   POST {accion:"suscribir", sub, equipo} → guarda este celular/computador para quien tiene la sesión.
 *   POST {accion:"quitar", endpoint}       → deja de avisar en este equipo.
 *   POST {accion:"probar"}                 → manda un aviso de prueba a todos los equipos de quien lo pide.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { enviarAUsuarios, llavesPush } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = clienteDeServicio();
  const k = db ? await llavesPush(db) : null;
  return NextResponse.json({ publica: k?.publica ?? null, listo: !!k, falta: k ? null : db ? "Falta correr 2026-11-config-servidor.sql en Supabase." : "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const db = clienteDeServicio();
  if (!db) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }, { status: 503 });
  let c: { accion?: string; sub?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; equipo?: string; endpoint?: string } = {};
  try { c = await req.json() } catch { return NextResponse.json({ error: "Datos ilegibles." }, { status: 400 }) }
  const falta = (m: string) => /push_suscripciones|schema cache|does not exist/i.test(m);

  if (c.accion === "suscribir") {
    const e = c.sub?.endpoint, p = c.sub?.keys?.p256dh, a = c.sub?.keys?.auth;
    if (!e || !p || !a || !/^https:\/\//.test(e)) return NextResponse.json({ error: "Suscripción incompleta." }, { status: 400 });
    const { error } = await db.from("push_suscripciones").upsert({ usuario: user.id, endpoint: e, p256dh: p, auth: a, equipo: (c.equipo ?? "").slice(0, 120) || null }, { onConflict: "endpoint" });
    if (error) return NextResponse.json({ error: falta(error.message) ? "Falta correr 2026-11-gps-avisos.sql en Supabase." : error.message }, { status: falta(error.message) ? 409 : 500 });
    return NextResponse.json({ ok: true });
  }
  if (c.accion === "quitar") {
    if (c.endpoint) await db.from("push_suscripciones").delete().eq("endpoint", c.endpoint).eq("usuario", user.id);
    return NextResponse.json({ ok: true });
  }
  if (c.accion === "probar") {
    if (!(await llavesPush(db))) return NextResponse.json({ error: "Falta correr 2026-11-config-servidor.sql en Supabase." }, { status: 503 });
    const n = await enviarAUsuarios(db, [user.id], { titulo: "CONTROL · aviso de prueba", cuerpo: "Así te van a llegar los avisos del GPS.", etiqueta: "prueba" });
    return NextResponse.json({ ok: true, enviados: n });
  }
  return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
}
