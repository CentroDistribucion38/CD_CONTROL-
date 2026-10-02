/* ===================================================================
   VH INTERNO · LA CANTIDAD SE ESCRIBE EN UNIDADES (lógica pura)

   La persona escribe UNIDADES. La base guarda ESTIBAS, así que adentro se
   convierte con los factores del maestro y se tienen los dos datos:

       unidades = estibas × cajas por estiba × unidades por caja

   Sin esos dos factores no hay conversión posible: no se puede crear y se dice
   qué completar en el Maestro.
   =================================================================== */

export type MatCantidad = { cajas_x_estiba?: number | null; unidades_x_caja?: number | null } | null | undefined;

/** «0,83» y «0.83» valen lo mismo; vacío o basura, nada. */
export const numero = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Unidades que trae una estiba de ese material; null si al maestro le falta un factor. */
export function unidadesPorEstiba(mat: MatCantidad): number | null {
  const ce = mat?.cajas_x_estiba == null ? null : Number(mat.cajas_x_estiba);
  const uc = mat?.unidades_x_caja == null ? null : Number(mat.unidades_x_caja);
  if (ce == null || uc == null || !(ce > 0) || !(uc > 0)) return null;
  return ce * uc;
}

/** Qué factor del maestro falta para poder convertir (o null si se puede). */
export function factorFaltante(mat: MatCantidad): string | null {
  if (!mat) return null;
  if (mat.cajas_x_estiba == null || !(Number(mat.cajas_x_estiba) > 0)) return "factor de estiba";
  if (mat.unidades_x_caja == null || !(Number(mat.unidades_x_caja) > 0)) return "unidades por caja";
  return null;
}

/** Las ESTIBAS que valen las unidades escritas. null = no se puede saber (vacío, basura o sin factores). */
export function estibasDe(unidades: string, mat: MatCantidad): number | null {
  const n = numero(unidades);
  if (n == null) return null;
  const f = unidadesPorEstiba(mat);
  return f == null ? null : n / f;
}

/** Las unidades escritas, como número (null si está vacío o es basura). */
export const unidadesDe = (unidades: string): number | null => numero(unidades);

/** Con unidades, ¿completan cajas enteras? (Una advertencia, no un error: la base acepta estibas fraccionadas.) */
export function cajasCompletas(unidades: number | null, mat: MatCantidad): boolean {
  if (unidades == null || mat?.unidades_x_caja == null || !(Number(mat.unidades_x_caja) > 0)) return true;
  const c = unidades / Number(mat.unidades_x_caja);
  return Math.abs(c - Math.round(c)) < 1e-9;
}
