/**
 * TRACCAR CLIENT · leer lo que manda la app (los dos formatos). Ver src/app/api/traspasos/gps/traccar/route.ts.
 *   Nuevo (2025+): JSON { device_id, location: { timestamp, coords: { latitude, longitude, accuracy, speed (m/s), heading } } }
 *                  — location también puede venir como lista (lo que guardó sin señal).
 *   Viejo (OsmAnd): id|deviceid, lat, lon | location="lat,lon", timestamp (s, ms o ISO), speed (nudos), bearing|heading, accuracy.
 */
import { limpiarPlaca } from "./celular";
import type { Fix } from "./entrada";

/** Más imprecisa que esto, la posición no sirve para saber si está dentro de un patio. */
export const PRECISION_MAX_M = 80;
const num = (x: unknown) => { const n = typeof x === "string" ? Number(x) : typeof x === "number" ? x : NaN; return Number.isFinite(n) ? n : null };

export function fecha(x: unknown): string {
  const ahora = Date.now();
  let t: number | null = null;
  if (typeof x === "string" && /^\d+$/.test(x)) t = Number(x);
  else if (typeof x === "number") t = x;
  else if (typeof x === "string") t = Date.parse(x.includes("T") ? x : x.replace(" ", "T") + "Z");
  if (t != null && t < 1e12) t *= 1000;                       // venía en segundos
  /* una hora del celular muy corrida (o futura) se cambia por la del servidor */
  return t != null && Number.isFinite(t) && t <= ahora + 120_000 && t >= ahora - 24 * 3_600_000 ? new Date(t).toISOString() : new Date(ahora).toISOString();
}

export type Leida = { placa: string; fix: Fix };
/** Saca placa y posiciones de cualquiera de los formatos. */
export function leer(params: URLSearchParams, cuerpo: unknown): Leida[] {
  const out: Leida[] = [];
  const j = cuerpo && typeof cuerpo === "object" ? (cuerpo as Record<string, unknown>) : null;
  if (j && (typeof j.location === "object" || j.device_id)) {
    const placa = limpiarPlaca(String(j.device_id ?? params.get("id") ?? params.get("deviceid") ?? ""));
    const locs = (Array.isArray(j.location) ? j.location : [j.location]) as Record<string, unknown>[];
    for (const l of locs) {
      const c = (l?.coords ?? {}) as Record<string, unknown>;
      const lat = num(c.latitude), lng = num(c.longitude);
      if (lat == null || lng == null) continue;
      const vel = num(c.speed), rum = num(c.heading);
      out.push({ placa, fix: { lat, lng, en: fecha(l.timestamp), precision: num(c.accuracy), velocidad: vel != null && vel >= 0 ? vel * 3.6 : null, rumbo: rum != null && rum >= 0 ? rum : null } });
    }
    return out;
  }
  const g = (k: string) => params.get(k) ?? (j ? (j[k] as string | undefined) ?? null : null);
  const placa = limpiarPlaca(String(g("id") ?? g("deviceid") ?? ""));
  let lat = num(g("lat")), lng = num(g("lon"));
  const loc = g("location");
  if ((lat == null || lng == null) && loc) { const [a, b] = String(loc).split(","); lat = num(a); lng = num(b) }
  if (lat == null || lng == null) return out;
  const vel = num(g("speed")), rum = num(g("bearing") ?? g("heading"));
  out.push({ placa, fix: { lat, lng, en: fecha(g("timestamp")), precision: num(g("accuracy")), velocidad: vel != null && vel >= 0 ? vel * 1.852 : null, rumbo: rum != null && rum >= 0 ? rum : null } });
  return out;
}

