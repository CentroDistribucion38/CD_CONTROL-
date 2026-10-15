/**
 * EL INFORME DEL CIERRE DEL DÍA (análisis de diferencia) — los bloques para el PDF y el Word.
 *
 * «Una vez hecho el análisis, lo más rápido: el informe PDF del cierre del día, igual de presentable que el
 *  de evidencias: resumen, top diferencias, ajustes hechos y pendientes, listo para enviar a la jefatura.»
 *
 * Se pinta con los MISMOS papeles del informe de evidencias (`evidencias-pdf.ts`, `evidencias-word.ts`):
 * cinta del tema, logo, marca de agua, cada módulo en hoja nueva. Aquí solo se decide QUÉ dice.
 * Es pura (no toca la base): recibe los ajustes del día con lo marcado como hecho.
 */
import type { Bloque, CeldaT, Col } from "./evidencias-informe";
import { COMPENSA, analisisFinal, type FilaAjuste } from "./compensa";

export const NOMBRE_CIERRE = "INFORME DE CIERRE · ANÁLISIS DE DIFERENCIA BODEGA 38";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
/* Guion corriente y no «−»: la letra del PDF no trae el signo menos tipográfico. */
const sg = (v: number) => (v > 0 ? "+" : v < 0 ? "-" : "") + nf.format(Math.abs(v));
const VERDE = "#0F7A4A", ROJO = "#B42318", AZUL = "#1B4F8F";
const color = (v: number): CeldaT => ({ x: sg(v), bold: true, color: v < 0 ? ROJO : v > 0 ? AZUL : VERDE });

export type OpcionesCierre = {
  nombre: string; fechaLarga: string; generado: string; quien: string;
  guardadoEn: string | null; guardadoPor: string | null; finalEn: string | null;
};

export function construirCierre(aj: FilaAjuste[], o: OpcionesCierre): Bloque[] {
  const F = analisisFinal(aj);
  const s = <T,>(xs: T[], k: (f: T) => number) => xs.reduce((t, f) => t + k(f), 0);
  const sap = s(F, (f) => f.sap), conteo = s(F, (f) => f.conteo);
  const ini = s(F, (f) => f.diferencia), fin = s(F, (f) => f.difFinal);
  const comp = s(F, (f) => Math.max(0, f.compensa));
  const sobra = s(F, (f) => Math.max(0, f.ajuste)), falta = s(F, (f) => Math.min(0, f.ajuste));
  const movido = s(F, (f) => f.movComp + f.movAjuste);
  const pend = F.filter((f) => f.difFinal !== 0);
  const hechos = F.filter((f) => (f.compensa !== 0 && f.compHecha) || (f.ajusteHecho ?? 0) !== 0);
  const absIni = s(F, (f) => Math.abs(f.diferencia)), absFin = s(F, (f) => Math.abs(f.difFinal));
  const avance = absIni ? Math.round((1 - absFin / absIni) * 100) : 100;
  const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  const b: Bloque[] = [];
  b.push({
    t: "portada", titulo: o.nombre, sub: o.fechaLarga,
    meta: [
      `Bodega 38 · conteo contra SAP, en unidades (cajas plásticas y estibas por unidad)`,
      o.guardadoEn ? `Análisis guardado el ${cuando(o.guardadoEn)}${o.guardadoPor ? ` por ${o.guardadoPor}` : ""}` : "Análisis sin guardar",
      o.finalEn ? `Análisis final guardado el ${cuando(o.finalEn)}` : "Análisis final sin guardar: lo que se ve es lo marcado como hecho hasta ahora",
      `Generado por ${o.quien} · ${o.generado}`,
    ],
  });

  /* 01 · RESUMEN, redactado como lo contaría quien hizo el cierre. */
  b.push({ t: "modulo", n: "01", titulo: "Resumen del cierre", sub: o.fechaLarga });
  b.push({ t: "kpis", items: [
    { rotulo: "SAP", valor: n(sap), detalle: "unidades" },
    { rotulo: "Conteo", valor: n(conteo), detalle: "unidades" },
    { rotulo: "Diferencia inicial", valor: sg(ini), detalle: "conteo - SAP", color: ini < 0 ? ROJO : AZUL },
    { rotulo: "Diferencia final", valor: sg(fin), detalle: pend.length ? `${pend.length} códigos pendientes` : "todo cuadra", color: fin === 0 ? VERDE : ROJO },
  ] });
  b.push({ t: "kpis", items: [
    { rotulo: "Compensado R / NR", valor: n(comp), detalle: "retornable contado en NUEVO", color: AZUL },
    { rotulo: "Ajuste sobrante", valor: sg(sobra), detalle: "sube SAP", color: VERDE },
    { rotulo: "Ajuste faltante", valor: sg(falta), detalle: "baja SAP", color: ROJO },
    { rotulo: "Avance", valor: `${avance}%`, detalle: `movido en SAP ${sg(movido)}` },
  ] });
  const top1 = [...F].sort((a, c) => Math.abs(c.diferencia) - Math.abs(a.diferencia))[0];
  b.push({ t: "p", texto:
    `El análisis del día comparó ${n(conteo)} unidades contadas contra ${n(sap)} en SAP y dejó una diferencia de ${sg(ini)} unidades en ${F.filter((f) => f.diferencia !== 0).length} códigos` +
    (top1 && top1.diferencia ? `; la más grande es ${top1.codigo} ${top1.descripcion} (${sg(top1.diferencia)}).` : ".") +
    (comp ? ` Del envase retornable contado en estado NUEVO se compensaron ${n(comp)} unidades contra su NR nuevo.` : "") +
    ` Quedaron por ajustar ${sg(sobra)} de sobrante y ${sg(falta)} de faltante.` +
    (hechos.length ? ` Ya se movieron en SAP ${sg(movido)} unidades en ${hechos.length} códigos.` : " Todavía no se ha marcado ningún movimiento como hecho.") +
    (pend.length ? ` Siguen ${pend.length} códigos con diferencia, por ${sg(fin)} unidades.` : " Con eso, la bodega queda cuadrada contra SAP.") });

  /* POR FAMILIA, en la misma hoja del resumen. */
  const fams = [...new Set(F.map((f) => f.familia))];
  b.push({ t: "sub", texto: "Cómo quedó cada familia" });
  b.push({ t: "tabla", cols: [{ h: "Familia", w: 50 }, { h: "SAP", w: 28, al: "r" }, { h: "Conteo", w: 28, al: "r" }, { h: "Dif. inicial", w: 26, al: "r" }, { h: "Movido", w: 24, al: "r" }, { h: "Dif. final", w: 24, al: "r" }],
    filas: [...fams.map((fam) => {
      const xs = F.filter((f) => f.familia === fam);
      return [fam, n(s(xs, (f) => f.sap)), n(s(xs, (f) => f.conteo)), color(s(xs, (f) => f.diferencia)), sg(s(xs, (f) => f.movComp + f.movAjuste)), color(s(xs, (f) => f.difFinal))] as CeldaT[];
    }), [{ x: "TOTAL", bold: true }, { x: n(sap), bold: true }, { x: n(conteo), bold: true }, color(ini), { x: sg(movido), bold: true }, color(fin)]] });

  /* 02 · TOP DIFERENCIAS */
  const top = [...F].filter((f) => f.diferencia !== 0).sort((a, c) => Math.abs(c.diferencia) - Math.abs(a.diferencia)).slice(0, 12);
  const colsTop: Col[] = [{ h: "Código", w: 16 }, { h: "Descripción", w: 62 }, { h: "SAP", w: 26, al: "r" }, { h: "Conteo", w: 26, al: "r" }, { h: "Diferencia", w: 24, al: "r" }, { h: "Final", w: 22, al: "r" }];
  b.push({ t: "modulo", n: "02", titulo: "Top diferencias", sub: "Las más grandes del día, antes y después de los ajustes" });
  b.push({ t: "tabla", cols: colsTop, filas: top.map((f) => [f.codigo, f.descripcion, n(f.sap), n(f.conteo), color(f.diferencia), color(f.difFinal)]),
    nota: top.length ? undefined : "No hubo diferencias." });

  /* 03 · COMPENSACIONES */
  const por = new Map(F.map((f) => [f.codigo, f]));
  const filasComp: CeldaT[][] = COMPENSA.map(([r, nr]) => {
    const a = por.get(r), c = por.get(nr);
    const m = Math.abs(a?.compensa ?? 0);
    return [`${r} / ${nr}`, a?.descripcion ?? "—", n(a?.nuevo ?? 0), c ? sg(c.diferencia) : "—", { x: n(m), bold: true, color: AZUL },
      m ? (a?.compHecha && c?.compHecha ? { x: "HECHA", bold: true, color: VERDE, fill: "#E3F4EA" } : { x: "PENDIENTE", bold: true, color: ROJO, fill: "#FDE7EA" }) : "—"];
  });
  b.push({ t: "sub", texto: "Compensaciones retornable / NR nuevo (lo contado en estado NUEVO)" });
  b.push({ t: "tabla", cols: [{ h: "Par", w: 30 }, { h: "Retornable", w: 50 }, { h: "Contado NUEVO", w: 26, al: "r" }, { h: "Dif. NR", w: 26, al: "r" }, { h: "Compensa", w: 24, al: "r" }, { h: "Estado", w: 20, al: "c" }], filas: filasComp });

  /* 04 · AJUSTES HECHOS */
  b.push({ t: "modulo", n: "03", titulo: "Ajustes hechos y pendientes", sub: hechos.length ? `${hechos.length} códigos · ${sg(movido)} unidades movidas` : "Ninguno marcado como hecho" });
  b.push({ t: "tabla", cols: [{ h: "Código", w: 16 }, { h: "Descripción", w: 52 }, { h: "Compensación", w: 24, al: "r" }, { h: "Ajuste", w: 24, al: "r" }, { h: "SAP final", w: 26, al: "r" }, { h: "Observación", w: 44 }],
    filas: hechos.map((f) => [f.codigo, f.descripcion, f.movComp ? sg(f.movComp) : "—", f.movAjuste ? sg(f.movAjuste) : "—", n(f.sapFinal), f.observacion || "—"]),
    nota: hechos.length ? undefined : "Marca en Ajustes lo que ya se movió en SAP para que salga aquí.", compacta: true });

  /* 05 · PENDIENTES */
  b.push({ t: "sub", texto: pend.length ? `Pendientes: ${pend.length} códigos siguen con diferencia (${sg(fin)})` : "Pendientes: nada, todo cuadra" });
  b.push({ t: "tabla", cols: [{ h: "Código", w: 16 }, { h: "Descripción", w: 50 }, { h: "Dif. final", w: 24, al: "r" }, { h: "Qué falta", w: 46 }, { h: "Observación", w: 50 }],
    filas: [...pend].sort((a, c) => Math.abs(c.difFinal) - Math.abs(a.difFinal)).map((f) => {
      const falta: string[] = [];
      if (f.compensa !== 0 && !f.compHecha) falta.push(`compensar ${n(Math.abs(f.compensa))}`);
      const restoAj = f.ajuste - (f.ajusteHecho ?? 0);
      if (restoAj !== 0) falta.push(`ajuste ${sg(restoAj)} (${restoAj > 0 ? "sube" : "baja"} SAP)`);
      return [f.codigo, f.descripcion, color(f.difFinal), falta.join(" · ") || "revisar", f.observacion || "—"];
    }), compacta: true });

  return b;
}

/** El nombre del archivo sale del nombre del informe (en mayúscula, sin caracteres raros) y del día. */
export const archivoCierre = (nombre: string, fecha: string, ext: "pdf" | "docx") =>
  `${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "INFORME"}-${fecha}.${ext}`;
