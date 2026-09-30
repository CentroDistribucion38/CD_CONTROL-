/* SOLO EL ÚLTIMO INVENTARIO DE LA POSICIÓN.
 *
 * La pre-anotación («La última vez en A01_DER…») enseña lo que se contó la
 * última vez en ese módulo: los renglones de UN conteo, el más reciente, y
 * nada de los anteriores. La vista de la base ya lo hace, pero la pantalla no
 * se fía: si llegan renglones de varios conteos (una vista vieja, una
 * importación), se queda con los del más reciente y descarta el resto.
 *
 * «El más reciente» es el de fecha mayor; si dos empatan, el de id mayor
 * (el mismo desempate que usa la vista).
 */
export type FilaDeConteo = { conteo_id?: string | null; contado_en: string };

export function soloElUltimo<T extends FilaDeConteo>(filas: T[]): T[] {
  /* Sin conteo_id (la vista no lo trae) no hay cómo separarlos: se dejan tal cual. */
  if (filas.length === 0 || filas.some((f) => !f.conteo_id)) return filas;
  const cuando = (f: T) => Date.parse(f.contado_en) || 0;
  let mejor = filas[0];
  for (const f of filas) {
    const c = cuando(f), m = cuando(mejor);
    if (c > m || (c === m && String(f.conteo_id) > String(mejor.conteo_id))) mejor = f;
  }
  return filas.filter((f) => f.conteo_id === mejor.conteo_id);
}
