/**
 * COMPARTIR UBICACIÓN DENTRO DE LA APP «CONTROL CONDUCTOR» (Android, apps/conductor).
 * La app abre esta misma pantalla, pero el GPS lo lleva Android con un servicio en primer plano: sigue mandando con el
 * celular bloqueado, en otra app o con la pantalla apagada (con el aviso fijo «CONTROL está siguiendo el viaje»).
 * Las posiciones se mandan por HTTP NATIVO (CapacitorHttp) al punto de entrada del GPS con su clave: Android frena las
 * peticiones de la página después de 5 min en segundo plano, las nativas no.
 * En el navegador normal nada de esto existe y la pantalla sigue como siempre.
 */
type Cap = { isNativePlatform?: () => boolean };
const cap = (): Cap | undefined => (typeof window !== "undefined" ? (window as unknown as { Capacitor?: Cap }).Capacitor : undefined);

/** El puente nativo de Android solo trae lo mínimo (isNativePlatform); registerPlugin vive en la librería
 *  @capacitor/core, que se carga aquí solo dentro de la app (en el navegador normal nunca se descarga). */
export const enApp = () => !!cap()?.isNativePlatform?.();

export type LugarNativo = { latitude: number; longitude: number; accuracy: number; speed: number | null; bearing: number | null; time: number | null };
type ErrorNativo = { code?: string; message?: string };
type PluginGps = {
  addWatcher: (o: { backgroundMessage?: string; backgroundTitle?: string; requestPermissions?: boolean; stale?: boolean; distanceFilter?: number },
    cb: (l?: LugarNativo, e?: ErrorNativo) => void) => Promise<string>;
  removeWatcher: (o: { id: string }) => Promise<void>;
  openSettings: () => Promise<void>;
};
type PluginHttp = { post: (o: { url: string; headers?: Record<string, string>; data?: unknown; connectTimeout?: number; readTimeout?: number }) => Promise<{ status: number; data: unknown }> };

let plugins: Promise<{ gps: PluginGps; http: PluginHttp } | null> | null = null;
function cargar() {
  if (!enApp()) return Promise.resolve(null);
  plugins ??= import("@capacitor/core")
    .then(({ registerPlugin, CapacitorHttp }) => ({ gps: registerPlugin<PluginGps>("BackgroundGeolocation"), http: CapacitorHttp as unknown as PluginHttp }))
    .catch(() => { plugins = null; return null });
  return plugins;
}
const gps = async () => (await cargar())?.gps;
const http = async () => (await cargar())?.http;

/** Arranca el GPS en segundo plano. Devuelve el id del vigilante (para pararlo). */
export async function empezarNativo(placa: string, cb: (l?: LugarNativo, e?: ErrorNativo) => void): Promise<string | null> {
  const g = await gps();
  if (!g) return null;
  return g.addWatcher({
    backgroundTitle: "CONTROL está siguiendo el viaje",
    backgroundMessage: `Vehículo ${placa} · toca para abrir CONTROL`,
    requestPermissions: true, stale: false, distanceFilter: 0,
  }, cb);
}
export async function pararNativo(id: string | null) { if (id) await (await gps())?.removeWatcher({ id }).catch(() => {}) }
export async function ajustesNativo() { await (await gps())?.openSettings().catch(() => {}) }

/** Manda una posición por HTTP nativo al punto de entrada del GPS (formato de la app de GPS: device_id + location). */
export async function mandarNativo(url: string, placa: string, l: LugarNativo): Promise<boolean> {
  const h = await http();
  if (!h) return false;
  try {
    const r = await h.post({
      url, headers: { "Content-Type": "application/json" }, connectTimeout: 15000, readTimeout: 15000,
      data: { device_id: placa, location: { timestamp: new Date(l.time ?? Date.now()).toISOString(), coords: { latitude: l.latitude, longitude: l.longitude, accuracy: l.accuracy, speed: l.speed ?? -1, heading: l.bearing ?? -1 } } },
    });
    return r.status >= 200 && r.status < 300;
  } catch { return false }
}
