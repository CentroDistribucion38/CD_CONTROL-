/**
 * LAS GRÁFICAS DE LAS EVIDENCIAS — se dibujan en un lienzo (canvas) y salen como PNG.
 *
 * Así el PDF y el Word llevan EXACTAMENTE la misma imagen, y la pantalla no necesita otra
 * librería. Todo a 2× para que se vea nítido al imprimir. Solo corre en el navegador.
 *
 * REGLAS DE LECTURA (para que se entienda sin la leyenda a la vista):
 *   · el color del tipo siempre es el mismo (Avería ámbar, PNC azul, Mezclado morado, Sin acceso pizarra);
 *   · los colores son los vivos del tablero de riesgo (naranja, azul, verde, rojo): se leen igual en pantalla, en papel y en el Word.
 */
import { TENDENCIAS, TEND, TIPOS, diaCorto, letrasTipos, type Analisis, type FilaUbicacion } from "./evidencias";
import type { Graficas } from "./evidencias-informe";

export type Imagen = { png: string; w: number; h: number };

const TINTA = "#12263A", GRIS = "#5B6B7F", LINEA = "#E3E8EF", FONDO = "#FFFFFF";
const FUENTE = "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const ESC = 2;

function lienzo(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.round(w * ESC); c.height = Math.round(h * ESC);
  const g = c.getContext("2d")!;
  g.scale(ESC, ESC);
  g.fillStyle = FONDO; g.fillRect(0, 0, w, h);
  g.textBaseline = "middle";
  return { c, g, w, h };
}
const salir = (l: ReturnType<typeof lienzo>): Imagen => ({ png: l.c.toDataURL("image/png"), w: l.w, h: l.h });
const fuente = (g: CanvasRenderingContext2D, peso: number, px: number) => { g.font = `${peso} ${px}px ${FUENTE}` };
/** Un tope «redondo» para el eje: 4 → 4, 7 → 8, 13 → 15, 83 → 100. */
function tope(max: number): { tope: number; paso: number } {
  if (max <= 4) return { tope: Math.max(max, 1), paso: 1 };
  const base = [1, 2, 2.5, 5, 10];
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const m of base) { const p = m * mag / 2; if (p * 5 >= max) return { tope: Math.ceil(max / p) * p, paso: p }; }
  return { tope: Math.ceil(max / mag) * mag, paso: mag };
}

/** Las marcas del eje X: todas si caben, si no una de cada k. */
const cadaK = (n: number, ancho: number, minPx: number) => Math.max(1, Math.ceil((n * minPx) / ancho));

/* ============ 1 · NOVEDADES POR DÍA, apiladas por tipo ============ */
export function graficaDias(a: Analisis): Imagen {
  const W = 700, H = 214, L = 40, R = 16, T = 36, B = 48;
  const l = lienzo(W, H), g = l.g;
  const n = a.porDia.length, max = Math.max(1, ...a.porDia.map((d) => d.total));
  const { tope: top, paso } = tope(max);
  const ancho = W - L - R, alto = H - T - B;
  const y = (v: number) => T + alto - (v / top) * alto;
  /* leyenda */
  let lx = L; fuente(g, 600, 12);
  for (const t of TIPOS) { g.fillStyle = t.color; g.fillRect(lx, 14, 12, 12); g.fillStyle = TINTA; g.textAlign = "left"; g.fillText(t.nombre, lx + 17, 20); lx += 17 + g.measureText(t.nombre).width + 22 }
  /* cuadrícula */
  fuente(g, 500, 11); g.textAlign = "right";
  for (let v = 0; v <= top + 1e-9; v += paso) {
    g.strokeStyle = v === 0 ? "#9AA7B6" : LINEA; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y(v)); g.lineTo(W - R, y(v)); g.stroke();
    g.fillStyle = GRIS; g.fillText(String(Math.round(v * 10) / 10), L - 8, y(v));
  }
  /* barras */
  const slot = ancho / n, bw = Math.min(54, Math.max(4, slot - 6));
  const k = cadaK(n, ancho, 44);
  a.porDia.forEach((d, i) => {
    const x = L + slot * i + (slot - bw) / 2; let acum = 0;
    for (const t of TIPOS) {
      const v = d.porTipo[t.k]; if (!v) continue;
      const y1 = y(acum + v), y0 = y(acum);
      g.fillStyle = t.color; g.fillRect(x, y1, bw, Math.max(1, y0 - y1 - 1.5));
      acum += v;
    }
    if (d.total > 0 && n <= 20) { fuente(g, 700, 12); g.fillStyle = TINTA; g.textAlign = "center"; g.fillText(String(d.total), x + bw / 2, y(d.total) - 9) }
    if (i % k === 0) { fuente(g, 500, 11); g.fillStyle = GRIS; g.textAlign = "center"; g.fillText(diaCorto(d.dia), x + bw / 2, T + alto + 16) }
  });
  fuente(g, 500, 11); g.fillStyle = GRIS; g.textAlign = "left"; g.fillText("Novedades encontradas por día", L, H - 12);
  return salir(l);
}

/* ============ 2 · UBICACIONES CONTADAS vs. CON NOVEDAD (una sola escala) ============ */
export function graficaCobertura(a: Analisis): Imagen {
  const W = 700, H = 209, L = 40, R = 56, T = 36, B = 47; // R: sitio a la derecha para el último valor (hasta 5 cifras)
  const l = lienzo(W, H), g = l.g;
  const n = a.porDia.length;
  const max = Math.max(1, ...a.porDia.map((d) => d.contadas));
  const { tope: top, paso } = tope(max);
  const ancho = W - L - R, alto = H - T - B;
  const x = (i: number) => L + (n === 1 ? ancho / 2 : (ancho * i) / (n - 1));
  const y = (v: number) => T + alto - (v / top) * alto;
  const series = [
    { nombre: "Ubicaciones contadas", color: "#0B4EA2", v: a.porDia.map((d) => d.contadas), dash: [6, 4] as number[] },
    { nombre: "Ubicaciones con novedad", color: "#E4002B", v: a.porDia.map((d) => d.conNovedad), dash: [] as number[] },
  ];
  let lx = L; fuente(g, 600, 12);
  for (const s of series) { g.strokeStyle = s.color; g.lineWidth = 3; g.setLineDash(s.dash); g.beginPath(); g.moveTo(lx, 20); g.lineTo(lx + 22, 20); g.stroke(); g.setLineDash([]); g.fillStyle = TINTA; g.textAlign = "left"; g.fillText(s.nombre, lx + 28, 20); lx += 28 + g.measureText(s.nombre).width + 26 }
  fuente(g, 500, 11); g.textAlign = "right";
  for (let v = 0; v <= top + 1e-9; v += paso) {
    g.strokeStyle = v === 0 ? "#9AA7B6" : LINEA; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y(v)); g.lineTo(W - R, y(v)); g.stroke();
    g.fillStyle = GRIS; g.fillText(String(Math.round(v * 10) / 10), L - 8, y(v));
  }
  for (const s of series) {
    g.strokeStyle = s.color; g.lineWidth = 3; g.setLineDash(s.dash); g.lineJoin = "round"; g.beginPath();
    s.v.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)))); g.stroke(); g.setLineDash([]);
    s.v.forEach((v, i) => {
      const ult = i === n - 1;
      if (n <= 31 || ult) { const r = ult ? 5 : 3.4; g.fillStyle = FONDO; g.fillRect(x(i) - r, y(v) - r, 2 * r, 2 * r); g.strokeStyle = s.color; g.lineWidth = 2; g.strokeRect(x(i) - r, y(v) - r, 2 * r, 2 * r); }
    });
    /* el último valor, rotulado */
    const u = s.v[n - 1]; fuente(g, 700, 12); g.fillStyle = TINTA; g.textAlign = "left"; /* Cada rótulo junto a su punto; si las dos líneas terminan casi juntas, el de las contadas sube
       (nunca se baja uno: abajo está el eje con las fechas). */
    const cerca = Math.abs(y(series[0].v[n - 1]) - y(series[1].v[n - 1])) < 18;
    g.fillText(String(u), Math.min(x(n - 1) + 10, W - 6 - g.measureText(String(u)).width), y(u) - (s === series[0] && cerca ? 13 : 0));
  }
  const k = cadaK(n, ancho, 44);
  fuente(g, 500, 11); g.fillStyle = GRIS; g.textAlign = "center";
  a.porDia.forEach((d, i) => { if (i % k === 0) g.fillText(diaCorto(d.dia), x(i), T + alto + 16) });
  g.textAlign = "left"; g.fillText("Mismo eje para las dos líneas: cuántas ubicaciones se miraron y en cuántas hubo novedad.", L, H - 10);
  return salir(l);
}

/* ============ 3 · PROPORCIÓN POR TIPO (una barra al 100 %, recta como todo lo demás) ============ */
export function graficaDona(a: Analisis): Imagen {
  const W = 520, H = 250;
  const l = lienzo(W, H), g = l.g;
  const tot = a.total || 1;
  /* El ancho del número se mide CON la letra grande: medido con la chica, el rótulo caía encima de la cifra. */
  g.textAlign = "left"; fuente(g, 800, 38); g.fillStyle = TINTA; g.fillText(String(a.total), 16, 34);
  const anchoTotal = g.measureText(String(a.total)).width;
  fuente(g, 600, 12); g.fillStyle = GRIS; g.fillText("NOVEDADES EN EL PERIODO", 16 + anchoTotal + 12, 36);
  const bx = 16, bw = W - 32, by = 66, bh = 30;
  g.fillStyle = LINEA; g.fillRect(bx, by, bw, bh);
  let x = bx;
  for (const t of TIPOS) {
    const v = a.porTipo[t.k]; if (!v) continue;
    const w = (v / tot) * bw; g.fillStyle = t.color; g.fillRect(x, by, Math.max(2, w - 2), bh); x += w;
  }
  let yy = 130; g.textAlign = "left";
  for (const t of TIPOS) {
    const v = a.porTipo[t.k];
    g.fillStyle = t.color; g.fillRect(16, yy - 8, 14, 14);
    fuente(g, 600, 14); g.fillStyle = TINTA; g.textAlign = "left"; g.fillText(t.nombre, 40, yy);
    fuente(g, 800, 14); g.textAlign = "right"; g.fillText(`${v}  ·  ${a.total ? Math.round((v / a.total) * 100) : 0} %`, W - 16, yy);
    yy += 30;
  }
  return salir(l);
}

/* ============ 5 · UBICACIONES CON MÁS NOVEDADES (apiladas por tipo) ============ */
export function graficaTop(a: Analisis, cuantas = 8): Imagen {
  const top = [...a.filas].sort((x, y) => y.total - x.total || y.diasConNovedad - x.diasConNovedad).slice(0, cuantas);
  const LAB = 80, R = 90, T = 52, RH = 26;
  const W = 580, H = T + RH * Math.max(top.length, 1) + 16;
  const l = lienzo(W, H), g = l.g;
  let lx = LAB; fuente(g, 600, 12);
  for (const t of TIPOS) { g.fillStyle = t.color; g.fillRect(lx, 14, 12, 12); g.fillStyle = TINTA; g.textAlign = "left"; g.fillText(t.nombre, lx + 17, 20); lx += 17 + g.measureText(t.nombre).width + 22 }
  const max = Math.max(1, ...top.map((f) => f.total)), ancho = W - LAB - R;
  top.forEach((f, r) => {
    const y0 = T + RH * r;
    fuente(g, 800, 12.5); g.textAlign = "right"; g.fillStyle = TINTA; g.fillText(f.clave, LAB - 10, y0 + RH / 2);
    let x = LAB;
    for (const t of TIPOS) {
      const v = f.tipos[t.k]; if (!v) continue;
      const w = (v / max) * ancho; g.fillStyle = t.color; g.fillRect(x, y0 + 3, Math.max(2, w - 1.5), RH - 8); x += w;
    }
    fuente(g, 800, 12); g.textAlign = "left"; g.fillStyle = TINTA;
    g.fillText(`${f.total}`, x + 7, y0 + RH / 2);
    fuente(g, 500, 10.5); g.fillStyle = GRIS; g.fillText(`${f.diasConNovedad} ${f.diasConNovedad === 1 ? "día" : "días"}`, x + 7 + g.measureText(`${f.total}`).width + 8, y0 + RH / 2);
  });
  if (!top.length) { fuente(g, 600, 13); g.textAlign = "left"; g.fillStyle = GRIS; g.fillText("Sin novedades en el periodo.", LAB, T + RH / 2) }
  return salir(l);
}

/* ============ 6 · CÓMO VAN LAS UBICACIONES (tendencia) ============ */
export function graficaTendencias(a: Analisis): Imagen {
  const LAB = 120, R = 70, T = 8, RH = 34;
  const W = 520, H = T + RH * TENDENCIAS.length + 6;
  const l = lienzo(W, H), g = l.g;
  const max = Math.max(1, ...TENDENCIAS.map((t) => a.conteoTendencia[t.k])), ancho = W - LAB - R;
  TENDENCIAS.forEach((t, r) => {
    const y0 = T + RH * r, v = a.conteoTendencia[t.k];
    fuente(g, 700, 13); g.textAlign = "right"; g.fillStyle = TINTA; g.fillText(t.nombre, LAB - 12, y0 + RH / 2);
    g.fillStyle = LINEA; g.fillRect(LAB, y0 + 7, ancho, RH - 14);
    g.fillStyle = t.color; g.fillRect(LAB, y0 + 7, Math.max(v ? 3 : 0, (v / max) * ancho), RH - 14);
    fuente(g, 800, 14); g.textAlign = "left"; g.fillStyle = TINTA; g.fillText(String(v), LAB + (v / max) * ancho + 8, y0 + RH / 2);
  });
  return salir(l);
}

/** Todas las gráficas del informe (y de la pantalla) de una vez. */
export function armarGraficas(a: Analisis): Graficas {
  return { dias: graficaDias(a), cobertura: graficaCobertura(a), dona: graficaDona(a), top: graficaTop(a), tendencias: graficaTendencias(a) };
}
