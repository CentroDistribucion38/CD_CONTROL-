/**
 * VARIAS PLACAS PEGADAS DE UNA VEZ — de Excel, de un chat, de donde sea.
 *
 * «Que yo pueda copiar y pegar en un campo varias placas de una, que
 * vengan de Excel, con el fin de filtrar y que me muestre cuáles vienen
 * en camino y cuáles no.»
 *
 * LO QUE LLEGA AL PEGAR depende de dónde se copió:
 *   · una columna de Excel      JGY577\r\nABC123\r\nXYZ98A
 *   · una fila de Excel         JGY577\tABC123\tXYZ98A
 *   · un chat o un correo       JGY577, ABC123 y XYZ 98A
 * Se parte por saltos de línea, tabuladores, comas, punto y coma y
 * barras. Un pedazo con espacios se junta si juntado tiene forma de
 * placa —«ABC 123» es UNA placa—; si no, se parte también por espacios.
 *
 * SE QUEDA LO QUE TIENE FORMA DE PLACA: letras y números, de 5 a 7, con
 * al menos una letra y un número. Así el encabezado «PLACA» de la
 * columna, un «y» del chat o una celda vacía no cuentan como placas que
 * «no vienen».
 */

/** Como se compara: sin espacios, guiones ni puntos, y en mayúscula. */
export const normPlaca = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const esPlaca = (s: string) => /^[A-Z0-9]{5,7}$/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s);

/** Un renglón con varias palabras: cada palabra que ya es placa, y si
 *  no, la palabra junto con la siguiente —«XYZ 98A» en medio de un chat—. */
function porPalabras(pedazo: string): string[] {
  const ps = pedazo.split(/\s+/).map(normPlaca).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < ps.length; i++) {
    if (esPlaca(ps[i])) out.push(ps[i]);
    else if (i + 1 < ps.length && esPlaca(ps[i] + ps[i + 1])) { out.push(ps[i] + ps[i + 1]); i++ }
  }
  return out;
}

export function leerPlacas(texto: string): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const pedazo of texto.split(/[\r\n\t,;|]+/)) {
    const junto = normPlaca(pedazo);
    const candidatas = esPlaca(junto) ? [junto] : porPalabras(pedazo);
    for (const c of candidatas) {
      if (esPlaca(c) && !vistas.has(c)) { vistas.add(c); out.push(c) }
    }
  }
  return out;
}
