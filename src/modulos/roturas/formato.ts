/**
 * CÓMO SE DICEN LAS COSAS EN ROTURAS.
 *
 * Va aparte de comunes.tsx —que es "use client"— a propósito: las
 * páginas del servidor también necesitan formatear kilos para el KPI del
 * encabezado, y una función importada desde un módulo de cliente llega
 * al servidor como una referencia, no como la función. Aquí no hay
 * componentes, así que las dos orillas la pueden usar.
 */

export function fecha(s: string | null) {
  return s ? new Date(s).toLocaleString("es-CO", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }) : "";
}

/** El tiempo en palabras. "hace 40 min" se entiende; "40" no dice de qué. */
export function hace(min: number) {
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}

export function quien(nombres: Record<string, string>, id: string | null) {
  return id ? (nombres[id] ?? "—") : "—";
}

/** Kilos con separador de miles y un decimal como mucho. */
export function kilos(n: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(Number(n) || 0);
}

export const COLOR_VIDRIO: Record<string, string> = {
  ambar: "Ámbar", flint: "Flint", green: "Green",
};

/**
 * PLATA EN PESOS, SIN CENTAVOS Y CON EL SIGNO.
 *
 * SIN DECIMALES A PROPÓSITO: los precios del MM60 traen centavos
 * —$233,50— pero lo que se lee en una pantalla son totales de cientos de
 * miles, y ahí dos decimales son ruido que además hace que dos cifras
 * de la misma columna no se alineen.
 *
 * Y CUANDO NO SE PUEDE CALCULAR, DEVUELVE NULO Y NO «$ 0». Falta el
 * precio de algún material en el maestro: un cero se lee como «no se le
 * cobra nada» y eso es exactamente lo contrario de lo que pasa.
 */
export function pesos(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return "$ " + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(n));
}
