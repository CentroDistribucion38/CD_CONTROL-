/**
 * LA FOTO DEL INFORME %AI, EN DOS PARTES — para copiar, pegar y compartir.
 *
 * «Que cuando vayamos a copiar se muestre así como el cierre de turno, pero que se abra y se divida en dos partes para copiar
 *  una parte y luego la otra, para que se entienda, así como la barra arriba.»
 *
 * El mismo diseño de la foto del cierre de turno (`foto-pareto.ts`): la banda negra con el sello, el filo rojo, la franja
 * amarilla con las cifras y las secciones con su raya. El informe completo en una sola imagen sale larguísima y en el
 * celular no se lee; partido en dos, cada imagen cabe en una pantalla:
 *   · PARTE 1 · ORIGEN Y TENDENCIA — las cifras, el %AI por origen (CD) con su ranking y la tendencia por día.
 *   · PARTE 2 · CAUSAL, SKU Y DRY — el pareto por causal, el ranking por referencia (SKU) y el top 5 DRY con su pareto.
 * CDs y referencias van en RANKING por %AI, no en pareto: el pareto ordena por unidades malas y no tiene en cuenta lo que
 * se revisa. El pareto queda para las causales (todas sobre las mismas revisadas) y el top 5 DRY.
 * Las dos llevan la misma franja de cifras arriba, para que cada una se entienda sola.
 */
import { banda, partir, pintarGrafica, vitales, type ExtraPareto } from "./foto-pareto";
import { META_AI, lienzoRanking, lienzoTendencia, rankingOrigen, rankingSku, type DatosInformeAi } from "./informe-ai-graficas";

type Ctx = CanvasRenderingContext2D;
const TINTA = "#111111", ORO = "#FFC400", ROJO = "#C8102E", GRIS = "#5b6b7f", LINEA = "#E6EAF0", AZUL = "#2c4361";
const FUENTE = `"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
const TITULO = `"Archivo", "IBM Plex Sans", system-ui, sans-serif`;
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pc = (x: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x * 100) + " %";
const pc0 = (x: number) => `${Math.round(x * 100)} %`;
const W = 1280, ESCALA = 2, M = 34, FILA = 34, G = 405, GD = 320;

function lienzo(alto: number) {
  const cv = document.createElement("canvas"); cv.width = W * ESCALA; cv.height = Math.ceil(alto * ESCALA);
  const ctx = cv.getContext("2d")!; ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, alto);
  return { cv, ctx };
}

/**
 * LAS CIFRAS DE LA FRANJA AMARILLA — se escogen en la ventana de la imagen (quitar y agregar), igual en las dos partes.
 * Por defecto las cuatro de siempre; el resto: la meta, cuántos CDs y cuántos días quedan por encima, el CD más alto y
 * cuántas referencias se revisaron.
 */
export const CIFRAS_AI: { k: string; t: string }[] = [
  { k: "revisiones", t: "Revisiones" }, { k: "revisadas", t: "Cantidad revisada" }, { k: "malas", t: "En mal estado" }, { k: "ai", t: "%AI" },
  { k: "meta", t: "Meta" }, { k: "encima", t: "CDs sobre la meta" }, { k: "dias", t: "Días sobre la meta" }, { k: "peor", t: "CD más alto" }, { k: "sku", t: "SKU revisados" },
];
export const CIFRAS_AI_DEF = ["revisiones", "revisadas", "malas", "ai"];

function franja(ctx: Ctx, d: DatosInformeAi, cifras: string[] = CIFRAS_AI_DEF) {
  ctx.fillStyle = ORO; ctx.fillRect(0, 100, W, 84);
  const peor = [...d.origenes].sort((a, b) => b.indice - a.indice)[0];
  const encima = d.origenes.filter((o) => o.indice > META_AI).length;
  const dias = d.dias.filter((x) => x.revisadas > 0);
  const val: Record<string, [string, string, string]> = {
    revisiones: ["REVISIONES", nf.format(d.total.revisiones), `${d.origenes.length} CD${d.origenes.length === 1 ? "" : "s"} de origen`],
    revisadas: ["CANTIDAD REVISADA", nf.format(d.total.revisadas), "unidades"],
    malas: ["EN MAL ESTADO", nf.format(d.total.defectos), "unidades"],
    ai: ["%AI DEL PERÍODO", pc(d.total.indice), "mal estado ÷ revisadas"],
    meta: ["META %AI", pc(META_AI), d.total.indice > META_AI ? `${pc(d.total.indice - META_AI)} por encima` : "el período la cumple"],
    encima: ["CDs SOBRE LA META", `${encima} de ${d.origenes.length}`, "con %AI mayor que la meta"],
    dias: ["DÍAS SOBRE LA META", `${dias.filter((x) => x.indice > META_AI).length} de ${dias.length}`, "días con revisiones"],
    peor: ["CD MÁS ALTO", peor ? pc(peor.indice) : "—", peor ? peor.origen : ""],
    sku: ["SKU REVISADOS", nf.format(d.envases.length), "referencias de envase"],
  };
  const xs = cifras.filter((k) => val[k]);
  const lista = xs.length ? xs : CIFRAS_AI_DEF;
  const ancho = (W - 2 * M) / lista.length;
  const tam = lista.length <= 4 ? 38 : lista.length === 5 ? 32 : lista.length === 6 ? 28 : 24;
  lista.forEach((k, i) => {
    const [t, v, sub] = val[k], x0 = M + i * ancho;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = TINTA; ctx.globalAlpha = 0.8; ctx.font = `700 10.5px ${FUENTE}`; ctx.fillText(t.split("").join("\u200A"), x0, 122); ctx.globalAlpha = 1;
    ctx.font = `900 ${tam}px ${TITULO}`; ctx.fillText(v, x0, 158, ancho - 14);
    ctx.globalAlpha = 0.85; ctx.font = `500 12px ${FUENTE}`; ctx.fillText(sub, x0, 176, ancho - 14); ctx.globalAlpha = 1;
  });
}

/** El título de una sección con su nota a la derecha y la raya gruesa debajo. Devuelve dónde sigue. */
function seccion(ctx: Ctx, y: number, t: string, nota: string) {
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `900 18px ${TITULO}`; ctx.fillText(t, M, y);
  ctx.textAlign = "right"; ctx.fillStyle = GRIS; ctx.font = `500 12.5px ${FUENTE}`; ctx.fillText(nota, W - M, y);
  ctx.fillStyle = TINTA; ctx.fillRect(M, y + 9, W - 2 * M, 2);
  return y + 22;
}

type ColT = { t: string; x: number; der?: boolean };
/** Una tabla: cabecera gris, filas alternadas, una barra fina debajo del nombre y el total opcional. */
function tabla(ctx: Ctx, y: number, cols: ColT[], filas: { celdas: string[]; barra?: number; rojo?: boolean[] }[], total?: string[]) {
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#F7F9FC"; ctx.fillRect(M, y, W - 2 * M, 32);
  ctx.strokeStyle = LINEA; ctx.lineWidth = 1; ctx.strokeRect(M + 0.5, y + 0.5, W - 2 * M - 1, 31);
  ctx.fillStyle = GRIS; ctx.font = `700 10.5px ${FUENTE}`;
  cols.forEach((c) => { ctx.textAlign = c.der ? "right" : "left"; ctx.fillText(c.t.split("").join(" "), c.x, y + 20) });
  y += 32;
  filas.forEach((f, i) => {
    if (i % 2) { ctx.fillStyle = "#FAFBFC"; ctx.fillRect(M + 1, y, W - 2 * M - 2, FILA) }
    ctx.fillStyle = "#EEF1F5"; ctx.fillRect(M + 1, y + FILA - 1, W - 2 * M - 2, 1);
    f.celdas.forEach((v, j) => {
      const c = cols[j], ult = j === cols.length - 1, nombre = j === 1;
      ctx.textAlign = c.der ? "right" : "left";
      ctx.font = ult ? `800 13.5px ${FUENTE}` : nombre ? `600 13.5px ${FUENTE}` : j === 0 ? `500 13px ${FUENTE}` : `500 13px ${FUENTE}`;
      ctx.fillStyle = f.rojo?.[j] ? ROJO : j === 0 ? GRIS : TINTA;
      ctx.fillText(v, c.x, y + (nombre && f.barra != null ? 17 : 22));
    });
    if (f.barra != null) {
      ctx.fillStyle = "#EEF1F5"; ctx.fillRect(cols[1].x, y + 24, 300, 4);
      ctx.fillStyle = i === 0 ? ROJO : TINTA; ctx.fillRect(cols[1].x, y + 24, Math.max(2, 300 * f.barra), 4);
    }
    y += FILA;
  });
  if (total) {
    ctx.fillStyle = TINTA; ctx.fillRect(M, y, W - 2 * M, 2); ctx.fillStyle = "#F7F9FC"; ctx.fillRect(M, y + 2, W - 2 * M, 38);
    ctx.font = `800 13.5px ${FUENTE}`; ctx.fillStyle = TINTA;
    total.forEach((v, j) => { ctx.textAlign = cols[j].der ? "right" : "left"; ctx.fillText(v, cols[j].x, y + 26) });
    y += 40;
  }
  return y;
}

function nota(ctx: Ctx, y: number, txt: string) {
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.font = `500 11.5px ${FUENTE}`; ctx.fillStyle = GRIS;
  const ls = partir(ctx, txt, W - 2 * M, 4);
  ls.forEach((l, i) => ctx.fillText(l, M, y + i * 16));
  return y + ls.length * 16;
}
const medir = () => { const c = document.createElement("canvas").getContext("2d")!; c.font = `500 11.5px ${FUENTE}`; return c };

/* =====================================================================
   PARTE 1 · RESUMEN
   ===================================================================== */
export function dibujarInformeParte1(d: DatosInformeAi, x: ExtraPareto, cifras?: string[]): HTMLCanvasElement {
  const o = [...d.origenes].sort((a, b) => b.indice - a.indice);
  const ro = rankingOrigen(d);
  const RANK = Math.round((W - 2 * M) * (72 / 182));
  const conTend = d.dias.length > 1;
  const TEND = Math.round((W - 2 * M) * (66 / 182));
  const pie = `%AI = unidades en mal estado ÷ unidades revisadas, sumadas en el período (no el promedio de cada revisión). En rojo, lo que queda por encima de la meta (${pc(META_AI)}); raya punteada = la meta. Filtros: ${d.filtros}.`;
  const lineasPie = partir(medir(), pie, W - 2 * M, 4).length;
  const alto = 184 + 34 + 22 + 32 + Math.max(1, o.length) * FILA + 40 + 30
    + (ro.length ? 4 + 34 + 18 + RANK + 26 : 0)
    + (conTend ? 34 + 22 + TEND + 16 : 0) + 10 + lineasPie * 16 + 22;
  const { cv, ctx } = lienzo(alto);
  banda(ctx, W, x.titulo, x);
  franja(ctx, d, cifras);

  /* %AI POR ORIGEN */
  let y = seccion(ctx, 184 + 34, "%AI por origen (CD) · de mayor a menor", `${o.length} CD${o.length === 1 ? "" : "s"} · su parte del mal estado`);
  const tope = Math.max(0.0001, ...o.map((r) => r.indice));
  const colO: ColT[] = [{ t: "#", x: 64, der: true }, { t: "CD", x: 84 }, { t: "REVISIONES", x: 560, der: true }, { t: "REVISADAS", x: 720, der: true }, { t: "MAL ESTADO", x: 870, der: true }, { t: "% DEL MAL ESTADO", x: 1060, der: true }, { t: "%AI", x: W - 50, der: true }];
  y = tabla(ctx, y, colO,
    o.map((r, i) => ({ celdas: [String(i + 1), r.origen, nf.format(r.revisiones), nf.format(r.revisadas), nf.format(r.malas), pc(d.total.defectos ? r.malas / d.total.defectos : 0), pc(r.indice)],
      barra: r.indice / tope, rojo: [false, false, false, false, false, false, r.indice > META_AI] })),
    ["", "Total", nf.format(d.total.revisiones), nf.format(d.total.revisadas), nf.format(d.total.defectos), "100,00 %", pc(d.total.indice)]);
  y += 30;

  /* EL RANKING POR ORIGEN, debajo de su tabla. */
  if (ro.length) {
    const sobre = ro.filter((r) => r.indice > META_AI).length;
    y = seccion(ctx, y + 4, "Ranking de CDs por %AI", `${sobre} de ${ro.length} por encima de la meta · debajo, lo revisado`) - 4;
    ctx.drawImage(lienzoRanking(ro, META_AI, [17, 17, 17]), M, y, W - 2 * M, RANK);
    y += RANK + 26;
  }

  /* TENDENCIA */
  if (conTend) {
    const sobre = d.dias.filter((r) => r.indice > META_AI).length;
    y = seccion(ctx, y + 4, "Tendencia del %AI por día", `${sobre} de ${d.dias.length} días por encima de la meta`);
    ctx.drawImage(lienzoTendencia(d.dias, META_AI, [17, 17, 17]), M, y, W - 2 * M, TEND);
    y += TEND + 16;
  }
  ctx.fillStyle = LINEA; ctx.fillRect(M, y, W - 2 * M, 1);
  nota(ctx, y + 22, pie);
  return cv;
}

/* =====================================================================
   PARTE 2 · PARETOS
   ===================================================================== */
export function dibujarInformeParte2(d: DatosInformeAi, x: ExtraPareto, cifras?: string[]): HTMLCanvasElement {
  const bloques = [
    d.causales.length ? { t: "Pareto por causal · el estado más encontrado", p: d.causales, de: "causales" } : null,
  ].filter(Boolean) as { t: string; p: typeof d.causales; de: string }[];
  const pie = `Paretos (causal y DRY): barras = unidades en mal estado, de más a menos; en negro, las que juntas forman el 80 %; línea roja = % acumulado. Ranking (SKU): %AI de cada referencia; en negro, las que quedan por encima de la meta (${pc(META_AI)}).${d.otrosCausal.length ? ` Contados pero fuera del %AI: ${d.otrosCausal.map((r) => `${r.nombre} ${nf.format(r.unidades)}`).join(" · ")}.` : ""}`;
  const lineasPie = partir(medir(), pie, W - 2 * M, 4).length;
  const rs = rankingSku(d);
  const RANK = Math.round((W - 2 * M) * (72 / 182));
  const alto = 184 + Math.max(1, bloques.length) * (34 + 18 + G + 10 + 30 + 20) + (rs.length ? 34 + 18 + RANK + 26 : 0)
    + (d.top5.length ? 34 + 22 + 32 + d.top5.length * FILA + 14 + GD + 26 : 0) + 10 + lineasPie * 16 + 22;
  const { cv, ctx } = lienzo(alto);
  banda(ctx, W, x.titulo, x);
  franja(ctx, d, cifras);

  let y = 184;
  if (!bloques.length) { ctx.textAlign = "left"; ctx.fillStyle = GRIS; ctx.font = `500 14px ${FUENTE}`; ctx.fillText("No hay unidades en mal estado en el período.", M, y + 60); y += 120 }
  for (const b of bloques) {
    const v = vitales(b.p), vPct = v.length ? v[v.length - 1].acumulado : 0;
    y = seccion(ctx, y + 34, b.t, `${v.length} de ${b.p.length} ${b.de} forman el ${pc0(vPct)}`) - 4;
    pintarGrafica(ctx, M, y, W - 2 * M, G, b.p);
    y += G + 10;
    /* La lectura en una frase, debajo de cada gráfica. */
    const t0 = b.p[0];
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.font = `800 13.5px ${FUENTE}`; ctx.fillStyle = TINTA; ctx.fillText(t0.nombre, M, y + 20);
    const a = ctx.measureText(t0.nombre).width;
    ctx.font = `500 13.5px ${FUENTE}`; ctx.fillStyle = AZUL;
    ctx.fillText(` es el ${pc0(t0.pctDefectos)} del mal estado. Con ${v.length === 1 ? "el primero" : `${v.length === b.p.length ? "todos" : `los ${v.length} primeros`}`} ya se explica el ${pc0(vPct)}.`, M + a, y + 20);
    y += 30 + 20;
  }

  /* %AI POR REFERENCIA: ranking por %AI, con lo revisado debajo de cada una. */
  if (rs.length) {
    const sobre = rs.filter((r) => r.indice > META_AI).length;
    y = seccion(ctx, y + 34, "%AI por referencia (SKU) · ranking", `${sobre} de ${rs.length} por encima de la meta · debajo, lo revisado`) - 4;
    ctx.drawImage(lienzoRanking(rs, META_AI, [17, 17, 17]), M, y, W - 2 * M, RANK);
    y += RANK + 26;
  }

  /* TOP 5 DRY: la tabla y su pareto debajo. */
  if (d.top5.length) {
    const a5 = d.top5[d.top5.length - 1].acumulado;
    y = seccion(ctx, y + 34, "Top 5 DRY · más unidades en mal estado", `juntos: ${pc0(a5)} del mal estado de los socios`);
    const colD: ColT[] = [{ t: "#", x: 64, der: true }, { t: "DRY (SOCIO)", x: 84 }, { t: "REVISADAS", x: 640, der: true }, { t: "MAL ESTADO", x: 800, der: true }, { t: "% DEL MAL ESTADO", x: 980, der: true }, { t: "% ACUM.", x: 1100, der: true }, { t: "%AI", x: W - 50, der: true }];
    const topeD = Math.max(1, ...d.top5.map((r) => r.unidades));
    y = tabla(ctx, y, colD, d.top5.map((r, i) => ({
      celdas: [String(i + 1), r.nombre, nf.format(r.socio?.revisadas ?? 0), nf.format(r.unidades), pc(r.pctDefectos), pc(r.acumulado), pc(r.socio?.indice ?? 0)],
      barra: r.unidades / topeD, rojo: [false, false, false, false, false, false, (r.socio?.indice ?? 0) > META_AI],
    })));
    y += 14;
    /* La gráfica cuenta todo el mal estado de los socios (la última barra es el resto): así su acumulado es el de la tabla. */
    const resto = d.malasSocios - d.top5.reduce((a, r) => a + r.unidades, 0);
    pintarGrafica(ctx, M, y, W - 2 * M, GD, resto > 0
      ? [...d.top5, { clave: "resto", nombre: "Los demás socios", unidades: resto, pct: d.total.revisadas ? resto / d.total.revisadas : 0, pctDefectos: d.malasSocios ? resto / d.malasSocios : 0, acumulado: 1 }]
      : d.top5);
    y += GD + 26;
  }
  ctx.fillStyle = LINEA; ctx.fillRect(M, y, W - 2 * M, 1);
  nota(ctx, y + 22, pie);
  return cv;
}
