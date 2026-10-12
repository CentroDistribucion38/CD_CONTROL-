/**
 * LO COMÚN DE LAS FOTOS PARA COMPARTIR (Dashboard y Detalle de Pasivos y de Casco de vidrio).
 *
 * Una imagen que se copia y se pega en un correo o en WhatsApp: 1800 puntos de ancho, al doble de
 * resolución para que no se vea borrosa al ampliarla en el celular. Aquí van la cabecera (cinta,
 * logo, título y filtros como chips), el pie, los colores neutros y las letras.
 */
import type { Paleta } from "@/modulos/rotlinea/hoja";

export type Ctx = CanvasRenderingContext2D;
export const FOTO = { ancho: 1800, alto: 1000, escala: 2 } as const;
export const FONDO = "#F3F5F8", BORDE = "#DEE3EA", GRIS = "#5F6B79", SUAVE = "#EEF1F5", SUBE = "#C8102E", BAJA_OK = "#1E8E3E";
const FUENTE = `"Segoe UI", Helvetica, Arial, sans-serif`;

export const letra = (ctx: Ctx, peso: number, px: number) => { ctx.font = `${peso} ${px}px ${FUENTE}` };
export function recortar(ctx: Ctx, t: string, ancho: number) {
  if (ctx.measureText(t).width <= ancho) return t;
  let s = t; while (s.length > 3 && ctx.measureText(s + "…").width > ancho) s = s.slice(0, -1);
  return s + "…";
}
/** El texto con un poco de aire entre letras (los títulos en mayúscula). */
export function espaciado(ctx: Ctx, t: string, x: number, y: number, aire = 0.8) {
  for (const ch of t) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + aire }
  return x;
}
export function anchoEspaciado(ctx: Ctx, t: string, aire = 0.8) { let w = 0; for (const ch of t) w += ctx.measureText(ch).width + aire; return w }

export type Caja = { x: number; y: number; w: number; h: number };

export const MARGEN = 16, HUECO = 12;
/** La cabecera de las fotos: la cinta, el logo, el título y los filtros como chips. */
export function cabecera(ctx: Ctx, W: number, chips: string[], P: Paleta, logo: CanvasImageSource | null | undefined, titulo: string, sub: string) {
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`, M = MARGEN;
  /* ---------- CABECERA ---------- */
  // la cinta del tema arriba
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  for (const [t, col] of P.cinta) grad.addColorStop(t, `rgb(${col.join(",")})`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 6);
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(M, 18, W - 2 * M, 76);
  ctx.strokeStyle = BORDE; ctx.strokeRect(M + .5, 18.5, W - 2 * M - 1, 75);
  let tx = M + 22;
  if (logo) {
    try { const lh = 44, lw = lh * 540 / 160; ctx.drawImage(logo, tx, 34, lw, lh); tx += lw + 26 } catch { /* sin logo */ }
  } else { letra(ctx, 900, 32); ctx.fillStyle = "#E30613"; ctx.textAlign = "left"; ctx.fillText("Bavaria", tx, 56); tx += ctx.measureText("Bavaria").width + 26 }
  ctx.fillStyle = BORDE; ctx.fillRect(tx - 13, 34, 1, 44);
  letra(ctx, 800, 30); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(titulo, tx, 46);
  letra(ctx, 500, 16); ctx.fillStyle = GRIS;
  ctx.fillText(sub, tx, 74);

  // los filtros como chips, a la derecha
  {
    const partes = chips;
    letra(ctx, 700, 13.5);
    let x = W - M - 22;
    for (const p of [...partes].reverse()) {
      const w = ctx.measureText(p).width + 26; x -= w;
      ctx.fillStyle = SUAVE; ctx.fillRect(x, 42, w, 30);
      ctx.fillStyle = ACENTO; ctx.fillRect(x, 42, 3, 30);
      ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(p, x + 14, 57);
      x -= 8;
    }
    letra(ctx, 800, 11); ctx.fillStyle = GRIS; ctx.textAlign = "left";
    espaciado(ctx, "FILTROS", W - M - 22 - anchoEspaciado(ctx, "FILTROS", 1.2), 30, 1.2);
  }

}
/** El pie: quién la generó y cuándo. */
export function pie(ctx: Ctx, W: number, H: number, gen: Date, nota: string) {
  letra(ctx, 500, 12.5); ctx.fillStyle = GRIS; ctx.textAlign = "left";
  ctx.fillText(`CONTROL · CD38 — generado el ${gen.toLocaleDateString("es-CO")} ${gen.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`, MARGEN, H - 16);
  ctx.textAlign = "right"; ctx.fillText(nota, W - MARGEN, H - 16);
}

/* =====================================================================
   LAS TABLAS DE LAS FOTOS — cabecera oscura, renglones en franjas, total con raya, y una columna
   que se PARTE EN RENGLONES (la ubicación): «no se logran ver completas las ubicaciones».
   El renglón crece lo que haga falta; nada se corta con «…».
   ===================================================================== */
export const FILA_T = 29, CAB_T = 42, LINEA_T = 16;
export type ColTabla<F> = {
  t: string;
  /** Ancho en puntos; 0 = la que se estira (el material). */
  w: number;
  num?: boolean;
  v: (f: F) => string;
  /** Para la columna que se parte: un renglón por grupo (zona); cada uno se parte si no cabe. */
  lineas?: (f: F) => string[];
  gris?: boolean;
  fuerte?: boolean;
  /** Rojo si el texto empieza con «-» (lo negativo). */
  rojoNegativo?: boolean;
  /** El texto se parte en renglones en vez de cortarse (el material). */
  envuelve?: boolean;
};

/** Un lienzo de 1 × 1 solo para medir texto antes de saber el alto de la imagen. */
export function medidor(): Ctx {
  const c = document.createElement("canvas"); c.width = 1; c.height = 1;
  return c.getContext("2d")!;
}

/** Parte un texto en renglones que quepan en `ancho` (por palabras; una palabra larga va sola). */
export function envolver(ctx: Ctx, texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let linea = "";
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (!linea || ctx.measureText(prueba).width <= ancho) linea = prueba;
    else { out.push(linea); linea = p }
  }
  if (linea) out.push(linea);
  return out;
}

/** Reparte el ancho: la columna con w = 0 se queda con lo que sobra. */
export function anchosTabla<F>(cols: ColTabla<F>[], ancho: number): ColTabla<F>[] {
  const fijo = cols.reduce((t, c) => t + c.w, 0);
  return cols.map((c) => (c.w ? c : { ...c, w: Math.max(150, ancho - fijo) }));
}

const fuenteLineas = (ctx: Ctx) => letra(ctx, 500, 12.5);
const fuenteTexto = (ctx: Ctx, c: { fuerte?: boolean; gris?: boolean }) => letra(ctx, c.fuerte ? 800 : c.gris ? 500 : 600, 13.5);
function lineasCelda<F>(ctx: Ctx, c: ColTabla<F>, f: F): string[] {
  if (c.envuelve) { fuenteTexto(ctx, c); return envolver(ctx, c.v(f), c.w - 16) }
  if (!c.lineas) return [];
  fuenteLineas(ctx);
  return c.lineas(f).flatMap((g) => envolver(ctx, g, c.w - 16));
}
export function altoFilaTabla<F>(ctx: Ctx, cols: ColTabla<F>[], f: F) {
  const n = Math.max(1, ...cols.map((c) => lineasCelda(ctx, c, f).length));
  return Math.max(FILA_T, n * LINEA_T + 13);
}
/** Alto de la tabla entera: cabecera + renglones + total. */
export function altoTabla<F>(ctx: Ctx, cols: ColTabla<F>[], filas: F[]) {
  return CAB_T + filas.reduce((t, f) => t + altoFilaTabla(ctx, cols, f), 0) + 2 + FILA_T;
}

export function dibujarTabla<F>(ctx: Ctx, TINTA: string, x: number, y: number, ancho: number, cols: ColTabla<F>[], filas: F[], total: (c: ColTabla<F>) => string, apagada?: (f: F) => boolean) {
  const APAGADO = "#AAB3BE";
  /* la cabecera oscura, partida en dos renglones si un título no cabe */
  ctx.fillStyle = TINTA; ctx.fillRect(x, y, ancho, CAB_T);
  let cx = x;
  for (const cc of cols) {
    letra(ctx, 800, 11.5); ctx.fillStyle = "#FFFFFF";
    const cabe = cc.w - 16, pal = cc.t.split(" ");
    let l1 = cc.t, l2 = "";
    if (ctx.measureText(cc.t).width > cabe && pal.length > 1) {
      let k = pal.length - 1;
      while (k > 1 && ctx.measureText(pal.slice(0, k).join(" ")).width > cabe) k--;
      l1 = pal.slice(0, k).join(" "); l2 = pal.slice(k).join(" ");
    }
    ctx.textAlign = cc.num ? "right" : "left";
    const tx = cc.num ? cx + cc.w - 8 : cx + 8;
    if (l2) { ctx.fillText(recortar(ctx, l1, cabe), tx, y + 14); ctx.fillText(recortar(ctx, l2, cabe), tx, y + 29) }
    else ctx.fillText(recortar(ctx, l1, cabe), tx, y + CAB_T / 2);
    cx += cc.w;
  }
  let cy = y + CAB_T;
  filas.forEach((f, r) => {
    const h = altoFilaTabla(ctx, cols, f);
    if (r % 2 === 1) { ctx.fillStyle = "#F6F8FA"; ctx.fillRect(x, cy, ancho, h) }
    /* un renglón en cero va apagado: se ve que está, pero no pesa */
    const off = !!apagada?.(f);
    let fx = x;
    for (const cc of cols) {
      if (cc.lineas) {
        const ls = lineasCelda(ctx, cc, f);
        fuenteLineas(ctx); ctx.fillStyle = GRIS; ctx.textAlign = "left";
        const y0 = cy + h / 2 - ((ls.length - 1) * LINEA_T) / 2;
        ls.forEach((l, i) => {
          /* la zona («P:», «FABRICA PATIO:») en negrita, lo demás normal */
          const m = l.match(/^([^:]{1,24}:)(.*)$/);
          if (m) {
            letra(ctx, 800, 12.5); ctx.fillStyle = off ? APAGADO : TINTA; ctx.fillText(m[1], fx + 8, y0 + i * LINEA_T);
            const w = ctx.measureText(m[1]).width;
            fuenteLineas(ctx); ctx.fillStyle = GRIS; ctx.fillText(m[2], fx + 8 + w, y0 + i * LINEA_T);
          } else ctx.fillText(l, fx + 8, y0 + i * LINEA_T);
        });
      } else if (cc.envuelve) {
        const ls = lineasCelda(ctx, cc, f);
        fuenteTexto(ctx, cc); ctx.fillStyle = off ? APAGADO : cc.gris ? GRIS : TINTA; ctx.textAlign = "left";
        const y0 = cy + h / 2 - ((ls.length - 1) * LINEA_T) / 2;
        ls.forEach((l, i) => ctx.fillText(l, fx + 8, y0 + i * LINEA_T));
      } else {
        const t = cc.v(f);
        fuenteTexto(ctx, cc);
        ctx.fillStyle = off ? APAGADO : cc.rojoNegativo && t.startsWith("-") ? SUBE : cc.gris ? GRIS : TINTA;
        ctx.textAlign = cc.num ? "right" : "left";
        ctx.fillText(recortar(ctx, t, cc.w - 16), cc.num ? fx + cc.w - 8 : fx + 8, cy + h / 2);
      }
      fx += cc.w;
    }
    cy += h;
  });
  ctx.fillStyle = TINTA; ctx.fillRect(x, cy, ancho, 2); cy += 2;
  let fx = x;
  for (const cc of cols) {
    letra(ctx, 900, 13.5); ctx.fillStyle = TINTA; ctx.textAlign = cc.num ? "right" : "left";
    const t = total(cc);
    ctx.fillStyle = cc.rojoNegativo && t.startsWith("-") ? SUBE : TINTA;
    ctx.fillText(recortar(ctx, t, cc.w - 16), cc.num ? fx + cc.w - 8 : fx + 8, cy + FILA_T / 2 + 1);
    fx += cc.w;
  }
  return cy + FILA_T;
}
