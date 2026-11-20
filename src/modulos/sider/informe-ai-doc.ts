/**
 * EL INFORME %AI EN WORD Y PDF, CON EL DISEÑO DEL INFORME DEL ANÁLISIS DE DIFERENCIA.
 *
 * «Así como en inventario generamos un informe en Word y PDF con el análisis de diferencias, acá quiero el informe con esa
 *  información adicional, con las gráficas de pareto, para día a día poder exportar el Word o PDF.» · «Te hablo como el del
 *  análisis de diferencia, o sea algo más profesional.»
 *
 * Es EL MISMO PAPEL del cierre del análisis de diferencia (carta, logo de Bavaria en la portada, la B de marca de agua,
 * secciones numeradas, tablas sobrias): se arma con los mismos bloques y se pinta con `cierre-pdf.ts` / `cierre-word.ts`.
 * Aquí solo se decide QUÉ dice. Las gráficas y la lectura del período salen de `informe-ai-pdf.ts`.
 */
import type { Bloque, CeldaT, Col } from "@/modulos/inventario/evidencias-informe";
import type { Imagen } from "@/modulos/inventario/evidencias-graficas";
import { MEDIDA, graficaPareto, paretoOrigen, graficaTendencia, hallazgos, n0 as n, pc, periodoLargo, vitales, type DatosInformeAi } from "./informe-ai-graficas";

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
  const P = MEDIDA.pareto, T = MEDIDA.tendencia;
  return {
    origen: d.origenes.length ? t(() => im(graficaPareto(paretoOrigen(d)), P.ancho, P.alto)) : null,
    causal: d.causales.length ? t(() => im(graficaPareto(d.causales), P.ancho, P.alto)) : null,
    dry: d.top5.length ? t(() => im(graficaPareto(d.top5), P.ancho, P.alto)) : null,
    sku: d.envases.length ? t(() => im(graficaPareto(d.envases), P.ancho, P.alto)) : null,
    tendencia: d.dias.length > 1 ? t(() => im(graficaTendencia(d.dias, d.total.indice), T.ancho, T.alto)) : null,
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
  const prom = d.total.indice;

  b.push({ t: "portada", titulo: o.titulo, sub: `Período: ${periodo.replace(/^./, (c) => c.toUpperCase())} · revisión de envase`, meta: [
    `Filtros: ${d.filtros}.`,
    `Generado el ${o.generado}${o.quien && o.quien !== "—" ? ` por ${o.quien}` : ""}.`,
    "%AI = unidades en mal estado / unidades revisadas, sumadas en el período (no el promedio de cada revisión).",
  ] });

  /* 1 · RESUMEN */
  b.push({ t: "modulo", n: sig(), titulo: "Resumen del período", seguido: true, ojo: OJO_AI });
  const oMax = [...d.origenes].sort((a, c) => c.indice - a.indice)[0];
  b.push({ t: "pares", filas: [
    { a: ["%AI del período", fuerte(pc(prom))], b: ["Revisiones", n(d.total.revisiones)], fuerte: true },
    { a: ["Unidades revisadas", n(d.total.revisadas)], b: ["Unidades en mal estado", fuerte(n(d.total.defectos))] },
    { a: ["Origen con mayor %AI", oMax ? `${oMax.origen} · ${pc(oMax.indice)}` : "—"], b: ["Causal principal", d.causales[0] ? `${d.causales[0].nombre} · ${pc1(d.causales[0].pctDefectos)}` : "—"], sep: true },
    { a: ["DRY con más mal estado", d.top5[0] ? `${d.top5[0].nombre} · ${pc1(d.top5[0].pctDefectos)}` : "—"],
      b: ["Referencia con más mal estado", d.envases[0] ? `${d.envases[0].nombre} · ${pc1(d.envases[0].pctDefectos)}` : "—"] },
  ] });
  b.push({ t: "sub", texto: "Lo que dice el período" });
  b.push({ t: "lista", items: hallazgos(d) });

  /* 2 · POR ORIGEN */
  if (d.origenes.length) {
    const o2 = [...d.origenes].sort((a, c) => c.indice - a.indice);
    b.push({ t: "modulo", n: sig(), titulo: "%AI por origen (CD)", seguido: true, sub: "del %AI más alto al más bajo, y cuánto aporta cada uno al mal estado", ojo: OJO_AI });
    if (img.origen) b.push({ t: "img", img: img.origen, pie: "El pareto por origen: unidades en mal estado de cada CD, de más a menos. En negro, los CDs que juntos llegan al 80 %; la curva roja es el acumulado. La tabla los ordena por %AI." });
    const colsO: Col[] = [{ h: "Origen (CD)", w: 30 }, { h: "Revisiones", w: 13, al: "r" }, { h: "Revisadas", w: 16, al: "r" }, { h: "Mal estado", w: 15, al: "r" }, { h: "% del mal estado", w: 16, al: "r" }, { h: "%AI", w: 13, al: "r" }];
    b.push({ t: "tabla", cols: colsO, total: true, filas: [
      ...o2.map((x) => [x.origen, n(x.revisiones), n(x.revisadas), n(x.malas), pc(d.total.defectos ? x.malas / d.total.defectos : 0), rojoSi(x.indice > prom, pc(x.indice))] as CeldaT[]),
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
        rojoSi((x.socio?.indice ?? 0) > prom, pc(x.socio?.indice ?? 0))]) });
  }

  /* 5 · POR REFERENCIA */
  if (d.envases.length) {
    const v = vitales(d.envases);
    b.push({ t: "modulo", n: sig(), titulo: "%AI por referencia (SKU)", seguido: true, sub: `${v.length} de ${d.envases.length} referencias hacen el 80 % del mal estado`, ojo: OJO_AI });
    if (img.sku) b.push({ t: "img", img: img.sku, pie: "El pareto por envase revisado: en negro, las referencias que juntas llegan al 80 %; la curva roja es el acumulado." });
    b.push({ t: "tabla", cols: [{ h: "Referencia", w: 30 }, { h: "Revisiones", w: 12, al: "r" }, { h: "Revisadas", w: 14, al: "r" }, { h: "Mal estado", w: 13, al: "r" }, { h: "% del mal estado", w: 15, al: "r" }, { h: "% acum.", w: 12, al: "r" }, { h: "%AI", w: 12, al: "r" }],
      filas: d.envases.map((x, i) => [i < v.length ? fuerte(x.nombre) : x.nombre, n(x.env?.revisiones ?? 0), n(x.env?.revisadas ?? 0), n(x.unidades), pc(x.pctDefectos), pc(x.acumulado),
        rojoSi((x.env?.indice ?? 0) > prom, pc(x.env?.indice ?? 0))]) });
  }

  /* 6 · TENDENCIA POR DÍA */
  if (d.dias.length) {
    const sobre = d.dias.filter((x) => x.indice > prom).length;
    b.push({ t: "modulo", n: sig(), titulo: "Tendencia del %AI por día", seguido: true, sub: `${sobre} de ${d.dias.length} días quedaron por encima del %AI del período`, ojo: OJO_AI });
    if (img.tendencia) b.push({ t: "img", img: img.tendencia, pie: "Cada punto es un día. La raya punteada es el %AI del período; en rojo, los días que quedaron por encima." });
    b.push({ t: "tabla", compacta: true, total: true, cols: [{ h: "Día", w: 28 }, { h: "Revisiones", w: 16, al: "r" }, { h: "Revisadas", w: 20, al: "r" }, { h: "Mal estado", w: 18, al: "r" }, { h: "%AI", w: 18, al: "r" }],
      filas: [...d.dias.map((x) => [fCorta(x.dia), n(x.revisiones), n(x.revisadas), n(x.malas), rojoSi(x.indice > prom, pc(x.indice))] as CeldaT[]),
        ["Período", n(d.total.revisiones), n(d.total.revisadas), n(d.total.defectos), pc(prom)]] });
  }
  return b;
}

export const archivoInformeAi = (titulo: string, desde: string, hasta: string, ext: "pdf" | "docx") =>
  `${titulo.replace(/[\\/:*?"<>|·]+/g, " ").replace(/\s+/g, " ").trim()} ${desde === hasta ? desde : `${desde} a ${hasta}`}.${ext}`;
