import { aDia } from "./leer";
import type { Hoja, SeccionHoja } from "./logica";

/**
 * LEER EL EXCEL DE «EXISTENCIAS DIARIAS» en el navegador (con `xlsx`), sin llave ni modelo.
 * La hoja trae una fecha arriba y secciones: una fila de título EN MAYÚSCULAS con los nombres de sus dos columnas
 * (ESTIBA · CAJA, CANTIDAD · Columna1, CANT…), y debajo los renglones (nombre + dos números). Las columnas se toman de
 * donde caen los títulos de cada sección, así que no importa en qué columna del Excel empiece la tabla.
 */
type Celda = string | number | Date | null | undefined;
const txt = (v: Celda) => (v instanceof Date ? "" : String(v ?? "")).trim();
const vacia = (v: Celda) => v == null || (typeof v === "string" && v.trim() === "");
const esNum = (v: Celda) => typeof v === "number" && Number.isFinite(v);
const numero = (v: Celda): number | null => (esNum(v) ? (v as number) : null);

export async function leerInventario(archivo: File): Promise<{ hoja?: Hoja & { fechaLeida: boolean }; error?: string }> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const nombre = libro.SheetNames.find((n) => /exist|inven/i.test(n)) ?? libro.SheetNames[0];
  const filas = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null });

  let fecha: string | null = null;
  const secciones: SeccionHoja[] = [];
  let actual: { s: SeccionHoja; ia: number; ib: number } | null = null;

  for (const f of filas) {
    const idx = f.map((c, i) => (vacia(c) ? -1 : i)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const ic = idx[0];                       // la columna del nombre
    const concepto = txt(f[ic]);
    const resto = idx.slice(1);

    /* la fecha: un renglón con solo una fecha (o dd/mm/aaaa), antes de la primera sección */
    if (!actual && !fecha) {
      const d = aDia(f[ic]) ?? resto.map((i) => aDia(f[i])).find(Boolean) ?? null;
      if (d && (resto.length === 0 || typeof f[ic] !== "string" || /^\d/.test(concepto))) { fecha = d; continue }
    }
    /* título de sección: mayúsculas, sin números a la derecha, con los nombres de las columnas */
    const esTitulo = resto.length > 0 && resto.every((i) => !esNum(f[i])) && typeof f[ic] === "string" && concepto === concepto.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(concepto);
    if (esTitulo) {
      const s: SeccionHoja = { titulo: concepto, colA: txt(f[resto[0]]), colB: resto[1] != null ? txt(f[resto[1]]) : "", filas: [] };
      actual = { s, ia: resto[0], ib: resto[1] ?? resto[0] + 1 };
      secciones.push(s);
      continue;
    }
    if (!actual || typeof f[ic] !== "string") continue;
    actual.s.filas.push({ concepto, a: numero(f[actual.ia]), b: numero(f[actual.ib]) });
  }

  const conFilas = secciones.filter((s) => s.filas.length);
  if (!conFilas.length) return { error: "No encontré secciones en el Excel. Deben verse como en la hoja: un título en mayúsculas (ENVASE, PALLET…) con los nombres de sus dos columnas." };
  return { hoja: { fecha: fecha ?? "", fechaLeida: !!fecha, secciones: conFilas } };
}
