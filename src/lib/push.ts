/**
 * AVISOS AL CELULAR (notificaciones push del navegador). Solo servidor.
 *
 * Cada persona activa los avisos en su celular o computador (Tiempos GPS → «Avisos al celular»): el navegador entrega
 * una suscripción que se guarda en push_suscripciones. Para avisar, el servidor manda el mensaje a todas las
 * suscripciones de las personas escogidas; el celular lo muestra con sonido y vibración aunque CONTROL esté cerrado.
 *
 * Las llaves (VAPID): si están en Vercel (NEXT_PUBLIC_VAPID_PUBLICA, VAPID_PRIVADA) mandan esas; si no, el servidor las
 * genera solo la primera vez y las guarda en app_config (SQL 2026-11-config-servidor.sql).
 * En iPhone solo funciona con CONTROL agregado a la pantalla de inicio (iOS 16.4 o más nuevo).
 */
import webpush from "web-push";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asegurarConfig } from "./config-servidor";

export type Aviso = { titulo: string; cuerpo: string; url?: string; etiqueta?: string };

let llaves: { publica: string; privada: string } | null = null;

/** Las llaves de avisos (de Vercel o de la base, creándolas si hace falta) y deja web-push listo. null si no se pudo. */
export async function llavesPush(db: SupabaseClient): Promise<{ publica: string; privada: string } | null> {
  if (llaves) return llaves;
  let pub = process.env.NEXT_PUBLIC_VAPID_PUBLICA, priv = process.env.VAPID_PRIVADA;
  if (!pub || !priv) {
    const v = await asegurarConfig(db, "vapid", () => { const k = webpush.generateVAPIDKeys(); return JSON.stringify({ publica: k.publicKey, privada: k.privateKey }) });
    if (!v) return null;
    try { const j = JSON.parse(v) as { publica: string; privada: string }; pub = j.publica; priv = j.privada } catch { return null }
  }
  try { webpush.setVapidDetails(`mailto:${process.env.VAPID_CORREO || "cristian@1aautomatizacion.group"}`, pub!, priv!) } catch { return null }
  return (llaves = { publica: pub!, privada: priv! });
}
export const pushConfigurado = async (db: SupabaseClient) => !!(await llavesPush(db));
/** Una clave aleatoria para URLs (la de Traccar). */
export const claveAleatoria = () => randomBytes(18).toString("base64url");

/** Manda el aviso a todos los equipos de esas personas. Devuelve cuántos lo recibieron. Las suscripciones vencidas se borran. */
export async function enviarAUsuarios(db: SupabaseClient, usuarios: string[], a: Aviso): Promise<number> {
  if (!usuarios.length || !(await pushConfigurado(db))) return 0;
  const { data } = await db.from("push_suscripciones").select("id, endpoint, p256dh, auth").in("usuario", usuarios);
  const subs = (data ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[];
  const cuerpo = JSON.stringify({ titulo: a.titulo, cuerpo: a.cuerpo, url: a.url ?? "/traspasos/tiempos-gps", etiqueta: a.etiqueta ?? a.titulo });
  let ok = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, { TTL: 600, urgency: "high" });
      ok++;
      await db.from("push_suscripciones").update({ ultimo_ok: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const st = (e as { statusCode?: number }).statusCode;
      if (st === 404 || st === 410) await db.from("push_suscripciones").delete().eq("id", s.id);
    }
  }));
  return ok;
}
