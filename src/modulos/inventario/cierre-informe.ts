/**
 * EL INFORME DEL CIERRE DEL DÍA (análisis de diferencia) — los bloques para el PDF y el Word.
 *
 * «Una vez hecho el análisis, lo más rápido: el informe PDF del cierre del día, igual de presentable que el
 *  de evidencias: resumen, top diferencias, ajustes hechos y pendientes, listo para enviar a la jefatura.»
 *
 * REHECHO CON EL DISEÑO APROBADO (nov 2026): tamaño carta, logo de Bavaria arriba en cada hoja, la B de marca
 * de agua, estilo sobrio —sin tarjetas de colores ni pastillas: rojo SOLO para negativos y los estados como
 * texto (Pendiente / Parcial / Hecho)—, el «Resumen del cierre» como tabla de dos columnas y una página nueva
 * que compara con los dos últimos inventarios fiscales.
 *
 * Se pinta con `cierre-pdf.ts` (PDF) y `evidencias-word.ts` en modo sobrio (Word). Aquí solo se decide QUÉ
 * dice. Es pura (no toca la base): recibe los ajustes del día con lo marcado como hecho, y los de los fiscales.
 */
import type { Bloque, CeldaT, Col } from "./evidencias-informe";
import { COMPENSA, analisisFinal, type FilaAjuste, type FilaFinal } from "./compensa";
import type { Cambio, Recurrente } from "./analisis-extra";

export const NOMBRE_CIERRE = "INFORME DE CIERRE · ANÁLISIS DE DIFERENCIA BODEGA 38";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
/* Guion corriente y no «−»: la letra del PDF no trae el signo menos tipográfico. */
const sg = (v: number) => (v > 0 ? "+" : v < 0 ? "-" : "") + nf.format(Math.abs(v));
/** El ÚNICO color del informe: rojo para lo negativo. Lo demás va en tinta. */
export const ROJO = "#B3261E";
export const GRIS = "#6B7078";
/** Una cifra con signo: roja si es negativa. */
const cs = (v: number, bold = false): CeldaT => ({ x: sg(v), color: v < 0 ? ROJO : undefined, bold });
const tot = (v: number): CeldaT => cs(v, true);

export type OpcionesCierre = {
  /** El día del análisis, AAAA-MM-DD. */
  fecha: string;
  nombre: string; fechaLarga: string; generado: string; quien: string;
  guardadoEn: string | null; guardadoPor: string | null; finalEn: string | null;
};

/** Lo de las hojas aparte: precios (valor $), recurrencia y contra el día anterior. Sin ellos, el informe sale sin esas partes. */
export type ExtrasCierre = {
  precios: Record<string, { precio: number; fuente: string }>;
  recurrencia: { desde: string; fechas: number; filas: Recurrente[] };
  ayer: { anterior: string | null; filas: Cambio[] };
};

/** UN INVENTARIO FISCAL CON QUÉ COMPARAR: su fecha, su nombre y el análisis de diferencia guardado ese día
 *  (`null` = ese día no tiene análisis guardado: la columna sale con «—» y el informe lo dice). */
export type FiscalComparado = { fecha: string; nombre: string; filas: FilaAjuste[] | null;
  /** false = un día guardado que no fue inventario fiscal (escogido con «Cambiar fechas»). */
  esFiscal: boolean };
/** Los dos fiscales con qué comparar (en cualquier orden: el informe pone primero el más reciente).
 *  `porDefecto` = son los dos más recientes antes del día; si no, se escogieron con «Cambiar fechas». */
export type ComparacionFiscal = { fiscales: FiscalComparado[]; porDefecto: boolean };

/* Pesos con guion corriente (la letra del PDF no trae «−»). */
const $ = (v: number) => (v < 0 ? "-$ " : "$ ") + nf.format(Math.abs(Math.round(v)));
const $c = (v: number, bold = false): CeldaT => ({ x: (v > 0 ? "+" : "") + $(v), color: v < 0 ? ROJO : undefined, bold });
const diaCorto = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
/** «30 oct 2026» — el rótulo de los fiscales; «9 nov» para la columna de hoy. */
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const fechaFiscal = (iso: string) => `${Number(iso.slice(8, 10))} ${MES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const diaMes = (iso: string) => `${Number(iso.slice(8, 10))} ${MES[Number(iso.slice(5, 7)) - 1]}`;

/* Los estados van COMO TEXTO: Pendiente en rojo, Hecho en tinta, Parcial y Manual en gris. */
const PENDIENTE: CeldaT = { x: "Pendiente", color: ROJO, bold: true };
const HECHO: CeldaT = { x: "Hecho", bold: true };
const HECHA: CeldaT = { x: "Hecha", bold: true };
const PARCIAL: CeldaT = { x: "Parcial", color: GRIS, bold: true };
const MANUAL: CeldaT = { x: "Manual", color: GRIS, bold: true };

export const OJO_PORTADA = "INVENTARIO · BALANCE · BODEGA 38";
export const OJO_CIERRE = "INVENTARIO · CIERRE DEL ANÁLISIS DE DIFERENCIA";
export const OJO_FISCAL = "INVENTARIO · COMPARACIÓN CON INVENTARIOS FISCALES";

export function construirCierre(aj: FilaAjuste[], o: OpcionesCierre, x?: ExtrasCierre, comp?: ComparacionFiscal | null): Bloque[] {
  const F = analisisFinal(aj);
  const pu = (c: string) => x?.precios[c]?.precio ?? 0;
  const V = F.map((f) => ({ ...f, p: x?.precios[f.codigo]?.precio ?? null, vDif: f.diferencia * pu(f.codigo), vAj: f.ajuste * pu(f.codigo), vFin: f.difFinal * pu(f.codigo) }));
  const vPor = new Map(V.map((f) => [f.codigo, f]));
  const s = <T,>(xs: T[], k: (f: T) => number) => xs.reduce((t, f) => t + k(f), 0);
  const sap = s(F, (f) => f.sap), conteo = s(F, (f) => f.conteo);
  const ini = s(F, (f) => f.diferencia), fin = s(F, (f) => f.difFinal);
  const compensado = s(F, (f) => Math.max(0, f.compensa));
  const sobra = s(F, (f) => Math.max(0, f.ajuste)), falta = s(F, (f) => Math.min(0, f.ajuste));
  const movido = s(F, (f) => f.movComp + f.movAjuste);
  const pend = F.filter((f) => f.difFinal !== 0);
  const hechos = F.filter((f) => (f.compensa !== 0 && f.compHecha) || (f.ajusteHecho ?? 0) !== 0);
  const absIni = s(F, (f) => Math.abs(f.diferencia)), absFin = s(F, (f) => Math.abs(f.difFinal));
  const avance = absIni ? Math.round((1 - absFin / absIni) * 100) : 100;
  const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  const vIni = s(V, (f) => f.vDif), vSobra = s(V, (f) => Math.max(0, f.vAj)), vFalta = s(V, (f) => Math.min(0, f.vAj)), vFin = s(V, (f) => f.vFin);
  let num = 0;
  const sig = () => String(++num);

  const b: Bloque[] = [];
  b.push({
    t: "portada", titulo: o.nombre, sub: `${o.fechaLarga.replace(/^./, (c) => c.toUpperCase())} · conteo contra SAP, en unidades`,
    meta: [[
      o.guardadoEn ? `Análisis guardado el ${cuando(o.guardadoEn)}${o.guardadoPor ? `, por ${o.guardadoPor}` : ""}` : "Análisis sin guardar",
      o.finalEn ? `Análisis final guardado el ${cuando(o.finalEn)}` : "Análisis final sin guardar: lo que se ve es lo marcado como hecho hasta ahora",
    ].join(" · "), `Generado por ${o.quien} · ${o.generado}`],
  });

  /* 1 · RESUMEN DEL CIERRE: una tabla de dos columnas (rótulo y cifra a cada lado), debajo de la portada. */
  b.push({ t: "modulo", n: sig(), titulo: "Resumen del cierre", seguido: true });
  const pares: Extract<Bloque, { t: "pares" }>["filas"] = [
    { a: ["SAP", n(sap)], b: ["Compensado R / NR", n(compensado)] },
    { a: ["Conteo", n(conteo)], b: ["Ajuste sobrante (sube SAP)", cs(sobra, true)] },
    { a: ["Diferencia inicial", cs(ini, true)], b: ["Ajuste faltante (baja SAP)", cs(falta, true)] },
    { a: ["Diferencia final", cs(fin, true)], b: [`Avance (movido en SAP ${sg(movido)})`, `${avance} %`], fuerte: true },
  ];
  if (x) {
    pares.push({ a: ["Valor de la diferencia", $c(vIni, true)], b: ["Valor sobrante (sube SAP)", $c(vSobra, true)], sep: true });
    pares.push({ a: ["Valor pendiente", $c(vFin, true)], b: ["Valor faltante (baja SAP)", $c(vFalta, true)] });
  }
  b.push({ t: "pares", filas: pares });

  const top1 = [...F].sort((a, c) => Math.abs(c.diferencia) - Math.abs(a.diferencia))[0];
  b.push({ t: "p", texto:
    `El análisis del día comparó ${n(conteo)} unidades contadas contra ${n(sap)} en SAP y dejó una diferencia de ${sg(ini)} unidades en ${F.filter((f) => f.diferencia !== 0).length} códigos` +
    (top1 && top1.diferencia ? `; la mayor es ${top1.codigo} ${top1.descripcion} (${sg(top1.diferencia)}).` : ".") +
    (compensado ? ` Del retornable contado en estado NUEVO se compensaron ${n(compensado)} unidades contra su NR nuevo.` : "") +
    (hechos.length ? ` Ya se movieron en SAP ${sg(movido)} unidades en ${hechos.length} códigos;` : " Todavía no se ha marcado ningún movimiento como hecho;") +
    (pend.length ? ` siguen ${pend.length} códigos con diferencia, por ${sg(fin)} unidades.` : " con eso, la bodega queda cuadrada contra SAP.") +
    (x ? ` En pesos, la diferencia del día vale ${$(vIni)}; queda pendiente ${$(vFin)}.` : "") +
    (x && x.recurrencia.filas.length ? ` ${x.recurrencia.filas.length} código${x.recurrencia.filas.length === 1 ? "" : "s"} se repite${x.recurrencia.filas.length === 1 ? "" : "n"} 3 o más días seguidos.` : "") });

  /* Por familia, en la misma hoja del resumen. */
  const fams = [...new Set(F.map((f) => f.familia))];
  b.push({ t: "sub", texto: "Cómo quedó cada familia" });
  b.push({ t: "tabla", total: true,
    cols: [{ h: "Familia", w: 46 }, { h: "SAP", w: 24, al: "r" }, { h: "Conteo", w: 24, al: "r" }, { h: "Dif. inicial", w: 21, al: "r" }, { h: "Movido", w: 19, al: "r" }, { h: "Dif. final", w: 21, al: "r" }, ...(x ? [{ h: "Valor dif.", w: 28, al: "r" as const }] : [])],
    filas: [...fams.map((fam) => {
      const xs = V.filter((f) => f.familia === fam);
      const mov = s(xs, (f) => f.movComp + f.movAjuste);
      return [fam, n(s(xs, (f) => f.sap)), n(s(xs, (f) => f.conteo)), cs(s(xs, (f) => f.diferencia)), mov ? cs(mov) : "0", cs(s(xs, (f) => f.difFinal)), ...(x ? [$c(s(xs, (f) => f.vDif))] : [])] as CeldaT[];
    }), ["TOTAL", n(sap), n(conteo), tot(ini), tot(movido), tot(fin), ...(x ? [$c(vIni, true)] : [])]] });

  /* 2 · LAS DIFERENCIAS MÁS GRANDES, LAS COMPENSACIONES Y LOS AJUSTES — hoja nueva. */
  const top = [...F].filter((f) => f.diferencia !== 0).sort((a, c) => Math.abs(c.diferencia) - Math.abs(a.diferencia)).slice(0, 10);
  const colsTop: Col[] = x
    ? [{ h: "Código", w: 16 }, { h: "Descripción", w: 52 }, { h: "SAP", w: 22, al: "r" }, { h: "Conteo", w: 22, al: "r" }, { h: "Diferencia", w: 20, al: "r" }, { h: "Valor", w: 26, al: "r" }, { h: "Final", w: 20, al: "r" }]
    : [{ h: "Código", w: 16 }, { h: "Descripción", w: 62 }, { h: "SAP", w: 24, al: "r" }, { h: "Conteo", w: 24, al: "r" }, { h: "Diferencia", w: 22, al: "r" }, { h: "Final", w: 22, al: "r" }];
  b.push({ t: "modulo", n: sig(), titulo: "Diferencias más grandes del día, antes y después de los ajustes", ojo: OJO_CIERRE });
  b.push({ t: "tabla", cols: colsTop, filas: top.map((f) => x
      ? [f.codigo, f.descripcion, n(f.sap), n(f.conteo), cs(f.diferencia), $c(vPor.get(f.codigo)?.vDif ?? 0), cs(f.difFinal)]
      : [f.codigo, f.descripcion, n(f.sap), n(f.conteo), cs(f.diferencia), cs(f.difFinal)]),
    nota: top.length ? undefined : "No hubo diferencias." });

  const por = new Map(F.map((f) => [f.codigo, f]));
  const filasComp: CeldaT[][] = COMPENSA.map(([r, nr]) => {
    const a = por.get(r), c = por.get(nr);
    const m = Math.abs(a?.compensa ?? 0);
    return [`${r} / ${nr}`, a?.descripcion ?? "—", n(a?.nuevo ?? 0), c ? cs(c.diferencia) : "—", n(m), m ? (a?.compHecha && c?.compHecha ? HECHA : PENDIENTE) : "—"];
  });
  b.push({ t: "sub", texto: "Compensaciones retornable / NR nuevo", extra: "lo contado en estado NUEVO" });
  b.push({ t: "tabla", cols: [{ h: "Par", w: 30 }, { h: "Retornable", w: 52 }, { h: "Contado NUEVO", w: 24, al: "r" }, { h: "Dif. NR", w: 22, al: "r" }, { h: "Compensa", w: 22, al: "r" }, { h: "Estado", w: 18, al: "r" }], filas: filasComp });

  /* Los ajustes: lo que se suma o se resta a SAP (lo sugerido y lo que se ajustó de verdad en la pantalla de
     Ajustes, incluso en un código que ya cuadraba por compensación). Las observaciones van en el anexo. */
  const conAjuste = F.filter((f) => f.ajuste !== 0 || (f.ajusteHecho ?? 0) !== 0)
    .sort((a, c) => Math.max(Math.abs(c.ajuste), Math.abs(c.ajusteHecho ?? 0)) - Math.max(Math.abs(a.ajuste), Math.abs(a.ajusteHecho ?? 0)));
  const estadoAj = (f: FilaFinal): CeldaT => {
    const h = f.ajusteHecho ?? 0;
    if (h === 0) return PENDIENTE;
    if (f.ajuste === 0) return MANUAL;
    if (h === f.ajuste) return HECHO;
    return PARCIAL;
  };
  const conObs = F.filter((f) => f.observacion.trim());
  b.push({ t: "sub", texto: "Ajustes en SAP", extra: conAjuste.length ? `${conAjuste.length} códigos · ${sg(s(F, (f) => f.ajusteHecho ?? 0))} unidades ajustadas` : undefined });
  b.push({ t: "tabla", cols: [{ h: "Código", w: 15 }, { h: "Descripción", w: 46 }, { h: "Diferencia", w: 19, al: "r" }, { h: "Compens.", w: 17, al: "r" }, { h: "Sugerido", w: 19, al: "r" }, { h: "En SAP", w: 18, al: "r" }, { h: "Final", w: 18, al: "r" }, { h: "Estado", w: 16, al: "r" }],
    filas: conAjuste.map((f) => [f.codigo, f.descripcion, cs(f.diferencia), f.movComp ? sg(f.movComp) : "—", f.ajuste ? cs(f.ajuste) : "—", (f.ajusteHecho ?? 0) !== 0 ? sg(f.ajusteHecho ?? 0) : "—", cs(f.difFinal), estadoAj(f)]),
    nota: conAjuste.length
      ? `Manual: se ajustó un código que no tenía ajuste sugerido (por ejemplo, uno que cuadraba por compensación).${conObs.length ? " Las observaciones completas de cada código van en el anexo, no en la tabla." : ""}`
      : "Todavía no hay ajustes: lo que sumes o restes en Análisis → Ajustes aparece aquí." });

  /* 3 · CONTRA LOS DOS ÚLTIMOS INVENTARIOS FISCALES — hoja nueva. */
  if (comp && comp.fiscales.length) fiscales(b, sig(), F, o, comp);

  /* AJUSTES HECHOS Y PENDIENTES */
  b.push({ t: "modulo", n: sig(), titulo: "Ajustes hechos y pendientes", sub: hechos.length ? `${hechos.length} códigos · ${sg(movido)} unidades movidas en SAP` : "Ninguno marcado como hecho", ojo: OJO_CIERRE });
  b.push({ t: "sub", texto: "Hechos en SAP" });
  b.push({ t: "tabla", cols: [{ h: "Código", w: 16 }, { h: "Descripción", w: 64 }, { h: "Compensación", w: 24, al: "r" }, { h: "Ajuste", w: 24, al: "r" }, { h: "SAP final", w: 26, al: "r" }],
    filas: hechos.map((f) => [f.codigo, f.descripcion, f.movComp ? cs(f.movComp) : "—", f.movAjuste ? cs(f.movAjuste) : "—", n(f.sapFinal)]),
    nota: hechos.length ? undefined : "Marca en Ajustes lo que ya se movió en SAP para que salga aquí.", compacta: true });
  b.push({ t: "sub", texto: "Pendientes", extra: pend.length ? `${pend.length} códigos siguen con diferencia (${sg(fin)})` : "nada, todo cuadra" });
  if (pend.length) b.push({ t: "tabla", compacta: true,
    cols: x ? [{ h: "Código", w: 16 }, { h: "Descripción", w: 52 }, { h: "Dif. final", w: 22, al: "r" }, { h: "Valor", w: 26, al: "r" }, { h: "Qué falta", w: 44 }] : [{ h: "Código", w: 16 }, { h: "Descripción", w: 60 }, { h: "Dif. final", w: 24, al: "r" }, { h: "Qué falta", w: 50 }],
    filas: [...pend].sort((a, c) => Math.abs(c.difFinal) - Math.abs(a.difFinal)).map((f) => {
      const q: string[] = [];
      if (f.compensa !== 0 && !f.compHecha) q.push(`compensar ${n(Math.abs(f.compensa))}`);
      const restoAj = f.ajuste - (f.ajusteHecho ?? 0);
      if (restoAj !== 0) q.push(`ajuste ${sg(restoAj)} (${restoAj > 0 ? "sube" : "baja"} SAP)`);
      return x ? [f.codigo, f.descripcion, cs(f.difFinal), $c(vPor.get(f.codigo)?.vFin ?? 0), q.join(" · ") || "revisar"]
        : [f.codigo, f.descripcion, cs(f.difFinal), q.join(" · ") || "revisar"];
    }) });

  if (x) {
    /* VALOR EN PESOS */
    const conValor = V.filter((f) => f.diferencia !== 0 || f.ajuste !== 0).sort((a, c) => Math.abs(c.vDif) - Math.abs(a.vDif));
    const sinPrecio = conValor.filter((f) => f.p == null);
    b.push({ t: "modulo", n: sig(), titulo: "Valor en pesos", sub: "Unidades por precio por unidad: el de la botella del MM60 y, si no lo tiene, el costo del maestro de Pasivos", ojo: OJO_CIERRE });
    b.push({ t: "tabla", compacta: true, total: true,
      cols: [{ h: "Código", w: 15 }, { h: "Descripción", w: 43 }, { h: "Precio u.", w: 19, al: "r" }, { h: "Diferencia", w: 20, al: "r" }, { h: "Valor dif.", w: 28, al: "r" }, { h: "Valor ajuste", w: 28, al: "r" }, { h: "Valor pend.", w: 28, al: "r" }],
      filas: [...conValor.map((f) => [f.codigo, f.descripcion, f.p != null ? $(f.p) : { x: "Sin precio", color: ROJO, bold: true }, cs(f.diferencia), $c(f.vDif), $c(f.vAj), $c(f.vFin)] as CeldaT[]),
        ["TOTAL", "", "", tot(ini), $c(vIni, true), $c(s(V, (f) => f.vAj), true), $c(vFin, true)]],
      nota: sinPrecio.length ? `Sin precio (cuentan como $ 0): ${sinPrecio.map((f) => f.codigo).join(", ")}.` : undefined });

    /* RECURRENCIA Y CONTRA EL DÍA ANTERIOR */
    const R = x.recurrencia;
    b.push({ t: "modulo", n: sig(), titulo: "Recurrencia y contra el día anterior", sub: `Recurrencia: ${R.fechas} días guardados entre el ${diaCorto(R.desde)} y este día`, ojo: OJO_CIERRE });
    b.push({ t: "sub", texto: "Códigos que se repiten", extra: "3 o más días guardados seguidos con ajuste" });
    if (R.filas.length) {
      b.push({ t: "tabla", compacta: true, cols: [{ h: "Código", w: 16 }, { h: "Descripción", w: 56 }, { h: "Racha", w: 30, al: "r" }, { h: "Días faltó", w: 18, al: "r" }, { h: "Días sobró", w: 18, al: "r" }, { h: "Total rango", w: 26, al: "r" }],
        filas: R.filas.map((r) => [r.codigo, r.descripcion, { x: `${r.racha} días ${r.ult < 0 ? "faltando" : "sobrando"}`, bold: true, color: r.ult < 0 ? ROJO : undefined }, String(r.falta), String(r.sobra), cs(r.total)]) });
    } else b.push({ t: "p", texto: "Ningún código lleva 3 o más días guardados seguidos con ajuste: las diferencias del día no se están repitiendo.", gris: true });
    const A = x.ayer;
    b.push({ t: "sub", texto: A.anterior ? `Contra el ${diaCorto(A.anterior)}` : "Contra el día anterior", extra: A.anterior ? undefined : "no hay otro día guardado" });
    if (A.anterior) {
      const cuenta = (e: Cambio["estado"]) => A.filas.filter((f) => f.estado === e).length;
      const totA = s(A.filas, (f) => f.da), totH = s(A.filas, (f) => f.dh);
      b.push({ t: "pares", filas: [
        { a: ["Diferencia anterior", cs(totA, true)], b: ["Mejoraron o se cerraron", `${cuenta("mejoro") + cuenta("cerro")} (${cuenta("cerro")} cerrados)`] },
        { a: ["Diferencia del día", cs(totH, true)], b: ["Empeoraron o son nuevos", `${cuenta("empeoro") + cuenta("nuevo")} (${cuenta("nuevo")} nuevos)`] },
      ] });
      const ET: Record<Cambio["estado"], CeldaT> = {
        empeoro: { x: "Empeoró", bold: true, color: ROJO }, nuevo: { x: "Nuevo", bold: true, color: ROJO },
        mejoro: { x: "Mejoró", bold: true }, cerro: { x: "Se cerró", bold: true }, igual: { x: "Igual", color: GRIS },
      };
      b.push({ t: "tabla", compacta: true, cols: [{ h: "Código", w: 16 }, { h: "Descripción", w: 60 }, { h: "Antes", w: 24, al: "r" }, { h: "Del día", w: 24, al: "r" }, { h: "Cambio", w: 24, al: "r" }, { h: "Estado", w: 18, al: "r" }],
        filas: A.filas.slice(0, 15).map((f) => [f.codigo, f.descripcion, cs(f.da), cs(f.dh), cs(f.cambio), ET[f.estado]]),
        nota: A.filas.length > 15 ? `Los 15 cambios más grandes de ${A.filas.length}.` : undefined });
    }
  }

  /* ANEXO: LAS OBSERVACIONES COMPLETAS. En las tablas no caben; aquí van enteras, código por código. */
  if (conObs.length) {
    b.push({ t: "modulo", n: "A", titulo: "Anexo · Observaciones por código", sub: `${conObs.length} código${conObs.length === 1 ? "" : "s"} con observación`, ojo: OJO_CIERRE });
    b.push({ t: "tabla", compacta: true, cols: [{ h: "Código", w: 15 }, { h: "Descripción", w: 40 }, { h: "Dif. final", w: 18, al: "r" }, { h: "Observación", w: 77 }],
      filas: [...conObs].sort((a, c) => Math.abs(c.difFinal) - Math.abs(a.difFinal)).map((f) => [f.codigo, f.descripcion, cs(f.difFinal), f.observacion.trim()]) });
  }
  return b;
}

/* ------------------------------------------------------------------
   LA PÁGINA DE LOS FISCALES

   «Página nueva: comparación con los 2 últimos inventarios fiscales: tabla por familia y tabla por código
    (hoy vs fiscal 1 vs fiscal 2) con etiqueta Se repite / Aumenta / Nuevo.»

   Por familia va la diferencia FINAL (después de lo movido en SAP), que es la que cierra cada día; por
   código, la diferencia del conteo contra SAP antes de ajustes, que es la que dice si el problema vuelve.
   ------------------------------------------------------------------ */
export type Lectura = "Se repite" | "Aumenta" | "Nuevo" | "Baja";
/** Cómo se lee un código frente a los dos fiscales (`null` = ese fiscal no tiene análisis guardado). */
export function lecturaFiscal(hoy: number, reciente: number | null, anterior: number | null): Lectura {
  const r = reciente ?? 0, a = anterior ?? 0;
  if (reciente != null && anterior != null && r !== 0 && a !== 0) return "Se repite";
  if (r === 0 && a === 0) return "Nuevo";
  if (Math.abs(hoy) > Math.abs(reciente != null ? r : a)) return "Aumenta";
  return "Baja";
}

function fiscales(b: Bloque[], numero: string, F: FilaFinal[], o: OpcionesCierre, comp: ComparacionFiscal) {
  /* El más reciente primero, como se lee: hoy, el último fiscal, el de antes. */
  const fs = [...comp.fiscales].sort((a, c) => c.fecha.localeCompare(a.fecha)).slice(0, 2);
  const finales = fs.map((f) => (f.filas ? analisisFinal(f.filas) : null));
  const rot = (f: FiscalComparado) => `${f.esFiscal ? "Fiscal" : "Día"} ${diaMes(f.fecha)}`;
  const hoyRot = `Hoy · ${diaMes(o.fecha)}`;
  const s = <T,>(xs: T[], k: (f: T) => number) => xs.reduce((t, f) => t + k(f), 0);

  b.push({ t: "modulo", n: numero, titulo: "Las diferencias de hoy frente a los dos últimos inventarios fiscales", ojo: OJO_FISCAL });
  b.push({ t: "p", gris: true, texto: `Comparar con: ${fs.map((f) => `${f.esFiscal ? "Fiscal" : "Día guardado"} ${fechaFiscal(f.fecha)}${f.nombre ? ` (${f.nombre})` : ""}`).join(" · ")}` +
    (comp.porDefecto ? " — por defecto, los 2 fiscales más recientes antes de este día." : " — fechas escogidas con «Cambiar fechas».") });
  const sinAnalisis = fs.filter((f) => !f.filas);
  if (sinAnalisis.length) b.push({ t: "p", gris: true, texto: `${sinAnalisis.map((f) => `${f.esFiscal ? "El fiscal" : "El día"} del ${fechaFiscal(f.fecha)}`).join(" y ")} no tiene análisis de diferencia guardado: su columna sale con «—». Guarda el análisis de ese día o escoge otras fechas con «Cambiar fechas».` });

  /* POR FAMILIA — diferencia final. */
  const fams = [...new Set([...F.map((f) => f.familia), ...finales.flatMap((x) => (x ?? []).map((f) => f.familia))])].sort((a, c) => a.localeCompare(c, "es"));
  const celdaFam = (xs: FilaFinal[] | null, fam: string | null, bold = false): CeldaT => {
    if (!xs) return "—";
    const v = s(fam == null ? xs : xs.filter((f) => f.familia === fam), (f) => f.difFinal);
    return v === 0 && !bold ? "0" : cs(v, bold);
  };
  b.push({ t: "sub", texto: "Por familia", extra: "diferencia final, después de lo movido en SAP" });
  b.push({ t: "tabla", total: true,
    cols: [{ h: "Familia", w: 58 }, { h: hoyRot, w: 30, al: "r" }, ...fs.map((f) => ({ h: rot(f), w: 30, al: "r" as const }))],
    filas: [...fams.map((fam) => [fam, celdaFam(F, fam), ...finales.map((x) => celdaFam(x, fam))] as CeldaT[]),
      ["TOTAL", celdaFam(F, null, true), ...finales.map((x) => celdaFam(x, null, true))]] });

  /* POR CÓDIGO — los de mayor diferencia hoy, y cómo estaban en cada fiscal. */
  const mapas = fs.map((f) => (f.filas ? new Map(f.filas.map((r) => [r.codigo, r.diferencia])) : null));
  const top = [...F].filter((f) => f.diferencia !== 0).sort((a, c) => Math.abs(c.diferencia) - Math.abs(a.diferencia)).slice(0, 15);
  const celda = (v: number | null): CeldaT => (v == null ? "—" : v === 0 ? "0" : cs(v));
  b.push({ t: "sub", texto: "Códigos con mayor diferencia hoy", extra: "y cómo estaban en cada fiscal (conteo contra SAP, antes de ajustes)" });
  b.push({ t: "tabla",
    cols: [{ h: "Código", w: 15 }, { h: "Descripción", w: 50 }, { h: hoyRot, w: 22, al: "r" }, ...fs.map((f) => ({ h: rot(f), w: 22, al: "r" as const })), { h: "Lectura", w: 18, al: "r" }],
    filas: top.map((f) => {
      const vs = mapas.map((m) => (m ? m.get(f.codigo) ?? 0 : null));
      const l = lecturaFiscal(f.diferencia, vs[0] ?? null, vs[1] ?? null);
      return [f.codigo, f.descripcion, cs(f.diferencia), ...vs.map(celda), { x: l, bold: true, color: l === "Se repite" || l === "Aumenta" ? ROJO : undefined }];
    }),
    nota: top.length ? undefined : "Hoy no hay códigos con diferencia." });
  b.push({ t: "p", gris: true, texto: "Lectura: «Se repite» = tuvo diferencia en los dos fiscales y hoy otra vez · «Aumenta» = hoy es mayor que en el fiscal anterior · «Nuevo» = no tenía diferencia en ningún fiscal · «Baja» = hoy es menor que en el fiscal anterior." });
}

/** El nombre del archivo sale del nombre del informe (en mayúscula, sin caracteres raros) y del día. */
export const archivoCierre = (nombre: string, fecha: string, ext: "pdf" | "docx") =>
  `${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "INFORME"}-${fecha}.${ext}`;
