/**
 * COMPARTIR UBICACIÓN DENTRO DE LA APP «CONTROL CONDUCTOR» (Android, apps/conductor).
 * La app abre esta misma pantalla, pero el GPS lo lleva Android con un servicio en primer plano: sigue mandando con el
 * celular bloqueado, en otra app o con la pantalla apagada (con el aviso fijo «CONTROL está siguiendo el viaje»).
 * Las posiciones se mandan por HTTP NATIVO (CapacitorHttp) al punto de entrada del GPS con su clave: Android frena las
 * peticiones de la página después de 5 min en segundo plano, las nativas no.
 * En el navegador normal nada de esto existe y la pantalla sigue como siempre.
 */
type Cap = { isNativePlatform?: () => boolean; registerPlugin?: <T>(nombre: string) => T };
const cap = (): Cap | undefined => (typeof window !== "undefined" ? (window as unknown as { Capacitor?: Cap }).Capacitor : undefined);

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

const gps = () => cap()?.registerPlugin?.<PluginGps>("BackgroundGeolocation");
const http = () => cap()?.registerPlugin?.<PluginHttp>("CapacitorHttp");

/** Arranca el GPS en segundo plano. Devuelve el id del vigilante (para pararlo). */
export async function empezarNativo(placa: string, cb: (l?: LugarNativo, e?: ErrorNativo) => void): Promise<string | null> {
  const g = gps();
  if (!g) return null;
  return g.addWatcher({
    backgroundTitle: "CONTROL está siguiendo el viaje",
    backgroundMessage: `Vehículo ${placa} · toca para abrir CONTROL`,
    requestPermissions: true, stale: false, distanceFilter: 0,
  }, cb);
}
export async function pararNativo(id: string | null) { if (id) await gps()?.removeWatcher({ id }).catch(() => {}) }
export async function ajustesNativo() { await gps()?.openSettings().catch(() => {}) }

/** Manda una posición por HTTP nativo al punto de entrada del GPS (formato de la app de GPS: device_id + location). */
export async function mandarNativo(url: string, placa: string, l: LugarNativo): Promise<boolean> {
  const h = http();
  if (!h) return false;
  try {
    const r = await h.post({
      url, headers: { "Content-Type": "application/json" }, connectTimeout: 15000, readTimeout: 15000,
      data: { device_id: placa, location: { timestamp: new Date(l.time ?? Date.now()).toISOString(), coords: { latitude: l.latitude, longitude: l.longitude, accuracy: l.accuracy, speed: l.speed ?? -1, heading: l.bearing ?? -1 } } },
    });
    return r.status >= 200 && r.status < 300;
  } catch { return false }
}
