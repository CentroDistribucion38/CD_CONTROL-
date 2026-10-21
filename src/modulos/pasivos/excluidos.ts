/**
 * LOS QUE NO VAN EN PASIVOS NI EN EL CUADRE SAP DE AG22.
 *
 * «Hay excepciones, como el barril y el 412644, 412671 y 412707: son los únicos SKU que no van dentro de
 *  ese balance y también se excluyen del pasivo, ya que son envases nuevos.» «También el de estiba 3500163.»
 *
 * · Envases nuevos (barril + 412644, 412671, 412707): fuera de Pasivos y de los dos cuadres SAP.
 * · La estiba 3500163: fuera de Pasivos y del cuadre de AG22. En el cuadre de AG18 SÍ va (las estibas
 *   de madera de la fábrica se cuadran allí: sueltas + bajo el envase + las del almacén).
 *
 * El barril se reconoce por el nombre (BARRIL), así entra cualquier código de barril sin tener que
 * listarlo. Este archivo no toca la base de datos: lo usan el servidor y la pantalla.
 */
export const ENVASES_NUEVOS = ["412644", "412671", "412707"] as const;
export const ESTIBA_MADERA = "3500163";
const NUEVOS = new Set<string>(ENVASES_NUEVOS);

/** ¿Se deja por fuera? `donde`: "pasivos" (Pasivos y el cuadre de AG22, sin la estiba) o "ag18" (el cuadre de AG18). */
export function esExcluido(codigo: unknown, nombre?: string | null, donde: "pasivos" | "ag18" = "pasivos"): boolean {
  const c = String(codigo ?? "").trim();
  if (NUEVOS.has(c) || /\bBARRIL/i.test(nombre ?? "")) return true;
  return donde === "pasivos" && c === ESTIBA_MADERA;
}

/* ------------------------------------------------------------------------------------------------
 * LA LISTA SE PUEDE ESCOGER. «Que esos SKU no entren como quemados: que yo pueda seleccionar en un
 * toolbox con filtro de código. Siempre van a estar seleccionados los que dijimos, pero que no me
 * amarre solo a esos y pueda elegir.»
 *
 * · Lo de siempre (porDefecto) sigue siendo la regla de arriba.
 * · Lo que el usuario cambia se guarda en la tabla excluidos_sku: un renglón por ámbito y código con
 *   fuera = true (lo saca) o fuera = false (lo vuelve a meter aunque sea de los de siempre).
 * · Ámbito AG18 = el cuadre SAP de AG18. Ámbito AG22 = el cuadre SAP de AG22 y la base de Pasivos.
 * ---------------------------------------------------------------------------------------------- */
export type AmbitoExcluidos = "AG18" | "AG22";
export const esAmbitoExcluidos = (v: unknown): v is AmbitoExcluidos => v === "AG18" || v === "AG22";

/** La regla de siempre para ese ámbito (sin lo que el usuario haya escogido). */
export function porDefecto(ambito: AmbitoExcluidos, codigo: unknown, nombre?: string | null): boolean {
  return esExcluido(codigo, nombre, ambito === "AG18" ? "ag18" : "pasivos");
}

/** Lo escogido: código → fuera (true) o adentro (false). Lo que no está aquí sigue la regla de siempre. */
export type ReglaExcluidos = { ambito: AmbitoExcluidos; elecciones: Record<string, boolean>; faltaSql: boolean };

export function excluye(regla: ReglaExcluidos, codigo: unknown, nombre?: string | null): boolean {
  const c = String(codigo ?? "").trim();
  if (c in regla.elecciones) return regla.elecciones[c];
  return porDefecto(regla.ambito, c, nombre);
}

/** Lo que la pantalla necesita para el toolbox: cada SKU que se puede escoger. */
export type SkuExcluible = { codigo: string; nombre: string; porDefecto: boolean; fuera: boolean; hoy: boolean };
export type PanelExcluidos = { ambito: AmbitoExcluidos; faltaSql: boolean; skus: SkuExcluible[]; hoy: string[] };

/**
 * EL DESCUENTO ESTÁNDAR: «en la base, este SKU puntual 3500005, de las unidades que tenga en AG22, que
 * haya una casilla para descontarle este valor estándar: 216.296».
 * Se guarda como un renglón MANUAL en negativo (BAJA · PRESORTING · AG22) con esta nota, así se ve en
 * la base, suma en los totales y entra al cuadre de AG22.
 */
export const DESCUENTO_ESTANDAR = { codigo: "3500005", almacen: "AG22", estado: "BAJA", causal: "PRESORTING", unidades: 216296, nota: "Descuento estándar" } as const;

/**
 * EL DESCUENTO ESTÁNDAR DENTRO DEL BALANCE: «a los 7.960 debes descontar es decir las 5.692». La pila estándar de
 * presorting de 3500005 (105 estibas × 54 + 22 cajas = 5.692 cajas = 216.296 u) no es diferencia por bajar: el Balance
 * la resta como ajuste automático de Baja · Bodega 38, y a Pasivos ya llega sin ella (ahí no se vuelve a descontar).
 */
export const DESCUENTO_BALANCE = { codigo: "3500005", estado: "BAJA", alcance: "PRESORTING", cajas: 5692, nota: "Descuento estándar presorting" } as const;
