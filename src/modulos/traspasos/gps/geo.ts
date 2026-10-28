/**
 * GEOMETRÍA DE LAS ZONAS: un polígono es una lista de vértices [lat, lng].
 * Todo es puro (sin pantalla ni base) para poder probarlo.
 */
export type Punto = [number, number];   // [lat, lng]

/** ¿El punto cae dentro del polígono? (trazado de rayo; el borde cuenta como adentro con una tolerancia mínima) */
export function puntoEnPoligono(p: Punto, poli: Punto[]): boolean {
  const [y, x] = p;
  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [yi, xi] = poli[i], [yj, xj] = poli[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Centro aproximado (promedio de vértices): para poner la etiqueta de la zona. */
export function centro(poli: Punto[]): Punto {
  const n = poli.length || 1;
  return [poli.reduce((t, p) => t + p[0], 0) / n, poli.reduce((t, p) => t + p[1], 0) / n];
}

/** Área en m² (aproximada, plana: sirve para decidir cuál zona es la más pequeña cuando se cruzan dos). */
export function areaM2(poli: Punto[]): number {
  if (poli.length < 3) return 0;
  const lat0 = (centro(poli)[0] * Math.PI) / 180;
  const kx = 111_320 * Math.cos(lat0), ky = 110_540;
  let a = 0;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    a += (poli[j][1] * kx) * (poli[i][0] * ky) - (poli[i][1] * kx) * (poli[j][0] * ky);
  }
  return Math.abs(a) / 2;
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaM(a: Punto, b: Punto): number {
  const R = 6_371_000, rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Un círculo (centro y radio en metros) como polígono de 32 lados. */
export function circuloComoPoligono(c: Punto, radioM: number, lados = 32): Punto[] {
  const dLat = radioM / 110_540, dLng = radioM / (111_320 * Math.cos((c[0] * Math.PI) / 180));
  return Array.from({ length: lados }, (_, i) => {
    const t = (2 * Math.PI * i) / lados;
    return [c[0] + dLat * Math.sin(t), c[1] + dLng * Math.cos(t)] as Punto;
  });
}

/**
 * Las geocercas de Traccar llegan como texto: «POLYGON ((lat lon, lat lon, …))» o «CIRCLE (lat lon, radio)».
 * (Traccar escribe primero la latitud.) Las líneas no sirven para zonas y devuelven null.
 */
export function zonaDeTraccar(area: string): Punto[] | null {
  const t = area.trim();
  const poli = /^POLYGON\s*\(\(\s*([^)]+)\)\)/i.exec(t);
  if (poli) {
    const pts = poli[1].split(",").map((s) => s.trim().split(/\s+/).map(Number)).filter((v) => v.length >= 2 && v.every(Number.isFinite)).map((v) => [v[0], v[1]] as Punto);
    /* El último vértice repite el primero: se quita. */
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    return pts.length >= 3 ? pts : null;
  }
  const circ = /^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([\d.]+)\s*\)/i.exec(t);
  if (circ) return circuloComoPoligono([Number(circ[1]), Number(circ[2])], Number(circ[3]));
  return null;
}

/* ===================================================================
   UBICAR UN SITIO SIN DIBUJARLO: coordenadas («10.9748, -74.7714») o Plus Code de Google Maps
   («X6FH+WC», «7727X6FH+WC», «X6FH+WC Barranquilla»). El código corto se completa con la zona más cercana
   a `ref` (por defecto Barranquilla).
   =================================================================== */
const ALFABETO_PLUS = "23456789CFGHJMPQRVWX";
const RESOL_PLUS = [20, 1, 0.05, 0.0025, 0.000125];

function plusAPunto(completo: string): Punto | null {
  const c = completo.replace("+", "");
  if (c.length < 10) return null;
  let lat = -90, lng = -180;
  for (let i = 0; i < 5; i++) {
    const a = ALFABETO_PLUS.indexOf(c[2 * i]), b = ALFABETO_PLUS.indexOf(c[2 * i + 1]);
    if (a < 0 || b < 0) return null;
    lat += a * RESOL_PLUS[i]; lng += b * RESOL_PLUS[i];
  }
  return [lat + RESOL_PLUS[4] / 2, lng + RESOL_PLUS[4] / 2];
}
function puntoAPrefijoPlus(p: Punto, n: number): string {
  let lat = p[0] + 90, lng = p[1] + 180, s = "";
  for (let i = 0; i < n / 2; i++) {
    const r = RESOL_PLUS[i], a = Math.floor(lat / r), b = Math.floor(lng / r);
    lat -= a * r; lng -= b * r; s += ALFABETO_PLUS[a] + ALFABETO_PLUS[b];
  }
  return s;
}

/** Devuelve el punto [lat, lng] o null si el texto no se entiende. */
export function leerUbicacion(texto: string, ref: Punto = [10.98, -74.8]): Punto | null {
  const t = texto.trim().toUpperCase();
  const num = t.replace(/[°;]/g, " ").match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (num) {
    const lat = Number(num[1].replace(",", ".")), lng = Number(num[2].replace(",", "."));
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
  }
  const m = t.match(/\b([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/);
  if (!m) return null;
  const code = m[1];
  const antes = code.indexOf("+");
  if (antes === 8) return plusAPunto(code);
  if (antes >= 2 && antes < 8 && antes % 2 === 0) {
    const falta = 8 - antes;
    const completo = puntoAPrefijoPlus(ref, falta) + code;
    const c = plusAPunto(completo.length - 1 >= 10 ? completo : completo + "22");
    if (!c) return null;
    const medio = RESOL_PLUS[falta / 2 - 1] / 2;   // la mitad del lado del bloque que se completó
    let [lat, lng] = c;
    const paso = RESOL_PLUS[falta / 2 - 1];
    if (lat - ref[0] > medio) lat -= paso; else if (ref[0] - lat > medio) lat += paso;
    if (lng - ref[1] > medio) lng -= paso; else if (ref[1] - lng > medio) lng += paso;
    return [lat, lng];
  }
  return null;
}

/** Un cuadrito de `ladoM` metros centrado en `c`. */
export function cuadradoEn(c: Punto, ladoM = 120): Punto[] {
  const mitad = ladoM / 2;
  const dLat = mitad / 111_320, dLng = mitad / (111_320 * Math.cos((c[0] * Math.PI) / 180));
  return [[c[0] + dLat, c[1] - dLng], [c[0] + dLat, c[1] + dLng], [c[0] - dLat, c[1] + dLng], [c[0] - dLat, c[1] - dLng]];
}
