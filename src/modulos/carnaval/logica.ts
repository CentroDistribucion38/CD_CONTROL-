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

/* =====================================================================
   INVENTARIO DIARIO (la hoja «EXISTENCIAS DIARIAS» de Carnaval)
   Se lee de la foto, se revisa en pantalla y se guarda un renglón por día. La sección PALLET se compara
   con el saldo de pallets que lleva la app: si no coincide, una persona decide (dejar o ajustar la app).
   ===================================================================== */
export type FilaHoja = { concepto: string; a: number | null; b: number | null };
export type SeccionHoja = { titulo: string; colA: string; colB: string; filas: FilaHoja[] };
export type Hoja = { fecha: string; secciones: SeccionHoja[] };

const limpio = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Cómo se llama cada línea de PALLET en la hoja → el código de Carnaval. */
export const MAPA_PALLET: Record<string, string> = {
  "costenita 175r": "3500005",
  "palleth clover cc320": "3501430", "pallet clover cc320": "3501430", "palleth clover cc 320": "3501430", "clover cc320": "3501430",
  "flint 330r": "412707",
  "marron 330r": "412644",
  "marron 1000cc": "3500888",
  "flint 1000r": "3500887",
  "marron 250 cc": "3501226", "marron 250cc": "3501226",
  "flint 250": "3501225",
  "trophy": "3500446",
};
export const codigoDePallet = (concepto: string) => MAPA_PALLET[limpio(concepto)] ?? null;
export const esSeccionPallet = (titulo: string) => limpio(titulo) === "pallet";

export type FilaValidacion = { codigo: string; nombreHoja: string; hoja: number; app: number; dif: number; faltaEnHoja?: boolean };
export type Validacion = { filas: FilaValidacion[]; sinEmparejar: string[]; sinSeccion: boolean };

/** Compara la sección PALLET de la hoja contra el saldo de la app (solo las líneas con diferencia, o con saldo que la hoja no trae). */
export function validarPallet(hoja: Hoja, saldos: Record<string, number>, nombres: Record<string, string>): Validacion {
  const sec = hoja.secciones.find((s) => esSeccionPallet(s.titulo));
  if (!sec) return { filas: [], sinEmparejar: [], sinSeccion: true };
  const filas: FilaValidacion[] = [];
  const sinEmparejar: string[] = [];
  const vistos = new Set<string>();
  for (const f of sec.filas) {
    const cod = codigoDePallet(f.concepto);
    if (!cod) { if ((f.a ?? 0) !== 0) sinEmparejar.push(f.concepto); continue }
    vistos.add(cod);
    const hojaQ = f.a ?? 0, app = redondear(saldos[cod] ?? 0);
    if (redondear(hojaQ) !== app) filas.push({ codigo: cod, nombreHoja: f.concepto, hoja: hojaQ, app, dif: redondear(hojaQ - app) });
  }
  for (const [cod, q] of Object.entries(saldos)) {
    if (!vistos.has(cod) && redondear(q) !== 0 && nombres[cod]) filas.push({ codigo: cod, nombreHoja: nombres[cod], hoja: 0, app: redondear(q), dif: redondear(-q), faltaEnHoja: true });
  }
  return { filas, sinEmparejar, sinSeccion: false };
}
