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

/** Con qué días se saca el promedio: los últimos `n` días con PET, o los últimos `n` iguales al día a programar. */
export type BasePet = { modo: "dias" | "semana"; n: number };
export const TURNOS_PET = ["C", "A", "B"] as const;
export type Celda = { promedio: number; sugerido: number };

export type PlanFormato = {
  formato: number | null;
  /** Vhs al día (promedio y sugerido) y por turno; los sugeridos de los turnos suman el del día. */
  dia: Celda;
  turnos: Record<string, Celda>;
  /** Vhs de ese formato en cada día base (del más viejo al más nuevo). */
  porDia: { fecha: string; vhs: number }[];
  /** Promedio de la mitad más nueva de los días base − el de la mitad más vieja (Vhs al día). */
  tendencia: number;
  /** Vhs de cada uno de los `ventana` días hasta ayer, para la gráfica. `igual` = es un día base. */
  serie: { fecha: string; vhs: number; igual: boolean }[];
};

export type Programa = {
  fecha: string; base: BasePet;
  /** Los días que entraron al promedio (cerrados, con PET y con el formato ya registrado). */
  dias: string[];
  /** El primer día con el formato registrado: antes de ese, los Vhs no dicen qué llevaban y no cuentan. */
  inicioFormato: string | null;
  total: PlanFormato;
  formatos: PlanFormato[];
  /** La suma de los formatos supera el total: hay Vhs que llevan más de un formato. */
  mezclan: boolean;
};

const redondo = (x: number) => Math.floor(x + 0.5);
const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** El sugerido del día repartido en los turnos según su promedio (mayor residuo): C + A + B = día, siempre. */
export function repartir(diaSugerido: number, promedios: number[]): number[] {
  const suma = promedios.reduce((a, b) => a + b, 0);
  if (!suma || !diaSugerido) return promedios.map(() => 0);
  const ideal = promedios.map((p) => (p * diaSugerido) / suma);
  const base = ideal.map(Math.floor);
  let falta = diaSugerido - base.reduce((a, b) => a + b, 0);
  const orden = ideal.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of orden) { if (falta <= 0) break; base[i]++; falta-- }
  return base;
}

/**
 * CUÁNTOS VHS DE PET PROGRAMAR, POR FORMATO, AL DÍA Y POR TURNO.
 *
 * Días base: días YA CERRADOS (antes de `corte`, que es hoy), con al menos un Vh de PET y desde que el formato se
 * registra (antes de eso los Vhs salen «sin formato» y bajarían todo). Con `modo: "dias"` son los últimos `n` días
 * así; con `modo: "semana"`, los últimos `n` iguales al día a programar (mismo día de la semana).
 * Por cada formato: Vhs de ese formato cada día base (un Vh que llevó dos formatos cuenta en el que más llevó),
 * el promedio al día, y el mismo promedio por turno (C, A, B). El sugerido del día es el promedio redondeado y se
 * reparte en los turnos para que sumen exacto.
 */
export function programar(filas: FilaPet[], fecha: string, base: BasePet = { modo: "dias", n: 7 }, corte?: string, ventana = 28): Programa {
  /* Un día sirve de base si tiene PET y casi todos sus Vhs (≥ 80 %) traen el formato: los días de cuando todavía no se
     pedía el SKU (casi todo «Sin formato») bajarían cada formato y no dicen qué se llevó. */
  const vhsDia = new Map<string, Set<string>>(), conFm = new Map<string, Set<string>>();
  for (const x of filas) {
    (vhsDia.get(x.fecha) ?? vhsDia.set(x.fecha, new Set()).get(x.fecha)!).add(x.viaje);
    if (x.formato_ml != null) (conFm.get(x.fecha) ?? conFm.set(x.fecha, new Set()).get(x.fecha)!).add(x.viaje);
  }
  const conPet = new Set([...vhsDia].filter(([d, v]) => (conFm.get(d)?.size ?? 0) >= 0.8 * v.size).map(([d]) => d));
  const inicioFormato = [...conPet].sort()[0] ?? null;
  const fin = masDias(corte && corte <= fecha ? corte : fecha, -1);
  const dias: string[] = [];
  if (inicioFormato) {
    if (base.modo === "dias") {
      for (let d = fin; dias.length < base.n && d >= inicioFormato; d = masDias(d, -1)) if (conPet.has(d)) dias.unshift(d);
    } else {
      let d = masDias(fecha, -7);
      while (d > fin) d = masDias(d, -7);
      for (; dias.length < base.n && d >= inicioFormato; d = masDias(d, -7)) if (conPet.has(d)) dias.unshift(d);
    }
  }
  const enBase = new Set(dias);

  /* Vhs distintos por día · turno · formato. */
  const viajes = new Map<string, Set<string>>();
  const k = (d: string, t: string, fm: number | null | "T") => `${d}|${t}|${fm}`;
  const meter = (key: string, v: string) => (viajes.get(key) ?? viajes.set(key, new Set()).get(key)!).add(v);
  /* Cada Vh cuenta UNA vez, en el formato del que más llevó (27 estibas de 1.000 + 9 de 1.500 = un Vh de 1.000):
     así los formatos suman exacto el total de Vhs y la tabla cuadra. */
  const carga = new Map<string, Map<number | null, number>>();
  for (const x of filas) { const m = carga.get(x.viaje) ?? carga.set(x.viaje, new Map()).get(x.viaje)!; m.set(x.formato_ml, (m.get(x.formato_ml) ?? 0) + (x.estibas || 0)) }
  const principal = new Map<string, number | null>();
  for (const [v, m] of carga) principal.set(v, [...m].sort((a, b) => b[1] - a[1] || (a[0] == null ? 1 : 0) - (b[0] == null ? 1 : 0))[0][0]);
  const vistos = new Set<string>();
  for (const x of filas) {
    if (vistos.has(x.viaje)) continue; vistos.add(x.viaje);
    const fm = principal.get(x.viaje) ?? null;
    for (const t of [x.turno, "D"]) { meter(k(x.fecha, t, fm), x.viaje); meter(k(x.fecha, t, "T"), x.viaje) }
  }
  const vhs = (d: string, t: string, fm: number | null | "T") => viajes.get(k(d, t, fm))?.size ?? 0;

  const fila = (fm: number | null | "T"): PlanFormato => {
    const porDia = dias.map((d) => ({ fecha: d, vhs: vhs(d, "D", fm) }));
    const pd = prom(porDia.map((x) => x.vhs));
    const pt = TURNOS_PET.map((t) => prom(dias.map((d) => vhs(d, t, fm))));
    const sd = redondo(pd);
    const st = repartir(sd, pt);
    const xs = porDia.map((x) => x.vhs), m = Math.floor(xs.length / 2);
    const serie: PlanFormato["serie"] = [];
    for (let i = ventana - 1; i >= 0; i--) { const d = masDias(fin, -i); serie.push({ fecha: d, vhs: vhs(d, "D", fm), igual: enBase.has(d) }) }
    return {
      formato: fm === "T" ? null : fm, dia: { promedio: pd, sugerido: sd },
      turnos: Object.fromEntries(TURNOS_PET.map((t, i) => [t, { promedio: pt[i], sugerido: st[i] }])),
      porDia, tendencia: xs.length >= 4 ? prom(xs.slice(m)) - prom(xs.slice(0, xs.length - m)) : 0, serie,
    };
  };

  const formatos = formatosDe(filas.filter((x) => enBase.has(x.fecha) || x.formato_ml != null)).map(fila)
    .filter((x) => (FORMATOS_BASE as readonly (number | null)[]).includes(x.formato) || x.porDia.some((d) => d.vhs > 0));
  const total = fila("T");
  /* QUE CUADRE: si ningún Vh lleva dos formatos, los formatos suman el total y la tabla tiene que cuadrar por filas y
     por columnas. Redondear cada celda por su lado no lo garantiza (2 + 6 + 1 + 1 = 10 contra un total de 9), así que
     el total del día se reparte entre los formatos y cada formato entre los turnos, respetando lo que va a cada turno. */
  const mezclan = formatos.reduce((a, x) => a + x.dia.promedio, 0) > total.dia.promedio + 1e-9;
  if (!mezclan && formatos.length) {
    const filasDia = repartir(total.dia.sugerido, formatos.map((f) => f.dia.promedio));
    const cols = TURNOS_PET.map((t) => total.turnos[t].sugerido);
    const ideal = formatos.map((f, i) => TURNOS_PET.map((t) => (f.dia.promedio ? (f.turnos[t].promedio * filasDia[i]) / f.dia.promedio : 0)));
    const M = ideal.map((r) => r.map(Math.floor));
    const fr = filasDia.map((v, i) => v - M[i].reduce((a, b) => a + b, 0));
    const fc = cols.map((v, j) => v - M.reduce((a, r) => a + r[j], 0));
    const celdas = ideal.flatMap((r, i) => r.map((x, j) => ({ i, j, resto: x - Math.floor(x) }))).sort((a, b) => b.resto - a.resto);
    for (const pasada of [0, 1]) for (const c of celdas) {
      if ((pasada === 0 && c.resto <= 0) || fr[c.i] <= 0 || fc[c.j] <= 0) continue;
      M[c.i][c.j]++; fr[c.i]--; fc[c.j]--;
    }
    formatos.forEach((f, i) => {
      f.dia = { ...f.dia, sugerido: filasDia[i] };
      TURNOS_PET.forEach((t, j) => { f.turnos[t] = { ...f.turnos[t], sugerido: M[i][j] } });
    });
  }
  return { fecha, base, dias, inicioFormato, total, formatos, mezclan };
}
