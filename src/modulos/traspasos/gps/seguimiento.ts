/**
 * TIEMPOS GPS · SEGUIMIENTO (parte 3, en prueba: solo superadmin). Funciones puras, sin base ni pantalla:
 *
 *   A · EN VIVO: con las posiciones de un recorrido (gps_posiciones) se calcula cuánto le falta al destino, a qué
 *       velocidad va, cuándo llega (ETA), cuánto lleva del camino y si está parado fuera de una zona.
 *   B · LÍNEA DE TIEMPO: el día de cada vehículo en bloques: dentro de cada zona (con su color) y en tránsito entre
 *       ellas; los bloques que pasan bastante de lo normal se marcan como espera larga.
 *   C · TIEMPOS NORMALES Y ALERTAS: lo «normal» es la mediana de los últimos 14 días (espera en cada zona, cada tramo
 *       A → B y el ciclo hasta volver a la misma zona). Alerta: un vehículo que lleva en una zona mucho más que lo
 *       normal, o que está parado fuera de las zonas.
 */
import { centro, distanciaM, puntoEnPoligono, type Punto } from "./geo";
import type { Visita } from "./motor";

export type PosRuta = { lat: number; lng: number; en: string; velocidad: number | null };
export type ZonaSimple = { id: string; nombre: string; color: string; poligono: Punto[] };

/* ============================================================ A · EN VIVO */

/** Velocidad de ciudad cuando el camión todavía no ha arrancado o va parado (para que la hora de llegada no se dispare). */
export const VEL_CIUDAD_KMH = 22;
/** Se considera parado si en este tiempo no se ha movido más de RADIO_PARADO_M. */
const RADIO_PARADO_M = 40;

const seg = (a: string, b: string | number) => Math.max(0, Math.round(((typeof b === "number" ? b : Date.parse(b)) - Date.parse(a)) / 1000));

/** Distancia (m) de un punto al borde de un polígono (0 si está adentro), aproximada en plano local. */
export function distanciaAPoligono(p: Punto, pol: Punto[]): number {
  if (pol.length >= 3 && puntoEnPoligono(p, pol)) return 0;
  let min = Infinity;
  const kx = 111_320 * Math.cos((p[0] * Math.PI) / 180), ky = 110_540;
  for (let i = 0; i < pol.length; i++) {
    const a = pol[i], b = pol[(i + 1) % pol.length];
    const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky, bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return Number.isFinite(min) ? min : 0;
}

/** Segundos que lleva quieto (sin salir de un círculo de 40 m) contando hacia atrás desde la última posición. */
export function segundosParado(puntos: PosRuta[], ahora: number): number {
  if (!puntos.length) return 0;
  const u = puntos[puntos.length - 1];
  let desde = u.en;
  for (let i = puntos.length - 2; i >= 0; i--) {
    if (distanciaM([puntos[i].lat, puntos[i].lng], [u.lat, u.lng]) > RADIO_PARADO_M) break;
    desde = puntos[i].en;
  }
  return seg(desde, ahora);
}

export type Vivo = {
  /** Segundos desde la última posición recibida (3 min o más = sin señal: celular bloqueado, sin datos o CONTROL cerrado). */
  callado: number;
  /** km que le faltan (en línea recta hasta el borde de la geocerca destino, por 1,3 de calles). */
  faltaKm: number | null;
  /** Velocidad de los últimos 3 minutos (km/h). */
  velocidad: number;
  /** Minutos para llegar y la hora de llegada. */
  etaMin: number | null; llegaEn: string | null;
  /** 0 a 1: lo recorrido sobre lo recorrido + lo que falta. */
  avance: number;
  /** Segundos que lleva quieto (0 si se mueve) y si está dentro de alguna zona. */
  parado: number; enZona: string | null;
};

/** El estado en vivo de un recorrido en curso. `km` es lo que ya recorrió (lo guarda el servidor). */
export function enVivo(puntos: PosRuta[], km: number, destino: ZonaSimple | null, zonas: ZonaSimple[], ahora: number): Vivo {
  const u = puntos[puntos.length - 1];
  if (!u) return { callado: 0, faltaKm: null, velocidad: 0, etaMin: null, llegaEn: null, avance: 0, parado: 0, enZona: null };
  const aqui: Punto = [u.lat, u.lng];
  /* Velocidad: distancia recorrida en los últimos 3 minutos de posiciones (más estable que la del GPS del celular). */
  const t0 = Date.parse(u.en) - 180_000;
  let d = 0, desde = u.en;
  for (let i = puntos.length - 1; i > 0 && Date.parse(puntos[i - 1].en) >= t0; i--) {
    d += distanciaM([puntos[i - 1].lat, puntos[i - 1].lng], [puntos[i].lat, puntos[i].lng]); desde = puntos[i - 1].en;
  }
  const s = seg(desde, u.en);
  const velocidad = s >= 30 ? Math.round(((d / s) * 3.6) * 10) / 10 : Math.max(0, u.velocidad ?? 0);
  const faltaM = destino && destino.poligono.length >= 3 ? distanciaAPoligono(aqui, destino.poligono) * 1.3 : null;
  const faltaKm = faltaM == null ? null : Math.round(faltaM / 100) / 10;
  const v = Math.max(velocidad, VEL_CIUDAD_KMH);
  const etaMin = faltaM == null ? null : Math.max(faltaM > 0 ? 1 : 0, Math.round((faltaM / 1000 / v) * 60));
  const enZona = zonas.find((z) => z.poligono.length >= 3 && puntoEnPoligono(aqui, z.poligono))?.nombre ?? null;
  const total = km + (faltaKm ?? 0);
  return {
    callado: Math.max(0, Math.round((ahora - Date.parse(u.en)) / 1000)),
    faltaKm, velocidad, etaMin, llegaEn: etaMin == null ? null : new Date(ahora + etaMin * 60_000).toISOString(),
    avance: faltaKm == null ? 0 : total > 0 ? Math.min(1, km / total) : 0,
    parado: segundosParado(puntos, ahora), enZona,
  };
}

/** Desde cuántos segundos sin posición un viaje en curso está «sin señal». */
export const SIN_SENAL_S = 180;

/** Quita puntos casi encima del anterior (< 8 m) para dibujar la ruta sin miles de vértices. */
export function adelgazar(puntos: PosRuta[], minM = 8): PosRuta[] {
  const out: PosRuta[] = [];
  for (const p of puntos) {
    const u = out[out.length - 1];
    if (!u || distanciaM([u.lat, u.lng], [p.lat, p.lng]) >= minM) out.push(p);
  }
  const ult = puntos[puntos.length - 1];
  if (ult && out[out.length - 1] !== ult) out.push(ult);
  return out;
}

/* ============================================================ C · LO NORMAL */

const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b), m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
};
/** Con menos de estas muestras no hay «normal» (se usan los topes fijos). */
export const MIN_MUESTRAS = 3;

export type Normales = {
  /** Espera normal en cada zona (s), con cuántas visitas la respaldan. */
  zona: Map<string, { normal: number | null; n: number }>;
  /** Tránsito normal de cada tramo «A → B» (s). */
  tramo: Map<string, { normal: number | null; n: number }>;
  /** Ciclo normal: de entrar a una zona a volver a entrar a ella después de pasar por otra (s). */
  ciclo: Map<string, { normal: number | null; n: number }>;
};

/** Visitas ya cerradas (con nombre de zona) → los tiempos normales. Se ignoran visitas de menos de 1 min (pasó por el borde). */
export function normalesDe(visitas: Visita[]): Normales {
  const z = new Map<string, number[]>(), t = new Map<string, number[]>(), c = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, v: number) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  const por = new Map<string, Visita[]>();
  for (const v of visitas) if (v.salida && seg(v.entrada, v.salida) >= 60) (por.get(v.vehiculo) ?? por.set(v.vehiculo, []).get(v.vehiculo)!).push(v);
  for (const lista of por.values()) {
    lista.sort((a, b) => a.entrada.localeCompare(b.entrada));
    lista.forEach((v, i) => {
      push(z, v.zona, seg(v.entrada, v.salida!));
      const sig = lista[i + 1];
      if (sig && sig.zona !== v.zona) { const s = seg(v.salida!, sig.entrada); if (s <= 6 * 3600) push(t, `${v.zona} → ${sig.zona}`, s) }
      /* ciclo: la próxima vez que vuelve a entrar a esta zona, con otra en el medio */
      const j = lista.findIndex((x, k) => k > i && x.zona === v.zona);
      if (j > i + 1) { const s = seg(v.entrada, lista[j].entrada); if (s <= 12 * 3600) push(c, v.zona, s) }
    });
  }
  const a = (m: Map<string, number[]>) => new Map([...m].map(([k, xs]) => [k, { normal: xs.length >= MIN_MUESTRAS ? mediana(xs) : null, n: xs.length }]));
  return { zona: a(z), tramo: a(t), ciclo: a(c) };
}

/** Cuándo una espera ya es larga: más de 1,5 veces lo normal y al menos 10 min más; sin normal, 45 min. */
export const esLarga = (s: number, normal: number | null | undefined) => (normal ? s > Math.max(normal * 1.5, normal + 600) : s > 45 * 60);

/* ============================================================ B · LÍNEA DE TIEMPO */

export type Bloque = { tipo: "zona" | "transito"; zona: string | null; color: string; ini: string; fin: string; segundos: number; larga: boolean; abierto: boolean };
export type FilaTiempo = { vehiculo: string; bloques: Bloque[] };

/** El día de cada vehículo entre `desde` y `hasta`: sus visitas a zonas y los tránsitos entre ellas (recortados a la ventana). */
export function lineaDeTiempo(visitas: Visita[], colorDe: Map<string, string>, normales: Normales, desde: string, hasta: string, ahora: string): FilaTiempo[] {
  const por = new Map<string, Visita[]>();
  for (const v of visitas) (por.get(v.vehiculo) ?? por.set(v.vehiculo, []).get(v.vehiculo)!).push(v);
  const corta = (a: string, b: string) => [a < desde ? desde : a, b > hasta ? hasta : b] as const;
  const out: FilaTiempo[] = [];
  for (const [veh, lista] of por) {
    lista.sort((a, b) => a.entrada.localeCompare(b.entrada));
    const bloques: Bloque[] = [];
    lista.forEach((v, i) => {
      const fin = v.salida ?? ahora;
      const [a, b] = corta(v.entrada, fin);
      if (b > a) {
        const s = seg(v.entrada, fin);
        bloques.push({ tipo: "zona", zona: v.zona, color: colorDe.get(v.zona) ?? "#8a94a0", ini: a, fin: b, segundos: s, larga: esLarga(s, normales.zona.get(v.zona)?.normal), abierto: !v.salida });
      }
      const sig = lista[i + 1];
      if (v.salida) {
        const hastaT = sig ? sig.entrada : ahora;
        const [c, d] = corta(v.salida, hastaT);
        if (d > c) {
          const s = seg(v.salida, hastaT);
          const n = sig ? normales.tramo.get(`${v.zona} → ${sig.zona}`)?.normal : null;
          /* más de 4 h «en tránsito» es el camión guardado (la noche, un fin de turno), no un viaje: no se marca */
          bloques.push({ tipo: "transito", zona: sig?.zona ?? null, color: "#c9ced4", ini: c, fin: d, segundos: s, larga: sig && s < 4 * 3600 ? esLarga(s, n) : false, abierto: !sig });
        }
      }
    });
    if (bloques.length) out.push({ vehiculo: veh, bloques });
  }
  return out;
}

/* ============================================================ C · ALERTAS */

export type Alerta = { vehiculo: string; tipo: "espera" | "parado" | "tramo" | "senal"; texto: string; detalle: string; segundos: number };

const min = (s: number) => `${Math.round(s / 60)} min`;

/**
 * Las alertas de ahora: espera larga dentro de una zona (visita abierta), un tramo que ya va mucho más largo de lo
 * normal, o un vehículo parado más de 15 min fuera de las zonas.
 * `parados`: vehículo → segundos quieto fuera de zona (de las posiciones de su recorrido).
 */
export function alertasDe(visitas: Visita[], normales: Normales, parados: Map<string, number>, nombreV: Map<string, string>, ahora: string): Alerta[] {
  const out: Alerta[] = [];
  const por = new Map<string, Visita[]>();
  for (const v of visitas) (por.get(v.vehiculo) ?? por.set(v.vehiculo, []).get(v.vehiculo)!).push(v);
  for (const [veh, lista] of por) {
    lista.sort((a, b) => a.entrada.localeCompare(b.entrada));
    const u = lista[lista.length - 1];
    const placa = nombreV.get(veh) ?? "—";
    if (!u.salida) {
      const s = seg(u.entrada, ahora), n = normales.zona.get(u.zona)?.normal ?? null;
      if (esLarga(s, n)) out.push({ vehiculo: veh, tipo: "espera", segundos: s, texto: `${placa} lleva ${min(s)} en ${u.zona}`, detalle: n ? `lo normal es ${min(n)}` : "más de 45 min" });
    } else if (!parados.has(veh)) {
      /* va en tránsito: si el tramo hacia donde suele ir ya pasó mucho de lo normal */
      const s = seg(u.salida, ahora);
      const tramos = [...normales.tramo].filter(([k, x]) => k.startsWith(`${u.zona} → `) && x.normal).map(([, x]) => x.normal!);
      const n = tramos.length ? Math.max(...tramos) : null;
      if (n && s < 4 * 3600 && s > Math.max(n * 2, n + 900)) out.push({ vehiculo: veh, tipo: "tramo", segundos: s, texto: `${placa} salió de ${u.zona} hace ${min(s)}`, detalle: `y no ha llegado a otra zona (un tramo normal es ${min(n)})` });
    }
  }
  for (const [veh, s] of parados) if (s >= 15 * 60) out.push({ vehiculo: veh, tipo: "parado", segundos: s, texto: `${nombreV.get(veh) ?? "—"} parado hace ${min(s)}`, detalle: "fuera de las zonas" });
  return out.sort((a, b) => b.segundos - a.segundos);
}

/* ============================================================ C · CALOR POR HORA */

/** Espera promedio en cada zona según la hora en que entró (hora de Colombia): zona → 24 valores (s) o null. */
export function calorPorHora(visitas: Visita[], ahora: string): Map<string, (number | null)[]> {
  const sum = new Map<string, { s: number[]; n: number[] }>();
  for (const v of visitas) {
    const h = (new Date(Date.parse(v.entrada) - 5 * 3600_000).getUTCHours());
    const x = sum.get(v.zona) ?? sum.set(v.zona, { s: Array(24).fill(0), n: Array(24).fill(0) }).get(v.zona)!;
    x.s[h] += seg(v.entrada, v.salida ?? ahora); x.n[h]++;
  }
  return new Map([...sum].map(([z, x]) => [z, x.s.map((s, i) => (x.n[i] ? Math.round(s / x.n[i]) : null))]));
}

/** Duración corta para tablas angostas: «23 min», «1 h 05». */
export const corto = (s: number | null | undefined) => {
  if (s == null || !Number.isFinite(s)) return "—";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

export { centro };
