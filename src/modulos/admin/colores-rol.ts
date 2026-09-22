/** Los colores de los exportables de usuarios: la tinta y la banda del
 *  tema de quien exporta, y el color vivo de cada rol. Aparte del libro
 *  para que la tarjeta en imagen no cargue exceljs. */
export type ColoresLibro = { tinta: string; banda: string };   // RRGGBB
export const MARCA: ColoresLibro = { tinta: "12263A", banda: "FFC000" };

/** EL COLOR DE CADA ROL: vivo, con letra blanca. «Esos colores ponlos más
 *  vivos, que se ve horrible.» Quien administra va en la tinta con el
 *  color de la banda; los demás, por su orden en la lista de roles. */
const VIVOS = ["00B050", "0A84FF", "8B3DFF", "00B8A9", "FF6A00", "FF2D78", "E0A800", "00A2E8"];
export function colorRol(clave: string, roles: { clave: string; manda: boolean }[], c: ColoresLibro = MARCA): { fondo: string; letra: string } {
  const r = roles.find((x) => x.clave === clave);
  if (r?.manda) return { fondo: c.tinta, letra: c.banda };
  const i = Math.max(0, roles.filter((x) => !x.manda).findIndex((x) => x.clave === clave));
  return { fondo: VIVOS[i % VIVOS.length], letra: "FFFFFF" };
}

