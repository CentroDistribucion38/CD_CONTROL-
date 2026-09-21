/**
 * LAS HOJAS DEL DÍA QUE SE GENERARON, LEÍDAS PARA EL TABLERO.
 *
 * «Y si no, que en el tablero de rotura haya una hoja con todos los PDF
 * generados.»
 *
 * Sin base de datos: recibe lo que ya trajo el tablero y dice tres cosas:
 * cuántas se generaron, qué días con rotura quedaron SIN hoja y cuáles
 * CAMBIARON después de generar la última —lo firmado ya no es lo que dice
 * la base—.
 */

/** EL DÍA EN QUE EMPEZÓ A EXISTIR LA HOJA. Antes no había cómo generarla:
 *  contar esos días como «sin hoja» sería una alarma de 260 días que
 *  nadie puede cerrar, y una alarma así se deja de mirar. */
export const DESDE_HOJAS = "2026-09-21";

export type HojaDeTablero = {
  id: string; fecha: string; unidades: number; generado_en: string;
  anulada_en?: string | null;
};

/** Una hoja anulada se sigue viendo, pero no cuenta: ni como «la hoja
 *  del día» ni para decir que el día ya tiene hoja. */
export const anulada = (h: { anulada_en?: string | null }) => h.anulada_en != null;

export function resumirHojas<H extends HojaDeTablero>(
  hojas: H[],
  dias: { fecha: string; und: number }[],
  { conLinea }: { conLinea: boolean },
) {
  /* Lo que dice la base de cada día, todas las líneas juntas. */
  const undDia = new Map<string, number>();
  for (const d of dias) undDia.set(d.fecha, (undDia.get(d.fecha) ?? 0) + Number(d.und));

  /* La ÚLTIMA hoja de cada día es la que cuenta: las anteriores se
     reemplazaron por algo. */
  const ultima = new Map<string, H>();
  for (const h of hojas) {
    if (anulada(h)) continue;
    const u = ultima.get(h.fecha);
    if (!u || h.generado_en > u.generado_en) ultima.set(h.fecha, h);
  }

  /* SIN HOJA: días con rotura desde que la hoja existe y sin ninguna
     generada. El más reciente primero, que es el que se puede arreglar. */
  const sinHoja = [...undDia.entries()]
    .filter(([f, u]) => u > 0 && f >= DESDE_HOJAS && !ultima.has(f))
    .map(([fecha, und]) => ({ fecha, und }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  /* CAMBIÓ DESPUÉS: solo sin filtro de línea. Con una línea escogida, la
     base dice lo de esa línea y la hoja lo del día entero: no se comparan
     y parecería que todas cambiaron. */
  const cambio = new Set<string>();
  if (!conLinea) {
    for (const [f, h] of ultima) {
      const hoy = undDia.get(f) ?? 0;
      if (Number(h.unidades) !== hoy) cambio.add(h.id);
    }
  }

  const ordenadas = [...hojas].sort((a, b) =>
    b.fecha.localeCompare(a.fecha) || b.generado_en.localeCompare(a.generado_en));

  const anuladas = hojas.filter(anulada).length;
  return {
    total: hojas.length - anuladas,
    anuladas,
    dias: ultima.size,
    sinHoja,
    cambio,
    ordenadas,
    esUltima: (h: H) => ultima.get(h.fecha)?.id === h.id,
  };
}
