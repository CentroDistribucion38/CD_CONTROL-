/**
 * QUÉ UBICACIONES SON DE QUÉ TABLA. Sin nada de servidor: lo usan Control y el tablero (navegador)
 * y la lectura del inventario (servidor).
 *
 * «En Bodega no me puede aparecer lo de Fábrica; Fábrica en AG18, y en AG22 lo que está en Bodega,
 *  que no sea Fábrica.» Las de Fábrica se llaman FABRICA_… (FABRICA_PATIO_1, FABRICA_SORTING_L2…);
 *  las demás (P_16_DER, A01_IZQ, BAHIA_5…) son de Bodega.
 */
export const esUbicacionFabrica = (u: string | null | undefined) => /^\s*FABRICA/i.test(u ?? "");

/** AG18 se queda con las de Fábrica; AG22 con las que no son de Fábrica. Las demás tablas, sin regla. */
export const DE_FABRICA: Record<string, boolean> = { AG18: true, AG22: false };

/**
 * Quita de una ubicación ya guardada lo que no es de esa tabla. En AG22 sale todo lo FABRICA_…; en
 * AG18 sale lo de Bodega que vino del inventario (nombres con «_», como A01_IZQ). Lo escrito a mano
 * sin «_» (P19, SORTING) se respeta.
 */
export function limpiarPuesto(centro: string | null | undefined, puesto: string | null | undefined): string {
  const c = (centro ?? "").toUpperCase();
  const texto = puesto ?? "";
  if (!(c in DE_FABRICA)) return texto;
  const partes = texto.split(/\s+-\s+/).map((u) => u.trim()).filter(Boolean);
  const quedan = partes.filter((u) => (DE_FABRICA[c] ? esUbicacionFabrica(u) || !u.includes("_") : !esUbicacionFabrica(u)));
  return quedan.length === partes.length ? texto : quedan.join(" - ");
}
