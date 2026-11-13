/**
 * EL COMPARATIVO DE LO PENDIENTE POR DARLE DE BAJA, DÍA POR DÍA.
 *
 * «Una tabla que muestre por descripción (que serían 3) y por SKU las cantidades, y compararlo con los días
 *  anteriores: así voy viendo por días cuántas unidades pendientes por baja voy teniendo, cuántas se van
 *  incrementando o bajando, y que pueda copiar, pegar y compartir.»
 *
 * Cada día es LO MISMO que sale en «Exportar pendiente de baja» (la columna Total Unidades de la hoja Conteos):
 *   SORTING          Baja · Fábrica (AG18)
 *   PRESORTING       Baja · Bodega 38 (AG22)
 *   ROTURA DE LINEA  lo que se subió al pasivo de ese día con esa causal
 * Aquí no se calcula el pendiente: llega hecho por día (`DiaPendiente`); esto solo lo pone lado a lado,
 * saca los subtotales, el total y cuánto subió o bajó contra el día anterior, y lo dibuja para compartir.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import { BORDE, FONDO, FOTO, GRIS, HUECO, MARGEN, cabecera, espaciado, letra, pie, recortar } from "@/modulos/foto";

export const DESCRIPCIONES = [
  { k: "SORTING", t: "SORTING", sub: "Baja · Fábrica · AG18" },
  { k: "PRESORTING", t: "PRESORTING", sub: "Baja · Bodega 38 · AG22" },
  { k: "ROTURA DE LINEA", t: "ROTURA DE LÍNEA", sub: "Pasivo del día · causal rotura de línea" },
] as const;
export type Descripcion = (typeof DESCRIPCIONES)[number]["k"];

export type LineaPendiente = { desc: Descripcion; codigo: string; material: string; un: number };
export type DiaPendiente = { fecha: string; filas: LineaPendiente[]; error?: string | null };

export type FilaComparativo = { codigo: string; material: string; valores: (number | null)[]; delta: number | null };
export type GrupoComparativo = { desc: Descripcion; titulo: string; sub: string; filas: FilaComparativo[]; totales: (number | null)[]; delta: number | null };
export type Comparativo = { fechas: string[]; grupos: GrupoComparativo[]; totales: (number | null)[]; delta: number | null };

/** Suma por SKU dentro de cada descripción (el reparto 85/15 de Fábrica no importa aquí: va la cantidad completa). */
export function sumarLineas(filas: LineaPendiente[]): LineaPendiente[] {
  const m = new Map<string, LineaPendiente>();
  for (const f of filas) {
    const k = `${f.desc}|${f.codigo}`;
    const x = m.get(k);
    if (x) x.un += f.un; else m.set(k, { ...f });
  }
  return [...m.values()];
}

/** `dias` del más viejo al más nuevo. Un día que no se pudo leer queda en null (se ve «—»), no en cero. */
export function armarComparativo(dias: DiaPendiente[]): Comparativo {
  const fechas = dias.map((d) => d.fecha);
  const ok = dias.map((d) => !d.error);
  const n = dias.length;
  const dif = (v: (number | null)[]) => (n >= 2 && v[n - 1] != null && v[n - 2] != null ? v[n - 1]! - v[n - 2]! : null);
  const grupos: GrupoComparativo[] = DESCRIPCIONES.map((D) => {
    const skus = new Map<string, string>();
    for (const d of dias) for (const f of d.filas) if (f.desc === D.k && !skus.has(f.codigo)) skus.set(f.codigo, f.material);
    const filas: FilaComparativo[] = [...skus].map(([codigo, material]) => {
      const valores = dias.map((d, i) => (ok[i] ? d.filas.filter((f) => f.desc === D.k && f.codigo === codigo).reduce((t, f) => t + f.un, 0) : null));
      return { codigo, material, valores, delta: dif(valores) };
    }).sort((a, b) => (b.valores[n - 1] ?? 0) - (a.valores[n - 1] ?? 0) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
    const totales = dias.map((_, i) => (ok[i] ? filas.reduce((t, f) => t + (f.valores[i] ?? 0), 0) : null));
    return { desc: D.k, titulo: D.t, sub: D.sub, filas, totales, delta: dif(totales) };
  });
  const totales = dias.map((_, i) => (ok[i] ? grupos.reduce((t, g) => t + (g.totales[i] ?? 0), 0) : null));
  return { fechas, grupos, totales, delta: dif(totales) };
}

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
export const unidades = (x: number | null) => (x == null ? "—" : nf.format(x));
export const conSigno = (x: number | null) => (x == null ? "—" : x === 0 ? "0" : (x > 0 ? "+" : "−") + nf.format(Math.abs(x)));
/** Con flecha: ▲ subió (más pendiente), ▼ bajó. */
export const flecha = (x: number | null) => (x == null ? "—" : x === 0 ? "=" : `${x > 0 ? "▲" : "▼"} ${nf.format(Math.abs(x))}`);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const SEM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export const diaCorto = (f: string) => `${Number(f.slice(8, 10))}-${MESES[Number(f.slice(5, 7)) - 1]}`;
export const diaSemana = (f: string) => SEM[new Date(f + "T12:00:00Z").getUTCDay()];

/** Para pegar en Excel o en un correo: separado por tabulaciones, con subtotales y total. */
export function textoComparativo(c: Comparativo): string {
  const L: string[] = [];
  const cab = ["Descripción", "SKU", "Material", ...c.fechas.map(diaCorto), ...(c.fechas.length >= 2 ? ["Δ vs día anterior"] : [])];
  L.push(cab.join("\t"));
  const num = (x: number | null) => (x == null ? "" : String(x));
  for (const g of c.grupos) {
    for (const f of g.filas) L.push([g.titulo, f.codigo, f.material, ...f.valores.map(num), ...(c.fechas.length >= 2 ? [num(f.delta)] : [])].join("\t"));
    L.push([`Total ${g.titulo}`, "", "", ...g.totales.map(num), ...(c.fechas.length >= 2 ? [num(g.delta)] : [])].join("\t"));
  }
  L.push(["TOTAL PENDIENTE DE BAJA", "", "", ...c.totales.map(num), ...(c.fechas.length >= 2 ? [num(c.delta)] : [])].join("\t"));
  return L.join("\n");
}

/* ======================= LA IMAGEN PARA COMPARTIR ======================= */
type Extra = { paleta?: Paleta; logo?: CanvasImageSource | null; generado?: Date };

function nuevoLienzo(W: number, H: number) {
  const c = document.createElement("canvas");
  c.width = W * FOTO.escala; c.height = H * FOTO.escala;
  const ctx = c.getContext("2d")!;
  ctx.scale(FOTO.escala, FOTO.escala); ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);
  return { c, ctx };
}

/** LA IMAGEN, IGUAL QUE LA VENTANA: una sola tabla — cabecera negra con los días (el último subrayado en el acento),
 *  un renglón por descripción, los SKU (el día de hoy sombreado, lo que subió en rojo y lo que bajó en verde), el total
 *  de cada descripción y abajo el TOTAL PENDIENTE DE BAJA en el acento. Sin tarjetas arriba. */
export function dibujarComparativo(c: Comparativo, extra: Extra = {}): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const W = FOTO.ancho, M = MARGEN, G = HUECO, n = c.fechas.length, conDelta = n >= 2;
  const VERDE = "#0F7A4A", ROJO = "#C8102E", HOY = "rgba(255, 192, 0, .10)", CERO = "#AAB3BE";

  /* columnas */
  const x0 = M, ancho = W - 2 * M;
  const wSku = 120, wDia = 150, wDel = conDelta ? 170 : 0;
  const wMat = ancho - wSku - wDia * n - wDel;
  const xDia = (i: number) => x0 + wSku + wMat + i * wDia;
  const xDel = x0 + wSku + wMat + n * wDia;

  /* alturas */
  const hCab = 52, hGrupo = 46, hFila = 34, hSub = 36, hTot = 46;
  const visibles = c.grupos.filter((g) => g.filas.length);
  const hTabla = hCab + visibles.reduce((t, g) => t + hGrupo + g.filas.length * hFila + hSub, 0) + hTot;
  const yCards = 106, hCards = 112;
  const yT = yCards + hCards + G;
  const H = yT + hTabla + G + 34;

  const { c: cv, ctx } = nuevoLienzo(W, H);
  const hasta = c.fechas[n - 1] ?? "", desde = c.fechas[0] ?? "";
  cabecera(ctx, W, [`${n} ${n === 1 ? "día" : "días"} de conteo`], P, extra.logo, "Pendiente de baja · comparativo",
    n > 1 ? `Unidades pendientes por darle de baja, día por día · del ${diaCorto(desde)} al ${diaCorto(hasta)} de ${hasta.slice(0, 4)}` : `Unidades pendientes por darle de baja · ${diaCorto(hasta)}`);

  /* ---------- EL TOTAL DE CADA DÍA (el último, destacado) ---------- */
  const cw = (W - 2 * M - G * (n - 1)) / Math.max(1, n);
  c.fechas.forEach((d, i) => {
    const x = M + i * (cw + G), yc = yCards, ult = i === n - 1;
    ctx.fillStyle = ult ? ACENTO : "#FFFFFF"; ctx.fillRect(x, yc, cw, hCards);
    if (!ult) { ctx.strokeStyle = BORDE; ctx.strokeRect(x + .5, yc + .5, cw - 1, hCards - 1) }
    ctx.fillStyle = TINTA; ctx.fillRect(x, ult ? yc : yc + hCards - 4, ult ? 8 : cw, ult ? hCards : 4);
    letra(ctx, 800, 13); ctx.fillStyle = ult ? TINTA : GRIS; ctx.textAlign = "left";
    espaciado(ctx, `${diaSemana(d).toUpperCase()} ${diaCorto(d).toUpperCase()}`, x + 22, yc + 24, 1.1);
    letra(ctx, 900, 34); ctx.fillStyle = TINTA; ctx.fillText(recortar(ctx, unidades(c.totales[i]), cw - 40), x + 22, yc + 62);
    const prev = i > 0 ? c.totales[i - 1] : null, v = c.totales[i];
    const dd = prev != null && v != null ? v - prev : null;
    letra(ctx, 700, 13);
    ctx.fillStyle = ult || dd == null || dd === 0 ? (ult ? TINTA : GRIS) : dd > 0 ? ROJO : VERDE;
    ctx.fillText(dd == null ? "unidades" : dd === 0 ? "igual que el día anterior" : `${dd > 0 ? "▲" : "▼"} ${conSigno(dd)} vs el día anterior`, x + 22, yc + hCards - 22);
  });

  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x0, yT, ancho, hTabla);
  ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(x0 + .5, yT + .5, ancho - 1, hTabla - 1);

  /* la columna de hoy, sombreada de arriba abajo (bajo los renglones) */
  const sombraHoy = (y: number, h: number) => { ctx.fillStyle = HOY; ctx.fillRect(xDia(n - 1), y, wDia, h) };
  const num = (t: string, xDer: number, y: number, col: string, peso = 600, px = 14) => {
    letra(ctx, peso, px); ctx.fillStyle = col; ctx.textAlign = "right"; ctx.fillText(t, xDer, y);
  };
  const colDelta = (d: number | null) => (d == null || d === 0 ? GRIS : d > 0 ? ROJO : VERDE);

  /* ---------- CABECERA DE LA TABLA ---------- */
  let y = yT;
  ctx.fillStyle = TINTA; ctx.fillRect(x0, y, ancho, hCab);
  letra(ctx, 800, 12); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  espaciado(ctx, "SKU · MATERIAL", x0 + 14, y + hCab / 2, 1);
  c.fechas.forEach((d, i) => {
    letra(ctx, 800, 12); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "right";
    ctx.fillText(diaSemana(d).toUpperCase(), xDia(i) + wDia - 14, y + 18);
    ctx.fillText(diaCorto(d).toUpperCase(), xDia(i) + wDia - 14, y + 35);
  });
  if (n) { ctx.fillStyle = ACENTO; ctx.fillRect(xDia(n - 1) + 8, y + hCab - 4, wDia - 16, 4) }
  if (conDelta) {
    letra(ctx, 800, 12); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "right";
    ctx.fillText("VS DÍA", xDel + wDel - 14, y + 18); ctx.fillText("ANTERIOR", xDel + wDel - 14, y + 35);
  }
  y += hCab;

  /* ---------- CADA DESCRIPCIÓN ---------- */
  for (const g of visibles) {
    /* el renglón del título */
    letra(ctx, 900, 17); ctx.fillStyle = TINTA; ctx.textAlign = "left";
    ctx.fillStyle = ACENTO; ctx.fillRect(x0 + 14, y + 14, 5, 22);
    ctx.fillStyle = TINTA; ctx.fillText(g.titulo, x0 + 28, y + 26);
    const tw = ctx.measureText(g.titulo).width;
    letra(ctx, 500, 13); ctx.fillStyle = GRIS; ctx.fillText(g.sub, x0 + 40 + tw, y + 27);
    letra(ctx, 700, 13); ctx.textAlign = "right"; ctx.fillText(`${g.filas.length} SKU`, x0 + ancho - 14, y + 27);
    ctx.fillStyle = TINTA; ctx.fillRect(x0, y + hGrupo - 2, ancho, 2);
    y += hGrupo;

    /* los SKU */
    g.filas.forEach((f, k) => {
      if (k % 2 === 1) { ctx.fillStyle = "#FAFBFC"; ctx.fillRect(x0, y, ancho, hFila) }
      sombraHoy(y, hFila);
      ctx.fillStyle = "#EEF1F5"; ctx.fillRect(x0, y + hFila - 1, ancho, 1);
      const cy = y + hFila / 2;
      letra(ctx, 700, 14); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(f.codigo, x0 + 14, cy);
      letra(ctx, 600, 14); ctx.fillStyle = TINTA; ctx.fillText(recortar(ctx, f.material, wMat - 20), x0 + wSku, cy);
      f.valores.forEach((v, i) => num(unidades(v), xDia(i) + wDia - 14, cy, v === 0 ? CERO : TINTA, i === n - 1 ? 800 : 600));
      if (conDelta) num(flecha(f.delta), xDel + wDel - 14, cy, colDelta(f.delta), 800);
      y += hFila;
    });

    /* el total de la descripción */
    ctx.fillStyle = "#F3F5F8"; ctx.fillRect(x0, y, ancho, hSub);
    sombraHoy(y, hSub);
    ctx.fillStyle = BORDE; ctx.fillRect(x0, y + hSub - 1, ancho, 1);
    const cy = y + hSub / 2;
    letra(ctx, 800, 14); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(`Total ${g.titulo.toLowerCase()}`, x0 + 14, cy);
    g.totales.forEach((v, i) => num(unidades(v), xDia(i) + wDia - 14, cy, TINTA, 800));
    if (conDelta) num(flecha(g.delta), xDel + wDel - 14, cy, colDelta(g.delta), 800);
    y += hSub;
  }

  /* ---------- EL TOTAL ---------- */
  ctx.fillStyle = ACENTO; ctx.fillRect(x0, y, ancho, hTot);
  ctx.fillStyle = TINTA; ctx.fillRect(x0, y, ancho, 2);
  const cy = y + hTot / 2 + 1;
  letra(ctx, 900, 15); ctx.fillStyle = TINTA; ctx.textAlign = "left"; espaciado(ctx, "TOTAL PENDIENTE DE BAJA", x0 + 14, cy, .6);
  c.totales.forEach((v, i) => num(unidades(v), xDia(i) + wDia - 14, cy, TINTA, 900, 15));
  if (conDelta) num(flecha(c.delta), xDel + wDel - 14, cy, TINTA, 900, 15);

  if (!visibles.length) {
    letra(ctx, 600, 16); ctx.fillStyle = GRIS; ctx.textAlign = "center";
    ctx.fillText("No hay nada pendiente por darle de baja en estos días.", W / 2, yT + hCab + 30);
  }
  pie(ctx, W, H, extra.generado ?? new Date(),
    "Lo mismo que «Exportar pendiente de baja»: Dif cajas × factor caja (lo que el físico pasa del casco) + la rotura de línea del pasivo. ▲ subió · ▼ bajó.");
  return cv;
}
export const nombreComparativo = (desde: string, hasta: string) => `pendiente-baja-comparativo-${desde}-a-${hasta}.png`;
