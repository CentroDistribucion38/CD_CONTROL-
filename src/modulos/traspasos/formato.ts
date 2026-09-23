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
 * LOS TURNOS SON C, A y B, CON SUS HORARIOS.
 *
 * No son 1, 2 y 3: así los llama la bodega. Y el orden sale del
 * horario: EL TURNO C ABRE EL DÍA, a las 22:00 del día anterior. El
 * día 23 son el C que arranca el 22 a las 22:00, el A de las 06:00 y
 * el B de las 14:00 del 23.
 *
 * ESTUVO AL REVÉS —A, B, C— y con eso el turno C que entraba a las
 * 22:00 no podía registrar nada hasta la medianoche. De este orden
 * salen los renglones del plan, las columnas del control y los anillos
 * del tablero: si el C abre el día y se pinta de último, el tablero
 * cuenta el día al revés.
 *
 * Los horarios también viven en la base (traspaso_orden_turno,
 * traspaso_arranque_turno), que es la que manda: aquí están para que la
 * pantalla no tenga que preguntarlos en cada renglón de una rejilla de
 * veintisiete celdas.
 */
export const TURNOS = ["C", "A", "B"] as const;
export type Turno = (typeof TURNOS)[number];

export const HORARIO: Record<string, string> = {
  C: "22:00 · 06:00",
  A: "06:00 · 14:00",
  B: "14:00 · 22:00",
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

/* =====================================================================
   HASTA DÓNDE SE PUEDE REGISTRAR HACIA ADELANTE

   «Hay veces que tengo un viaje del día siguiente y lo adelanto.» Ese
   viaje ya salió y pertenece al día que le toca, así que se registra en
   ese día, no en hoy.

   SIETE DÍAS, Y EL NÚMERO ESTÁ DOS VECES: aquí y en el `if` de
   `traspaso_registrar` (supabase/migraciones/2026-09-traspasos-registro-adelantado.sql).
   No se puede juntar más —uno vive en la base y el otro en la pantalla—,
   pero sí se puede dejar escrito en UN solo sitio de cada lado, que es
   lo que hace esta constante: si mañana pasan a diez, se cambian dos
   líneas y no siete pantallas. Si los dos números se separan, la
   pantalla deja llenar el formulario para que el guardado reviente.
   ===================================================================== */
export const DIAS_ADELANTE = 7;

/** El último día en que se puede registrar, contando desde el día
 *  operativo. Se ancla al mediodía a propósito: sumar días sobre una
 *  fecha leída como medianoche UTC se cae en el cambio de mes por el
 *  huso de Colombia. */
export const topeAdelante = (hoy: string, dias = DIAS_ADELANTE) =>
  new Date(Date.parse(hoy + "T12:00:00") + dias * 86400_000)
    .toISOString().slice(0, 10);

export { MESES };

/* =====================================================================
   EL VIDRIO QUE SE VA CON EL VIAJE
   ===================================================================== */

/**
 * UNA CÉDULA DE VIDRIO ESPERANDO VH.
 *
 * Es una salida de vidrio pesada y cerrada que todavía no se ha
 * despachado. El número —SR-0001— no es nuevo: es el código con el que
 * la salida nace, y es lo que facturación escoge al dar la salida al
 * viaje. Inventar un segundo número único al lado habría dejado dos
 * identidades para la misma carga y, el día que no cuadren, nadie
 * sabría cuál manda.
 */
export type Cedula = {
  id: string;
  cedula: string;
  placa: string;
  tolvas: number;
  neto_kg: number;
  observacion: string | null;
  dias_esperando: number;
};

/**
 * UNA SALIDA DE VIDRIO QUE TODAVÍA ESTÁ EN LA BÁSCULA.
 *
 * Nace abierta y se llena tolva por tolva; solo es cédula cuando quien
 * pesó la CIERRA. Hasta entonces el número de tolvas puede cambiar, así
 * que ofrecérsela a facturación sería despachar una carga a medio
 * medir.
 *
 * PERO SE AVISA. Facturación tiene que saber que en la báscula hay un
 * pesaje a medias de esa misma placa: si no, o piensa que la función no
 * sirve, o le da salida al Vh y el vidrio se va con el registro
 * diciendo que sigue en el patio. Un freno que no se ve es una trampa.
 */
export type EnBascula = {
  id: string;
  cedula: string;
  placa: string;
  tolvas: number;
  neto_kg: number;
  observacion: string | null;
  horas_abierta: number;
};

/**
 * LA PLACA, SIN ESPACIOS NI GUIONES: "abc 123", "ABC-123" y "abc123"
 * son el mismo Vh. Es el mismo criterio con el que la base la guarda.
 *
 * VIVE AQUÍ Y NO EN datos.ts, y no es capricho: datos.ts es del
 * SERVIDOR —importa el cliente de Supabase del servidor, que a su vez
 * pide next/headers—. Una pantalla "use client" que importe de ahí una
 * función se arrastra el módulo del servidor entero al navegador y
 * revienta con «Dynamic require of react is not supported», que no dice
 * nada de lo que de verdad pasó. Es el mismo motivo por el que existe
 * este archivo.
 */
export const placaClave = (p?: string | null) =>
  (p ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
