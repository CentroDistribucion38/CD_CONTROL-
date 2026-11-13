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
import {
  BAJA_OK, BORDE, FONDO, FOTO, GRIS, HUECO, MARGEN, SUBE,
  altoTabla, anchosTabla, cabecera, dibujarTabla, espaciado, letra, medidor, pie, recortar,
  type ColTabla,
} from "@/modulos/foto";

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

/** Una fila de la tabla de la imagen: un SKU, o el total de la descripción. */
type FilaT = { codigo: string; material: string; valores: (number | null)[]; delta: number | null };

export function dibujarComparativo(c: Comparativo, extra: Extra = {}): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const W = FOTO.ancho, M = MARGEN, G = HUECO, n = c.fechas.length, conDelta = n >= 2;
  const med = medidor();

  const cols = (ancho: number) => anchosTabla<FilaT>([
    { t: "SKU", w: 100, gris: true, v: (f) => f.codigo },
    { t: "MATERIAL", w: 0, envuelve: true, v: (f) => f.material },
    ...c.fechas.map((d, i): ColTabla<FilaT> => ({ t: `${diaSemana(d).toUpperCase()} ${diaCorto(d).toUpperCase()}`, w: 112, num: true, fuerte: i === n - 1, v: (f) => unidades(f.valores[i]) })),
    ...(conDelta ? [{ t: "VS DÍA ANTERIOR", w: 130, num: true, fuerte: true, rojoNegativo: false, v: (f: FilaT) => flecha(f.delta) } as ColTabla<FilaT>] : []),
  ], ancho);

  /* alto: cabecera, tarjetas del total por día, un panel por descripción con su tabla */
  const yCards = 106, hCards = 112;
  let H = yCards + hCards + G;
  const aW = W - 2 * M - 32;
  const visibles = c.grupos.filter((g) => g.filas.length);
  const altoG = (g: GrupoComparativo) => 62 + altoTabla(med, cols(aW), g.filas) + 10;
  H += visibles.reduce((t, g) => t + altoG(g) + G, 0);
  if (!visibles.length) H += 120;
  H += 34;

  const { c: cv, ctx } = nuevoLienzo(W, H);
  const hasta = c.fechas[n - 1] ?? "", desde = c.fechas[0] ?? "";
  cabecera(ctx, W, [`${n} ${n === 1 ? "día" : "días"} de conteo`], P, extra.logo, "Pendiente de baja · comparativo",
    n > 1 ? `Unidades pendientes por darle de baja · del ${diaCorto(desde)} al ${diaCorto(hasta)} de ${hasta.slice(0, 4)}` : `Unidades pendientes por darle de baja · ${diaCorto(hasta)}`);

  /* ---------- EL TOTAL DE CADA DÍA (el último, destacado) ---------- */
  const cw = (W - 2 * M - G * (n - 1)) / Math.max(1, n);
  c.fechas.forEach((d, i) => {
    const x = M + i * (cw + G), y = yCards, ult = i === n - 1;
    ctx.fillStyle = ult ? ACENTO : "#FFFFFF"; ctx.fillRect(x, y, cw, hCards);
    if (!ult) { ctx.strokeStyle = BORDE; ctx.strokeRect(x + .5, y + .5, cw - 1, hCards - 1) }
    ctx.fillStyle = TINTA; ctx.fillRect(x, ult ? y : y + hCards - 4, ult ? 8 : cw, ult ? hCards : 4);
    letra(ctx, 800, 13); ctx.fillStyle = ult ? TINTA : GRIS; ctx.textAlign = "left";
    espaciado(ctx, `${diaSemana(d).toUpperCase()} ${diaCorto(d).toUpperCase()}`, x + 22, y + 24, 1.1);
    letra(ctx, 900, 34); ctx.fillStyle = TINTA; ctx.fillText(recortar(ctx, unidades(c.totales[i]), cw - 40), x + 22, y + 62);
    const prev = i > 0 ? c.totales[i - 1] : null, v = c.totales[i];
    const dd = prev != null && v != null ? v - prev : null;
    letra(ctx, 700, 13);
    ctx.fillStyle = dd == null || dd === 0 ? (ult ? TINTA : GRIS) : dd > 0 ? (ult ? TINTA : SUBE) : (ult ? TINTA : BAJA_OK);
    ctx.fillText(dd == null ? "unidades" : dd === 0 ? "igual que el día anterior" : `${dd > 0 ? "▲" : "▼"} ${conSigno(dd)} vs el día anterior`, x + 22, y + hCards - 22);
  });

  /* ---------- UNA TABLA POR DESCRIPCIÓN ---------- */
  let y = yCards + hCards + G;
  for (const g of visibles) {
    const h = altoG(g), b = { x: M, y, w: W - 2 * M, h };
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
    ctx.fillStyle = ACENTO; ctx.fillRect(b.x + 16, b.y + 18, 10, 10);
    letra(ctx, 800, 15); ctx.fillStyle = TINTA; ctx.textAlign = "left"; espaciado(ctx, g.titulo, b.x + 34, b.y + 24);
    letra(ctx, 600, 13); ctx.fillStyle = GRIS;
    ctx.fillText(g.sub, b.x + 34 + ctx.measureText(g.titulo).width + 60, b.y + 24);
    ctx.textAlign = "right";
    ctx.fillText(`${g.filas.length} ${g.filas.length === 1 ? "SKU" : "SKU"} · hoy ${unidades(g.totales[n - 1])} und${conDelta ? ` · ${conSigno(g.delta)} vs el día anterior` : ""}`, b.x + b.w - 16, b.y + 24);
    const cc = cols(aW);
    dibujarTabla(ctx, TINTA, b.x + 16, b.y + 48, aW, cc, g.filas, (k) =>
      k.t === "SKU" ? "TOTAL" : k.t === "MATERIAL" ? g.titulo
        : k.t === "VS DÍA ANTERIOR" ? flecha(g.delta)
          : unidades(g.totales[cc.filter((z) => z.num && z.t !== "VS DÍA ANTERIOR").findIndex((z) => z.t === k.t)] ?? null));
    y += h + G;
  }
  if (!visibles.length) {
    letra(ctx, 600, 16); ctx.fillStyle = GRIS; ctx.textAlign = "center";
    ctx.fillText("No hay nada pendiente por darle de baja en estos días.", W / 2, y + 50);
  }
  pie(ctx, W, H, extra.generado ?? new Date(),
    "Lo mismo que «Exportar pendiente de baja»: Dif cajas × factor caja (solo lo que el físico pasa del casco) + la rotura de línea del pasivo. ▲ = subió.");
  return cv;
}
export const nombreComparativo = (desde: string, hasta: string) => `pendiente-baja-comparativo-${desde}-a-${hasta}.png`;
