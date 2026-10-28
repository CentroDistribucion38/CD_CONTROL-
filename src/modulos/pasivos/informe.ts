/**
 * EL INFORME PASIVO — PDF (y las gráficas que comparte con el Word).
 *
 * «Que me lo deje exportar como PDF y Word, así como tenemos los informes; ese informe debe quedar
 *  mundial, con toda la información completa.»
 *
 * MISMO DISEÑO QUE EL INFORME DE CASCO: A4 vertical, márgenes de 14 mm, la cinta del degradado, el
 * sello de agua, la banda oscura del total, tablas de cabecera oscura y pie con la página. La paleta
 * y la cinta salen de `@/modulos/rotlinea/hoja` (los colores del tema de quien lo genera).
 *
 * NO CALCULA NADA: la pantalla arma `DatosInformePasivo` con lo mismo que pinta, con los filtros
 * puestos. LAS GRÁFICAS SE PINTAN UNA VEZ en un lienzo a 12 px/mm y ese PNG va al PDF y al Word.
 */
import type { jsPDF as JsPDF } from "jspdf";
import { gruposDeUbicacion } from "@/modulos/casco/informe";
import { PALETA_MARCA, type Marca, type Paleta } from "@/modulos/rotlinea/hoja";

type RGB = [number, number, number];

export type AlmacenInforme = { a: string; nombre: string; e: Record<string, number>; total: number; costo: number };
export type DiaInforme = { fecha: string; e: Record<string, number>; total: number };
export type SkuInforme = { codigo: string; desc: string; hl: Record<string, number>; costo: Record<string, number>; th: number; tc: number };
export type FilaConsolidado = {
  almacen: string; codigo: string; desc: string; und: number; cajas: number; hl: number; costo: number;
  /** Dónde está en el conteo de ese día («P_16_DER - P_20_IZQ»), del estado que le toca. Vacío si no aparece. */
  ubic?: string;
};
export type DatosInformePasivo = {
  /** El día del informe (AAAA-MM-DD). */
  dia: string;
  filtros: string;
  total: number; costo: number;
  anterior: { fecha: string; total: number } | null;
  estados: string[];
  almacenes: AlmacenInforme[];
  porDia: DiaInforme[];
  sku: SkuInforme[];
  cajas: { caja: string; nombre: string; cajas: number }[];
  consolidado: FilaConsolidado[];
};

/** El estado del conteo que le toca a un renglón de Pasivos; null si no viene del conteo. */
export function estadoDelConteo(estado: string, causal: string): string | null {
  const e = (estado ?? "").trim().toUpperCase(), c = (causal ?? "").trim().toUpperCase();
  if (c === "EXTRASUCIO" || c === "PENDIENTE EXTRASUCIO") return "EXTRASUCIO";
  if (e === "BAJA" && (c === "SORTING" || c === "PRESORTING" || c === "EXPORTACION" || c === "BTS")) return "BAJA";
  if (e === "LAVADO" && c === "LAVADO") return "LAVADO";
  return null;
}

/* ---------------- formatos ---------------- */
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Con guion ASCII: la helvetica de jsPDF no trae «−». */
const sig = (v: number, f: (n: number) => string) => (v < 0 ? "-" : "") + f(Math.abs(v));
export const f0 = (v: number) => sig(Math.round(v), (n) => nf0.format(n));
export const f1 = (v: number) => sig(v, (n) => nf1.format(n));
export const plata = (v: number) => (v < 0 ? "-$ " : "$ ") + nf0.format(Math.abs(Math.round(v)));
export const millones = (v: number) => sig(v / 1e6, (n) => nf1.format(n));
const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const larga = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return `${DIAS_L[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_L[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};
export const corta = (iso: string) => `${Number(iso.slice(8, 10))}-${MESES_L[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
export const mesDe = (iso: string) => MESES_L[Number(iso.slice(5, 7)) - 1];
export const nombreInformePasivo = (dia: string, ext: "pdf" | "docx") => `informe-pasivo-${dia}.${ext}`;

/* EL COLOR VA CON EL ESTADO, igual que en la pantalla. */
export const COLOR_ESTADO: Record<string, string> = { BAJA: "#B58200", LAVADO: "#FFC300", EXTRASUCIO: "#3B3B3B" };
export const colorEstado = (e: string) => COLOR_ESTADO[e] ?? "#8C8C8C";
export const tintaSobre = (hex: string) => (hex === "#FFC300" ? "#1B1B1B" : "#FFFFFF");
export const COLOR_ALMACEN = ["#B58200", "#FFC300", "#3B3B3B", "#8C8C8C"];
const hexRGB = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const rgbHex = (c: RGB) => c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

/* =====================================================================
   LAS GRÁFICAS (lienzo a 12 px por mm; el PNG va igual al PDF y al Word)
   ===================================================================== */
const K = 12;
export const MEDIDA = {
  dias: { ancho: 182, alto: 78 },
  linea: { ancho: 182, alto: 58 },
  dona: { ancho: 60, alto: 60 },
  barras: (n: number) => ({ ancho: 182, alto: Math.max(30, 8 + n * 6.4) }),
} as const;

function lienzo(wmm: number, hmm: number) {
  const c = document.createElement("canvas");
  c.width = Math.round(wmm * K); c.height = Math.round(hmm * K);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.textBaseline = "middle";
  return { c, ctx, W: c.width, H: c.height };
}
const letra = (ctx: CanvasRenderingContext2D, peso: number, mm: number) => { ctx.font = `${peso} ${Math.round(mm * K)}px Helvetica, Arial, sans-serif` };

/** Columnas por día apiladas por estado, con el valor de cada estado adentro y el total encima. */
export function graficaDias(d: DatosInformePasivo, tinta: RGB = PALETA_MARCA.tinta): string {
  const { c, ctx, W, H } = lienzo(MEDIDA.dias.ancho, MEDIDA.dias.alto);
  const MT = 8 * K, MB = 8 * K, ML = 2 * K, MR = 2 * K;
  const n = Math.max(1, d.porDia.length), max = Math.max(1, ...d.porDia.map((x) => x.total));
  const PASO = (W - ML - MR) / n, BW = Math.min(22 * K, PASO * 0.62);
  const alto = (v: number) => (v / max) * (H - MT - MB);
  ctx.strokeStyle = "#9AA5B1"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ML, H - MB + .5); ctx.lineTo(W - MR, H - MB + .5); ctx.stroke();
  d.porDia.forEach((dia, i) => {
    const x = ML + i * PASO + (PASO - BW) / 2;
    let y = H - MB;
    for (const e of [...d.estados].reverse()) {
      const v = dia.e[e] ?? 0; const h = alto(v); if (h <= 0) continue;
      y -= h;
      ctx.fillStyle = colorEstado(e); ctx.fillRect(x, y, BW, Math.max(0, h - 2));
      if (h >= 4.2 * K) { letra(ctx, 700, 2.6); ctx.fillStyle = tintaSobre(colorEstado(e)); ctx.textAlign = "center"; ctx.fillText(f0(v), x + BW / 2, y + h / 2) }
    }
    letra(ctx, 800, 3); ctx.fillStyle = `rgb(${tinta.join(",")})`; ctx.textAlign = "center"; ctx.fillText(f0(dia.total), x + BW / 2, y - 3 * K);
    letra(ctx, dia.fecha === d.dia ? 800 : 500, 2.7); ctx.fillStyle = dia.fecha === d.dia ? `rgb(${tinta.join(",")})` : "#5F6B79";
    ctx.fillText(corta(dia.fecha), x + BW / 2, H - MB / 2);
  });
  return c.toDataURL("image/png");
}

/** La línea de HL diarios, con el área suave, cada cifra encima y el día del informe resaltado. */
export function graficaLinea(d: DatosInformePasivo, tinta: RGB = PALETA_MARCA.tinta): string {
  const { c, ctx, W, H } = lienzo(MEDIDA.linea.ancho, MEDIDA.linea.alto);
  const MT = 9 * K, MB = 8 * K, ML = 8 * K, MR = 8 * K;
  const p = d.porDia; if (!p.length) return c.toDataURL("image/png");
  const vals = p.map((x) => x.total), mn = Math.min(...vals), mx = Math.max(...vals);
  const lo = Math.max(0, mn - (mx - mn) * 0.3 - 1), hi = mx + (mx - mn) * 0.1 + 1;
  const X = (i: number) => (p.length === 1 ? W / 2 : ML + (i * (W - ML - MR)) / (p.length - 1));
  const Y = (v: number) => MT + (1 - (v - lo) / (hi - lo)) * (H - MT - MB);
  ctx.strokeStyle = "#E3E8EE"; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
  for (const t of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(ML, MT + t * (H - MT - MB)); ctx.lineTo(W - MR, MT + t * (H - MT - MB)); ctx.stroke() }
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,195,0,0.22)"; ctx.beginPath(); ctx.moveTo(X(0), H - MB);
  p.forEach((x, i) => ctx.lineTo(X(i), Y(x.total))); ctx.lineTo(X(p.length - 1), H - MB); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#B58200"; ctx.lineWidth = 0.7 * K; ctx.lineJoin = "round"; ctx.beginPath();
  p.forEach((x, i) => (i ? ctx.lineTo(X(i), Y(x.total)) : ctx.moveTo(X(i), Y(x.total)))); ctx.stroke();
  p.forEach((x, i) => {
    const on = x.fecha === d.dia;
    ctx.beginPath(); ctx.arc(X(i), Y(x.total), (on ? 1.6 : 1.1) * K, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#B58200" : "#FFFFFF"; ctx.fill(); ctx.lineWidth = 0.5 * K; ctx.strokeStyle = "#B58200"; ctx.stroke();
    letra(ctx, 800, 2.8); ctx.fillStyle = `rgb(${tinta.join(",")})`; ctx.textAlign = "center"; ctx.fillText(f0(x.total), X(i), Y(x.total) - 3.6 * K);
    letra(ctx, on ? 800 : 500, 2.6); ctx.fillStyle = on ? `rgb(${tinta.join(",")})` : "#5F6B79"; ctx.fillText(corta(x.fecha), X(i), H - MB / 2);
  });
  return c.toDataURL("image/png");
}

/** La dona por almacén, con el % encima de cada tramo y el total en el centro. */
export function graficaDona(d: DatosInformePasivo, tinta: RGB = PALETA_MARCA.tinta): string {
  const { c, ctx, W, H } = lienzo(MEDIDA.dona.ancho, MEDIDA.dona.alto);
  const cx = W / 2, cy = H / 2, R = 21 * K, G = 9 * K;
  let a0 = -Math.PI / 2;
  d.almacenes.forEach((x, i) => {
    const frac = d.total ? x.total / d.total : 0, a1 = a0 + frac * Math.PI * 2;
    const col = COLOR_ALMACEN[i] ?? "#8C8C8C";
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.lineWidth = G; ctx.strokeStyle = col; ctx.stroke();
    if (frac >= 0.06) {
      const m = (a0 + a1) / 2; letra(ctx, 800, 3.4); ctx.fillStyle = tintaSobre(col); ctx.textAlign = "center";
      ctx.fillText(`${Math.round(frac * 100)}%`, cx + R * Math.cos(m), cy + R * Math.sin(m));
    }
    a0 = a1;
  });
  letra(ctx, 900, 6); ctx.fillStyle = `rgb(${tinta.join(",")})`; ctx.textAlign = "center"; ctx.fillText(f0(d.total), cx, cy - 1 * K);
  letra(ctx, 500, 3); ctx.fillStyle = "#5F6B79"; ctx.fillText("HL", cx, cy + 4.5 * K);
  return c.toDataURL("image/png");
}

/** Barras horizontales por SKU partidas por estado (HL o $ millones). */
export function graficaBarras(filas: { k: string; partes: Record<string, number>; total: number }[], estados: string[], fmt: (v: number) => string, tinta: RGB = PALETA_MARCA.tinta): string {
  const m = MEDIDA.barras(filas.length);
  const { c, ctx, W } = lienzo(m.ancho, m.alto);
  const NOM = 58 * K, VAL = 22 * K, X0 = NOM + 2 * K, X1 = W - VAL - 2 * K, FILA = 6.4 * K, BH = 3.6 * K;
  const max = Math.max(1, ...filas.map((f) => f.total));
  filas.forEach((f, i) => {
    const y = 4 * K + i * FILA;
    letra(ctx, 500, 2.8); ctx.fillStyle = `rgb(${tinta.join(",")})`; ctx.textAlign = "left";
    let nom = f.k; while (ctx.measureText(nom).width > NOM && nom.length > 4) nom = nom.slice(0, -2);
    ctx.fillText(nom === f.k ? nom : nom + "…", 0, y + FILA / 2);
    ctx.fillStyle = "#F1F3F5"; ctx.fillRect(X0, y + (FILA - BH) / 2, X1 - X0, BH);
    let x = X0;
    for (const e of estados) {
      const v = f.partes[e] ?? 0; if (v <= 0) continue;
      const w = (v / max) * (X1 - X0); ctx.fillStyle = colorEstado(e); ctx.fillRect(x, y + (FILA - BH) / 2, w, BH); x += w;
    }
    letra(ctx, 800, 2.8); ctx.fillStyle = `rgb(${tinta.join(",")})`; ctx.textAlign = "right"; ctx.fillText(fmt(f.total), W, y + FILA / 2);
  });
  return c.toDataURL("image/png");
}

export type Graficas = { dias: string | null; linea: string | null; dona: string | null; skuHl: string | null; skuCosto: string | null };
export const filasSkuHl = (d: DatosInformePasivo) => [...d.sku].sort((a, b) => b.th - a.th).map((s) => ({ k: s.desc, partes: s.hl, total: s.th }));
export const filasSkuCosto = (d: DatosInformePasivo) => [...d.sku].sort((a, b) => b.tc - a.tc).map((s) => ({ k: s.desc, partes: s.costo, total: s.tc }));
export function todasLasGraficas(d: DatosInformePasivo, tinta?: RGB): Graficas {
  const t = <T,>(f: () => T) => { try { return f() } catch { return null } };
  return {
    dias: t(() => graficaDias(d, tinta)), linea: t(() => graficaLinea(d, tinta)), dona: t(() => graficaDona(d, tinta)),
    skuHl: t(() => graficaBarras(filasSkuHl(d), d.estados, f1, tinta)), skuCosto: t(() => graficaBarras(filasSkuCosto(d), d.estados, millones, tinta)),
  };
}

/* =====================================================================
   EL PDF
   ===================================================================== */
export function dibujarInformePasivo(
  JsPDFCtor: typeof JsPDF, d: DatosInformePasivo,
  extra: { generado: Date; marca?: Marca; paleta?: Paleta; graficas: Graficas },
): JsPDF {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, ANCHO = W - 2 * M, PIE = H - 10, TOPE = PIE - 7, FILA = 6.2;
  let y = M;
  const P = extra.paleta ?? PALETA_MARCA, TINTA = P.tinta;
  const TENUE: RGB = TINTA.map((c) => Math.round(255 - (255 - c) * 0.16)) as RGB;
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso: "normal" | "bold", tam: number) => { doc.setFont("helvetica", peso); doc.setFontSize(tam) };
  const marca = extra.marca ?? {};
  const G = extra.graficas;

  const cinta = (x: number, yy: number, ancho: number, alto: number) => {
    const N = Math.max(12, Math.round(ancho / 1.5)), paso = ancho / N;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1); let k = 0;
      while (k < P.cinta.length - 2 && t > P.cinta[k + 1][0]) k++;
      const [ta, a] = P.cinta[k], [tb, b] = P.cinta[k + 1];
      const u = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
      doc.setFillColor(Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u));
      doc.rect(x + i * paso, yy, paso + 0.15, alto, "F");
    }
  };
  const opacidad = (o: number) => doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown }).GState({ opacity: o }));
  const aguaDeFondo = () => {
    if (!marca.sello) return;
    try { opacidad(0.04); doc.addImage(marca.sello, "PNG", (W - 120) / 2, 118, 120, 120, "sello", "FAST") } catch { /* sigue */ } finally { opacidad(1) }
  };
  const hojaNueva = () => {
    doc.addPage(); aguaDeFondo(); cinta(0, 0, W, 2.2);
    if (marca.sello) { try { doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ } }
    const x = M + (marca.sello ? 12 : 0);
    fuente("bold", 10); tinta(); doc.text("Informe pasivo", x, 12.2);
    fuente("normal", 8.5); gris(); doc.text(`EER bloqueados al ${larga(d.dia)}`, x, 15.8);
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.3); doc.line(M, 19.5, W - M, 19.5);
    y = 24;
  };
  const cabe = (alto: number) => { if (y + alto > TOPE) hojaNueva() };
  const titulo = (t: string, nota?: string) => {
    doc.setFillColor(...P.acento); doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11); tinta(); doc.text(t, M + 4.5, y + 4);
    if (nota) { fuente("normal", 8.5); gris(); doc.text(nota, W - M, y + 4, { align: "right" }) }
    y += 7;
  };
  const leyenda = (yTit: number) => {
    let lx = W - M; fuente("normal", 7.5);
    for (const e of [...d.estados].reverse()) {
      const w = doc.getTextWidth(e); lx -= w; gris(); doc.text(e, lx, yTit + 4);
      lx -= 4; doc.setFillColor(...hexRGB(colorEstado(e))); doc.rect(lx, yTit + 1.6, 2.8, 2.8, "F"); lx -= 4;
    }
  };
  const imagen = (src: string | null, wmm: number, hmm: number, x = M) => {
    if (src) { try { doc.addImage(src, "PNG", x, y, wmm, hmm, undefined, "SLOW") } catch { /* sigue */ } }
    else { fuente("normal", 9); gris(); doc.text("La gráfica no se pudo dibujar en este equipo.", x, y + 8) }
  };
  /** Una tabla con cabecera oscura que se repite si salta de hoja. */
  type Col = { t: string; mm: number; num?: boolean; envuelve?: boolean };
  const tablaPdf = (nombre: string, cols: Col[], filas: string[][], total?: string[], nota?: string) => {
    const cab = (sigue: boolean) => {
      titulo(nombre + (sigue ? " (continúa)" : ""), nota);
      doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, FILA, "F");
      doc.setTextColor(255, 255, 255); fuente("bold", 7.6);
      let x = M; cols.forEach((c) => { c.num ? doc.text(c.t, x + c.mm - 2, y + 4.2, { align: "right" }) : doc.text(c.t, x + 2, y + 4.2); x += c.mm });
      y += FILA;
    };
    cabe(7 + FILA * Math.min(filas.length + 2, 8)); cab(false);
    /* LAS COLUMNAS QUE SE PARTEN (material, ubicación) no se cortan: el renglón crece. Un «\n» en
       el texto es un renglón aparte (cada zona de la ubicación). */
    const lineasDe = (c: Col, t: string) => {
      fuente("normal", 8.2);
      if (!c.envuelve) return [(doc.splitTextToSize(t, c.mm - 3) as string[])[0] ?? ""];
      return t.split("\n").flatMap((p) => doc.splitTextToSize(p, c.mm - 3) as string[]);
    };
    filas.forEach((f, i) => {
      const ls = cols.map((c, j) => (c.num ? [f[j] ?? ""] : lineasDe(c, f[j] ?? "")));
      const alto = Math.max(FILA, 2.4 + 3.4 * Math.max(...ls.map((l) => l.length)));
      if (y + alto > TOPE) { hojaNueva(); cab(true) }
      if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, alto, "F") }
      let x = M;
      cols.forEach((c, j) => {
        fuente(c.t === "COSTO" || (c.num && j === cols.length - 1) ? "bold" : "normal", 8.2);
        if (j === 0 || c.t === "UBICACIÓN") gris(); else tinta();
        if (c.num && f[j]?.startsWith("-")) doc.setTextColor(200, 16, 46);
        const y0 = y + alto / 2 - (ls[j].length - 1) * 1.7 + 1;
        c.num ? doc.text(ls[j][0], x + c.mm - 2, y0, { align: "right" }) : doc.text(ls[j], x + 2, y0, { lineHeightFactor: 1.2 });
        x += c.mm;
      });
      y += alto;
    });
    if (total) {
      if (y + FILA + 1 > TOPE) { hojaNueva(); cab(true) }
      doc.setDrawColor(...TINTA); doc.setLineWidth(0.4); doc.line(M, y, W - M, y);
      let x = M; fuente("bold", 8.5); tinta();
      cols.forEach((c, j) => { const t = total[j] ?? ""; c.num ? doc.text(t, x + c.mm - 2, y + 4.4, { align: "right" }) : doc.text(t, x + 2, y + 4.4); x += c.mm });
      y += FILA;
    }
    y += 8;
  };

  /* ---------------- CABECERA ---------------- */
  aguaDeFondo(); cinta(0, 0, W, 4.5);
  let conLogo = false;
  if (marca.palabra) { try { doc.addImage(marca.palabra, "PNG", M, 11, 15 * 540 / 160, 15, "palabra", "FAST"); conLogo = true } catch { /* sigue */ } }
  if (!conLogo) { fuente("bold", 16); doc.setTextColor(255, 0, 15); doc.text("Bavaria", M, 21) }
  fuente("bold", 7.5); gris(); doc.text("CENTRO DE DISTRIBUCIÓN CD38 · CONTROL", W - M, 13.5, { align: "right" });
  fuente("bold", 20); tinta(); doc.text("Informe pasivo", W - M, 21.5, { align: "right" });
  fuente("normal", 10); gris(); doc.text(`EER bloqueados al ${larga(d.dia)}`, W - M, 27.5, { align: "right" });
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.5); doc.line(M, 32, W - M, 32);
  y = 37;
  if (d.filtros) {
    doc.setFillColor(...TINTA); doc.rect(M, y, 2.2, 9, "F");
    doc.setDrawColor(213, 220, 229); doc.setLineWidth(0.2); doc.rect(M + 2.2, y, ANCHO - 2.2, 9);
    fuente("bold", 7.5); gris(); doc.text("FILTRADO", M + 6, y + 5.8);
    fuente("normal", 8.5); tinta(); doc.text((doc.splitTextToSize(d.filtros, ANCHO - 34) as string[])[0] ?? "", M + 26, y + 5.8);
    y += 15;
  }

  /* ---------------- LA BANDA DEL TOTAL ---------------- */
  const KPI = 22;
  doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, KPI, "F");
  doc.setFillColor(...P.acento); doc.rect(M, y, 3, KPI, "F");
  doc.setTextColor(255, 255, 255); fuente("bold", 26);
  const cifra = f0(d.total); doc.text(cifra, M + 9, y + 14.5);
  fuente("normal", 10.5); doc.setTextColor(...TENUE);
  doc.text("HL de pasivos", M + 11 + doc.getTextWidth(cifra) * 26 / 10.5, y + 14.5);
  fuente("bold", 13); doc.setTextColor(255, 255, 255); doc.text(plata(d.costo), W - M - 6, y + 10, { align: "right" });
  fuente("normal", 8.5); doc.setTextColor(...TENUE);
  const vs = d.anterior ? `${d.total - d.anterior.total >= 0 ? "+" : "-"}${f0(Math.abs(d.total - d.anterior.total))} HL vs ${corta(d.anterior.fecha)}` : "primer día del mes";
  doc.text(`costo pasivos · ${vs} · generado el ${extra.generado.toLocaleDateString("es-CO")} ${extra.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`, W - M - 6, y + 16.5, { align: "right" });
  y += KPI + 8;

  /* ---------------- CADA ALMACÉN ---------------- */
  titulo("Cómo está cada almacén", "HL y costo del día");
  const na = Math.max(1, d.almacenes.length), GAP = 3, kw = (ANCHO - GAP * (na - 1)) / na, KH = 25;
  d.almacenes.forEach((a, i) => {
    const x = M + i * (kw + GAP);
    doc.setFillColor(243, 246, 249); doc.rect(x, y, kw, KH, "F");
    doc.setFillColor(...hexRGB(COLOR_ALMACEN[i] ?? "#8C8C8C")); doc.rect(x + 3, y + 2.6, 2.6, 2.6, "F");
    fuente("bold", 7); gris(); doc.text(`${a.a} · ${a.nombre}`.toUpperCase(), x + 7, y + 4.8);
    fuente("bold", 17); tinta(); doc.text(`${f0(a.total)} HL`, x + 3, y + 13.5);
    fuente("bold", 10); doc.text(`${d.total ? Math.round(a.total / d.total * 100) : 0} %`, x + kw - 3, y + 13.5, { align: "right" });
    fuente("normal", 7); gris();
    doc.text(d.estados.map((e) => `${e} ${f0(a.e[e] ?? 0)}`).join(" · "), x + 3, y + 18.5);
    doc.text(plata(a.costo), x + 3, y + 22.3);
  });
  y += KH + 9;

  /* ---------------- POR DÍA ---------------- */
  cabe(MEDIDA.dias.alto + 16);
  let yt = y; titulo(`EER bloqueados por día (HL) · ${mesDe(d.dia)}`); leyenda(yt);
  imagen(G.dias, MEDIDA.dias.ancho, MEDIDA.dias.alto); y += MEDIDA.dias.alto + 2;
  fuente("normal", 7); gris(); doc.text("Una columna por día con pasivos en el mes: cada color es un estado, adentro su HL y encima el total del día.", M, y + 1); y += 9;

  /* ---------------- HL DIARIOS ---------------- */
  cabe(MEDIDA.linea.alto + 14);
  titulo(`HL diarios · ${mesDe(d.dia)}`, `el ${corta(d.dia)} resaltado`);
  imagen(G.linea, MEDIDA.linea.ancho, MEDIDA.linea.alto); y += MEDIDA.linea.alto + 9;

  /* ---------------- POR ALMACÉN (dona + tabla) ---------------- */
  cabe(MEDIDA.dona.alto + 14);
  titulo("% de bloqueados por almacén");
  const yDona = y;
  imagen(G.dona, MEDIDA.dona.ancho, MEDIDA.dona.alto);
  {
    const x0 = M + MEDIDA.dona.ancho + 6, w = ANCHO - MEDIDA.dona.ancho - 6;
    const cA = 32, cT = 28, cE = (w - cA - cT) / Math.max(1, d.estados.length);
    let yy = yDona + 8;
    doc.setFillColor(...TINTA); doc.rect(x0, yy, w, FILA, "F"); doc.setTextColor(255, 255, 255); fuente("bold", 7.6);
    doc.text("ALMACÉN", x0 + 2, yy + 4.2);
    d.estados.forEach((e, j) => doc.text(e, x0 + cA + cE * (j + 1) - 2, yy + 4.2, { align: "right" }));
    doc.text("TOTAL HL", x0 + w - 2, yy + 4.2, { align: "right" }); yy += FILA;
    d.almacenes.forEach((a, i) => {
      if (i % 2) { doc.setFillColor(247, 249, 251); doc.rect(x0, yy, w, FILA, "F") }
      doc.setFillColor(...hexRGB(COLOR_ALMACEN[i] ?? "#8C8C8C")); doc.rect(x0 + 2, yy + 1.8, 2.6, 2.6, "F");
      fuente("normal", 8.2); tinta(); doc.text(a.a, x0 + 6, yy + 4.2);
      d.estados.forEach((e, j) => doc.text(f0(a.e[e] ?? 0), x0 + cA + cE * (j + 1) - 2, yy + 4.2, { align: "right" }));
      fuente("bold", 8.2); doc.text(f0(a.total), x0 + w - 2, yy + 4.2, { align: "right" }); yy += FILA;
    });
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.4); doc.line(x0, yy, x0 + w, yy);
    fuente("bold", 8.5); tinta(); doc.text("TOTAL", x0 + 2, yy + 4.4);
    d.estados.forEach((e, j) => doc.text(f0(d.almacenes.reduce((t, a) => t + (a.e[e] ?? 0), 0)), x0 + cA + cE * (j + 1) - 2, yy + 4.4, { align: "right" }));
    doc.text(f0(d.total), x0 + w - 2, yy + 4.4, { align: "right" });
  }
  y = yDona + MEDIDA.dona.alto + 9;

  /* ---------------- SKU ---------------- */
  const bHl = MEDIDA.barras(d.sku.length);
  cabe(bHl.alto + 14); yt = y; titulo("SKU bloqueados (HL)"); leyenda(yt);
  imagen(G.skuHl, bHl.ancho, bHl.alto); y += bHl.alto + 8;
  cabe(bHl.alto + 14); yt = y; titulo("SKU bloqueados ($ millones)"); leyenda(yt);
  imagen(G.skuCosto, bHl.ancho, bHl.alto); y += bHl.alto + 8;

  /* ---------------- CONSOLIDADO POR ALMACÉN (la TD) ---------------- */
  /* Con UBICACIÓN (del conteo de ese día) si alguno la tiene: «para ver dónde está eso». */
  const conUbi = d.consolidado.some((x) => x.ubic);
  const cols: Col[] = conUbi
    ? [{ t: "CÓDIGO", mm: 17 }, { t: "MATERIAL", mm: 46, envuelve: true }, { t: "UNIDADES", mm: 21, num: true }, { t: "CAJAS", mm: 16, num: true }, { t: "HL", mm: 16, num: true }, { t: "COSTO", mm: 27, num: true }, { t: "UBICACIÓN", mm: 39, envuelve: true }]
    : [{ t: "CÓDIGO", mm: 20 }, { t: "MATERIAL", mm: 66, envuelve: true }, { t: "UNIDADES", mm: 26, num: true }, { t: "CAJAS", mm: 20, num: true }, { t: "HL", mm: 20, num: true }, { t: "COSTO", mm: 30, num: true }];
  for (const a of d.almacenes) {
    const rs = d.consolidado.filter((x) => x.almacen === a.a);
    if (!rs.length) continue;
    tablaPdf(`${a.a} · ${a.nombre}`, cols,
      rs.map((x) => [x.codigo, x.desc, f0(x.und), f0(x.cajas), f1(x.hl), plata(x.costo), ...(conUbi ? [gruposDeUbicacion(x.ubic).join("\n")] : [])]),
      ["TOTAL", `${rs.length} materiales`, f0(rs.reduce((t, x) => t + x.und, 0)), f0(rs.reduce((t, x) => t + x.cajas, 0)), f1(rs.reduce((t, x) => t + x.hl, 0)), plata(rs.reduce((t, x) => t + x.costo, 0))],
      `${f1(a.total)} HL · ${plata(a.costo)}`);
  }

  /* ---------------- CAJAS PLÁSTICAS ---------------- */
  if (d.cajas.length) {
    tablaPdf("Cajas plásticas comprometidas", [{ t: "CAJA", mm: 26 }, { t: "DESCRIPCIÓN", mm: 116 }, { t: "CAJAS", mm: 40, num: true }],
      d.cajas.map((c) => [c.caja, c.nombre, f0(c.cajas)]), ["TOTAL", "", f0(d.cajas.reduce((t, c) => t + c.cajas, 0))]);
  }

  /* ---------------- PIE ---------------- */
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5); gris();
    doc.text(`Informe pasivo · ${corta(d.dia)}${d.filtros ? ` · ${d.filtros}` : ""}`.slice(0, 80), M, PIE);
    doc.text("Bavaria", W / 2, PIE, { align: "center" });
    doc.text(`Página ${i} de ${n}`, W - M, PIE, { align: "right" });
  }
  return doc;
}
