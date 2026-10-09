/**
 * LAS UBICACIONES DEL CASCO SALEN DEL CONTEO — LA REGLA, SIN NADA DE SERVIDOR.
 *
 * La usan Control y el tablero (navegador), la lectura del inventario y el Excel (servidor).
 *
 * CADA COLUMNA DEL CASCO TIENE SU ESTADO EN EL CONTEO:
 *   AG22 Bodega ·  «Inventario casco de vidrio» ← BAJA       · «Extrasucio con baja» ← EXTRASUCIO
 *   AG18 Fábrica · «Inventario casco de vidrio» ← LAVADO     · «Lavado con baja»     ← LAVADO
 * y cada tabla solo con sus ubicaciones (Fábrica = FABRICA_…, Bodega = las demás).
 *
 * «Del SKU 3501226 tengo 1 estiba en Inventario casco de vidrio, pero en el conteo está como
 *  EXTRASUCIO: esa ubicación no corresponde. En el informe debe aparecer vacía, y en el Excel, en
 *  el Análisis, como comentario.» → la ubicación de un renglón es SOLO la del estado que le
 * corresponde a la columna donde tiene estibas; lo que no cuadra no se pone: se avisa.
 */
import { DE_FABRICA, esUbicacionFabrica } from "./ubicacion-sitio";

export type RenglonUbic = {
  codigo: string; ubicacion: string | null; ubicacion_combinada: string | null;
  calle?: string | null; estado_envase: string | null;
  /** Día del conteo (aaaa-mm-dd): cada estado toma su último día. */
  fecha: string;
};

export type UbicacionesInventario = {
  /** El último día con conteo enviado. */
  fecha: string;
  /** centro → { día más reciente, estado → sku → «P_16_DER - P_20_IZQ» } (solo las ubicaciones de ese almacén). */
  porCentro: Record<string, { fecha: string; porEstado: Record<string, Record<string, string>> }>;
  /** Lo contado de cada material en CUALQUIER estado y zona (último día de cada estado), para explicar lo que no cuadra. */
  todo: Record<string, { estado: string; fabrica: boolean; ubic: string }[]>;
};

/** Qué estado del conteo le corresponde a cada columna de cada almacén. */
export const COLUMNAS_CENTRO: Record<string, { inv: string[]; baja: string[] }> = {
  AG18: { inv: ["LAVADO"], baja: ["LAVADO"] },
  AG22: { inv: ["BAJA"], baja: ["EXTRASUCIO"] },
};
export const estadosDeCentro = (centro: string) => {
  const c = COLUMNAS_CENTRO[centro.toUpperCase()];
  return c ? [...new Set([...c.inv, ...c.baja])] : [];
};

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
const est = (x: { estado_envase: string | null }) => (x.estado_envase ?? "").trim().toUpperCase();
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** Las ubicaciones de unos renglones, en una línea, sin la palabra del estado: «P_16_IZQ BAJA Andina» → «P_16_IZQ (Andina)». */
export function lineaDeUbicaciones(rs: RenglonUbic[]): string {
  const nombres = new Set<string>();
  for (const x of rs) {
    const estado = est(x);
    const base = (x.ubicacion ?? x.ubicacion_combinada ?? "").trim();
    const comb = (x.ubicacion_combinada ?? base).trim();
    const zona = comb.startsWith(base) ? comb.slice(base.length).trim() : "";
    const resto = estado && zona.toUpperCase().startsWith(estado) ? zona.slice(estado.length).trim() : zona;
    const nombre = base && resto ? `${base} (${resto})` : base || comb;
    if (nombre) nombres.add(nombre);
  }
  return [...nombres].sort(natural).join(" - ");
}

/** Junta dos o más líneas «A - B» sin repetir. */
export const juntarLineas = (ls: string[]) =>
  [...new Set(ls.flatMap((l) => l.split(/\s+-\s+/)).map((u) => u.trim()).filter(Boolean))].sort(natural).join(" - ");

/** Último día de cada grupo, y sus renglones de ese día. */
function delUltimoDia(rs: RenglonUbic[]) {
  const dia = rs.reduce((m, x) => (x.fecha > m ? x.fecha : m), "");
  return { dia, rs: rs.filter((x) => x.fecha === dia) };
}
function porSku(rs: RenglonUbic[]) {
  const m = new Map<string, RenglonUbic[]>();
  for (const x of rs) {
    const k = String(x.codigo ?? "").trim();
    if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(x);
  }
  return m;
}

/** Arma lo que necesita el casco a partir de los renglones del conteo (con su día). */
export function armarUbicaciones(rs: RenglonUbic[]): UbicacionesInventario {
  const fecha = rs.reduce((m, x) => (x.fecha > m ? x.fecha : m), "");
  const porCentro: UbicacionesInventario["porCentro"] = {};
  for (const centro of Object.keys(COLUMNAS_CENTRO)) {
    const porEstado: Record<string, Record<string, string>> = {};
    let dia = "";
    for (const estado of estadosDeCentro(centro)) {
      const u = delUltimoDia(rs.filter((x) => est(x) === estado && esUbicacionFabrica(x.ubicacion ?? x.ubicacion_combinada) === DE_FABRICA[centro]));
      if (!u.dia) continue;
      if (u.dia > dia) dia = u.dia;
      const mapa: Record<string, string> = {};
      for (const [sku, xs] of porSku(u.rs)) { const l = lineaDeUbicaciones(xs); if (l) mapa[sku] = l }
      porEstado[estado] = mapa;
    }
    if (dia) porCentro[centro] = { fecha: dia, porEstado };
  }
  /* TODO LO CONTADO, por estado y zona, del último día de cada estado: para decir «lo tiene como X en Y». */
  const todo: UbicacionesInventario["todo"] = {};
  const estados = [...new Set(rs.map(est).filter(Boolean))];
  for (const estado of estados) {
    const u = delUltimoDia(rs.filter((x) => est(x) === estado));
    for (const fab of [true, false]) {
      const suyos = u.rs.filter((x) => esUbicacionFabrica(x.ubicacion ?? x.ubicacion_combinada) === fab);
      for (const [sku, xs] of porSku(suyos)) {
        const l = lineaDeUbicaciones(xs);
        if (l) (todo[sku] ??= []).push({ estado, fabrica: fab, ubic: l });
      }
    }
  }
  return { fecha, porCentro, todo };
}

export type ResultadoFila = {
  /** La ubicación que le toca al renglón (vacía si no cuadra con el conteo). */
  puesto: string;
  /** Lo que no cuadra, en palabras, para el Análisis y la pantalla (no para el informe). */
  avisos: string[];
};

/**
 * La ubicación de un renglón del casco según DÓNDE tiene estibas:
 *   inventario ≠ 0 → las del estado de «Inventario casco de vidrio»;
 *   baja ≠ 0       → las del estado de la columna de baja.
 * Si una columna con estibas no tiene ese material en su estado en el conteo, esa parte queda vacía
 * y se avisa (diciendo, si lo hay, cómo SÍ está en el conteo).
 */
export function ubicacionDeFila(
  u: UbicacionesInventario, centro: string, sku: string, inv: number, baja: number,
  rotuloBaja = "con baja",
): ResultadoFila | null {
  const c = centro.toUpperCase();
  const cfg = COLUMNAS_CENTRO[c];
  const sitio = u.porCentro[c];
  if (!cfg || !sitio) return null;
  const zona = DE_FABRICA[c] ? "Fábrica" : "Bodega";
  const partes: string[] = [];
  const avisos: string[] = [];
  const pide = (valor: number, estados: string[], columna: string) => {
    if (!valor) return;
    const ls = estados.map((e) => sitio.porEstado[e]?.[sku]).filter((l): l is string => !!l);
    if (ls.length) { partes.push(...ls); return }
    const otros = (u.todo[sku] ?? []).filter((o) => !(estados.includes(o.estado) && o.fabrica === DE_FABRICA[c]));
    avisos.push(
      `Casco tiene ${nf.format(valor)} est. en «${columna}», pero el conteo no lo tiene en ${estados.join("/")} en ${zona}` +
      (otros.length
        ? `: lo tiene como ${otros.map((o) => `${o.estado}${o.fabrica !== DE_FABRICA[c] ? ` (${o.fabrica ? "Fábrica" : "Bodega"})` : ""} en ${o.ubic}`).join("; ")}.`
        : ": no aparece en el conteo."),
    );
  };
  pide(inv, cfg.inv, "Inventario casco de vidrio");
  pide(baja, cfg.baja, rotuloBaja);
  return { puesto: juntarLineas(partes), avisos };
}
