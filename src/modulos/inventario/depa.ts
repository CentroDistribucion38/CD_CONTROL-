/**
 * DEPA (la depaletizadora de cada línea) en el Análisis de diferencia.
 * Lo normal es que salga del corte inicial del día (Cortes). Si no hay corte, se sube en la plantilla de novedades con un tipo «DEPA L1»,
 * «DEPA L2», «DEPA L4» o «DEPA L6» (suma al CONTEO, y su caja plástica sale sola del envase).
 */
/** En la línea (DEPA) algunos envases salen en otra caja que la del maestro: la Flint 250 sale en café 225. */
export const CAJA_EN_DEPA: Record<string, string> = { "3501225": "3500231" };

const sinTilde = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
/** «DEPA L1» → «L1». null si el tipo no es de la DEPA. */
export const lineaDeDepa = (tipo: unknown): string | null => { const m = /^DEPA\s*(.*)$/.exec(sinTilde(tipo)); return m ? (m[1] || "").replace(/\s+/g, "") || "—" : null };
