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
