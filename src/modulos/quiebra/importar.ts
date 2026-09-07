/**
 * Lectura del maestro: hojas BAJA MB51 y ZPREC.
 *
 * Reglas que salieron de auditar el archivo real contra la hoja SIMULADOR:
 *  · La pérdida es NETA. SAP registra las bajas en negativo y los reversos
 *    en positivo; aquí se invierte el signo para que los reversos resten.
 *  · La causal viene en texto libre en "Texto cab.documento" y se normaliza
 *    a un grupo estable; si aparece algo nuevo, cae en "Otros" sin romper.
 */

export type FilaBaja = {
  fecha: string;
  documento: string | null;
  material: string | null;
  denominacion: string | null;
  causal: string;
  causal_sap: string | null;
  almacen: string | null;
  cmv: number | null;
  cantidad: number;
};

export type FilaProduccion = {
  fecha: string;
  centro: string | null;
  linea: number | null;
  volumen: string | null;
  material: string | null;
  descripcion: string | null;
  orden: string | null;
  cantidad: number;
  cantidad_hl: number | null;
};

export const HOJA_BAJAS = "BAJA MB51";
export const HOJA_PROD = "ZPREC";

export function normalizarCausal(texto: unknown): string {
  const t = String(texto ?? "")
    .toUpperCase()
    .replace("BAJA ", "")
    .replace(/Ó/g, "O")
    .trim();
  if (t.includes("MAQUINA") || t === "ROTURA DE LINEA") return "Rotura máquina";
  if (t.includes("PRESORTING")) return "Presorting";
  if (t.includes("DEPOSITO")) return "Rotura depósito";
  if (t.includes("SORTING DISTRIBUCION") || t === "SORTING CD") return "Sorting distribución";
  if (t.includes("SORTING")) return "Sorting envase";
  if (t.includes("LAVADO") || t.includes("EXTRASUCIO")) return "Lavado / extrasucio";
  return "Otros";
}

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" || s === "undefined" ? null : s;
};

const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Excel guarda las fechas como número de serie; también acepta Date y texto. */
export function aFecha(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

type Cruda = Record<string, unknown>;
const col = (f: Cruda, ...nombres: string[]) => {
  for (const n of nombres) {
    for (const k of Object.keys(f)) {
      if (k.trim().toLowerCase() === n.toLowerCase()) return f[k];
    }
  }
  return undefined;
};

export function leerBajas(filas: Cruda[]): { filas: FilaBaja[]; descartadas: number } {
  const out: FilaBaja[] = [];
  let descartadas = 0;
  for (const f of filas) {
    const fecha = aFecha(col(f, "Fe.contab.", "Fe.contab", "Fecha contabilización", "Fecha"));
    const cant = num(col(f, "Cantidad"));
    if (!fecha || cant === 0) { descartadas++; continue; }
    const causalSap = txt(col(f, "Texto cab.documento", "Texto cab. documento"));
    out.push({
      fecha,
      documento: txt(col(f, "Doc.mat.", "Doc. mat.", "Documento")),
      material: txt(col(f, "Material")),
      denominacion: txt(col(f, "Denominación", "Denominacion")),
      causal: normalizarCausal(causalSap),
      causal_sap: causalSap,
      almacen: txt(col(f, "Almacén", "Almacen")),
      cmv: Number(col(f, "CMv")) || null,
      // SAP trae la baja en negativo: se invierte para que la pérdida sume
      // y los reversos (positivos en el archivo) resten.
      cantidad: -cant,
    });
  }
  return { filas: out, descartadas };
}

export function leerProduccion(filas: Cruda[]): { filas: FilaProduccion[]; descartadas: number } {
  const out: FilaProduccion[] = [];
  let descartadas = 0;
  for (const f of filas) {
    const fecha = aFecha(col(f, "Fe.Cont", "Fe.Cont.", "Fecha"));
    const cant = num(col(f, "Cantidad"));
    if (!fecha || cant === 0) { descartadas++; continue; }
    out.push({
      fecha,
      centro: txt(col(f, "Centro")),
      linea: Number(col(f, "Linea", "Línea")) || null,
      volumen: txt(col(f, "Volumen Envase")),
      material: txt(col(f, "Material")),
      descripcion: txt(col(f, "Descripcion Material", "Descripción Material")),
      orden: txt(col(f, "Orden")),
      cantidad: cant,
      cantidad_hl: num(col(f, "Cantidad HL")) || null,
    });
  }
  return { filas: out, descartadas };
}
