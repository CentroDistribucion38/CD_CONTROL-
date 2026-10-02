/* ===================================================================
   VH INTERNO · LA CANTIDAD EN ESTIBAS O EN UNIDADES (lógica pura)

   La persona escoge cómo contó el material: en estibas o en unidades. La base
   guarda ESTIBAS, así que lo que se escribe en unidades se convierte con los
   factores del maestro:

       unidades = estibas × cajas por estiba × unidades por caja

   Sin esos dos factores no hay conversión posible: las unidades no se ofrecen
   para ese material y se dice qué completar en el Maestro.
   =================================================================== */

export type MatCantidad = { cajas_x_estiba?: number | null; unidades_x_caja?: number | null } | null | undefined;
export type ModoCantidad = "estibas" | "unidades";

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

/** Las ESTIBAS que valen lo escrito, en el modo escogido. null = no se puede saber (vacío, basura o sin factores). */
export function estibasDe(modo: ModoCantidad, texto: string, mat: MatCantidad): number | null {
  const n = numero(texto);
  if (n == null) return null;
  if (modo === "estibas") return n;
  const f = unidadesPorEstiba(mat);
  return f == null ? null : n / f;
}

/** Las UNIDADES que valen lo escrito, en el modo escogido. */
export function unidadesDe(modo: ModoCantidad, texto: string, mat: MatCantidad): number | null {
  const n = numero(texto);
  if (n == null) return null;
  if (modo === "unidades") return n;
  const f = unidadesPorEstiba(mat);
  return f == null ? null : n * f;
}

const limpio = (x: number, dec: number) => {
  const k = 10 ** dec;
  return String(Math.round(x * k) / k);
};

/** Al cambiar de modo, el mismo valor escrito en el otro: 19 estibas ↔ 25650 unidades. Si no se puede convertir, no se toca. */
export function cambiarModo(de: ModoCantidad, a: ModoCantidad, texto: string, mat: MatCantidad): string {
  if (de === a) return texto;
  const n = numero(texto);
  const f = unidadesPorEstiba(mat);
  if (n == null || f == null) return texto;
  return a === "unidades" ? limpio(n * f, 2) : limpio(n / f, 4);
}

/** Con unidades, ¿completan cajas enteras? (Una advertencia, no un error: la base acepta estibas fraccionadas.) */
export function cajasCompletas(unidades: number | null, mat: MatCantidad): boolean {
  if (unidades == null || mat?.unidades_x_caja == null || !(Number(mat.unidades_x_caja) > 0)) return true;
  const c = unidades / Number(mat.unidades_x_caja);
  return Math.abs(c - Math.round(c)) < 1e-9;
}
