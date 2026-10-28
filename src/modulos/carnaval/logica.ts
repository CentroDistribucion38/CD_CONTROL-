/**
 * AG07 CARNAVAL · LA CUENTA (sin base de datos, para poder probarla sola).
 *
 * El inventario de envase vacío de Peldar se lleva por PALLETS:
 *   saldo del código    = suma de los pallets de sus movimientos (+ entra, − sale)
 *   unidades            = pallets × unidades por pallet
 *   HL                  = pallets × unidades por pallet × cc / 100.000
 *
 * Cada fila del archivo diario de Peldar se identifica por REMISIÓN + PLACA + CÓDIGO (una remisión puede
 * traer varias placas). Si el mismo archivo trae esa llave dos veces, la segunda lleva «|2», y así.
 */

export type FilaPeldar = {
  fecha: string;        // fecha de recibo, AAAA-MM-DD
  codigo: string;
  descripcion: string;
  remision: string;
  placa: string;
  pallets: number;
  und: number;
};
export type FilaConClave = FilaPeldar & { clave: string };

export type Existente = { id: string; clave: string; fecha: string; pallets: number; und: number | null };

export type Cambio = {
  clave: string;
  id: string;
  fila: FilaConClave;
  antes: { fecha: string; pallets: number; und: number | null };
};

export type Comparacion = {
  nuevas: FilaConClave[];
  cambiadas: Cambio[];
  iguales: number;
  /** filas con fecha de recibo hasta el corte: ya están dentro del saldo inicial */
  anteriores: number;
  /** códigos que no están en el maestro de productos */
  sinProducto: { codigo: string; n: number }[];
  /** cargadas antes (después del corte) que el archivo de hoy ya no trae */
  ausentes: Existente[];
};

export const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const hl = (pallets: number, undPorPallet: number, cc: number) => (pallets * undPorPallet * cc) / 100000;
export const unidades = (pallets: number, undPorPallet: number) => pallets * undPorPallet;

export function claveBase(f: Pick<FilaPeldar, "remision" | "placa" | "codigo">) {
  return `${f.remision.trim()}|${f.placa.trim().toUpperCase()}|${f.codigo.trim()}`;
}

/** Les pone la llave a las filas del archivo, en el orden en que vienen. */
export function conClaves(filas: FilaPeldar[]): FilaConClave[] {
  const vistas = new Map<string, number>();
  return filas.map((f) => {
    const b = claveBase(f);
    const n = (vistas.get(b) ?? 0) + 1;
    vistas.set(b, n);
    return { ...f, clave: n === 1 ? b : `${b}|${n}` };
  });
}

export function compararPeldar(filas: FilaPeldar[], existentes: Existente[], productos: Set<string>, corte: string): Comparacion {
  const porClave = new Map(existentes.map((e) => [e.clave, e]));
  const out: Comparacion = { nuevas: [], cambiadas: [], iguales: 0, anteriores: 0, sinProducto: [], ausentes: [] };
  const faltan = new Map<string, number>();
  const enArchivo = new Set<string>();
  for (const f of conClaves(filas)) {
    if (f.fecha <= corte) { out.anteriores++; continue }
    if (!productos.has(f.codigo)) { faltan.set(f.codigo, (faltan.get(f.codigo) ?? 0) + 1); continue }
    enArchivo.add(f.clave);
    const e = porClave.get(f.clave);
    if (!e) { out.nuevas.push(f); continue }
    const igual = e.fecha === f.fecha && redondear(e.pallets) === redondear(f.pallets) && (e.und == null || Number(e.und) === f.und);
    if (igual) out.iguales++;
    else out.cambiadas.push({ clave: f.clave, id: e.id, fila: f, antes: { fecha: e.fecha, pallets: e.pallets, und: e.und } });
  }
  out.sinProducto = [...faltan].map(([codigo, n]) => ({ codigo, n }));
  out.ausentes = existentes.filter((e) => e.fecha > corte && !enArchivo.has(e.clave));
  return out;
}

/** El día de hoy en Colombia (AAAA-MM-DD). */
export const hoyCO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
