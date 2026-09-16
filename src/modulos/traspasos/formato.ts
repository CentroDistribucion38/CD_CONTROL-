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
 * LOS TURNOS SON A, B y C, CON SUS HORARIOS.
 *
 * No son 1, 2 y 3: así los llama la bodega. El orden sale del horario
 * —A abre el día— y no del orden en que aparecían en una lista
 * desplegable, que es de donde salió el C-A-B de la primera versión.
 * Un horario explícito le gana siempre a un orden inferido.
 *
 * Los horarios también viven en la base (traspaso_horario_turno), que
 * es la que manda: aquí están para que la pantalla no tenga que
 * preguntarlos en cada renglón de una rejilla de veintisiete celdas.
 */
export const TURNOS = ["A", "B", "C"] as const;
export type Turno = (typeof TURNOS)[number];

export const HORARIO: Record<string, string> = {
  A: "06:00 · 14:00",
  B: "14:00 · 22:00",
  C: "22:00 · 06:00",
};

/** Qué turno va según la hora de Colombia. Se PROPONE, no se impone:
 *  quien registra a las 6:05 casi siempre está cerrando el anterior. */
export function turnoDeAhora() {
  const h = new Date(Date.now() - 5 * 3600_000).getUTCHours();
  if (h >= 6 && h < 14) return "A";
  if (h >= 14 && h < 22) return "B";
  return "C";
}

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

/* =====================================================================
   LOS NOMBRES DE LAS FECHAS

   VIVEN AQUÍ Y NO EN Calendario.tsx, y ese traslado es el arreglo de un
   error de verdad: la página de Registrar es del SERVIDOR y llamaba
   `conDia` importándola del calendario, que es "use client". Next no
   trae la función: trae una referencia al cliente, y llamarla en el
   servidor revienta la pantalla entera con «a server-side exception has
   occurred».

   Y REVENTABA SOLO AL SALIRSE DE HOY, porque `conDia` únicamente se
   llama cuando la fecha no es la de hoy —el título dice «Estás en jue
   11 de septiembre»—. En hoy la línea nunca se ejecutaba. Por eso
   parecía «no me deja registrar días anteriores»: no era un permiso ni
   una regla, era la pantalla cayéndose antes de dibujarse.

   La regla, y es la misma que ya está escrita arriba para comunes.tsx:
   lo que una página del servidor va a LLAMAR no puede salir de un
   archivo "use client". Nunca.
   ===================================================================== */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const SEM = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export const partes = (f: string) => ({
  a: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)) - 1, d: Number(f.slice(8, 10)),
});

/** Lunes = 0 … domingo = 6, para una fecha suelta. Se ancla al mediodía
 *  porque una fecha sin hora se lee como medianoche UTC, que en Colombia
 *  es el día anterior. */
export const diaSemana = (f: string) =>
  (new Date(f + "T12:00:00").getUTCDay() + 6) % 7;

export const bonita = (f: string) => {
  const { m, d } = partes(f);
  return `${d} de ${MESES[m]}`;
};

/** Con el día de la semana delante. En una pantalla donde se planea por
 *  semana, saber que el 15 es martes es la mitad de la información. */
export const conDia = (f: string) => `${SEM[diaSemana(f)]} ${bonita(f)}`;

export { MESES };
