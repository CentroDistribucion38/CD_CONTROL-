/**
 * EL CIERRE DE TURNO DE ROTURAS EN SITIO.
 *
 * «Quiero cierres de turno A, B y C mostrando, en el día y en el turno,
 *  cuántos registros hicieron, cuántos fueron reportados, cuántos fueron
 *  encontrados, a qué corresponde esa rotura, con exportables PDF, así
 *  como en el control de traspasos.»
 *
 * FUNCIONES PURAS Y SIN REACT, para que la pantalla, el PDF y el texto
 * para copiar salgan de la MISMA cuenta. Si cada uno sumara por su lado,
 * bastaría una regla distinta para que el papel dijera 41 y la pantalla
 * 40, y a partir de ahí nadie le cree a ninguno.
 *
 * ---------------------------------------------------------------------
 * EL TURNO NO SE GUARDA: SE DERIVA DE LA HORA DE REGISTRO
 * ---------------------------------------------------------------------
 * La rotura no tiene campo de turno, y agregarlo sería guardar dos veces
 * lo mismo —la hora y lo que de ella se deduce—, con la posibilidad de
 * que digan cosas distintas. Se calcula con el mismo horario que usa
 * Traspasos (hora de Colombia, UTC−5):
 *
 *   C  22:00 → 06:00   ABRE EL DÍA: lo que se registra el 22 a las
 *                      23:30 es del turno C del 23.
 *   A  06:00 → 14:00
 *   B  14:00 → 22:00
 *
 * Por eso el orden es C, A, B y no A, B, C: el día empieza por el C.
 *
 * ---------------------------------------------------------------------
 * LAS TRES CIFRAS QUE SE PIDIERON, Y POR QUÉ SUMAN
 * ---------------------------------------------------------------------
 *   REGISTROS   todas las roturas vivas del turno.
 *   REPORTADAS  las que reportó un operario OPM con su PIN.
 *   ENCONTRADAS las que alguien encontró sin dueño (van directo a cobro).
 *   SIN ORIGEN  las que no dicen cuál de las dos (lo registrado antes de
 *               que existiera el campo). NO se reparten entre las otras
 *               dos: un hueco repartido deja de verse.
 *
 *   registros = reportadas + encontradas + sin origen. SIEMPRE.
 *
 * Las ANULADAS no son registros: ya no cuentan en ningún informe, pero
 * se dicen aparte para que quien las anuló vea que no desaparecieron.
 */
import type { Etapa, Rotura } from "./datos";

export const TURNOS = ["C", "A", "B"] as const;
export type TurnoR = (typeof TURNOS)[number];

export const HORARIO_TURNO: Record<TurnoR, string> = {
  C: "22:00 · 06:00",
  A: "06:00 · 14:00",
  B: "14:00 · 22:00",
};

const DIA_MS = 86_400_000;
const COL_MS = 5 * 3_600_000;

/** «2026-09-30» sumándole `n` días, sin pasar por la zona horaria. */
export function sumaDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + n * DIA_MS).toISOString().slice(0, 10);
}

/** A qué turno y a qué día pertenece una hora. La hora se lee en Colombia,
 *  no en la zona de quien abre la pantalla: el cierre tiene que dar lo
 *  mismo en un teléfono configurado en otro país. */
export function turnoYDia(iso: string): { turno: TurnoR; dia: string; hhmm: string } {
  const local = new Date(new Date(iso).getTime() - COL_MS);
  const h = local.getUTCHours();
  const fecha = local.toISOString().slice(0, 10);
  const hhmm = local.toISOString().slice(11, 16);
  if (h >= 22) return { turno: "C", dia: sumaDias(fecha, 1), hhmm };
  if (h < 6) return { turno: "C", dia: fecha, hhmm };
  return { turno: h < 14 ? "A" : "B", dia: fecha, hhmm };
}

export type Etiqueta = { txt: string; clase: string };

/** EL ESTADO SE TRADUCE EN UN SOLO SITIO. El tablero, el cierre y el PDF
 *  lo llaman igual; tres traducciones son tres maneras de llamar distinto
 *  a lo mismo. */
export function etiquetaRotura(r: Pick<Rotura, "estado" | "etapa" | "origen" | "ol_respuesta">): Etiqueta {
  if (r.estado === "anulada") return { txt: "ANULADA", clase: "tb-gris" };
  switch (r.etapa as Etapa | undefined) {
    case "espera_ol":  return { txt: "ESPERA AL OL", clase: "tb-esp" };
    case "desacuerdo": return { txt: "EN DESACUERDO", clase: "tb-mal" };
    /* LA ENCONTRADA SE DICE: se fue a cobro de una, sin visto bueno. */
    case "cobro":      return r.origen === "encontrada" && !r.ol_respuesta
                         ? { txt: "A COBRO · ENCONTRADA", clase: "tb-ok" }
                         : { txt: "A COBRO", clase: "tb-ok" };
    case "no_cuenta":  return { txt: "NO SE COBRA", clase: "tb-gris" };
    default:
      /* SIN `etapa` —falta correr el SQL de la cadena nueva— se cae al
         estado de siempre en vez de enseñar un hueco. */
      return r.estado === "cuenta" ? { txt: "CUENTA", clase: "tb-ok" }
        : r.estado === "no_cuenta" ? { txt: "NO CUENTA", clase: "tb-gris" }
        : { txt: "ESPERANDO", clase: "tb-esp" };
  }
}

export type Fase = "espera" | "desacuerdo" | "cobro" | "no_cuenta";
/** En qué parte de la cadena va. Mismo criterio que `etiquetaRotura`, pero
 *  como clave: contar por el TEXTO de la etiqueta se rompe el día que
 *  alguien le cambie una palabra. */
export function faseRotura(r: Pick<Rotura, "estado" | "etapa">): Fase {
  switch (r.etapa as Etapa | undefined) {
    case "desacuerdo": return "desacuerdo";
    case "cobro": return "cobro";
    case "no_cuenta": return "no_cuenta";
    case "espera_ol": return "espera";
    default: return r.estado === "cuenta" ? "cobro" : r.estado === "no_cuenta" ? "no_cuenta" : "espera";
  }
}

export type OrigenR = "opm" | "encontrada" | "sin";
export const ORIGEN_TXT: Record<OrigenR, string> = {
  opm: "Reportada",
  encontrada: "Encontrada",
  sin: "Sin origen",
};

export type FilaCierre = {
  id: string;
  codigo: string;
  dia: string;
  turno: TurnoR;
  hora: string;
  material: string;
  material_nombre: string;
  tipo: "producto_terminado" | "eer";
  rotas: number;
  contaminadas: number;
  causa: string;
  proceso: string;
  area: string;
  origen: OrigenR;
  /** Quién la registró en la app. */
  registro: string;
  /** El operario OPM, cuando la reportó uno. */
  opm: string;
  estado: string;
  clase: string;
  fase: Fase;
  anulada: boolean;
};

export type Cuenta = { nombre: string; n: number; rotas: number; contaminadas: number };

export type TurnoCierre = {
  dia: string;
  turno: TurnoR;
  registros: number;
  reportadas: number;
  encontradas: number;
  sinOrigen: number;
  rotas: number;
  contaminadas: number;
  anuladas: number;
  /* En qué parte de la cadena quedaron las vivas. */
  esperanOL: number;
  desacuerdo: number;
  aCobro: number;
  noSeCobra: number;
  /* A QUÉ CORRESPONDE cada rotura. Cada lista suma `registros`. */
  porCausa: Cuenta[];
  porProceso: Cuenta[];
  porArea: Cuenta[];
  porQuien: Cuenta[];
  filas: FilaCierre[];
};

export type Cierre = {
  /** Un renglón por día y turno, el día más viejo primero y dentro del día C, A, B. */
  turnos: TurnoCierre[];
  /** Lo mismo, sumado. */
  total: TurnoCierre;
  desde: string;
  hasta: string;
  dias: number;
};

const SIN = "Sin dato";

function cuenta(filas: FilaCierre[], campo: (f: FilaCierre) => string): Cuenta[] {
  const m = new Map<string, Cuenta>();
  for (const f of filas) {
    const k = campo(f) || SIN;
    const c = m.get(k) ?? { nombre: k, n: 0, rotas: 0, contaminadas: 0 };
    c.n += 1; c.rotas += f.rotas; c.contaminadas += f.contaminadas;
    m.set(k, c);
  }
  /* Lo más frecuente primero; «Sin dato» al final a propósito: es un
     registro por arreglar, no una causa que se pueda atacar. */
  return [...m.values()].sort((a, b) =>
    (a.nombre === SIN ? 1 : 0) - (b.nombre === SIN ? 1 : 0) || b.n - a.n || a.nombre.localeCompare(b.nombre, "es"));
}

function resumir(dia: string, turno: TurnoR, todas: FilaCierre[]): TurnoCierre {
  const vivas = todas.filter((f) => !f.anulada);
  const por = (o: OrigenR) => vivas.filter((f) => f.origen === o).length;
  const fase = (t: Fase) => vivas.filter((f) => f.fase === t).length;
  return {
    dia, turno,
    registros: vivas.length,
    reportadas: por("opm"),
    encontradas: por("encontrada"),
    sinOrigen: por("sin"),
    rotas: vivas.reduce((s, f) => s + f.rotas, 0),
    contaminadas: vivas.reduce((s, f) => s + f.contaminadas, 0),
    anuladas: todas.length - vivas.length,
    esperanOL: fase("espera"),
    desacuerdo: fase("desacuerdo"),
    aCobro: fase("cobro"),
    noSeCobra: fase("no_cuenta"),
    porCausa: cuenta(vivas, (f) => f.causa),
    porProceso: cuenta(vivas, (f) => f.proceso),
    porArea: cuenta(vivas, (f) => f.area),
    porQuien: cuenta(vivas, (f) => f.registro),
    filas: todas,
  };
}

export function armarCierre(
  roturas: Rotura[],
  nombres: Record<string, string>,
  opc: { desde?: string; hasta?: string; turnos?: string[] } = {},
): Cierre {
  const turnosOk = (opc.turnos?.length ? opc.turnos : [...TURNOS]) as TurnoR[];

  const filas: FilaCierre[] = roturas.map((r) => {
    const { turno, dia, hhmm } = turnoYDia(r.reportada_en);
    const e = etiquetaRotura(r);
    return {
      id: r.id, codigo: r.codigo, dia, turno, hora: hhmm,
      material: r.material, material_nombre: r.material_nombre, tipo: r.tipo,
      rotas: r.unidades, contaminadas: r.tipo === "eer" ? 0 : (r.contaminadas ?? 0),
      causa: r.causa_nombre, proceso: r.proceso_nombre, area: r.area_nombre ?? "",
      origen: (r.origen === "opm" ? "opm" : r.origen === "encontrada" ? "encontrada" : "sin") as OrigenR,
      registro: nombres[r.reportada_por ?? ""] ?? "",
      opm: r.opm_nombre ?? "",
      estado: e.txt, clase: e.clase, fase: faseRotura(r), anulada: r.estado === "anulada",
    };
  }).filter((f) =>
    turnosOk.includes(f.turno)
    && (!opc.desde || f.dia >= opc.desde)
    && (!opc.hasta || f.dia <= opc.hasta),
  ).sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora) || a.codigo.localeCompare(b.codigo));

  const dias = [...new Set(filas.map((f) => f.dia))].sort();
  const desde = opc.desde || dias[0] || "";
  const hasta = opc.hasta || dias[dias.length - 1] || "";

  /* CON EL RANGO PUESTO SE ENSEÑAN TAMBIÉN LOS TURNOS VACÍOS. Un turno
     sin registros es una respuesta —«no se rompió nada»— y no un hueco;
     si desaparece de la lista, nadie sabe si no hubo o si no se miró.
     Con más de dos semanas se enseñan solo los que tienen algo: noventa
     tarjetas en cero no dicen nada. */
  const claves = new Set<string>();
  if (opc.desde && opc.hasta && opc.desde <= opc.hasta) {
    const n = Math.round((Date.parse(opc.hasta) - Date.parse(opc.desde)) / DIA_MS) + 1;
    if (n <= 14) for (let i = 0; i < n; i++) for (const t of turnosOk) claves.add(sumaDias(opc.desde, i) + "|" + t);
  }
  for (const f of filas) claves.add(f.dia + "|" + f.turno);

  const orden = (t: string) => TURNOS.indexOf(t as TurnoR);
  const turnos = [...claves].map((k) => {
    const [dia, turno] = k.split("|") as [string, TurnoR];
    return resumir(dia, turno, filas.filter((f) => f.dia === dia && f.turno === turno));
  }).sort((a, b) => a.dia.localeCompare(b.dia) || orden(a.turno) - orden(b.turno));

  return {
    turnos,
    total: resumir(desde, turnosOk[0] ?? "C", filas),
    desde, hasta, dias: dias.length,
  };
}

/** «Martes 29 de septiembre», sin pasar por la zona horaria. */
export function diaLargo(dia: string): string {
  if (!dia) return "—";
  const d = new Date(dia + "T12:00:00-05:00");
  const t = d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export const ddmm = (dia: string) => (dia ? dia.slice(8, 10) + "/" + dia.slice(5, 7) : "—");

/** Cómo se lee el período: «29/09 · turnos C y A», «del 28/09 al 30/09». */
export function periodoCierre(c: Cierre, turnos: string[]): string {
  const ts = turnos.length && turnos.length < 3 ? ` · turno${turnos.length > 1 ? "s" : ""} ${turnos.join(" y ")}` : "";
  if (!c.desde) return "sin registros" + ts;
  return (c.desde === c.hasta ? ddmm(c.desde) : `del ${ddmm(c.desde)} al ${ddmm(c.hasta)}`) + ts;
}

/** El mismo cierre, en texto plano para pegar en un chat. */
export function textoCierre(c: Cierre, o: { rotulo: string; filtros: string; generado: Date }): string {
  const l: string[] = [];
  l.push(`CIERRE DE ROTURAS EN SITIO · ${o.rotulo}`);
  if (o.filtros) l.push(`Filtrado: ${o.filtros}`);
  const t = c.total;
  l.push(`Registros ${t.registros} · reportadas ${t.reportadas} · encontradas ${t.encontradas}`
       + (t.sinOrigen ? ` · sin origen ${t.sinOrigen}` : "")
       + ` · ${t.rotas} rotas${t.contaminadas ? ` y ${t.contaminadas} contaminadas` : ""}`
       + (t.anuladas ? ` · ${t.anuladas} anuladas` : ""));
  for (const x of c.turnos) {
    l.push("");
    l.push(`${ddmm(x.dia)} · Turno ${x.turno} (${HORARIO_TURNO[x.turno]})`);
    if (x.registros === 0 && x.anuladas === 0) { l.push("  Sin registros."); continue }
    l.push(`  Registros ${x.registros} · reportadas ${x.reportadas} · encontradas ${x.encontradas}`
         + (x.sinOrigen ? ` · sin origen ${x.sinOrigen}` : ""));
    l.push(`  ${x.rotas} rotas${x.contaminadas ? ` y ${x.contaminadas} contaminadas` : ""}`
         + ` · a cobro ${x.aCobro} · esperan al OL ${x.esperanOL} · en desacuerdo ${x.desacuerdo}`);
    for (const f of x.filas.filter((y) => !y.anulada)) {
      l.push(`  · ${f.hora} ${f.codigo} ${f.material_nombre} — ${f.rotas} rotas`
           + (f.contaminadas ? ` + ${f.contaminadas} contam.` : "")
           + ` — ${f.causa || SIN} (${f.proceso || SIN}${f.area ? " · " + f.area : ""}) — ${ORIGEN_TXT[f.origen]}`);
    }
  }
  l.push("");
  l.push(`Armado el ${o.generado.toLocaleDateString("es-CO")} a las ${o.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`);
  return l.join("\n");
}
