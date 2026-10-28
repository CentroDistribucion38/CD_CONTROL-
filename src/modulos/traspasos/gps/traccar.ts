import "server-only";

/**
 * EL CLIENTE DE TRACCAR (solo servidor).
 *
 * La dirección y la llave viven en variables de entorno de Vercel, NUNCA en el navegador:
 *   TRACCAR_URL     p. ej. https://gps.miempresa.com   (sin «/» al final)
 *   TRACCAR_TOKEN   token de API de Traccar (Cuenta → Token)  — o, si no hay token:
 *   TRACCAR_USER y TRACCAR_PASSWORD   (acceso básico)
 */
export type DispositivoTraccar = { id: number; name: string; uniqueId: string; status: string; lastUpdate: string | null };
export type PosicionTraccar = { id: number; deviceId: number; fixTime: string; latitude: number; longitude: number; speed: number; course: number; valid?: boolean };
export type GeocercaTraccar = { id: number; name: string; area: string };

export function traccarConfigurado(): boolean {
  return !!process.env.TRACCAR_URL && (!!process.env.TRACCAR_TOKEN || (!!process.env.TRACCAR_USER && !!process.env.TRACCAR_PASSWORD));
}

async function pedir<T>(ruta: string, params?: Record<string, string>): Promise<T> {
  const base = (process.env.TRACCAR_URL ?? "").replace(/\/+$/, "");
  const url = new URL(base + "/api" + ruta);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const auth = process.env.TRACCAR_TOKEN
    ? `Bearer ${process.env.TRACCAR_TOKEN}`
    : "Basic " + Buffer.from(`${process.env.TRACCAR_USER}:${process.env.TRACCAR_PASSWORD}`).toString("base64");
  const r = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (r.status === 401 || r.status === 403) throw new Error("Traccar no aceptó la llave (revisa TRACCAR_TOKEN).");
  if (!r.ok) throw new Error(`Traccar respondió ${r.status}.`);
  return (await r.json()) as T;
}

export const dispositivos = () => pedir<DispositivoTraccar[]>("/devices");
export const ultimasPosiciones = () => pedir<PosicionTraccar[]>("/positions");
export const geocercas = () => pedir<GeocercaTraccar[]>("/geofences");
/** El recorrido de un equipo entre dos momentos (ISO). */
export const recorrido = (deviceId: number, desde: string, hasta: string) =>
  pedir<PosicionTraccar[]>("/reports/route", { deviceId: String(deviceId), from: desde, to: hasta });
