/**
 * LOS TURNOS DE LA PLANTA DE ENVASADO.
 *
 * Son OTROS que los de Traspasos, y por eso viven aquí y no allá: en el
 * centro de distribución el turno A arranca a las 06:00; en la planta
 * arranca a MEDIANOCHE. Compartir la constante habría hecho que
 * arreglar una rompiera la otra.
 *
 *   A   00:00 – 08:00
 *   B   08:00 – 16:00
 *   C   16:00 – 24:00
 *
 * EN LA BASE SE GUARDAN COMO 1, 2 Y 3. Así venían en las 24.243 filas
 * del Excel y así se quedan: renombrarlos a letras habría sido reescribir
 * el histórico entero para cambiar una etiqueta. La letra es lo que se
 * lee; el número es lo que se guarda.
 */
export const TURNOS = [
  { n: 1, letra: "A", desde: 0,  hasta: 8  },
  { n: 2, letra: "B", desde: 8,  hasta: 16 },
  { n: 3, letra: "C", desde: 16, hasta: 24 },
] as const;

export const letraDe = (n: number) => TURNOS.find((t) => t.n === n)?.letra ?? String(n);

const dosDig = (h: number) => String(h % 24).padStart(2, "0") + ":00";
export const horarioDe = (n: number) => {
  const t = TURNOS.find((x) => x.n === n);
  return t ? `${dosDig(t.desde)} · ${dosDig(t.hasta)}` : "";
};

/**
 * EL TURNO DE AHORA, en hora de Colombia y no en la del servidor.
 *
 * Vercel corre en UTC: a las 8 de la noche de acá allá ya es la 1 de la
 * mañana del día siguiente, y la pantalla abriría en el turno A cuando
 * el muelle está en el C.
 */
export function turnoDeAhora(ahora = new Date()) {
  const h = new Date(ahora.getTime() - 5 * 3600_000).getUTCHours();
  return TURNOS.find((t) => h >= t.desde && h < t.hasta)?.n ?? 1;
}
