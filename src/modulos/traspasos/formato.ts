/**
 * CÓMO SE ESCRIBEN LAS COSAS DE TRASPASOS.
 *
 * Va en un archivo aparte —y NO en comunes.tsx— porque comunes.tsx es
 * "use client": una función importada desde ahí por una página del
 * servidor llega como referencia al cliente, no como función, y revienta
 * al llamarla. Es el mismo motivo por el que existe
 * modulos/roturas/formato.ts.
 */

/** Los tres turnos. La bodega trabaja en tres y no cambian: si algún día
 *  cambian, cambian aquí y en el CHECK de la base, que es el que manda. */
export const TURNOS = [1, 2, 3] as const;

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
