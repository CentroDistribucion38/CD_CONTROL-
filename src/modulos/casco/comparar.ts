/**
 * COMPARAR DOS DÍAS DEL CASCO — las cuentas del «Comparativo», sin nada de servidor ni de pantalla.
 *
 * Toma los mismos renglones del tablero (día · almacén · material · HL · estibas · ubicaciones) y
 * contesta una sola pregunta: qué cambió entre el día A y el día B, en total, por almacén, por
 * material y por material en cada almacén. La pantalla, las fotos y los archivos salen de aquí, así
 * que no pueden contradecirse.
 *
 * SUBIR ES MÁS CASCO POR PARTIR: va en rojo, igual que «contra el día anterior» del tablero.
 * Una fecha que no tiene registro usa el último registro de ese día o anterior (`diaEfectivo`):
 * el inventario no se va a cero porque nadie lo guardó.
 */
import type { Punto } from "./serie";

export type Unidad = "hl" | "est" | "caj";
/** Una cantidad en las tres unidades. `caj` es null si el material no tiene cajas por estiba en el maestro. */
export type Medida = { hl: number; est: number; caj: number | null };
export type Estado = "sube" | "baja" | "igual" | "nuevo" | "salio";

export type Celda = { hl: number; est: number; caj: number | null; puesto: string | null; calidad: string | null; arrastre: string | null };

export type FilaCmp = {
  sku: string; sitio: string;
  a: Celda | null; b: Celda | null;
  d: Medida;
  estado: Estado;
};
export type TotalSitio = { clave: string; a: Medida; b: Medida; d: Medida };
export type FilaMat = { sku: string; a: Medida; b: Medida; d: Medida; estado: Estado; sitios: FilaCmp[] };
export type Comparacion = {
  /** Los días que de verdad se comparan (el último registro igual o anterior al pedido); null si no hay. */
  diaA: string | null; diaB: string | null;
  a: Medida; b: Medida; d: Medida;
  /** Cambio en %, null si A es cero. */
  pct: number | null;
  sitios: TotalSitio[];
  materiales: FilaMat[];
  filas: FilaCmp[];
  cuentas: Record<Estado, number>;
};

const CERO: Medida = { hl: 0, est: 0, caj: 0 };
const suma = (x: Medida, y: Medida): Medida => ({ hl: x.hl + y.hl, est: x.est + y.est, caj: x.caj == null || y.caj == null ? (x.caj ?? y.caj) : x.caj + y.caj });
const resta = (x: Medida, y: Medida): Medida => ({ hl: x.hl - y.hl, est: x.est - y.est, caj: x.caj == null && y.caj == null ? null : (x.caj ?? 0) - (y.caj ?? 0) });

export const valorDe = (m: Medida, u: Unidad): number | null => (u === "hl" ? m.hl : u === "est" ? m.est : m.caj);

/** El último día con registro que sea igual o anterior al pedido. `fechas` va de la más vieja a la más nueva. */
export function diaEfectivo(fechas: string[], pedido: string): string | null {
  let r: string | null = null;
  for (const f of fechas) { if (f <= pedido) r = f; else break }
  return r;
}

export const nombreEstado: Record<Estado, string> = { sube: "Subió", baja: "Bajó", igual: "Igual", nuevo: "Nuevo", salio: "Salió" };

function estadoDe(d: Medida, a: unknown, b: unknown): Estado {
  if (!a && b) return "nuevo";
  if (a && !b) return "salio";
  if (Math.abs(d.hl) < 0.005 && Math.abs(d.est) < 0.005) return "igual";
  return d.hl > 0 || (Math.abs(d.hl) < 0.005 && d.est > 0) ? "sube" : "baja";
}

/** Un día, en celdas por «almacén|material». Las estibas son inventario + baja, como en el tablero. */
function instantanea(puntos: Punto[], dia: string): Map<string, Celda & { sku: string; sitio: string }> {
  const m = new Map<string, Celda & { sku: string; sitio: string }>();
  for (const p of puntos) {
    if (p.fecha !== dia) continue;
    const k = p.ubicacion + "\u0001" + p.sku;
    const c = m.get(k) ?? { sku: p.sku, sitio: p.ubicacion, hl: 0, est: 0, caj: null, puesto: null, calidad: null, arrastre: p.arrastre ?? null };
    c.hl += p.hl; c.est += (p.inventario ?? 0) + (p.baja ?? 0);
    c.puesto = c.puesto ?? (p.puesto?.trim() || null);
    c.calidad = c.calidad ?? (p.calidad?.trim() || null);
    m.set(k, c);
  }
  return m;
}

export function comparar(
  puntos: Punto[], pedidoA: string, pedidoB: string,
  cajasPorEstiba: Record<string, number | null | undefined>,
  ordenSitios: (a: string, b: string) => number = (x, y) => x.localeCompare(y),
): Comparacion {
  const fechas = [...new Set(puntos.map((p) => p.fecha))].sort();
  const diaA = diaEfectivo(fechas, pedidoA), diaB = diaEfectivo(fechas, pedidoB);
  const A = diaA ? instantanea(puntos, diaA) : new Map<string, Celda & { sku: string; sitio: string }>();
  const B = diaB ? instantanea(puntos, diaB) : new Map<string, Celda & { sku: string; sitio: string }>();
  const cajasDe = (sku: string, est: number): number | null => {
    const cpe = cajasPorEstiba[sku];
    return cpe ? est * cpe : est === 0 ? 0 : null;
  };
  for (const c of [...A.values(), ...B.values()]) c.caj = cajasDe(c.sku, c.est);
  const medida = (sku: string, c: Celda | null): Medida => (c ? { hl: c.hl, est: c.est, caj: c.caj } : { ...CERO });
  const llaves = [...new Set([...A.keys(), ...B.keys()])];
  const filas: FilaCmp[] = [];
  for (const k of llaves) {
    const a = A.get(k) ?? null, b = B.get(k) ?? null;
    const sku = (a ?? b)!.sku, sitio = (a ?? b)!.sitio;
    const ma = medida(sku, a), mb = medida(sku, b);
    /* Un renglón en cero los dos días no dice nada. */
    if (Math.abs(ma.hl) < 0.005 && Math.abs(mb.hl) < 0.005 && ma.est === 0 && mb.est === 0) continue;
    const d = resta(mb, ma);
    filas.push({ sku, sitio, a, b, d, estado: estadoDe(d, a && (Math.abs(ma.hl) >= 0.005 || ma.est !== 0), b && (Math.abs(mb.hl) >= 0.005 || mb.est !== 0)) });
  }
  const med = (f: FilaCmp, lado: "a" | "b") => medida(f.sku, f[lado]);

  const sitiosClaves = [...new Set(filas.map((f) => f.sitio))].sort(ordenSitios);
  const sitios: TotalSitio[] = sitiosClaves.map((clave) => {
    let a = { ...CERO }, b = { ...CERO };
    for (const f of filas) if (f.sitio === clave) { a = suma(a, med(f, "a")); b = suma(b, med(f, "b")) }
    return { clave, a, b, d: resta(b, a) };
  });

  const porSku = new Map<string, FilaCmp[]>();
  for (const f of filas) (porSku.get(f.sku) ?? porSku.set(f.sku, []).get(f.sku)!).push(f);
  const materiales: FilaMat[] = [...porSku].map(([sku, fs]) => {
    let a = { ...CERO }, b = { ...CERO };
    for (const f of fs) { a = suma(a, med(f, "a")); b = suma(b, med(f, "b")) }
    const d = resta(b, a);
    const ordenadas = [...fs].sort((x, y) => ordenSitios(x.sitio, y.sitio));
    return { sku, a, b, d, sitios: ordenadas, estado: estadoDe(d, fs.some((f) => f.a), fs.some((f) => f.b)) };
  }).sort((x, y) => Math.abs(y.d.hl) - Math.abs(x.d.hl) || y.b.hl - x.b.hl || x.sku.localeCompare(y.sku));

  let a = { ...CERO }, b = { ...CERO };
  for (const s of sitios) { a = suma(a, s.a); b = suma(b, s.b) }
  const d = resta(b, a);
  const cuentas: Record<Estado, number> = { sube: 0, baja: 0, igual: 0, nuevo: 0, salio: 0 };
  for (const f of filas) cuentas[f.estado]++;
  return { diaA, diaB, a, b, d, pct: a.hl !== 0 ? (d.hl / Math.abs(a.hl)) * 100 : null, sitios, materiales, filas, cuentas };
}
