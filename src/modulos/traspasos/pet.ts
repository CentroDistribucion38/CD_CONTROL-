/**
 * TRASPASOS · PET POR FORMATO — lo común de Traspasos › PET y Programar PET.
 *
 * Un renglón = un Vh y un SKU de PET (v_traspasos_pet). El formato (200, 330, 1000, 1.500 ml) sale del maestro.
 * Aquí: los colores de cada formato, cómo se nombra, y LA CUENTA para programar (promedio de los últimos días
 * iguales, tendencia y sugerido), que es pura y la usan la pantalla y las pruebas.
 */

export type FilaPet = {
  id: string; viaje: string; fecha: string; turno: string; hora: string | null; placa: string | null;
  origen: string | null; destino: string | null; sku: string; descripcion: string;
  formato_ml: number | null; estibas: number; pacas: number | null; hl: number | null;
};

export type Unidad = "estibas" | "pacas" | "hl";

/* Los cuatro de siempre con su color fijo (el mismo en la tabla, las tarjetas y las gráficas). Si aparece otro
   formato en el maestro, sale también, en gris, después de estos. */
export const FORMATOS_BASE = [200, 330, 1000, 1500] as const;
const COLOR: Record<number, string> = { 200: "#8B95A3", 330: "#F5B800", 1000: "#E30613", 1500: "#141414" };
export const colorFormato = (ml: number | null) => (ml != null && COLOR[ml]) || "#B9C0CA";
export const nombreFormato = (ml: number | null) =>
  ml == null ? "Sin formato" : ml >= 1000 ? `${new Intl.NumberFormat("es-CO").format(ml)} ml` : `${ml} ml`;

/** Los formatos que hay que mostrar: los de siempre y, detrás, cualquier otro que traiga la data. */
export function formatosDe(filas: { formato_ml: number | null }[]): (number | null)[] {
  const otros = [...new Set(filas.map((f) => f.formato_ml))].filter((m) => !(FORMATOS_BASE as readonly (number | null)[]).includes(m));
  return [...FORMATOS_BASE, ...otros.sort((a, b) => (a ?? 1e9) - (b ?? 1e9))];
}

export const cantidad = (f: FilaPet, u: Unidad) => (u === "estibas" ? f.estibas : u === "pacas" ? f.pacas ?? 0 : f.hl ?? 0);

/* ======================= PROGRAMAR ======================= */

const DIA_MS = 86400000;
export const masDias = (f: string, n: number) => new Date(Date.parse(f + "T12:00:00Z") + n * DIA_MS).toISOString().slice(0, 10);
export const diaSemana = (f: string) => new Date(f + "T12:00:00Z").getUTCDay(); // 0 = domingo
export const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export type PlanFormato = {
  formato: number | null;
  /** Vhs de ese formato en cada uno de los últimos días iguales (del más viejo al más nuevo). */
  iguales: { fecha: string; vhs: number }[];
  promedio: number;
  /** promedio de los 2 últimos días iguales − el de los 2 anteriores (en Vhs). */
  tendencia: number;
  sugerido: number;
  /** Vhs de cada uno de los `ventana` días antes de `fecha`, para la gráfica. `igual` = es uno de los días que
   *  entraron al promedio. */
  serie: { fecha: string; vhs: number; igual: boolean }[];
};

export type Programa = {
  fecha: string; base: number;
  /** Días iguales con datos que de verdad se usaron (puede ser menos que `base` si el registro arrancó hace poco). */
  usados: number;
  total: { iguales: { fecha: string; vhs: number }[]; promedio: number; sugerido: number; tendencia: number };
  formatos: PlanFormato[];
  /** La suma de los sugeridos por formato supera al total: hay Vhs que llevan más de un formato. */
  mezclan: boolean;
};

/**
 * CUÁNTOS VHS PROGRAMAR. Para el día `fecha`: los últimos `base` días de la misma semana (mismo día de la semana)
 * desde que hay registro de PET, cuántos Vhs llevaron cada formato (un Vh cuenta en cada formato que llevó) y
 * cuántos Vhs distintos salieron. El sugerido es el promedio redondeado (0,5 sube). La tendencia compara los 2
 * últimos con los 2 anteriores. `turno` = "D" para el día entero o C / A / B.
 * `corte` = el primer día que todavía no cerró (hoy): ni ese ni los siguientes cuentan como día igual, porque
 * medio día de registros bajaría el promedio.
 */
export function programar(filas: FilaPet[], fecha: string, base = 4, turno = "D", ventana = 28, corte?: string): Programa {
  const f = turno === "D" ? filas : filas.filter((x) => x.turno === turno);
  const desdeData = filas.reduce((m, x) => (x.fecha < m ? x.fecha : m), "9999-12-31");
  const iguales: string[] = [];
  let d0 = masDias(fecha, -7);
  while (corte && d0 >= corte) d0 = masDias(d0, -7);
  for (let d = d0; iguales.length < base && d >= desdeData; d = masDias(d, -7)) iguales.unshift(d);

  const vhsDe = (dia: string, fm?: number | null) =>
    new Set(f.filter((x) => x.fecha === dia && (fm === undefined || x.formato_ml === fm)).map((x) => x.viaje)).size;
  const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const redondo = (x: number) => Math.floor(x + 0.5);
  const tend = (xs: number[]) => (xs.length >= 4 ? prom(xs.slice(-2)) - prom(xs.slice(-4, -2)) : 0);

  /* La gráfica termina en el último día cerrado (ayer) o en la víspera del día a programar, lo que llegue antes. */
  const fin = corte && corte <= fecha ? masDias(corte, -1) : masDias(fecha, -1);
  const formatos = formatosDe(filas).map((fm): PlanFormato => {
    const ig = iguales.map((d) => ({ fecha: d, vhs: vhsDe(d, fm) }));
    const p = prom(ig.map((x) => x.vhs));
    const serie: PlanFormato["serie"] = [];
    for (let i = ventana - 1; i >= 0; i--) {
      const d = masDias(fin, -i);
      serie.push({ fecha: d, vhs: d >= desdeData ? vhsDe(d, fm) : 0, igual: iguales.includes(d) });
    }
    return { formato: fm, iguales: ig, promedio: p, tendencia: tend(ig.map((x) => x.vhs)), sugerido: redondo(p), serie };
  }).filter((x) => (FORMATOS_BASE as readonly (number | null)[]).includes(x.formato) || x.serie.some((s) => s.vhs > 0));

  const tig = iguales.map((d) => ({ fecha: d, vhs: vhsDe(d) }));
  const tp = prom(tig.map((x) => x.vhs));
  const total = { iguales: tig, promedio: tp, sugerido: redondo(tp), tendencia: tend(tig.map((x) => x.vhs)) };
  return {
    fecha, base, usados: iguales.length, total, formatos,
    mezclan: formatos.reduce((a, x) => a + x.sugerido, 0) > total.sugerido,
  };
}
