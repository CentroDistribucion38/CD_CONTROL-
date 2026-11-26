/**
 * TIEMPOS GPS · EL VIGÍA. Lo llama Supabase cada minuto (pg_cron + pg_net, SQL 2026-11-gps-vigia.sql), sin sesión:
 * se protege con la clave del vigía guardada en app_config (o GPS_CRON_SECRET si está en Vercel).
 * Revisa los viajes en curso: si un vehículo lleva 3 min o más sin mandar ubicación, avisa al celular («Sin señal»).
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { revisarSenal } from "@/modulos/traspasos/gps/avisos";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) };

async function atender(req: Request) {
  const db = clienteDeServicio();
  if (!db) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }, { status: 503 });
  const dado = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data } = await db.from("app_config").select("valor").eq("clave", "vigia_clave").maybeSingle();
  const claves = [data?.valor as string | undefined, process.env.GPS_CRON_SECRET].filter((s): s is string => !!s && s.length >= 16);
  if (!dado || !claves.some((k) => igual(dado, k))) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const r = await revisarSenal(db);
  return NextResponse.json({ ok: true, ...r });
}

export const GET = atender;
export const POST = atender;
