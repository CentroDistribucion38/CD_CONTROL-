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

/**
 * EL DESCUENTO ESTÁNDAR: «en la base, este SKU puntual 3500005, de las unidades que tenga en AG22, que
 * haya una casilla para descontarle este valor estándar: 216.296».
 * Se guarda como un renglón MANUAL en negativo (BAJA · PRESORTING · AG22) con esta nota, así se ve en
 * la base, suma en los totales y entra al cuadre de AG22.
 */
export const DESCUENTO_ESTANDAR = { codigo: "3500005", almacen: "AG22", estado: "BAJA", causal: "PRESORTING", unidades: 216296, nota: "Descuento estándar" } as const;
