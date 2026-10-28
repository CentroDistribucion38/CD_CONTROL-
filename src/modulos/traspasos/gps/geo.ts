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
