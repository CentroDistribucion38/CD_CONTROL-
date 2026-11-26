/**
 * TIEMPOS GPS · QUÉ AVISAR AL CELULAR (servidor). Se revisa con cada posición que llega (de la página del conductor o
 * de Traccar Client), más o menos una vez por minuto por placa, y al instante cuando un viaje llega o arranca:
 *   · llego  — el viaje entró a su geocerca destino.
 *   · salio  — el viaje arrancó solo al salir de su zona de origen.
 *   · parado — 15 min o más sin moverse fuera de las zonas (un aviso por placa por hora, como mucho).
 *   · espera — lleva en una zona mucho más que lo normal (lo normal = mediana de 14 días; sin historia, 45 min). Uno por visita.
 * Cada aviso queda en gps_alertas_enviadas con una clave única: así no se repite cada 10 segundos.
 * Solo les llega a las personas de gps_alerta_destinatarios que tengan ese tipo marcado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarAUsuarios, pushConfigurado } from "@/lib/push";
import { esLarga, normalesDe, segundosParado, corto, type PosRuta } from "./seguimiento";
import type { Seguimiento } from "./recorridos";

export type TipoAviso = "parado" | "espera" | "llego" | "salio" | "tramo" | "senal";
/** Desde cuántos segundos sin posición un viaje en curso cuenta como «sin señal». */
export const SIN_SENAL_S = 180;

async function avisar(db: SupabaseClient, tipo: TipoAviso, clave: string, placa: string, titulo: string, cuerpo: string) {
  const ins = await db.from("gps_alertas_enviadas").insert({ clave, tipo, placa, titulo, cuerpo }).select("id").maybeSingle();
  if (ins.error || !ins.data) return;                       // ya se avisó (clave repetida) o falta la tabla
  const { data } = await db.from("gps_alerta_destinatarios").select("usuario").eq("activo", true).contains("tipos", [tipo]);
  const usuarios = ((data ?? []) as { usuario: string }[]).map((x) => x.usuario);
  const n = await enviarAUsuarios(db, usuarios, { titulo, cuerpo, etiqueta: `${tipo}-${placa}` });
  await db.from("gps_alertas_enviadas").update({ enviadas: n }).eq("id", (ins.data as { id: number }).id);
}

export async function revisarAvisos(db: SupabaseClient, p: {
  placa: string; en: string; zonaId: string | null; zonaNombre: string | null;
  seg: Seguimiento | null; arranco: { id: string; origen: string | null; destino: string | null } | null;
}): Promise<void> {
  if (!(await pushConfigurado(db))) return;
  const { placa } = p;
  try {
    if (p.seg?.llegoAhora) await avisar(db, "llego", `llego:${p.seg.id}`, placa, `${placa} llegó a ${p.seg.destino ?? "su destino"}`, `${p.seg.km.toLocaleString("es-CO")} km recorridos.`);
    if (p.arranco) await avisar(db, "salio", `salio:${p.arranco.id}`, placa, `${placa} salió hacia ${p.arranco.destino ?? "su destino"}`, `Desde ${p.arranco.origen ?? "su origen"}. El viaje arrancó solo.`);
    /* lo demás, una vez por minuto (las posiciones llegan cada ~10 s) */
    if (new Date(p.en).getUTCSeconds() >= 12) return;
    const ahora = Date.parse(p.en);

    if (!p.zonaId) {
      const desde = new Date(ahora - 25 * 60_000).toISOString();
      const { data } = await db.from("gps_posiciones").select("lat, lng, en, velocidad").eq("placa", placa).gte("en", desde).order("en", { ascending: true }).limit(400);
      const pts = (data ?? []) as PosRuta[];
      if (pts.length >= 6 && Date.parse(pts[0].en) <= ahora - 15 * 60_000) {
        const s = segundosParado(pts, ahora);
        if (s >= 15 * 60) await avisar(db, "parado", `parado:${placa}:${Math.floor(ahora / 3_600_000)}`, placa, `${placa} lleva ${corto(s)} parado`, "Está fuera de las zonas. Revisa si tuvo un problema.");
      }
      return;
    }

    const { data: vis } = await db.from("gps_visitas").select("id, entrada, gps_vehiculos!inner(placa)").eq("gps_vehiculos.placa", placa).eq("zona_id", p.zonaId).is("salida", null).order("entrada", { ascending: false }).limit(1);
    const v = (vis ?? [])[0] as { id: number | string; entrada: string } | undefined;
    if (!v) return;
    const s = Math.round((ahora - Date.parse(v.entrada)) / 1000);
    if (s < 20 * 60) return;
    const clave = `espera:${v.id}`;
    const ya = await db.from("gps_alertas_enviadas").select("id").eq("clave", clave).maybeSingle();
    if (ya.data) return;
    const hace14 = new Date(ahora - 14 * 24 * 3_600_000).toISOString();
    const { data: h } = await db.from("gps_visitas").select("vehiculo_id, zona_id, entrada, salida").eq("zona_id", p.zonaId).gte("entrada", hace14).not("salida", "is", null).limit(1000);
    const zona = p.zonaNombre ?? "la zona";
    const normal = normalesDe(((h ?? []) as { vehiculo_id: string; entrada: string; salida: string }[]).map((x) => ({ vehiculo: x.vehiculo_id, zona, entrada: x.entrada, salida: x.salida }))).zona.get(zona)?.normal ?? null;
    if (esLarga(s, normal)) await avisar(db, "espera", clave, placa, `${placa} lleva ${corto(s)} en ${zona}`, normal ? `Lo normal es ${corto(normal)}.` : "Pasa de 45 min.");
  } catch { /* un aviso que falla nunca tumba el registro de la posición */ }
}

/**
 * EL VIGÍA (cada minuto): los viajes en curso cuyo vehículo lleva 3 min o más sin mandar ubicación. Un aviso por
 * cada silencio (la clave lleva la hora de la última posición: si vuelve a mandar y se calla otra vez, avisa otra vez).
 */
export async function revisarSenal(db: SupabaseClient): Promise<{ enCurso: number; callados: number }> {
  const { data } = await db.from("gps_recorridos").select("id, placa, inicio, ultimo_en, zona_destino").eq("estado", "en_curso");
  const recs = (data ?? []) as { id: string; placa: string; inicio: string; ultimo_en: string | null; zona_destino: string | null }[];
  if (!recs.length || !(await pushConfigurado(db))) return { enCurso: recs.length, callados: 0 };
  const ahora = Date.now();
  let callados = 0;
  for (const r of recs) {
    const u = await db.from("gps_posiciones").select("en").eq("placa", r.placa).order("en", { ascending: false }).limit(1).maybeSingle();
    const ultima = (u.data?.en as string | undefined) ?? r.ultimo_en ?? r.inicio;
    const s = Math.round((ahora - Date.parse(ultima)) / 1000);
    if (s < SIN_SENAL_S) continue;
    callados++;
    let destino = "su destino";
    if (r.zona_destino) { const z = await db.from("gps_zonas").select("nombre").eq("id", r.zona_destino).maybeSingle(); if (z.data?.nombre) destino = z.data.nombre as string }
    await avisar(db, "senal", `senal:${r.id}:${ultima.slice(0, 16)}`, r.placa, `${r.placa} dejó de mandar su ubicación`,
      `Hace ${corto(s)}, en camino a ${destino}. Puede tener el celular bloqueado, sin datos o con CONTROL cerrado.`);
  }
  return { enCurso: recs.length, callados };
}
