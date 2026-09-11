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
