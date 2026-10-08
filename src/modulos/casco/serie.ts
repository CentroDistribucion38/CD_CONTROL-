/**
 * LAS CUENTAS DEL TABLERO DE CASCO — lo que en tu Excel hacía la dinámica de la hoja PARTIR.
 *
 * Todo son funciones puras sobre los renglones (día · sitio · material · HL): filtran y suman.
 * La gráfica, la dinámica y la tabla por material salen de aquí, así que no pueden contradecirse.
 */

export type Punto = {
  fecha: string;          // AAAA-MM-DD
  ubicacion: string;      // clave del sitio: «BODEGA 38»…
  sku: string;
  hl: number;
  inventario: number | null;
  baja: number | null;
};

export type Filtro = {
  desde?: string; hasta?: string;
  /** Sitios que se ven; vacío o ausente = todos. */
  sitios?: string[];
  /** Un material, o null/ausente = todos (el «(Todas)» de tu dinámica). */
  sku?: string | null;
};

export function filtrar(puntos: Punto[], f: Filtro): Punto[] {
  const s = f.sitios && f.sitios.length ? new Set(f.sitios) : null;
  return puntos.filter((p) =>
    (!f.desde || p.fecha >= f.desde) && (!f.hasta || p.fecha <= f.hasta) &&
    (!s || s.has(p.ubicacion)) && (!f.sku || p.sku === f.sku));
}

export type DiaSerie = { fecha: string; porSitio: Record<string, number>; total: number };

/** HL por día y por sitio, del día más viejo al más nuevo. Solo salen los días que tienen registros. */
export function porFecha(puntos: Punto[]): DiaSerie[] {
  const m = new Map<string, DiaSerie>();
  for (const p of puntos) {
    let d = m.get(p.fecha);
    if (!d) { d = { fecha: p.fecha, porSitio: {}, total: 0 }; m.set(p.fecha, d) }
    d.porSitio[p.ubicacion] = (d.porSitio[p.ubicacion] ?? 0) + p.hl;
    d.total += p.hl;
  }
  return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type FilaMaterial = { sku: string; porSitio: Record<string, number>; total: number; estibas: number };

/** HL por material y por sitio en UN día (el «por material» del último registro), de más a menos HL. */
export function porMaterial(puntos: Punto[], fecha: string): FilaMaterial[] {
  const m = new Map<string, FilaMaterial>();
  for (const p of puntos) {
    if (p.fecha !== fecha) continue;
    let r = m.get(p.sku);
    if (!r) { r = { sku: p.sku, porSitio: {}, total: 0, estibas: 0 }; m.set(p.sku, r) }
    r.porSitio[p.ubicacion] = (r.porSitio[p.ubicacion] ?? 0) + p.hl;
    r.total += p.hl;
    r.estibas += (p.inventario ?? 0) + (p.baja ?? 0);
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.sku.localeCompare(b.sku));
}

/** Estibas (inventario + baja) de un día, de todos los sitios. */
export const estibasDelDia = (puntos: Punto[], fecha: string) =>
  puntos.reduce((t, p) => (p.fecha === fecha ? t + (p.inventario ?? 0) + (p.baja ?? 0) : t), 0);

/** Viajes SERPRO como lo calcula tu hoja (Y1/100): estibas totales entre 100. */
export const viajesSerpro = (estibas: number) => estibas / 100;

/** Un tope «redondo» para el eje de la gráfica y sus marcas: 0, 1000, 2000… */
export function ejeNice(max: number, marcas = 5): { tope: number; paso: number; ticks: number[] } {
  if (!(max > 0)) return { tope: 1, paso: 1, ticks: [0, 1] };
  const crudo = max / marcas;
  const mag = Math.pow(10, Math.floor(Math.log10(crudo)));
  const f = crudo / mag;
  const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const tope = Math.ceil(max / paso) * paso;
  const ticks: number[] = [];
  for (let v = 0; v <= tope + paso / 1000; v += paso) ticks.push(Math.round(v * 1e6) / 1e6);
  return { tope, paso, ticks };
}
