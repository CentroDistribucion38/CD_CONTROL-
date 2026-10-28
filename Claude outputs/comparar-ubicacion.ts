/**
 * LA TABLA POR UBICACIÓN — dos conteos físicos, lado a lado, como la dinámica del Excel.
 *
 * Sale del CONTEO (no del registro del casco): cada renglón es un material en una ubicación
 * (módulo y número) con su estado de envase y sus estibas. Se suman las estibas por
 * material · almacén · módulo · número · estado, y se comparan el conteo A y el conteo B.
 *
 * Funciones puras: las usa la pantalla, y mañana las usarán la foto y el Excel.
 */
import { esUbicacionBts, esUbicacionExportacion, esUbicacionFabrica } from "./ubicacion-sitio";

export type RenglonConteo = {
  codigo: string; material: string | null; ubicacion: string | null;
  estado_envase: string | null; total_estibas: number | string | null;
};

export type Sitio = "BODEGA 38" | "FABRICA" | "EXPORTACION" | "BTS";
export const ORDEN_SITIO: Sitio[] = ["BODEGA 38", "FABRICA", "EXPORTACION", "BTS"];

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

/** De «P_46_IZQ» → P · 46; de «FABRICA_PATIO_1» → FABRICA · PATIO 1. El lado (IZQ/DER) se suma, como en el Excel. */
export function partirUbicacion(clave: string | null | undefined): { sitio: Sitio; modulo: string; numero: string } {
  const c = (clave ?? "").trim();
  const sinPrefijo = (p: RegExp) => c.replace(p, "").replace(/_/g, " ").trim();
  if (esUbicacionFabrica(c)) return { sitio: "FABRICA", modulo: "FABRICA", numero: sinPrefijo(/^FABRICA[_\s-]*/i) };
  if (esUbicacionExportacion(c)) return { sitio: "EXPORTACION", modulo: "EXPORTACION", numero: sinPrefijo(/^EXPORTACION[_\s-]*/i) };
  if (esUbicacionBts(c)) return { sitio: "BTS", modulo: "BTS", numero: sinPrefijo(/^BTS[_\s-]*/i) };
  const m = c.match(/^([A-Za-z]+)[_\s-]?0*(\d+)/);
  if (m) return { sitio: "BODEGA 38", modulo: m[1].toUpperCase(), numero: m[2] };
  return { sitio: "BODEGA 38", modulo: c.toUpperCase() || "SIN UBICACIÓN", numero: "" };
}

export const estadoDe = (e: string | null | undefined) => (e ?? "").trim().toUpperCase() || "SIN ESTADO";

export type FilaUb = {
  codigo: string; material: string; sitio: Sitio; modulo: string; numero: string; estado: string;
  a: number; b: number; d: number;
};
export type GrupoUb = { codigo: string; material: string; filas: FilaUb[]; a: number; b: number; d: number };
export type TablaUb = { grupos: GrupoUb[]; a: number; b: number; d: number; estados: string[] };

/**
 * @param estado  un estado de envase (p. ej. «LAVADO»), o "" para todos.
 * @param soloCambios  deja fuera los renglones que no cambiaron (los totales siguen siendo los de todo).
 */
export function armarTablaUbicacion(rA: RenglonConteo[], rB: RenglonConteo[], estado: string, soloCambios: boolean): TablaUb {
  const estados = [...new Set([...rA, ...rB].map((r) => estadoDe(r.estado_envase)))].sort(natural);
  const filas = new Map<string, FilaUb>();
  const poner = (rs: RenglonConteo[], lado: "a" | "b") => {
    for (const r of rs) {
      const e = estadoDe(r.estado_envase);
      if (estado && e !== estado) continue;
      const est = Number(r.total_estibas ?? 0);
      if (!est) continue;
      const u = partirUbicacion(r.ubicacion);
      const k = [r.codigo, u.sitio, u.modulo, u.numero, e].join("\u0001");
      const f = filas.get(k) ?? { codigo: r.codigo, material: r.material ?? r.codigo, ...u, estado: e, a: 0, b: 0, d: 0 };
      f[lado] += est;
      filas.set(k, f);
    }
  };
  poner(rA, "a"); poner(rB, "b");
  const grupos = new Map<string, GrupoUb>();
  let a = 0, b = 0;
  for (const f of filas.values()) {
    f.d = f.b - f.a;
    a += f.a; b += f.b;
    const g = grupos.get(f.codigo) ?? { codigo: f.codigo, material: f.material, filas: [], a: 0, b: 0, d: 0 };
    g.filas.push(f); g.a += f.a; g.b += f.b; g.d = g.b - g.a;
    grupos.set(f.codigo, g);
  }
  const orden = [...grupos.values()].sort((x, y) => natural(x.codigo, y.codigo)).map((g) => ({
    ...g,
    filas: g.filas
      .sort((x, y) => ORDEN_SITIO.indexOf(x.sitio) - ORDEN_SITIO.indexOf(y.sitio) || natural(x.modulo, y.modulo) || natural(x.numero, y.numero) || natural(x.estado, y.estado))
      .filter((f) => !soloCambios || Math.abs(f.d) > 0.0005),
  })).filter((g) => g.filas.length > 0);
  return { grupos: orden, a, b, d: b - a, estados };
}
