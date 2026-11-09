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
