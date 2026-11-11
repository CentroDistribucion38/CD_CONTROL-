/**
 * LA GRÁFICA DEL PARETO DEL CIERRE DE LA REVISIÓN AI — se dibuja en un lienzo (canvas), sin React.
 * La usan DOS cosas con el mismo dibujo: la gráfica que se ve dentro del cierre (`pintarGrafica`) y la foto para
 * copiar / compartir / descargar (`dibujarParetoFoto`, que le pone la banda negra, las cifras y el pie).
 *
 * Barras = unidades de cada defecto (de más a menos). Línea roja = % acumulado de los defectos, con su número en cada punto.
 * Línea punteada = el 80 %. En NEGRO los defectos que juntos forman el 80 %; en gris el resto.
 * El eje izquierdo va en unidades y el derecho en %: los dos cuadran (el total de unidades = 100 %).
 */
import type { CierreAi, ParetoFila } from "./cierre-ai";

type Ctx = CanvasRenderingContext2D;
const TINTA = "#111111", ORO = "#FFC400", ROJO = "#C8102E", GRIS = "#5b6b7f", RESTO = "#B4BEC9", LINEA = "#E6EAF0", AZUL = "#2c4361";
const FUENTE = `"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
const TITULO = `"Archivo", "IBM Plex Sans", system-ui, sans-serif`;
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pc = (x: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x * 100) + " %";
const pc0 = (x: number) => `${Math.round(x * 100)} %`;

/** Los defectos que juntos forman el 80 %: los que todavía no habían llegado al 80 % cuando se suman. */
export const vitales = (p: ParetoFila[]) => p.filter((d) => d.acumulado - d.pctDefectos < 0.8);

function partir(ctx: Ctx, texto: string, ancho: number, maxLineas: number): string[] {
  const palabras = texto.split(/\s+/); const lineas: string[] = []; let l = "";
  for (const p of palabras) {
    const t = l ? `${l} ${p}` : p;
    if (ctx.measureText(t).width <= ancho || !l) l = t; else { lineas.push(l); l = p }
  }
  if (l) lineas.push(l);
  if (lineas.length > maxLineas) { const resto = lineas.slice(maxLineas - 1).join(" "); lineas.length = maxLineas - 1; lineas.push(resto.length > 18 ? resto.slice(0, 17) + "…" : resto) }
  return lineas;
}

/** La gráfica dentro de la caja (x0, y0, w, h). Devuelve nada: pinta. */
export function pintarGrafica(ctx: Ctx, x0: number, y0: number, w: number, h: number, pareto: ParetoFila[]) {
  ctx.save(); ctx.translate(x0, y0);
  const total = pareto.reduce((t, d) => t + d.unidades, 0);
  if (!pareto.length || total <= 0) {
    ctx.fillStyle = GRIS; ctx.font = `500 14px ${FUENTE}`; ctx.textAlign = "center"; ctx.fillText("No se encontraron defectos.", w / 2, h / 2); ctx.restore(); return;
  }
  const L = 64, R = 64, top = 34, pie = 74, ph = h - top - pie, pw = w - L - R, slot = pw / pareto.length;
  const bw = Math.min(72, slot * 0.62), chico = slot < 96;
  const yDe = (u: number) => top + ph - (u / total) * ph;
  ctx.textBaseline = "alphabetic";

  /* La rejilla y los dos ejes: 0, 25, 50, 75 y 100 % (izquierda en unidades, derecha en %). */
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    const y = top + ph - p * ph;
    ctx.strokeStyle = LINEA; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
    ctx.font = `500 11.5px ${FUENTE}`; ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(nf.format(Math.round(p * total)), L - 10, y + 4);
    ctx.font = `700 11.5px ${FUENTE}`; ctx.fillStyle = ROJO; ctx.textAlign = "left"; ctx.fillText(`${p * 100} %`, w - R + 10, y + 4);
  }
  /* La línea del 80 %. */
  const y80 = top + ph - 0.8 * ph;
  ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = TINTA; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L, y80); ctx.lineTo(w - R, y80); ctx.stroke(); ctx.restore();
  ctx.font = `800 11.5px ${FUENTE}`; ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText("80 %", L + 6, y80 - 6);

  /* Las barras, el nombre y su % del total. */
  const puntos: { x: number; y: number; p: number }[] = [];
  let acum = 0;
  pareto.forEach((d, i) => {
    const antes = acum / total; acum += d.unidades;
    const cx = L + slot * i + slot / 2, alto = (d.unidades / total) * ph, by = top + ph - alto, esVital = antes < 0.8;
    ctx.fillStyle = esVital ? TINTA : RESTO; ctx.fillRect(cx - bw / 2, by, bw, Math.max(alto, 1));
    const dentro = alto > 30;
    ctx.font = `800 ${chico ? 12.5 : 14}px ${FUENTE}`; ctx.textAlign = "center";
    ctx.fillStyle = dentro && esVital ? "#fff" : TINTA;
    ctx.fillText(nf.format(d.unidades), cx, dentro ? by + 20 : by - 7);
    ctx.font = `${esVital ? 800 : 500} ${chico ? 11 : 12.5}px ${FUENTE}`; ctx.fillStyle = TINTA;
    partir(ctx, d.nombre, slot - 10, chico ? 3 : 2).forEach((l, k) => ctx.fillText(l, cx, top + ph + 22 + k * (chico ? 13 : 15)));
    ctx.font = `500 ${chico ? 10.5 : 12}px ${FUENTE}`; ctx.fillStyle = GRIS; ctx.fillText(`${pc0(d.pctDefectos)} del total`, cx, top + ph + pie - 8);
    puntos.push({ x: cx, y: yDe(acum), p: acum / total });
  });

  /* La línea del acumulado, con un punto y su % en cada defecto. */
  ctx.strokeStyle = ROJO; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath();
  puntos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  for (const p of puntos) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ROJO; ctx.stroke();
    const t = pc0(p.p); ctx.font = `900 ${chico ? 12 : 13.5}px ${FUENTE}`; ctx.textAlign = "center";
    const ancho = ctx.measureText(t).width + 8;
    ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fillRect(p.x - ancho / 2, p.y - 30, ancho, 19);
    ctx.fillStyle = ROJO; ctx.fillText(t, p.x, p.y - 16);
  }
  ctx.restore();
}

export type ExtraPareto = { titulo: string; ojo: string; periodo: string; generado: Date; logo?: HTMLImageElement | null };

/** La foto completa del pareto: banda negra, franja amarilla con las cifras, la gráfica y el pie. */
export function dibujarParetoFoto(c: CierreAi, x: ExtraPareto): HTMLCanvasElement {
  const W = 1280, escala = 2, G = 405;
  const cv = document.createElement("canvas");
  const alto = 96 + 4 + 84 + 56 + G + 44 + 84;
  cv.width = W * escala; cv.height = alto * escala;
  const ctx = cv.getContext("2d")!; ctx.scale(escala, escala);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, alto);

  /* La banda negra con el sello. */
  ctx.fillStyle = TINTA; ctx.fillRect(0, 0, W, 96); ctx.fillStyle = ROJO; ctx.fillRect(0, 96, W, 4);
  if (x.logo) ctx.drawImage(x.logo, 30, 24, 48, 48);
  else { ctx.beginPath(); ctx.arc(54, 48, 24, 0, Math.PI * 2); ctx.fillStyle = ORO; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = ROJO; ctx.stroke(); ctx.fillStyle = TINTA; ctx.font = `900 22px ${TITULO}`; ctx.textAlign = "center"; ctx.fillText("B", 54, 56) }
  ctx.textAlign = "left";
  ctx.font = `700 11px ${FUENTE}`; ctx.fillStyle = "#FFE08A"; ctx.fillText(`SIDER · ${x.ojo}`.toUpperCase().split("").join(" "), 98, 30);
  ctx.font = `900 30px ${TITULO}`; ctx.fillStyle = "#fff"; ctx.fillText(`Pareto de defectos · ${x.titulo}`, 98, 62);
  ctx.font = `500 13px ${FUENTE}`; ctx.fillStyle = "#d6dce4";
  ctx.fillText(`${x.periodo.charAt(0).toUpperCase() + x.periodo.slice(1)} · foto de las ${x.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`, 98, 84);

  /* La franja del acento. */
  ctx.fillStyle = ORO; ctx.fillRect(0, 100, W, 84);
  const v = vitales(c.pareto), vPct = v.length ? v[v.length - 1].acumulado : 0;
  const kpi = (xx: number, k: string, val: string, s: string, der = false) => {
    ctx.textAlign = der ? "right" : "left";
    ctx.fillStyle = TINTA; ctx.globalAlpha = 0.8; ctx.font = `700 10.5px ${FUENTE}`; ctx.fillText(k.split("").join(" "), xx, 122); ctx.globalAlpha = 1;
    ctx.font = `900 38px ${TITULO}`; ctx.fillText(val, xx, 158);
    ctx.globalAlpha = 0.85; ctx.font = `500 12px ${FUENTE}`; ctx.fillText(s, xx, 176); ctx.globalAlpha = 1;
  };
  kpi(34, "DEFECTOS ENCONTRADOS", nf.format(c.malas), "unidades en mal estado");
  kpi(340, "CANTIDAD REVISADA", nf.format(c.revisadas), `${c.vh} VH · ${c.cds.length} CD${c.cds.length === 1 ? "" : "s"}`);
  kpi(640, "%AI", pc(c.indice), "mal estado ÷ revisadas");
  kpi(W - 34, "LOS POCOS VITALES", `${v.length} de ${c.pareto.length}`, `forman el ${pc0(vPct)} de los defectos`, true);

  /* El título de la sección y la gráfica. */
  let y = 184 + 34;
  ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `900 18px ${TITULO}`; ctx.fillText("Defecto más encontrado · pareto", 34, y);
  ctx.textAlign = "right"; ctx.fillStyle = GRIS; ctx.font = `500 12.5px ${FUENTE}`; ctx.fillText("barras = unidades · línea = % acumulado de los defectos", W - 34, y);
  ctx.fillStyle = TINTA; ctx.fillRect(34, y + 9, W - 68, 2);
  y += 18;
  pintarGrafica(ctx, 34, y, W - 68, G, c.pareto);
  y += G + 8;

  /* La leyenda. */
  let lx = 34; ctx.textAlign = "left"; ctx.font = `500 12.5px ${FUENTE}`; ctx.textBaseline = "alphabetic";
  const cuadro = (col: string, t: string) => { ctx.fillStyle = col; ctx.fillRect(lx, y + 6, 14, 14); ctx.fillStyle = AZUL; ctx.fillText(t, lx + 20, y + 18); lx += 20 + ctx.measureText(t).width + 24 };
  cuadro(TINTA, "Los que forman el 80 % del problema"); cuadro(RESTO, "El resto");
  ctx.strokeStyle = ROJO; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, y + 13); ctx.lineTo(lx + 32, y + 13); ctx.stroke();
  ctx.beginPath(); ctx.arc(lx + 16, y + 13, 4.5, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke();
  ctx.fillStyle = AZUL; ctx.fillText("% acumulado", lx + 40, y + 18); lx += 40 + ctx.measureText("% acumulado").width + 24;
  ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = TINTA; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lx, y + 13); ctx.lineTo(lx + 32, y + 13); ctx.stroke(); ctx.restore();
  ctx.fillStyle = AZUL; ctx.fillText("línea del 80 %", lx + 40, y + 18);
  y += 34;

  /* El pie: la lectura en una frase y las notas. */
  ctx.fillStyle = LINEA; ctx.fillRect(34, y, W - 68, 1); y += 24;
  const t0 = c.pareto[0];
  if (t0) {
    ctx.font = `800 13.5px ${FUENTE}`; ctx.fillStyle = TINTA; ctx.fillText(t0.nombre, 34, y);
    const a = ctx.measureText(t0.nombre).width;
    ctx.font = `500 13.5px ${FUENTE}`; ctx.fillStyle = AZUL;
    ctx.fillText(` es el ${pc0(t0.pctDefectos)} de los defectos. Con ${v.length === 1 ? "el primero" : `los ${v.length} primeros`} ya se explica el ${pc0(vPct)} de lo que se encontró.`, 34 + a, y);
  }
  y += 22;
  ctx.font = `500 11.5px ${FUENTE}`; ctx.fillStyle = GRIS;
  const nota = `%AI = unidades en mal estado ÷ unidades revisadas, sumadas.${c.otras.length ? ` Contadas que no cobran (no entran en el %AI): ${c.otras.map((o) => `${o.nombre} ${nf.format(o.unidades)}`).join(" · ")}.` : ""}`;
  partir(ctx, nota, W - 68, 3).forEach((l, i) => ctx.fillText(l, 34, y + i * 16));
  return cv;
}
