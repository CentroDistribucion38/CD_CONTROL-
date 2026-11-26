/**
 * AVISOS AL CELULAR (notificaciones push del navegador). Solo servidor.
 *
 * Cada persona activa los avisos en su celular o computador (Tiempos GPS → «Avisos al celular»): el navegador entrega
 * una suscripción que se guarda en push_suscripciones. Para avisar, el servidor manda el mensaje a todas las
 * suscripciones de las personas escogidas; el celular lo muestra con sonido y vibración aunque CONTROL esté cerrado.
 *
 * Hace falta en Vercel: NEXT_PUBLIC_VAPID_PUBLICA, VAPID_PRIVADA (y opcional VAPID_CORREO). Sin ellas no se manda nada.
 * En iPhone solo funciona con CONTROL agregado a la pantalla de inicio (iOS 16.4 o más nuevo).
 */
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Aviso = { titulo: string; cuerpo: string; url?: string; etiqueta?: string };

let listo: boolean | null = null;
export function pushConfigurado(): boolean {
  if (listo !== null) return listo;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLICA, priv = process.env.VAPID_PRIVADA;
  if (!pub || !priv) return (listo = false);
  try { webpush.setVapidDetails(`mailto:${process.env.VAPID_CORREO || "cristian@1aautomatizacion.group"}`, pub, priv); listo = true }
  catch { listo = false }
  return listo;
}

/** Manda el aviso a todos los equipos de esas personas. Devuelve cuántos lo recibieron. Las suscripciones vencidas se borran. */
export async function enviarAUsuarios(db: SupabaseClient, usuarios: string[], a: Aviso): Promise<number> {
  if (!usuarios.length || !pushConfigurado()) return 0;
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
