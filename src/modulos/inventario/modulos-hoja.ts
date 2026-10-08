/* ===================================================================
   LOS MÓDULOS QUE TRAE LA HOJA DE CONTEO, CALLE POR CALLE

   «NO ESTÁN COMPLETAS LAS UBICACIONES, O SEA, PORQUE NO SALEN.» El formato
   de conteo en Excel (hoja «CAPACIDAD DE MODULOS», columnas A, B, C, D, E,
   EST, ALAR y P) trae para cada calle la lista de módulos que se pueden
   escoger: del 01 al 36 y, además, sitios que no son una posición numerada —
   PASILLO, TANDEM, DEPA, PALE, H, TUNEL—. La pantalla solo ofrecía lo que
   ya estaba cargado en el maestro, así que esos no salían.

   LO QUE YA SALE NO SE TOCA: esta lista solo AGREGA lo que falte. Y no
   hace falta cargarlo en el maestro antes: al anotar, la base da de alta la
   ubicación (`conteo_ubicacion_asegurar`), como con cualquier módulo a medias.

   LOS QUE NO SON NUMERADOS NO TIENEN LADO (un pasillo no tiene izquierda y
   derecha): se cuentan como una sola posición, igual que EST07 o JAULA_PNC.
   =================================================================== */
const numerados = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, "0"));

export const MODULOS_DE_LA_HOJA: Record<string, string[]> = {
  A: [...numerados(36), "DEPA", "PALE", "H", "TANDEM", "TUNEL", "PASILLO"],
  B: [...numerados(36), "DEPA", "PALE", "H", "TANDEM", "TUNEL"],
  C: [...numerados(36), "PASILLO", "TANDEM", "DEPA", "PALE", "H"],
  D: [...numerados(36), "DEPA", "PALE", "H", "TUNEL"],
  E: [...numerados(36), "DEPA", "PALE", "H", "TANDEM", "TUNEL"],
  EST: [...numerados(36), "TUNEL", "H", "PASILLO"],
  P: numerados(49),
  /* La calle H: módulos 01 a 04, con sus dos lados como las demás calles numeradas. */
  H: numerados(4),
  ALAR: ["A", "B", "C", "D", "E", "P", "BAHIA 6"],
  /* FÁBRICA es una calle y sus módulos son las líneas de producción: L2, L4 y L6.
     Sin lado: una línea se cuenta como una sola posición. */
  FABRICA: ["L2", "L4", "L6"],
};

/** Un módulo que empieza por número tiene izquierda y derecha; un pasillo, un tándem o un «H», no. */
export const moduloConLados = (modulo: string): boolean => /^\d/.test(modulo);

/** Lo que la hoja trae y el maestro todavía no: [{calle, modulo}], sin repetir lo que ya hay. */
export function modulosQueFaltan(
  yaHay: { calle: string; modulo: string }[], calle: string,
): { calle: string; modulo: string }[] {
  const hay = new Set(yaHay.map((u) => `${u.calle}|${u.modulo}`));
  const calles = calle === "" ? Object.keys(MODULOS_DE_LA_HOJA) : MODULOS_DE_LA_HOJA[calle] ? [calle] : [];
  const faltan: { calle: string; modulo: string }[] = [];
  for (const c of calles) for (const m of MODULOS_DE_LA_HOJA[c]) if (!hay.has(`${c}|${m}`)) faltan.push({ calle: c, modulo: m });
  return faltan;
}
