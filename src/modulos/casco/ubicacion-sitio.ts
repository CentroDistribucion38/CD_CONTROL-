/**
 * QUÉ UBICACIONES SON DE QUÉ TABLA. Sin nada de servidor: lo usan Control y el tablero (navegador)
 * y la lectura del inventario (servidor).
 *
 * «En Bodega no me puede aparecer lo de Fábrica; Fábrica en AG18, y en AG22 lo que está en Bodega,
 *  que no sea Fábrica.» Las de Fábrica se llaman FABRICA_… (FABRICA_PATIO_1, FABRICA_SORTING_L2…);
 *  las demás (P_16_DER, A01_IZQ, BAHIA_5…) son de Bodega.
 */
export const esUbicacionFabrica = (u: string | null | undefined) => /^\s*FABRICA/i.test(u ?? "");

/**
 * LOS ALMACENES PROPIOS: la calle EXPORTACION es el AG17 y la calle BTS es el AG16. Tienen su propio almacén,
 * así que NO entran ni a AG18 (solo la calle FABRICA) ni a AG22 (todo el resto de Bodega 38).
 */
export const esUbicacionExportacion = (u: string | null | undefined) => /^\s*EXPORTACION/i.test(u ?? "");
export const esUbicacionBts = (u: string | null | undefined) => /^\s*BTS/i.test(u ?? "");
type ConUbicacion = { calle?: string | null; ubicacion?: string | null; ubicacion_combinada?: string | null };
/** El almacén de un renglón del conteo: FABRICA → AG18, EXPORTACION → AG17, BTS → AG16, lo demás → AG22. */
export function almacenDeRenglon(r: ConUbicacion): "AG18" | "AG17" | "AG16" | "AG22" {
  const us = [r.calle, r.ubicacion, r.ubicacion_combinada];
  if (us.some(esUbicacionFabrica)) return "AG18";
  if (us.some(esUbicacionExportacion)) return "AG17";
  if (us.some(esUbicacionBts)) return "AG16";
  return "AG22";
}
/** true si el renglón es de AG17 (EXPORTACION) o AG16 (BTS): no va en AG18 ni en AG22. */
export const esDeAG17oAG16 = (r: ConUbicacion) => { const a = almacenDeRenglon(r); return a === "AG17" || a === "AG16" };

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
