/**
 * EL INFORME %AI — LAS GRÁFICAS Y LA LECTURA DEL PERÍODO.
 *
 * «Con el logo y el formato, o sea, ponle el 10.» El papel es el del análisis de diferencia (`informe-ai-doc.ts` arma los
 * bloques y los pinta `cierre-pdf.ts` / `cierre-word.ts`); aquí van las piezas que ese papel no tenía: las gráficas
 * (pareto con la curva del acumulado y la raya del 80 %, barras por origen y por DRY, la tendencia por día) y las frases
 * de «Lo que dice el período».
 *
 * NO CALCULA EL %AI: la pantalla arma `DatosInformeAi` con lo mismo que pinta, con los filtros puestos. LAS GRÁFICAS SE
 * PINTAN UNA VEZ en un lienzo a 12 px/mm, sin fondo, y ese PNG va igual al PDF y al Word.
 */
import { PALETA_MARCA } from "@/modulos/rotlinea/hoja";
import type { ParetoFila } from "./cierre-ai";
import type { PorDia, PorEnvase, PorOrigen, PorSocio } from "./informe-ai";

type RGB = [number, number, number];

export type DatosInformeAi = {
  desde: string; hasta: string; filtros: string;
  total: { revisiones: number; revisadas: number; defectos: number; indice: number };
  origenes: PorOrigen[];
  causales: ParetoFila[];
  otrosCausal: { nombre: string; unidades: number }[];
  top5: (ParetoFila & { socio?: PorSocio })[];
  /** Todo el mal estado de los socios (el 100 % del pareto de DRY). */
  malasSocios: number;
  envases: (ParetoFila & { env?: PorEnvase })[];
  dias: PorDia[];
};

/* ---------------- formatos ---------------- */
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const n0 = (v: number) => nf0.format(Math.round(v));
/** %AI y partes del total, con dos decimales: «3,49 %». */
export const pc = (x: number) => nf2.format(x * 100) + " %";
const pc1 = (x: number) => nf1.format(x * 100) + " %";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fecha = (iso: string) => new Date(iso + "T12:00:00Z");
export const corta = (iso: string) => `${fecha(iso).getUTCDate()} ${MESES[fecha(iso).getUTCMonth()].slice(0, 3)}`;
const larga = (iso: string) => { const d = fecha(iso); return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}` };
/** «1 al 19 de noviembre de 2026», «28 de octubre al 3 de noviembre de 2026» o un solo día. */
export function periodoLargo(desde: string, hasta: string) {
  if (!desde || !hasta) return "";
  if (desde === hasta) return larga(desde);
  const a = fecha(desde), b = fecha(hasta);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${larga(desde)} al ${larga(hasta)}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${a.getUTCDate()} de ${MESES[a.getUTCMonth()]} al ${larga(hasta)}`;
  return `${a.getUTCDate()} al ${larga(hasta)}`;
}

/* LOS COLORES DE LAS GRÁFICAS, los mismos del pareto de la pantalla (`foto-pareto.ts`): casi negro para
   lo que manda (las causas vitales, el primero), gris azulado para el resto y el rojo Bavaria para la
   curva del acumulado, la línea del %AI y los días por encima. «Ese color mierdita no me gusta»: nada de dorado. */
export const FUERTE = "#111111", GRIS_BARRA = "#B4BEC9", ROJO = "#C8102E";

/* =====================================================================
   LO QUE DICE EL PERÍODO (la lectura, en frases cortas)
   ===================================================================== */
/** Las que juntas llegan al 80 %: la que cruza la raya también cuenta. */
export const vitales = <T extends ParetoFila>(p: T[]) => p.filter((x) => x.acumulado - x.pctDefectos < 0.8);

export function hallazgos(d: DatosInformeAi): string[] {
  const out: string[] = [];
  const t = d.total;
  out.push(`El %AI del período fue ${pc(t.indice)}: ${n0(t.defectos)} unidades en mal estado de ${n0(t.revisadas)} revisadas, en ${n0(t.revisiones)} revisiones.`);
  if (d.origenes.length > 1) {
    const o = [...d.origenes].sort((a, b) => b.indice - a.indice);
    const alto = o[0], bajo = o[o.length - 1];
    out.push(`${alto.origen} es el origen con el %AI más alto (${pc(alto.indice)}) y aporta el ${pc1(t.defectos ? alto.malas / t.defectos : 0)} del mal estado; ${bajo.origen} el más bajo (${pc(bajo.indice)}).`);
  } else if (d.origenes.length === 1) out.push(`Todo viene de un solo origen: ${d.origenes[0].origen}.`);
  const v = vitales(d.causales);
  if (v.length) {
    const ult = v[v.length - 1];
    out.push(v.length === 1
      ? `Una sola causal explica el ${pc1(ult.acumulado)} del mal estado: ${v[0].nombre}.`
      : `${v.length} causales explican el ${pc1(ult.acumulado)} del mal estado: ${v.map((x) => x.nombre).join(", ")}.`);
  }
  if (d.top5.length) {
    const a5 = d.top5[d.top5.length - 1].acumulado;
    out.push(`Los ${d.top5.length} DRY con más mal estado suman el ${pc1(a5)} del mal estado de los socios; el primero es ${d.top5[0].nombre} con ${n0(d.top5[0].unidades)} unidades (%AI ${pc(d.top5[0].socio?.indice ?? 0)}).`);
  }
  if (d.envases.length) {
    const e = d.envases[0];
    const peor = [...d.envases].filter((x) => (x.env?.revisadas ?? 0) > 0).sort((a, b) => (b.env?.indice ?? 0) - (a.env?.indice ?? 0))[0];
    out.push(peor && peor.clave !== e.clave
      ? `${e.nombre} es la referencia con más mal estado (${n0(e.unidades)} unidades, ${pc1(e.pctDefectos)} del total); la de %AI más alto es ${peor.nombre} (${pc(peor.env?.indice ?? 0)}).`
      : `${e.nombre} es la referencia con más mal estado (${n0(e.unidades)} unidades, ${pc1(e.pctDefectos)} del total) y también la de %AI más alto (${pc(e.env?.indice ?? 0)}).`);
  }
  if (d.dias.length > 1) {
    const sobre = d.dias.filter((x) => x.indice > t.indice).length;
    const pico = [...d.dias].sort((a, b) => b.indice - a.indice)[0];
    out.push(`${sobre} de ${d.dias.length} días quedaron por encima del %AI del período; el más alto fue el ${corta(pico.dia)} con ${pc(pico.indice)}.`);
  }
  return out;
}

/* =====================================================================
   LAS GRÁFICAS (lienzo a 12 px por mm; el PNG va igual al PDF y al Word)
   ===================================================================== */
const K = 12;
export const MEDIDA = {
  pareto: { ancho: 182, alto: 80 },
  tendencia: { ancho: 182, alto: 66 },
} as const;

function lienzo(wmm: number, hmm: number) {
  const c = document.createElement("canvas");
  c.width = Math.round(wmm * K); c.height = Math.round(hmm * K);
  const ctx = c.getContext("2d")!;
  /* Sin fondo: el PNG queda transparente y deja ver la marca de agua de la hoja. */
  ctx.textBaseline = "middle";
  return { c, ctx, W: c.width, H: c.height };
}
const letra = (ctx: CanvasRenderingContext2D, peso: number, mm: number) => { ctx.font = `${peso} ${Math.round(mm * K)}px Helvetica, Arial, sans-serif` };
const rgb = (t: RGB) => `rgb(${t.join(",")})`;
/** Texto con un filo blanco alrededor: se lee aunque caiga sobre una columna o una raya. */
function halo(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, color: string) {
  ctx.lineWidth = 0.7 * K; ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineJoin = "round"; ctx.strokeText(t, x, y);
  ctx.fillStyle = color; ctx.fillText(t, x, y);
}
/** Parte un nombre en a lo sumo dos renglones que quepan en `ancho` px; el segundo se corta con «…». */
function dosRenglones(ctx: CanvasRenderingContext2D, txt: string, ancho: number): string[] {
  const pal = txt.split(/\s+/); const r: string[] = [""];
  for (const p of pal) {
    const prueba = r[r.length - 1] ? `${r[r.length - 1]} ${p}` : p;
    if (ctx.measureText(prueba).width <= ancho || !r[r.length - 1]) r[r.length - 1] = prueba;
    else if (r.length < 2) r.push(p);
    else { r[1] += ` ${p}`; break }
  }
  if (r[1]) { let s = r[1]; const corto = s; while (ctx.measureText(s).width > ancho && s.length > 3) s = s.slice(0, -2); if (s !== corto) r[1] = s.trimEnd() + "…" }
  if (ctx.measureText(r[0]).width > ancho) { let s = r[0]; while (ctx.measureText(s).width > ancho && s.length > 3) s = s.slice(0, -2); r[0] = s + "…" }
  return r.filter(Boolean);
}

/**
 * EL PARETO: columnas de más a menos unidades (las vitales en negro, el resto en gris), la curva del
 * acumulado en rojo con su % en cada punto y la raya del 80 %. La escala de las columnas y la del
 * acumulado van aparte: con veinte causales, una escala común deja las columnas en el piso. Más de
 * 12 renglones se juntan en «Otros (n)» para que los nombres se lean; la tabla los trae todos.
 */
export function graficaPareto(filas: ParetoFila[], tinta: RGB = PALETA_MARCA.tinta): string {
  const { c, ctx, W, H } = lienzo(MEDIDA.pareto.ancho, MEDIDA.pareto.alto);
  const MAXN = 12;
  const vit = new Set(vitales(filas).map((x) => x.clave));
  type Col = { nombre: string; unidades: number; acum: number; vital: boolean };
  let cols: Col[] = filas.map((x) => ({ nombre: x.nombre, unidades: x.unidades, acum: x.acumulado, vital: vit.has(x.clave) }));
  if (cols.length > MAXN) {
    const resto = cols.slice(MAXN - 1);
    cols = [...cols.slice(0, MAXN - 1), { nombre: `Otros (${resto.length})`, unidades: resto.reduce((a, x) => a + x.unidades, 0), acum: 1, vital: false }];
  }
  const ML = 4 * K, MR = 12 * K, MT = 9 * K, MB = 13 * K;
  const n = Math.max(1, cols.length), PASO = (W - ML - MR) / n, BW = Math.min(18 * K, PASO * 0.6);
  const max = Math.max(1, ...cols.map((x) => x.unidades)) * 1.12;
  const ph = H - MT - MB;
  const Yb = (v: number) => H - MB - (v / max) * ph;
  const Yp = (p: number) => H - MB - p * ph;
  /* La rejilla y el eje del acumulado, a la derecha. */
  ctx.lineWidth = 2;
  for (const p of [0.25, 0.5, 0.75, 1]) {
    ctx.strokeStyle = "#E6EAF0"; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(ML, Yp(p)); ctx.lineTo(W - MR, Yp(p)); ctx.stroke();
    if (p !== 0.75) { letra(ctx, 600, 2.4); ctx.fillStyle = "#8A96A3"; ctx.textAlign = "left"; ctx.fillText(`${Math.round(p * 100)} %`, W - MR + 2 * K, Yp(p)) }
  }
  ctx.strokeStyle = rgb(tinta); ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
  ctx.beginPath(); ctx.moveTo(ML, Yp(0.8)); ctx.lineTo(W - MR, Yp(0.8)); ctx.stroke(); ctx.setLineDash([]);
  letra(ctx, 800, 2.4); ctx.fillStyle = rgb(tinta); ctx.textAlign = "left"; ctx.fillText("80 %", W - MR + 2 * K, Yp(0.8));
  ctx.strokeStyle = "#9AA5B1"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ML, H - MB + 1); ctx.lineTo(W - MR, H - MB + 1); ctx.stroke();
  /* Las columnas, con su cifra encima y el nombre abajo. */
  const cx = (i: number) => ML + i * PASO + PASO / 2;
  cols.forEach((x, i) => {
    const y = Yb(x.unidades);
    ctx.fillStyle = x.vital ? FUERTE : GRIS_BARRA; ctx.fillRect(cx(i) - BW / 2, y, BW, H - MB - y);
    /* La cifra va DENTRO de la columna, al pie: arriba choca con la curva del acumulado. */
    letra(ctx, 800, n > 9 ? 2.3 : 2.7); ctx.textAlign = "center";
    if (H - MB - y >= 6 * K) { ctx.fillStyle = x.vital ? "#FFFFFF" : rgb(tinta); ctx.fillText(n0(x.unidades), cx(i), H - MB - 2.8 * K) }
    else { ctx.fillStyle = rgb(tinta); ctx.fillText(n0(x.unidades), cx(i), y - 2.2 * K) }
    letra(ctx, x.vital ? 700 : 500, n > 9 ? 2.2 : 2.5); ctx.fillStyle = x.vital ? rgb(tinta) : "#5F6B79";
    dosRenglones(ctx, x.nombre, PASO - 1.2 * K).forEach((r, k) => ctx.fillText(r, cx(i), H - MB + (3.4 + k * 3) * K));
  });
  /* La curva del acumulado. */
  ctx.strokeStyle = ROJO; ctx.lineWidth = 0.6 * K; ctx.lineJoin = "round"; ctx.beginPath();
  cols.forEach((x, i) => (i ? ctx.lineTo(cx(i), Yp(x.acum)) : ctx.moveTo(cx(i), Yp(x.acum)))); ctx.stroke();
  cols.forEach((x, i) => {
    ctx.beginPath(); ctx.arc(cx(i), Yp(x.acum), 1.1 * K, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.lineWidth = 0.45 * K; ctx.strokeStyle = ROJO; ctx.stroke();
    letra(ctx, 800, 2.4); ctx.textAlign = "center";
    halo(ctx, `${Math.round(x.acum * 100)} %`, cx(i), Yp(x.acum) - 2.8 * K, ROJO);
  });
  return c.toDataURL("image/png");
}

/** La tendencia: el %AI de cada día con el área suave, la raya del %AI del período y los días por encima en rojo. */
export const graficaTendencia = (dias: PorDia[], promedio: number, tinta: RGB = PALETA_MARCA.tinta): string =>
  lienzoTendencia(dias, promedio, tinta).toDataURL("image/png");
/** El mismo dibujo como lienzo, para pegarlo dentro de otra imagen (la foto del informe). */
export function lienzoTendencia(dias: PorDia[], promedio: number, tinta: RGB = PALETA_MARCA.tinta): HTMLCanvasElement {
  const { c, ctx, W, H } = lienzo(MEDIDA.tendencia.ancho, MEDIDA.tendencia.alto);
  const ML = 6 * K, MR = 6 * K, MT = 12 * K, MB = 12 * K;
  if (!dias.length) return c;
  const techo = Math.max(promedio, ...dias.map((x) => x.indice)) * 1.18 || 0.01;
  const X = (i: number) => (dias.length === 1 ? W / 2 : ML + (i * (W - ML - MR)) / (dias.length - 1));
  const Y = (v: number) => MT + (1 - v / techo) * (H - MT - MB);
  ctx.strokeStyle = "#E3E8EE"; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
  for (const t of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(ML, MT + t * (H - MT - MB)); ctx.lineTo(W - MR, MT + t * (H - MT - MB)); ctx.stroke() }
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(200,16,46,0.07)"; ctx.beginPath(); ctx.moveTo(X(0), H - MB);
  dias.forEach((x, i) => ctx.lineTo(X(i), Y(x.indice))); ctx.lineTo(X(dias.length - 1), H - MB); ctx.closePath(); ctx.fill();
  /* La raya del período. */
  ctx.strokeStyle = rgb(tinta); ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
  ctx.beginPath(); ctx.moveTo(ML, Y(promedio)); ctx.lineTo(W - MR, Y(promedio)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = ROJO; ctx.lineWidth = 0.6 * K; ctx.lineJoin = "round"; ctx.beginPath();
  dias.forEach((x, i) => (i ? ctx.lineTo(X(i), Y(x.indice)) : ctx.moveTo(X(i), Y(x.indice)))); ctx.stroke();
  const pico = dias.reduce((a, x) => (x.indice > a.indice ? x : a), dias[0]);
  const paso = Math.max(1, Math.ceil(dias.length / 16));
  dias.forEach((x, i) => {
    const sobre = x.indice > promedio;
    ctx.beginPath(); ctx.arc(X(i), Y(x.indice), (x === pico ? 1.5 : 1.05) * K, 0, Math.PI * 2);
    ctx.fillStyle = sobre ? ROJO : "#FFFFFF"; ctx.fill(); ctx.lineWidth = 0.45 * K; ctx.strokeStyle = sobre ? ROJO : FUERTE; ctx.stroke();
    /* LA ETIQUETA DE CADA DÍA, en todos los puntos. Va arriba si el punto es un pico frente a sus vecinos y abajo si es
       un valle: así dos días seguidos no se montan la cifra. */
    const vec = [dias[i - 1], dias[i + 1]].filter(Boolean).map((v) => v!.indice);
    const abajo = vec.length > 0 && x.indice < vec.reduce((a, v) => a + v, 0) / vec.length;
    letra(ctx, 800, dias.length > 30 ? 1.8 : dias.length > 14 ? 2.2 : 2.6); ctx.textAlign = "center";
    halo(ctx, nf2.format(x.indice * 100), X(i), Y(x.indice) + (abajo ? 3 : -3) * K, sobre ? ROJO : rgb(tinta));
    if ((i % paso === 0 && dias.length - 1 - i >= paso / 2) || i === dias.length - 1) { letra(ctx, 500, 2.4); ctx.fillStyle = "#5F6B79"; ctx.textAlign = "center"; ctx.fillText(corta(x.dia), X(i), H - MB / 2) }
  });
  /* La leyenda arriba a la derecha, fuera de la línea: la raya del período y los días por encima. */
  letra(ctx, 600, 2.4); ctx.textAlign = "right";
  const t2 = "día por encima", t1 = `%AI del período ${pc(promedio)}`;
  let lx = W - MR; const ly = 3.5 * K;
  ctx.fillStyle = "#5F6B79"; ctx.fillText(t2, lx, ly); lx -= ctx.measureText(t2).width + 2.2 * K;
  ctx.beginPath(); ctx.arc(lx, ly, 1 * K, 0, Math.PI * 2); ctx.fillStyle = ROJO; ctx.fill(); lx -= 5 * K;
  letra(ctx, 800, 2.4); ctx.fillStyle = rgb(tinta); ctx.fillText(t1, lx, ly); lx -= ctx.measureText(t1).width + 2 * K;
  ctx.strokeStyle = rgb(tinta); ctx.lineWidth = 3; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.moveTo(lx - 8 * K, ly); ctx.lineTo(lx, ly); ctx.stroke(); ctx.setLineDash([]);
  return c;
}

/** EL PARETO POR ORIGEN: los CDs de más a menos unidades en mal estado, con su parte del mal estado y el acumulado. */
export function paretoOrigen(d: DatosInformeAi): ParetoFila[] {
  const malas = d.origenes.reduce((a, x) => a + x.malas, 0);
  let acum = 0;
  return [...d.origenes].filter((x) => x.malas > 0).sort((a, b) => b.malas - a.malas).map((x) => {
    acum += x.malas;
    return { clave: x.origen, nombre: x.origen, unidades: x.malas, pct: d.total.revisadas ? x.malas / d.total.revisadas : 0,
             pctDefectos: malas ? x.malas / malas : 0, acumulado: malas ? acum / malas : 0 };
  });
}
