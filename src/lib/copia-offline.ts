/**
 * LA COPIA PARA TRABAJAR (Y AUDITAR) SIN INTERNET — lado de la pantalla.
 * El que guarda y sirve las copias es public/sw.js; esto es lo que la
 * persona puede pedirle: preparar todo antes de salir, saber de cuándo es
 * lo que está viendo, y borrar la copia al salir.
 */

export const LLAVE_PREPARADA = "cd38.copia.preparada";
const PAGINAS = "control-paginas";
const META = "control-meta";

export function haySoporte(): boolean {
  return typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator;
}

/** Borra las copias de las pantallas: al cerrar sesión y al llegar al login, para que el siguiente en el equipo no vea lo de otro. */
export async function borrarCopia(): Promise<void> {
  try {
    if ("caches" in window) { await caches.delete(PAGINAS); await caches.delete(META) }
    localStorage.removeItem(LLAVE_PREPARADA);
  } catch { /* nada que borrar o sin permiso: da igual */ }
}

/** Las pantallas que SÍ están guardadas ahora mismo en este equipo (lo que dice la caché, no lo que se recuerda haber hecho). */
export async function rutasGuardadas(): Promise<string[]> {
  try {
    if (!("caches" in window)) return [];
    const c = await caches.open(PAGINAS);
    return (await c.keys()).map((k) => { const u = new URL(k.url); return u.pathname + u.search });
  } catch { return [] }
}

/** Los paquetes de JavaScript, CSS y tipografías que nombra una pantalla (en el HTML y en su flujo de datos). */
export function recursosDe(html: string): string[] {
  const hallados = new Set<string>();
  const re = /(?:\/_next\/)?(static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./~%[\]()@$]+?\.(?:js|css|woff2?))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) hallados.add("/_next/" + m[1]);
  return [...hallados];
}

export type Avance = { hechas: number; total: number };
export type Resultado = { guardadas: string[]; fallidas: string[]; fecha: string };

/** ¿La respuesta es una pantalla de la app y no el login al que mandan cuando se venció la sesión? */
function esPantalla(r: Response): boolean {
  if (!r.ok) return false;
  try { return !/^\/(login|auth)/.test(new URL(r.url).pathname) } catch { return true }
}

/**
 * «PREPARAR PARA AUDITORÍA»: abre una por una las pantallas que esta
 * persona puede ver, con internet, para que queden guardadas junto con lo
 * que cada una necesita para abrir. Quien ya tiene sesión y señal no
 * nota nada: es lo mismo que recorrer el menú.
 */
export async function prepararCopia(rutas: string[], alAvanzar: (a: Avance) => void): Promise<Resultado> {
  const unicas = [...new Set(rutas)];
  const guardadas: string[] = [], fallidas: string[] = [];
  const recursos = new Set<string>();
  let hechas = 0;
  const total = unicas.length;
  alAvanzar({ hechas, total });

  let siguiente = 0;
  async function trabajador() {
    while (siguiente < unicas.length) {
      const ruta = unicas[siguiente++];
      try {
        const r = await fetch(ruta, { credentials: "same-origin", headers: { Accept: "text/html", "x-preparar": "1" } });
        if (!esPantalla(r)) fallidas.push(ruta);
        else { guardadas.push(ruta); for (const u of recursosDe(await r.text())) recursos.add(u) }
      } catch { fallidas.push(ruta) }
      alAvanzar({ hechas: ++hechas, total });
    }
  }
  await Promise.all([trabajador(), trabajador()]);

  /* Lo que las pantallas cargan al abrirse: sin esto el HTML estaría pero la pantalla no arrancaría. */
  const lista = [...recursos];
  let k = 0;
  await Promise.all([0, 1, 2, 3].map(async () => {
    while (k < lista.length) { try { await fetch(lista[k++]) } catch { /* uno que falle no tumba al resto */ } }
  }));

  const fecha = new Date().toISOString();
  /* Solo se anota como «preparada» si algo quedó guardado: una pasada en la que todo falló no debe frenar el siguiente intento. */
  if (guardadas.length > 0) {
    const n = (await rutasGuardadas()).length;
    try { localStorage.setItem(LLAVE_PREPARADA, JSON.stringify({ fecha, n, fallidas: fallidas.length })) } catch { /* sin almacenamiento: no se recuerda la fecha */ }
  }
  return { guardadas, fallidas, fecha };
}

export function ultimaPreparacion(): { fecha: string; n: number; fallidas: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(LLAVE_PREPARADA) ?? "null");
    return v && typeof v.fecha === "string" ? v : null;
  } catch { return null }
}

/** «29 sep, 14:05», hora de Colombia. */
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Lo que dice el service worker de la pantalla que se está viendo. */
export async function estadoDeCopia(ruta: string): Promise<{ copia: boolean; hayCopia: boolean; fecha: string | null } | null> {
  try {
    const r = await fetch("/__sw/estado?ruta=" + encodeURIComponent(ruta), { cache: "no-store" });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch { return null }
}

/** Cada cuántas horas, con internet, el equipo renueva solo su copia. */
export const RENOVAR_HORAS = 6;

/** ¿Toca preparar la copia sin que nadie lo pida? Nunca preparada, o ya pasaron las horas. */
export function hayQueRenovar(ultima: { fecha: string } | null, ahora: number = Date.now()): boolean {
  if (!ultima) return true;
  const t = new Date(ultima.fecha).getTime();
  return !Number.isFinite(t) || ahora - t >= RENOVAR_HORAS * 3600_000;
}
