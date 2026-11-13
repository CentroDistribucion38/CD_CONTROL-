/**
 * LEER LA ZEXI DE SAP TAL CUAL SALE (EXPORT.XLSX) para el análisis de Producto, en el navegador.
 *
 * «Aquí debo subir la ZEXI.» Columnas por su NOMBRE, no por posición: Material · descripción · Ce. · Alm. ·
 * Libre utiliz. · In control-cal · Bloqueado · Total General · UMB. SAP a veces escribe el almacén solo en el
 * primer renglón de cada grupo: los de abajo, con el almacén vacío, son del último que apareció.
 *
 * La cantidad es «Total General» (si no viene, Libre + Control-cal + Bloqueado). La UNIDAD (UMB) se respeta:
 * si viene en cajas (CJ, CAJ, CS…) se pasa a unidades con las unidades por caja del maestro.
 */
type Celda = string | number | null | undefined;
const txt = (v: Celda) => String(v ?? "").trim();
const norm = (v: Celda) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (v: Celda) => {
  if (typeof v === "number") return v;
  let s = txt(v).replace(/\s/g, ""); if (!s) return 0;
  let neg = false; if (s.endsWith("-")) { neg = true; s = s.slice(0, -1) }
  if (/,\d{1,3}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
};
const codigo = (v: Celda) => txt(v).replace(/^0+(?=\d)/, "").replace(/\.0+$/, "");
const col = (t: string[], ...p: RegExp[]) => { for (const r of p) { const i = t.findIndex((x) => r.test(x)); if (i >= 0) return i } return -1 };
/** Unidades de medida que son CAJAS (se multiplican por las unidades por caja). */
const ES_CAJA = /^(cj|caj|caja|cs|ca|bx|box)$/i;

export type FilaZexi = { almacen: string; codigo: string; descripcion: string; unidades: number; umb: string; enCajas: boolean };

export async function leerZexiProducto(archivo: File, upcDe: (sku: string) => number): Promise<{ filas: FilaZexi[]; error?: string }> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const filas = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: true, defval: null });
  const i = filas.slice(0, 15).findIndex((f) => f.some((c) => norm(c) === "material"));
  if (i < 0) return { filas: [], error: "Ese archivo no parece una ZEXI: no encontré la columna «Material» en las primeras filas." };
  const t = filas[i].map(norm);
  const cMat = col(t, /^material$/), cDes = col(t, /descrip|texto/), cAlm = col(t, /^alm\.?$/, /^almacen$/);
  const cTot = col(t, /^total/), cLib = col(t, /libre/), cCal = col(t, /control/), cBlo = col(t, /bloq/), cUmb = col(t, /^umb$/, /^um$/, /unidad/);
  const partes = [cLib, cCal, cBlo].filter((x) => x >= 0);
  if (cTot < 0 && !partes.length) return { filas: [], error: "No encontré la cantidad: la ZEXI debe traer «Total General» (o Libre utiliz., In control-cal y Bloqueado)." };

  const mapa = new Map<string, FilaZexi>();
  let alm = "";
  for (const f of filas.slice(i + 1)) {
    if (cAlm >= 0) { const a = txt(f[cAlm]).toUpperCase(); if (a) alm = a }
    const c = codigo(f[cMat]); if (!c || !/^\w+$/.test(c)) continue;
    const q = cTot >= 0 ? num(f[cTot]) : partes.reduce((s, k) => s + num(f[k]), 0);
    const umb = cUmb >= 0 ? txt(f[cUmb]).toUpperCase() : "";
    const enCajas = ES_CAJA.test(umb);
    const unidades = enCajas ? q * Math.max(1, upcDe(c)) : q;
    const k = `${alm}|${c}`;
    const x = mapa.get(k) ?? { almacen: alm || "—", codigo: c, descripcion: cDes >= 0 ? txt(f[cDes]) : "", unidades: 0, umb, enCajas };
    x.unidades += unidades;
    mapa.set(k, x);
  }
  const out = [...mapa.values()].filter((x) => x.unidades !== 0);
  if (!out.length) return { filas: [], error: "La ZEXI no trae cantidades." };
  return { filas: out };
}
