/**
 * EL INFORME %AI EN WORD Y PDF, CON EL DISEÑO DEL INFORME DEL ANÁLISIS DE DIFERENCIA.
 *
 * «Así como en inventario generamos un informe en Word y PDF con el análisis de diferencias, acá quiero el informe con esa
 *  información adicional, con las gráficas de pareto, para día a día poder exportar el Word o PDF.» · «Te hablo como el del
 *  análisis de diferencia, o sea algo más profesional.»
 *
 * Es EL MISMO PAPEL del cierre del análisis de diferencia (carta, logo de Bavaria en la portada, la B de marca de agua,
 * secciones numeradas, tablas sobrias): se arma con los mismos bloques y se pinta con `cierre-pdf.ts` / `cierre-word.ts`.
 * Aquí solo se decide QUÉ dice. Las gráficas y la lectura del período salen de `informe-ai-graficas.ts`.
 */
import type { Bloque, CeldaT, Col } from "@/modulos/inventario/evidencias-informe";
import type { Imagen } from "@/modulos/inventario/evidencias-graficas";
import { MEDIDA, META_AI, graficaPareto, graficaRanking, rankingOrigen, rankingSku, graficaTendencia, hallazgos, n0 as n, pc, periodoLargo, vitales, type DatosInformeAi } from "./informe-ai-graficas";

export type { DatosInformeAi };
export const NOMBRE_INFORME_AI = "INFORME %AI · REVISIÓN DE ENVASE";
export const OJO_AI = "SIDER · INFORME %AI DE LA REVISIÓN DE ENVASE";

const pc1 = (x: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x * 100) + " %";
const fCorta = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
const ROJO = "#B3261E";

/** Las gráficas del papel (12 px por mm), como las pide el bloque «img». */
export type ImagenesAi = { origen: Imagen | null; causal: Imagen | null; dry: Imagen | null; sku: Imagen | null; tendencia: Imagen | null };
export function imagenesAi(d: DatosInformeAi): ImagenesAi {
  const im = (png: string, w: number, h: number): Imagen => ({ png, w: w * 12, h: h * 12 });
  const t = <T,>(f: () => T) => { try { return f() } catch { return null } };
  const P = MEDIDA.pareto, T = MEDIDA.tendencia, R = MEDIDA.ranking;
  return {
    origen: d.origenes.length ? t(() => im(graficaRanking(rankingOrigen(d), META_AI), R.ancho, R.alto)) : null,
    causal: d.causales.length ? t(() => im(graficaPareto(d.causales), P.ancho, P.alto)) : null,
    dry: d.top5.length ? t(() => im(graficaPareto(d.top5), P.ancho, P.alto)) : null,
    sku: d.envases.length ? t(() => im(graficaRanking(rankingSku(d), META_AI), R.ancho, R.alto)) : null,
    tendencia: d.dias.length > 1 ? t(() => im(graficaTendencia(d.dias, META_AI), T.ancho, T.alto)) : null,
  };
}

/* ---------------------------------------------------------------- LOS BLOQUES */
export function construirInformeAi(d: DatosInformeAi, o: { titulo: string; generado: string; quien: string }, img: ImagenesAi): Bloque[] {
  const b: Bloque[] = [];
  let k = 0;
  const sig = () => String(++k);
  const periodo = periodoLargo(d.desde, d.hasta);
  const fuerte = (x: string): CeldaT => ({ x, bold: true });
  const rojoSi = (si: boolean, x: string): CeldaT => (si ? { x, color: ROJO, bold: true } : x);
  const prom = d.total.indice, meta = META_AI;

  b.push({ t: "portada", titulo: o.titulo, sub: `Período: ${periodo.replace(/^./, (c) => c.toUpperCase())} · revisión de envase`, meta: [
    `Filtros: ${d.filtros}.`,
    `Generado el ${o.generado}${o.quien && o.quien !== "—" ? ` por ${o.quien}` : ""}.`,
    "%AI = unidades en mal estado / unidades revisadas, sumadas en el período (no el promedio de cada revisión).",
  ] });

  /* 1 · RESUMEN */
  b.push({ t: "modulo", n: sig(), titulo: "Resumen del período", seguido: true, ojo: OJO_AI });
  const oMax = [...d.origenes].sort((a, c) => c.indice - a.indice)[0];
  const rk = rankingSku(d);
  b.push({ t: "pares", filas: [
    { a: ["%AI del período", fuerte(pc(prom))], b: ["Revisiones", n(d.total.revisiones)], fuerte: true },
    { a: ["Unidades revisadas", n(d.total.revisadas)], b: ["Unidades en mal estado", fuerte(n(d.total.defectos))] },
    { a: ["Origen con mayor %AI", oMax ? `${oMax.origen} · ${pc(oMax.indice)}` : "—"], b: ["Causal principal", d.causales[0] ? `${d.causales[0].nombre} · ${pc1(d.causales[0].pctDefectos)}` : "—"], sep: true },
    { a: ["DRY con más mal estado", d.top5[0] ? `${d.top5[0].nombre} · ${pc1(d.top5[0].pctDefectos)}` : "—"],
      b: ["Referencia con mayor %AI", rk[0] ? `${rk[0].nombre} · ${pc(rk[0].indice)}` : "—"] },
  ] });
  b.push({ t: "sub", texto: "Lo que dice el período" });
  b.push({ t: "lista", items: hallazgos(d) });

  /* 2 · POR ORIGEN */
  if (d.origenes.length) {
    const o2 = [...d.origenes].sort((a, c) => c.indice - a.indice);
    b.push({ t: "modulo", n: sig(), titulo: "%AI por origen (CD)", seguido: true, sub: "ranking: del %AI más alto al más bajo", ojo: OJO_AI });
    if (img.origen) b.push({ t: "img", img: img.origen, pie: "Ranking por %AI (mal estado ÷ revisadas de cada CD). Debajo de cada CD, cuánto se revisó: un %AI sobre pocas unidades pesa menos. En negro, los que quedan por encima de la meta de 1 % (raya punteada)." });
    const colsO: Col[] = [{ h: "Origen (CD)", w: 30 }, { h: "Revisiones", w: 13, al: "r" }, { h: "Revisadas", w: 16, al: "r" }, { h: "Mal estado", w: 15, al: "r" }, { h: "% del mal estado", w: 16, al: "r" }, { h: "%AI", w: 13, al: "r" }];
    b.push({ t: "tabla", cols: colsO, total: true, filas: [
      ...o2.map((x) => [x.origen, n(x.revisiones), n(x.revisadas), n(x.malas), pc(d.total.defectos ? x.malas / d.total.defectos : 0), rojoSi(x.indice > meta, pc(x.indice))] as CeldaT[]),
      ["Total", n(d.total.revisiones), n(d.total.revisadas), n(d.total.defectos), "100,00 %", pc(prom)],
    ] });
  }

  /* 3 · PARETO POR CAUSAL */
  if (d.causales.length) {
    const v = vitales(d.causales);
    b.push({ t: "modulo", n: sig(), titulo: "Pareto por causal", sub: `${v.length} de ${d.causales.length} causales hacen el 80 % del mal estado`, ojo: OJO_AI });
    if (img.causal) b.push({ t: "img", img: img.causal, pie: "En negro, las causales que juntas llegan al 80 % (atacar esas es atacar casi todo). La curva roja es el % acumulado." });
    b.push({ t: "tabla", cols: [{ h: "Causal", w: 38 }, { h: "Unidades", w: 15, al: "r" }, { h: "% del mal estado", w: 17, al: "r" }, { h: "% acumulado", w: 15, al: "r" }, { h: "%AI", w: 15, al: "r" }],
      filas: d.causales.map((c, i) => [i < v.length ? fuerte(c.nombre) : c.nombre, n(c.unidades), fuerte(pc(c.pctDefectos)), pc(c.acumulado), pc(c.pct)]),
      nota: d.otrosCausal.length ? `Contados pero fuera del %AI: ${d.otrosCausal.map((x) => `${x.nombre} ${n(x.unidades)}`).join(" · ")}.` : undefined });
  }

  /* 4 · TOP 5 DRY */
  if (d.top5.length) {
    const acum5 = d.top5[d.top5.length - 1].acumulado;
    b.push({ t: "modulo", n: sig(), titulo: "Top 5 DRY por unidades en mal estado", sub: `juntos son el ${pc1(acum5)} del mal estado de los socios (${n(d.malasSocios)} unidades)`, ojo: OJO_AI });
    if (img.dry) b.push({ t: "img", img: img.dry, ancho: 0.85, pie: "El pareto de los 5 DRY: unidades en mal estado de cada socio; la curva roja es el acumulado sobre el mal estado de todos los socios." });
    b.push({ t: "tabla", cols: [{ h: "#", w: 5, al: "r" }, { h: "DRY (socio)", w: 29 }, { h: "Revisiones", w: 12, al: "r" }, { h: "Revisadas", w: 13, al: "r" }, { h: "Mal estado", w: 13, al: "r" }, { h: "% del mal estado", w: 14, al: "r" }, { h: "% acum.", w: 11, al: "r" }, { h: "%AI", w: 11, al: "r" }],
      filas: d.top5.map((x, i) => [String(i + 1), fuerte(x.nombre), n(x.socio?.revisiones ?? 0), n(x.socio?.revisadas ?? 0), n(x.unidades), fuerte(pc(x.pctDefectos)), pc(x.acumulado),
        rojoSi((x.socio?.indice ?? 0) > meta, pc(x.socio?.indice ?? 0))]) });
  }

  /* 5 · POR REFERENCIA: un ranking por %AI, no un pareto */
  if (rk.length) {
    const sobre = rk.filter((x) => x.indice > meta).length;
    b.push({ t: "modulo", n: sig(), titulo: "%AI por referencia (SKU)", seguido: true, sub: `ranking: ${sobre} de ${rk.length} referencias por encima de la meta (${pc(meta)})`, ojo: OJO_AI });
    if (img.sku) b.push({ t: "img", img: img.sku, pie: "Ranking por %AI (mal estado ÷ revisadas de cada referencia), con lo revisado debajo de cada una. En negro, las que quedan por encima de la meta de 1 % (raya punteada)." });
    b.push({ t: "tabla", cols: [{ h: "#", w: 5, al: "r" }, { h: "Referencia", w: 30 }, { h: "Revisiones", w: 13, al: "r" }, { h: "Revisadas", w: 16, al: "r" }, { h: "Mal estado", w: 15, al: "r" }, { h: "% del mal estado", w: 16, al: "r" }, { h: "%AI", w: 13, al: "r" }],
      filas: rk.map((x, i) => [String(i + 1), x.indice > meta ? fuerte(x.nombre) : x.nombre, n(x.revisiones), n(x.revisadas), n(x.malas), pc(d.total.defectos ? x.malas / d.total.defectos : 0), rojoSi(x.indice > meta, pc(x.indice))]) });
  }

  /* 6 · TENDENCIA POR DÍA */
  if (d.dias.length) {
    const sobre = d.dias.filter((x) => x.indice > meta).length;
    b.push({ t: "modulo", n: sig(), titulo: "Tendencia del %AI por día", seguido: true, sub: `${sobre} de ${d.dias.length} días quedaron por encima de la meta (${pc(meta)})`, ojo: OJO_AI });
    if (img.tendencia) b.push({ t: "img", img: img.tendencia, pie: `Cada punto es un día. La raya punteada es la meta (${pc(meta)}); en rojo, los días que quedaron por encima.` });
    b.push({ t: "tabla", compacta: true, total: true, cols: [{ h: "Día", w: 28 }, { h: "Revisiones", w: 16, al: "r" }, { h: "Revisadas", w: 20, al: "r" }, { h: "Mal estado", w: 18, al: "r" }, { h: "%AI", w: 18, al: "r" }],
      filas: [...d.dias.map((x) => [fCorta(x.dia), n(x.revisiones), n(x.revisadas), n(x.malas), rojoSi(x.indice > meta, pc(x.indice))] as CeldaT[]),
        ["Período", n(d.total.revisiones), n(d.total.revisadas), n(d.total.defectos), pc(prom)]] });
  }
  return b;
}

export const archivoInformeAi = (titulo: string, desde: string, hasta: string, ext: "pdf" | "docx") =>
  `${titulo.replace(/[\\/:*?"<>|·]+/g, " ").replace(/\s+/g, " ").trim()} ${desde === hasta ? desde : `${desde} a ${hasta}`}.${ext}`;
