/* QUÉ RECORRIDOS ENTRAN EN LA FOTO DEL TABLERO.

   Por defecto, lo ENVIADO hasta hoy: el último inventario. Con una fecha,
   lo enviado hasta ESE día (la foto de la bodega como estaba al cierre de
   ese día). Y, solo si se pide, también lo que todavía se está contando
   (borrador): sirve para ver lo de hoy, pero puede estar incompleto. */

export type ConteoTab = {
  id: string; estado: string; fecha_analisis: string | null; enviado_en: string | null; renglones?: number | null;
};

export type Eleccion<T extends ConteoTab> = {
  /** Los recorridos que arman la foto, el más reciente primero. */
  elegidos: T[];
  /** Los días (AAAA-MM-DD) que se pueden escoger, del más nuevo al más viejo, con cuántos recorridos hay en cada uno. */
  dias: { dia: string; n: number }[];
  /** El recorrido más reciente de la foto (el que se usa para «sin contar»). */
  ultimo: T | null;
};

/** Cuándo cuenta un recorrido para ordenarlo: el envío; si no se ha enviado, el día de su análisis. */
const cuando = (c: ConteoTab) => c.enviado_en ?? (c.fecha_analisis ? c.fecha_analisis + "T23:59:59" : "");

export function elegirConteos<T extends ConteoTab>(todos: T[], op: { hasta?: string | null; borradores?: boolean } = {}): Eleccion<T> {
  const validos = todos.filter((c) => c.estado === "cerrado" || (op.borradores && (c.estado === "borrador" || c.estado === "en_proceso")))
    .filter((c) => c.estado === "cerrado" || (c.renglones ?? 0) > 0);
  validos.sort((a, b) => cuando(b).localeCompare(cuando(a)));
  const cuenta = new Map<string, number>();
  for (const c of validos) if (c.fecha_analisis) cuenta.set(c.fecha_analisis, (cuenta.get(c.fecha_analisis) ?? 0) + 1);
  const dias = [...cuenta.entries()].map(([dia, n]) => ({ dia, n })).sort((a, b) => b.dia.localeCompare(a.dia));
  const hasta = op.hasta && /^\d{4}-\d{2}-\d{2}$/.test(op.hasta) ? op.hasta : null;
  const elegidos = hasta ? validos.filter((c) => (c.fecha_analisis ?? "") <= hasta) : validos;
  return { elegidos, dias, ultimo: elegidos[0] ?? null };
}
