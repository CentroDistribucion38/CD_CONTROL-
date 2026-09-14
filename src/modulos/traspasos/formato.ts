/**
 * CÓMO SE ESCRIBEN LAS COSAS DE TRASPASOS.
 *
 * Va en un archivo aparte —y NO en comunes.tsx— porque comunes.tsx es
 * "use client": una función importada desde ahí por una página del
 * servidor llega como referencia al cliente, no como función, y revienta
 * al llamarla. Es el mismo motivo por el que existe
 * modulos/roturas/formato.ts.
 */

/**
 * LOS TURNOS SON C, A y B, EN ESE ORDEN.
 *
 * No son 1, 2 y 3: así los llama la bodega y C es el que abre el día.
 * Renumerarlos obligaría a traducir en cada conversación —"el turno 1,
 * o sea el C"— y esa traducción es donde se equivoca alguien a las
 * cinco de la mañana.
 */
export const TURNOS = ["C", "A", "B"] as const;
export type Turno = (typeof TURNOS)[number];

/** La hora sola. La fecha ya está en el encabezado de la pantalla:
 *  repetirla en cada renglón es ruido que empuja lo que importa. */
export function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit", minute: "2-digit",
  });
}

/** La fecha larga, para los encabezados. */
export function fecha(f: string) {
  /* Se le pega la hora del mediodía a propósito: "2026-09-14" sin hora
     se interpreta como medianoche UTC, que en Colombia es el día
     anterior a las 7 p. m. — y la pantalla mostraría ayer. */
  return new Date(f + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/** El nombre de quien hizo algo, o un guion. Nunca el uuid: un
 *  identificador en pantalla no le dice nada a nadie. */
export function quien(nombres: Record<string, string>, id: string | null) {
  if (!id) return "—";
  return nombres[id] ?? "—";
}

/** Fecha de hoy en Colombia, en el formato que espera un <input date>. */
export function hoy() {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}
