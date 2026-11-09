/* ===================================================================
   UNIDADES SUELTAS · LA CUENTA EXACTA

   Un renglón del fiscal lleva CAJAS (enteras) y, aparte, UNIDADES SUELTAS: lo que no completa una caja.
   Para comparar dos conteos, sumar o restar sin errores, todo se pasa a UNIDADES (cajas × unidades por caja + sueltas),
   que son enteros exactos; para mostrarlo se vuelve a partir en «cajas + sueltas». La base hace lo mismo
   (`inv_fiscal_tu`): lo que se ve aquí y lo que decide la base son la misma cuenta.
   =================================================================== */

/** Unidades por caja de un material; 1 si no se sabe (entonces no hay «sueltas»). */
export const upcDe = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 1 ? n : 1;
};

const entero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

/** Cajas + sueltas → unidades. */
export const aUnidades = (cajas: unknown, sueltas: unknown, upc: unknown): number => entero(cajas) * upcDe(upc) + entero(sueltas);

/** Unidades → cajas + sueltas (con signo: −5 unidades con 24 por caja son 0 cajas y −5 sueltas). */
export function partir(unidades: number, upc: unknown): { cajas: number; unidades: number } {
  const u = upcDe(upc), s = unidades < 0 ? -1 : 1, a = Math.abs(unidades);
  return { cajas: s * Math.floor(a / u), unidades: s * (a % u) };
}

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** «20 cajas + 5 un.» / «20 cajas» / «5 un.» / «0 cajas». */
export function textoCantidad(cajas: number, sueltas: number): string {
  const c = `${nf.format(cajas)} ${Math.abs(cajas) === 1 ? "caja" : "cajas"}`;
  if (!sueltas) return c;
  const s = `${nf.format(sueltas)} un.`;
  return cajas === 0 ? s : `${c} + ${s}`;
}

/** Una cantidad en unidades, mostrada como «cajas + sueltas». */
export const textoDeUnidades = (unidades: number, upc: unknown): string => {
  const p = partir(unidades, upc);
  return textoCantidad(p.cajas, p.unidades);
};

/** La diferencia con signo: «+2 un.», «−3 cajas + 5 un.», «0». */
export function textoDif(unidades: number, upc: unknown): string {
  if (unidades === 0) return "0";
  const p = partir(unidades, upc);
  const sig = unidades > 0 ? "+" : "−";
  const c = Math.abs(p.cajas), s = Math.abs(p.unidades);
  const partes = [c ? `${nf.format(c)} ${c === 1 ? "caja" : "cajas"}` : "", s ? `${nf.format(s)} un.` : ""].filter(Boolean);
  return `${sig}${partes.join(" + ")}`;
}

/** Una diferencia ya partida en cajas y sueltas (cada una con su signo): «+2 cajas, −5 un.» / «0». */
export function textoDifPartes(cajas: number, sueltas: number): string {
  if (!cajas && !sueltas) return "0";
  const f = (v: number, et: string) => `${v > 0 ? "+" : "−"}${nf.format(Math.abs(v))} ${et}`;
  return [cajas ? f(cajas, Math.abs(cajas) === 1 ? "caja" : "cajas") : "", sueltas ? f(sueltas, "un.") : ""].filter(Boolean).join(", ");
}

/* ---------------------------------------------------------------------------
   LAS SUELTAS EN LOS TOTALES (tablero, corte, informe, cuadre, FIFO, riesgo…)

   Un renglón de la base trae `total_cajas` (cajas ENTERAS), `unidades` (las sueltas, menos de una caja) y
   `unidades_por_caja`. Para sumar y comparar sin perder nada, las sueltas se pasan a fracción de caja
   (5 sueltas de 24 por caja = 0,2083 cajas): `cajasEq`. Las unidades totales salen exactas (cajasEq × unidades por caja).
   ------------------------------------------------------------------------- */
export type ConSueltas = { total_cajas?: unknown; unidades?: unknown; unidades_por_caja?: unknown };

/** Las unidades sueltas de un renglón (0 si no trae). */
export const sueltasDe = (r: { unidades?: unknown }): number => {
  const n = Math.trunc(Number(r.unidades));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Cajas con las sueltas como fracción de caja (6 decimales). Sin unidades por caja conocidas, solo las enteras. */
export function cajasEq(r: ConSueltas): number {
  const c = Number(r.total_cajas);
  const base = Number.isFinite(c) ? c : 0;
  const u = sueltasDe(r), upc = upcDe(r.unidades_por_caja);
  return u > 0 && upc > 1 ? Math.round((base + u / upc) * 1e6) / 1e6 : base;
}

/** La fila con `total_cajas` ya incluyendo las sueltas (decimal) y las cajas enteras guardadas en `cajas_enteras`. */
export function conSueltas<T extends ConSueltas>(r: T): T & { cajas_enteras: number } {
  const ent = Number(r.total_cajas);
  return { ...r, total_cajas: cajasEq(r), cajas_enteras: Number.isFinite(ent) ? ent : 0 } as T & { cajas_enteras: number };
}
export const conSueltasTodas = <T extends ConSueltas>(rs: readonly T[]): (T & { cajas_enteras: number })[] => rs.map(conSueltas);

/** Cajas que pueden traer decimales (por las sueltas): «1.234» o «1.234,21». */
export function textoCajas(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return Math.abs(v - Math.round(v)) < 1e-9
    ? nf.format(Math.round(v))
    : new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
