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

/* LA CIFRA DE LA TARJETA: ESTIBAS Y CAJAS, CALCULADAS.
 *
 * Un renglón puede traer estibas, cajas o las dos («30 estibas y 30 cajas de
 * saldo»). Con el factor de estibado (cajas por estiba) todo se pasa a cajas y
 * se vuelve a partir en estibas completas y cajas sueltas: 1.830 cajas con
 * factor 60 son «30 estibas + 30 cajas», sin importar cómo se anotó.
 * Sin factor no hay cómo convertir: se enseña tal cual se anotó.
 */
export type CifraEntrada = {
  estibas: number | null; cajas: number | null;
  factor_estibado: number | string | null; total_cajas: number | string | null;
};
export type Cifra = { estibas: number | null; cajas: number | null; total: number | null };

export function cifraDeTarjeta(p: CifraEntrada): Cifra {
  const f = Number(p.factor_estibado);
  if (!(f > 0)) return { estibas: p.estibas, cajas: p.cajas, total: null };
  const calculado = (p.estibas ?? 0) * f + (p.cajas ?? 0);
  const total = Number.isFinite(Number(p.total_cajas)) && p.total_cajas !== null ? Number(p.total_cajas) : calculado;
  const e = Math.floor(total / f);
  return { estibas: e, cajas: total - e * f, total };
}
