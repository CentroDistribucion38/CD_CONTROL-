import type { MovFila, ZexiFila } from "@/modulos/inventario/cuadre";

/**
 * LEER LOS ARCHIVOS DE SAP en el navegador (con `xlsx`) — el ZEXI y la transacción del 311.
 * Se buscan las columnas por su NOMBRE (como salen de SAP), no por su posición: si SAP agrega o
 * mueve una columna, sigue sirviendo. Si no encuentra lo que necesita, dice qué columna falta.
 */
type Celda = string | number | null | undefined;
const txt = (v: Celda) => String(v ?? "").trim();
const norm = (v: Celda) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (v: Celda) => {
  if (typeof v === "number") return v;
  let s = txt(v).replace(/\s/g, "");
  if (!s) return NaN;
  /* SAP en español: «1.234,5» o «1.234-» (el signo al final). */
  let neg = false;
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1) }
  if (/,\d{1,3}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return neg ? -n : n;
};
const codigo = (v: Celda) => txt(v).replace(/^0+(?=\d)/, "").replace(/\.0+$/, "");

async function filasDe(archivo: File): Promise<Celda[][]> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Celda[]>(hoja, { header: 1, raw: true, defval: null });
}
/** La fila de títulos: la primera (de las 15 de arriba) que tiene una columna «Material». */
function titulos(filas: Celda[][]) {
  const i = filas.slice(0, 15).findIndex((f) => f.some((c) => norm(c) === "material"));
  return i < 0 ? null : { i, t: filas[i].map(norm) };
}
const col = (t: string[], ...pruebas: RegExp[]) => {
  for (const p of pruebas) { const i = t.findIndex((x) => p.test(x)); if (i >= 0) return i }
  return -1;
};

/** EL ZEXI: Material · descripción · Alm. · Libre utiliz. · In control-cal · Bloqueado · Total General.
 *  campo «bloqueado» (AG22): solo la columna Bloqueado, que es contra lo que se cuadra la base de Pasivos. */
export async function leerZexi(archivo: File, almacen: string, campo: "total" | "bloqueado" = "total"): Promise<{ filas: ZexiFila[]; error?: string }> {
  const filas = await filasDe(archivo);
  const h = titulos(filas);
  if (!h) return { filas: [], error: "No encontré la columna «Material» en las primeras filas del ZEXI." };
  const cMat = col(h.t, /^material$/), cDes = col(h.t, /descrip|texto/), cAlm = col(h.t, /^alm\.?$/, /^almacen$/);
  const cBloq = col(h.t, /bloq/);
  if (campo === "bloqueado" && cBloq < 0) return { filas: [], error: "Para AG22 el ZEXI debe traer la columna «Bloqueado»." };
  const cTot = campo === "bloqueado" ? cBloq : col(h.t, /^total/);
  const cLib = col(h.t, /libre/), cCal = col(h.t, /control/);
  const cPartes = [cLib, cCal, cBloq].filter((x) => x >= 0);
  if (cTot < 0 && !cPartes.length) return { filas: [], error: "No encontré la cantidad: el ZEXI debe traer «Total General» (o Libre utiliz., In control-cal y Bloqueado)." };
  const suma = new Map<string, ZexiFila>();
  for (const f of filas.slice(h.i + 1)) {
    const c = codigo(f[cMat]); if (!c || !/^\w+$/.test(c)) continue;
    if (cAlm >= 0 && txt(f[cAlm]) && txt(f[cAlm]).toUpperCase() !== almacen) continue;
    const q = cTot >= 0 ? num(f[cTot]) : cPartes.reduce((t, i) => t + (num(f[i]) || 0), 0);
    if (!Number.isFinite(q)) continue;
    const x = suma.get(c) ?? { codigo: c, descripcion: cDes >= 0 ? txt(f[cDes]) : "", cantidad: 0 };
    x.cantidad += q;
    /* Cómo está repartido (Libre · Control de calidad · Bloqueado): el paso 2 avisa si lo que hay que
       sacar de AG18 está bloqueado (primero un 343). */
    if (campo === "total") {
      if (cLib >= 0) x.libre = (x.libre ?? 0) + (num(f[cLib]) || 0);
      if (cCal >= 0) x.calidad = (x.calidad ?? 0) + (num(f[cCal]) || 0);
      if (cBloq >= 0) x.bloqueado = (x.bloqueado ?? 0) + (num(f[cBloq]) || 0);
    }
    suma.set(c, x);
  }
  if (!suma.size) return { filas: [], error: `El ZEXI no trae materiales de ${almacen}.` };
  return { filas: [...suma.values()] };
}

/**
 * LA TRANSACCIÓN DEL 311: por cada renglón, cuánto ENTRA (+) o SALE (−) de AG18.
 *   · Con «Almacén receptor»: si sale de AG18 resta, si llega a AG18 suma.
 *   · Sin él: los renglones del almacén AG18, con su signo (o con «D/H»: H resta).
 */
export async function leerMovimientos(archivo: File, almacen: string): Promise<{ filas: MovFila[]; error?: string }> {
  const filas = await filasDe(archivo);
  const h = titulos(filas);
  if (!h) return { filas: [], error: "No encontré la columna «Material» en las primeras filas del archivo." };
  const cMat = col(h.t, /^material$/);
  const cCan = col(h.t, /^cantidad$/, /cantidad.*umb|cantidad.*entrada|^ctd/, /cantidad/);
  const cRec = col(h.t, /recep/, /^alm\.?\s*rec/, /umlgo/);
  const cAlm = h.t.findIndex((x, i) => i !== cRec && (/^alm\.?$/.test(x) || /^almacen$/.test(x)));
  const cDoc = col(h.t, /doc.*mat/, /^doc/, /documento/);
  const cDH = col(h.t, /d\/h|debe.*haber/);
  const cMov = col(h.t, /^cmv$|^cl\.?\s*mov|clase.*mov/);
  const falta = [cCan < 0 && "«Cantidad»", cAlm < 0 && "«Almacén» (Alm.)"].filter(Boolean);
  if (falta.length) return { filas: [], error: `Al archivo le falta la columna ${falta.join(" y ")}. Necesito Material, Cantidad y Almacén.` };
  const suma = new Map<string, MovFila>();
  for (const f of filas.slice(h.i + 1)) {
    const c = codigo(f[cMat]); if (!c || !/^\w+$/.test(c)) continue;
    if (cMov >= 0 && txt(f[cMov]) && !/^31[12]/.test(txt(f[cMov]))) continue;
    let q = num(f[cCan]); if (!Number.isFinite(q) || !q) continue;
    if (cDH >= 0 && txt(f[cDH]).toUpperCase() === "H") q = -Math.abs(q);
    const alm = txt(f[cAlm]).toUpperCase(), rec = cRec >= 0 ? txt(f[cRec]).toUpperCase() : "";
    let neto = 0;
    if (cRec >= 0 && rec) {
      if (alm === almacen && rec !== almacen) neto = -Math.abs(q);
      else if (rec === almacen && alm !== almacen) neto = Math.abs(q);
    } else if (alm === almacen) neto = q;
    if (!neto) continue;
    const x = suma.get(c) ?? { codigo: c, cantidad: 0, documentos: [] };
    x.cantidad += neto;
    const d = cDoc >= 0 ? codigo(f[cDoc]) : "";
    if (d && !x.documentos.includes(d)) x.documentos.push(d);
    suma.set(c, x);
  }
  if (!suma.size) return { filas: [], error: `No encontré movimientos 311 de ${almacen} en el archivo.` };
  return { filas: [...suma.values()] };
}
