import type { FilaPeldar } from "./logica";

/**
 * LEER EL ARCHIVO DIARIO DE PELDAR en el navegador (con `xlsx`).
 * Se buscan las columnas por su NOMBRE: Fecha de recibo · Codigo · Descripcion · remision · Placa · # PAL · Und.
 * (Si trae «Bodega», solo entran las de CARNAVAL.) Si el libro tiene varias hojas se usa la que tiene
 * esas columnas, y entre varias, la que se llame «nacional».
 */
type Celda = string | number | Date | null | undefined;
const txt = (v: Celda) => (v instanceof Date ? "" : String(v ?? "")).trim();
const norm = (v: Celda) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
const num = (v: Celda) => {
  if (typeof v === "number") return v;
  const s = txt(v).replace(/\s/g, "");
  if (!s) return NaN;
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/[.,](?=\d{3}\b)/g, ""));
  return n;
};
const codigo = (v: Celda) => txt(v).replace(/^0+(?=\d)/, "").replace(/\.0+$/, "");
const entero = (v: Celda) => { const s = txt(v).replace(/\.0+$/, ""); return s };

/** Fecha de Excel (número de serie), texto AAAA-MM-DD o DD/MM/AAAA → AAAA-MM-DD. */
export function aDia(v: Celda): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = txt(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

type Hoja = { nombre: string; i: number; t: string[]; filas: Celda[][] };
function encabezado(nombre: string, filas: Celda[][]): Hoja | null {
  const i = filas.slice(0, 30).findIndex((f) => {
    const t = f.map(norm);
    return t.some((x) => /^remision$/.test(x)) && t.some((x) => /^codigo$/.test(x)) && t.some((x) => /^#\s*pal/.test(x));
  });
  return i < 0 ? null : { nombre, i, t: filas[i].map(norm), filas };
}
const col = (t: string[], ...p: RegExp[]) => { for (const r of p) { const i = t.findIndex((x) => r.test(x)); if (i >= 0) return i } return -1 };

export type Lectura = { filas: FilaPeldar[]; hoja?: string; omitidas: { otraBodega: number; invalidas: number }; error?: string };

export async function leerPeldar(archivo: File): Promise<Lectura> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const hojas: Hoja[] = [];
  for (const n of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[n], { header: 1, raw: true, defval: null });
    const h = encabezado(n, filas);
    if (h) hojas.push(h);
  }
  const vacio = { filas: [], omitidas: { otraBodega: 0, invalidas: 0 } };
  if (!hojas.length) return { ...vacio, error: "No encontré las columnas del archivo de Peldar (Fecha de recibo, Codigo, remision, Placa, # PAL, Und) en ninguna hoja." };
  const h = hojas.find((x) => /nacional/i.test(x.nombre)) ?? hojas[0];
  const cFec = col(h.t, /fecha.*recibo/), cCod = col(h.t, /^codigo$/), cDes = col(h.t, /^descrip/);
  const cRem = col(h.t, /^remision$/), cPla = col(h.t, /^placa$/), cPal = col(h.t, /^#\s*pal/), cUnd = col(h.t, /^und$/);
  const cBod = col(h.t, /^bodega$/);
  /* «INGRESO» (fecha en que entró a SAP) y «Entrada de Mercancia» (el documento de SAP). Sin las dos no se puede saber qué está en SAP. */
  const cIng = col(h.t, /^ingreso$/), cEM = col(h.t, /^entrada.*mercanc/);
  const conEM = cIng >= 0 && cEM >= 0;
  if (cFec < 0) return { ...vacio, hoja: h.nombre, error: "Falta la columna «Fecha de recibo»." };
  if (cUnd < 0) return { ...vacio, hoja: h.nombre, error: "Falta la columna «Und»." };
  const filas: FilaPeldar[] = [];
  const omitidas = { otraBodega: 0, invalidas: 0 };
  for (const f of h.filas.slice(h.i + 1)) {
    const cod = codigo(f[cCod]);
    if (!cod) continue; // renglón vacío o de totales
    if (cBod >= 0 && txt(f[cBod]) && !/carnaval/i.test(txt(f[cBod]))) { omitidas.otraBodega++; continue }
    const fecha = aDia(f[cFec]), pallets = num(f[cPal]), und = num(f[cUnd]), remision = entero(f[cRem]);
    if (!fecha || !Number.isFinite(pallets) || pallets <= 0 || !remision) { omitidas.invalidas++; continue }
    filas.push({ fecha, codigo: cod, descripcion: cDes >= 0 ? txt(f[cDes]) : "", remision, placa: cPla >= 0 ? txt(f[cPla]).toUpperCase() : "", pallets, und: Number.isFinite(und) ? und : 0,
      ...(conEM ? { ingreso: aDia(f[cIng]), em: txt(f[cEM]) || null } : {}) });
  }
  if (!filas.length) return { filas, hoja: h.nombre, omitidas, error: "El archivo no trae filas con fecha de recibo, código, remisión y # PAL." };
  return { filas, hoja: h.nombre, omitidas };
}
