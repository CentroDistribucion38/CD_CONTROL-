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
import type { Cambio, Recurrente } from "./analisis-extra";

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

/** Lo de las hojas aparte: precios (valor $), recurrencia y contra el día anterior. Sin ellos, el informe sale sin esas partes. */
export type ExtrasCierre = {
  precios: Record<string, { precio: number; fuente: string }>;
  recurrencia: { desde: string; fechas: number; filas: Recurrente[] };
  ayer: { anterior: string | null; filas: Cambio[] };
};
/* Pesos con guion corriente (la letra del PDF no trae «−»). */
const $ = (v: number) => (v < 0 ? "-$ " : "$ ") + nf.format(Math.abs(Math.round(v)));
/* En los cuadros grandes, en millones para que quepa («$ 370,2 M»); la cifra completa va debajo. */
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const $M = (v: number) => (Math.abs(v) >= 1e6 ? `${v < 0 ? "-" : ""}$ ${nf1.format(Math.abs(v) / 1e6)} M` : $(v));
const $c = (v: number): CeldaT => ({ x: (v > 0 ? "+" : "") + $(v), bold: true, color: v < 0 ? ROJO : v > 0 ? AZUL : VERDE });
const diaCorto = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

export function construirCierre(aj: FilaAjuste[], o: OpcionesCierre, x?: ExtrasCierre): Bloque[] {
  const F = analisisFinal(aj);
  const pu = (c: string) => x?.precios[c]?.precio ?? 0;
  const V = F.map((f) => ({ ...f, p: x?.precios[f.codigo]?.precio ?? null, vDif: f.diferencia * pu(f.codigo), vAj: f.ajuste * pu(f.codigo), vFin: f.difFinal * pu(f.codigo), vMov: (f.movComp + f.movAjuste) * pu(f.codigo) }));
  const vPor = new Map(V.map((f) => [f.codigo, f]));
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
  const vIni = s(V, (f) => f.vDif), vSobra = s(V, (f) => Math.max(0, f.vAj)), vFalta = s(V, (f) => Math.min(0, f.vAj)), vFin = s(V, (f) => f.vFin);
  if (x) b.push({ t: "kpis", items: [
    { rotulo: "Valor diferencia", valor: $M(vIni), detalle: $(vIni), color: vIni < 0 ? ROJO : AZUL },
    { rotulo: "Valor sobrante", valor: $M(vSobra), detalle: `${$(vSobra)} · sube SAP`, color: VERDE },
    { rotulo: "Valor faltante", valor: $M(vFalta), detalle: `${$(vFalta)} · baja SAP`, color: ROJO },
    { rotulo: "Valor pendiente", valor: $M(vFin), detalle: $(vFin), color: vFin === 0 ? VERDE : ROJO },
  ] });
  const top1 = [...F].sort((a, c) => Math.abs(c.diferencia) - Math.abs(a.diferencia))[0];
  b.push({ t: "p", texto:
    `El análisis del día comparó ${n(conteo)} unidades contadas contra ${n(sap)} en SAP y dejó una diferencia de ${sg(ini)} unidades en ${F.filter((f) => f.diferencia !== 0).length} códigos` +
    (top1 && top1.diferencia ? `; la más grande es ${top1.codigo} ${top1.descripcion} (${sg(top1.diferencia)}).` : ".") +
    (comp ? ` Del envase retornable contado en estado NUEVO se compensaron ${n(comp)} unidades contra su NR nuevo.` : "") +
    ` Quedaron por ajustar ${sg(sobra)} de sobrante y ${sg(falta)} de faltante.` +
    (hechos.length ? ` Ya se movieron en SAP ${sg(movido)} unidades en ${hechos.length} códigos.` : " Todavía no se ha marcado ningún movimiento como hecho.") +
    (pend.length ? ` Siguen ${pend.length} códigos con diferencia, por ${sg(fin)} unidades.` : " Con eso, la bodega queda cuadrada contra SAP.") +
    (x ? ` En plata, la diferencia del día vale ${$(vIni)}: el sobrante ${$(vSobra)} y el faltante ${$(vFalta)}; queda pendiente ${$(vFin)}.` : "") +
    (x && x.recurrencia.filas.length ? ` ${x.recurrencia.filas.length} código${x.recurrencia.filas.length === 1 ? "" : "s"} se repite${x.recurrencia.filas.length === 1 ? "" : "n"} 3 o más días seguidos (ver Recurrencia).` : "") +
    (x?.ayer.anterior ? ` Contra el ${diaCorto(x.ayer.anterior)}: ${x.ayer.filas.filter((f) => f.estado === "mejoro" || f.estado === "cerro").length} códigos mejoraron o se cerraron y ${x.ayer.filas.filter((f) => f.estado === "empeoro" || f.estado === "nuevo").length} empeoraron o son nuevos.` : "") });

  /* POR FAMILIA, en la misma hoja del resumen. */
  const fams = [...new Set(F.map((f) => f.familia))];
  b.push({ t: "sub", texto: "Cómo quedó cada familia" });
  b.push({ t: "tabla", cols: [{ h: "Familia", w: 42 }, { h: "SAP", w: 25, al: "r" }, { h: "Conteo", w: 25, al: "r" }, { h: "Dif. inicial", w: 22, al: "r" }, { h: "Movido", w: 20, al: "r" }, { h: "Dif. final", w: 22, al: "r" }, ...(x ? [{ h: "Valor dif.", w: 30, al: "r" as const }] : [])],
    filas: [...fams.map((fam) => {
      const xs = V.filter((f) => f.familia === fam);
      return [fam, n(s(xs, (f) => f.sap)), n(s(xs, (f) => f.conteo)), color(s(xs, (f) => f.diferencia)), sg(s(xs, (f) => f.movComp + f.movAjuste)), color(s(xs, (f) => f.difFinal)), ...(x ? [$c(s(xs, (f) => f.vDif))] : [])] as CeldaT[];
    }), [{ x: "TOTAL", bold: true }, { x: n(sap), bold: true }, { x: n(conteo), bold: true }, color(ini), { x: sg(movido), bold: true }, color(fin), ...(x ? [$c(vIni)] : [])]] });

  /* 02 · TOP DIFERENCIAS */
  const top = [...F].filter((f) => f.diferencia !== 0).sort((a, c) => Math.abs(c.diferencia) - Math.abs(a.diferencia)).slice(0, 12);
  const colsTop: Col[] = x
    ? [{ h: "Código", w: 16 }, { h: "Descripción", w: 48 }, { h: "SAP", w: 24, al: "r" }, { h: "Conteo", w: 24, al: "r" }, { h: "Diferencia", w: 22, al: "r" }, { h: "Valor", w: 30, al: "r" }, { h: "Final", w: 22, al: "r" }]
    : [{ h: "Código", w: 16 }, { h: "Descripción", w: 62 }, { h: "SAP", w: 26, al: "r" }, { h: "Conteo", w: 26, al: "r" }, { h: "Diferencia", w: 24, al: "r" }, { h: "Final", w: 22, al: "r" }];
  b.push({ t: "modulo", n: "02", titulo: "Top diferencias", sub: "Las más grandes del día, antes y después de los ajustes" });
  b.push({ t: "tabla", cols: colsTop, filas: top.map((f) => x ? [f.codigo, f.descripcion, n(f.sap), n(f.conteo), color(f.diferencia), $c(vPor.get(f.codigo)?.vDif ?? 0), color(f.difFinal)] : [f.codigo, f.descripcion, n(f.sap), n(f.conteo), color(f.diferencia), color(f.difFinal)]),
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
  b.push({ t: "tabla", cols: x ? [{ h: "Código", w: 16 }, { h: "Descripción", w: 44 }, { h: "Dif. final", w: 22, al: "r" }, { h: "Valor", w: 28, al: "r" }, { h: "Qué falta", w: 40 }, { h: "Observación", w: 36 }] : [{ h: "Código", w: 16 }, { h: "Descripción", w: 50 }, { h: "Dif. final", w: 24, al: "r" }, { h: "Qué falta", w: 46 }, { h: "Observación", w: 50 }],
    filas: [...pend].sort((a, c) => Math.abs(c.difFinal) - Math.abs(a.difFinal)).map((f) => {
      const falta: string[] = [];
      if (f.compensa !== 0 && !f.compHecha) falta.push(`compensar ${n(Math.abs(f.compensa))}`);
      const restoAj = f.ajuste - (f.ajusteHecho ?? 0);
      if (restoAj !== 0) falta.push(`ajuste ${sg(restoAj)} (${restoAj > 0 ? "sube" : "baja"} SAP)`);
      return x ? [f.codigo, f.descripcion, color(f.difFinal), $c(vPor.get(f.codigo)?.vFin ?? 0), falta.join(" · ") || "revisar", f.observacion || "—"]
        : [f.codigo, f.descripcion, color(f.difFinal), falta.join(" · ") || "revisar", f.observacion || "—"];
    }), compacta: true });

  if (!x) return b;

  /* 04 · VALOR EN PESOS */
  const conValor = V.filter((f) => f.diferencia !== 0 || f.ajuste !== 0).sort((a, c) => Math.abs(c.vDif) - Math.abs(a.vDif));
  const sinPrecio = conValor.filter((f) => f.p == null);
  b.push({ t: "modulo", n: "04", titulo: "Valor en pesos", sub: "Unidades x precio por unidad: el de la botella del MM60 y, si no lo tiene, el costo del maestro de Pasivos" });
  b.push({ t: "tabla", cols: [{ h: "Código", w: 15 }, { h: "Descripción", w: 41 }, { h: "Precio u.", w: 20, al: "r" }, { h: "Diferencia", w: 20, al: "r" }, { h: "Valor dif.", w: 30, al: "r" }, { h: "Valor ajuste", w: 30, al: "r" }, { h: "Valor pend.", w: 30, al: "r" }],
    filas: [...conValor.map((f) => [f.codigo, f.descripcion, f.p != null ? $(f.p) : { x: "SIN PRECIO", bold: true, color: ROJO }, color(f.diferencia), $c(f.vDif), $c(f.vAj), $c(f.vFin)] as CeldaT[]),
      [{ x: "TOTAL", bold: true }, "", "", color(ini), $c(vIni), $c(s(V, (f) => f.vAj)), $c(vFin)]],
    nota: sinPrecio.length ? `Sin precio (cuentan como $ 0): ${sinPrecio.map((f) => f.codigo).join(", ")}.` : undefined, compacta: true });

  /* 05 · RECURRENCIA Y CONTRA EL DÍA ANTERIOR */
  const R = x.recurrencia;
  b.push({ t: "modulo", n: "05", titulo: "Recurrencia y contra el día anterior", sub: `Recurrencia: ${R.fechas} días guardados entre el ${diaCorto(R.desde)} y este día` });
  if (R.filas.length) {
    b.push({ t: "lista", items: R.filas.slice(0, 10).map((r) => `${r.codigo} ${r.descripcion} lleva ${r.racha} días seguidos ${r.ult < 0 ? "faltando" : "sobrando"} (hoy ${sg(r.ult)}; en el rango ${sg(r.total)})`) });
    b.push({ t: "tabla", cols: [{ h: "Código", w: 16 }, { h: "Descripción", w: 56 }, { h: "Racha", w: 30, al: "c" }, { h: "Días faltó", w: 20, al: "r" }, { h: "Días sobró", w: 20, al: "r" }, { h: "Total rango", w: 30, al: "r" }],
      filas: R.filas.map((r) => [r.codigo, r.descripcion, { x: `${r.racha} ${r.ult < 0 ? "faltando" : "sobrando"}`, bold: true, color: r.ult < 0 ? ROJO : VERDE, fill: r.ult < 0 ? "#FDE7EA" : "#E3F4EA" }, String(r.falta), String(r.sobra), color(r.total)]), compacta: true });
  } else b.push({ t: "p", texto: "Ningún código lleva 3 o más días guardados seguidos con ajuste: las diferencias del día no se están repitiendo.", gris: true });
  const A = x.ayer;
  b.push({ t: "sub", texto: A.anterior ? `Contra el ${diaCorto(A.anterior)}` : "Contra el día anterior: no hay otro día guardado" });
  if (A.anterior) {
    const cuenta = (e: Cambio["estado"]) => A.filas.filter((f) => f.estado === e).length;
    const totA = s(A.filas, (f) => f.da), totH = s(A.filas, (f) => f.dh);
    b.push({ t: "kpis", items: [
      { rotulo: "Diferencia anterior", valor: sg(totA), detalle: diaCorto(A.anterior) },
      { rotulo: "Diferencia del día", valor: sg(totH), detalle: o.fechaLarga },
      { rotulo: "Mejoraron o cerraron", valor: String(cuenta("mejoro") + cuenta("cerro")), detalle: `${cuenta("cerro")} se cerraron`, color: VERDE },
      { rotulo: "Empeoraron o nuevos", valor: String(cuenta("empeoro") + cuenta("nuevo")), detalle: `${cuenta("nuevo")} nuevos`, color: ROJO },
    ] });
    const ET: Record<Cambio["estado"], CeldaT> = {
      empeoro: { x: "EMPEORÓ", bold: true, color: ROJO }, nuevo: { x: "NUEVO", bold: true, color: ROJO },
      mejoro: { x: "MEJORÓ", bold: true, color: VERDE }, cerro: { x: "SE CERRÓ", bold: true, color: VERDE }, igual: { x: "IGUAL", color: "#5F6B79" },
    };
    b.push({ t: "tabla", cols: [{ h: "Código", w: 16 }, { h: "Descripción", w: 60 }, { h: "Antes", w: 26, al: "r" }, { h: "Del día", w: 26, al: "r" }, { h: "Cambio", w: 26, al: "r" }, { h: "Estado", w: 22, al: "c" }],
      filas: A.filas.slice(0, 15).map((f) => [f.codigo, f.descripcion, color(f.da), color(f.dh), sg(f.cambio), ET[f.estado]]), compacta: true,
      nota: A.filas.length > 15 ? `Los 15 cambios más grandes de ${A.filas.length}.` : undefined });
  }
  return b;
}

/** El nombre del archivo sale del nombre del informe (en mayúscula, sin caracteres raros) y del día. */
export const archivoCierre = (nombre: string, fecha: string, ext: "pdf" | "docx") =>
  `${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "INFORME"}-${fecha}.${ext}`;
