/**
 * LAS FOTOS DEL COMPARATIVO DE CASCO — Dashboard y Tabla, cada una en una imagen para copiar y
 * pegar en un correo o en WhatsApp, igual que las del Tablero.
 *
 * DASHBOARD: las dos barras apiladas (día A y día B) con lo que cambió cada almacén, las cifras
 * del cambio, cómo está cada almacén y lo que más se movió. Los tonos son los del dashboard del casco.
 * TABLA: la tabla por ubicación con los colores del Excel (material · almacén · módulo · número ·
 * estado del envase · conteo A · conteo B · diferencia).
 *
 * NO CALCULA NADA: pinta lo que la pantalla ya calculó, con la unidad y los filtros que estén puestos.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import {
  BAJA_OK, BORDE, FONDO, FOTO, GRIS, HUECO, MARGEN, SUAVE, SUBE,
  anchoEspaciado, cabecera, espaciado, letra, pie, recortar, type Caja, type Ctx,
} from "@/modulos/foto";
import { colorSitio, corta, fmt, larga } from "./informe";
import { ejeNice } from "./serie";
import type { Unidad } from "./comparar";
import type { TablaUb } from "./comparar-ubicacion";

type Extra = { paleta?: Paleta; logo?: CanvasImageSource | null; generado?: Date };

export type SitioCmpFoto = { clave: string; centro: string; nombre: string; a: number; b: number; d: number; estB: number; viajesB: number };
export type MaterialCmpFoto = { nombre: string; porSitioB: Record<string, number>; a: number; b: number; d: number };
export type DatosComparativo = {
  unidad: Unidad;
  /** «HL», «estibas» o «cajas». */
  unidadTxt: string;
  diaA: string | null; diaB: string | null;
  chips: string[];
  tot: { a: number; b: number; d: number };
  pct: number | null;
  viajesA: number; viajesB: number;
  sitios: SitioCmpFoto[];
  topes: MaterialCmpFoto[];
};
export type DatosTablaFoto = {
  tabla: TablaUb; fA: string; fB: string; estado: string; soloCambios: boolean; chips: string[]; unidad: Unidad;
};

const TXT_U: Record<Unidad, string> = { est: "Estibas", hl: "HL", caj: "Cajas" };
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const cero = (v: number, u: Unidad) => Math.abs(v) < (u === "est" ? 0.005 : 0.5);
const fv = (v: number, u: Unidad) => (u === "est" ? fmt.est(v) : fmt.hl0(v));
const sg = (v: number, u: Unidad) => (cero(v, u) ? "0" : (v > 0 ? "+" : "-") + fv(Math.abs(v), u));
const colDe = (v: number, u: Unidad) => (cero(v, u) ? GRIS : v > 0 ? SUBE : BAJA_OK);

function nuevoLienzo(W: number, H: number) {
  const escala = Math.min(FOTO.escala, 15000 / H);
  const c = document.createElement("canvas");
  c.width = Math.round(W * escala); c.height = Math.round(H * escala);
  const ctx = c.getContext("2d")!;
  ctx.scale(escala, escala); ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);
  return { c, ctx };
}

/** Un panel blanco con su título (y una nota a la derecha); devuelve el área de adentro. */
function panel(ctx: Ctx, TINTA: string, marca: string, b: Caja, t: string, der?: { leyenda?: { t: string; col: string }[]; nota?: string }) {
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
  ctx.fillStyle = marca; ctx.fillRect(b.x + 16, b.y + 18, 10, 10);
  letra(ctx, 800, 15); ctx.fillStyle = TINTA; ctx.textAlign = "left";
  espaciado(ctx, t.toUpperCase(), b.x + 34, b.y + 24);
  if (der?.nota) { letra(ctx, 600, 13); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(der.nota, b.x + b.w - 16, b.y + 24) }
  if (der?.leyenda?.length) {
    letra(ctx, 700, 12.5); let lx = b.x + b.w - 16;
    for (const l of [...der.leyenda].reverse()) {
      const tw = ctx.measureText(l.t).width; lx -= tw;
      ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(l.t, lx, b.y + 24);
      lx -= 16; ctx.fillStyle = l.col; ctx.fillRect(lx, b.y + 18, 11, 11);
      ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.strokeRect(lx + .5, b.y + 18.5, 10, 10); lx -= 16;
    }
  }
  return { x: b.x + 16, y: b.y + 48, w: b.w - 32, h: b.h - 62 };
}

/* =====================================================================
   DASHBOARD
   ===================================================================== */
export function dibujarDashboardComparativo(d: DatosComparativo, extra: Extra = {}): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const W = FOTO.ancho, H = FOTO.alto, M = MARGEN, G = HUECO, u = d.unidad, U = d.unidadTxt;
  const { c, ctx } = nuevoLienzo(W, H);
  const A = d.diaA ? corta(d.diaA) : "A", B = d.diaB ? corta(d.diaB) : "B";
  cabecera(ctx, W, d.chips, P, extra.logo, "Casco de vidrio · Comparativo",
    `${U === "HL" ? "HL" : U} por partir · ${d.diaA ? larga(d.diaA) : "—"} contra ${d.diaB ? larga(d.diaB) : "—"}`);

  const Y1 = 106, H1 = 470, Y2 = Y1 + H1 + G, H2 = H - Y2 - 34;
  const wK = 290, wA = W - 2 * M - wK - G, xK = M + wA + G;

  /* ---------- A · las dos barras apiladas ---------- */
  {
    const a = panel(ctx, TINTA, ACENTO, { x: M, y: Y1, w: wA, h: H1 }, `Casco por partir · día A contra día B (${U})`,
      { leyenda: d.sitios.map((s) => ({ t: s.centro, col: colorSitio(s.clave).fondo })) });
    const ML = 56, top = a.y + 34, base = a.y + a.h - 30;
    const val = (v: number) => Math.max(0, v);
    const totA = d.sitios.reduce((t, s) => t + val(s.a), 0), totB = d.sitios.reduce((t, s) => t + val(s.b), 0);
    const eje = ejeNice(Math.max(totA, totB, 1), 5);
    const Y = (v: number) => base - (v / eje.tope) * (base - top);
    for (const v of eje.ticks) {
      const yy = Math.round(Y(v)) + .5;
      ctx.strokeStyle = v === 0 ? "#9AA5B1" : "#E6EAF0"; ctx.lineWidth = 1; ctx.setLineDash(v === 0 ? [] : [4, 5]);
      ctx.beginPath(); ctx.moveTo(a.x + ML, yy); ctx.lineTo(a.x + a.w, yy); ctx.stroke();
      letra(ctx, 500, 12); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(fv(v, u), a.x + ML - 8, yy);
    }
    ctx.setLineDash([]);
    const BW = 190, xA = a.x + ML + 70, xB = xA + BW + 150;
    const pila = (x0: number, lado: "a" | "b") => {
      let acum = 0;
      for (const s of d.sitios) {
        const v = val(s[lado]); if (v <= 0) continue;
        const y1 = Y(acum + v), y0 = Y(acum); acum += v;
        const col = colorSitio(s.clave);
        ctx.fillStyle = col.fondo; ctx.fillRect(x0, y1, BW, Math.max(1, y0 - y1 - 2));
        if (y0 - y1 >= 18) { letra(ctx, 700, 14); ctx.fillStyle = col.tinta; ctx.textAlign = "center"; ctx.fillText(fv(v, u), x0 + BW / 2, (y0 + y1) / 2 - 1) }
      }
    };
    pila(xA, "a"); pila(xB, "b");
    ctx.strokeStyle = GRIS; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(xA + BW, Y(totA)); ctx.lineTo(xB, Y(totB)); ctx.stroke(); ctx.setLineDash([]);
    letra(ctx, 800, 19); ctx.fillStyle = TINTA; ctx.textAlign = "center";
    ctx.fillText(fv(totA, u), xA + BW / 2, Y(totA) - 14); ctx.fillText(fv(totB, u), xB + BW / 2, Y(totB) - 14);
    letra(ctx, 700, 14); ctx.fillStyle = GRIS; ctx.fillText(A, xA + BW / 2, base + 15);
    letra(ctx, 800, 14); ctx.fillStyle = TINTA; ctx.fillText(B, xB + BW / 2, base + 15);
    /* El cambio de cada almacén, a la altura de su tramo del día B. */
    let acum = 0;
    const xd = xB + BW + 28;
    for (const s of d.sitios) {
      const v = val(s.b); const mid = Y(acum + v / 2); acum += v;
      letra(ctx, 700, 13); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(s.centro, xd, mid - 12);
      letra(ctx, 900, 24); ctx.fillStyle = colDe(s.d, u); ctx.fillText(`${s.d > 0 && !cero(s.d, u) ? "▲ " : s.d < 0 && !cero(s.d, u) ? "▼ " : ""}${sg(s.d, u)}`, xd, mid + 10);
    }
  }

  /* ---------- K · las cifras ---------- */
  {
    const top = d.topes[0];
    const dv = d.tot.d;
    const dViajes = d.viajesB - d.viajesA;
    const tarjetas: { t: string; v: string; nota?: string; oscura?: boolean; col?: string }[] = [
      { t: `${U} por partir al ${B}`, v: fv(d.tot.b, u), oscura: true, nota: d.diaB ? larga(d.diaB) : undefined },
      { t: `Contra el ${A}`, v: `${sg(dv, u)} ${U}`, col: colDe(dv, u),
        nota: `${d.pct == null ? "" : `${d.pct > 0 ? "+" : d.pct < 0 ? "-" : ""}${fmt.hl(Math.abs(d.pct))}% · `}ese día: ${fv(d.tot.a, u)} ${U}` },
      { t: "Viajes SERPRO", v: fmt.viajes(d.viajesB), nota: `${fmt.viajes(d.viajesA)} → ${fmt.viajes(d.viajesB)} (${dViajes > 0 ? "+" : dViajes < 0 ? "-" : ""}${fmt.viajes(Math.abs(dViajes))})` },
      top ? { t: "El que más cambió", v: top.nombre, nota: `${sg(top.d, u)} ${U} · ${fv(top.a, u)} → ${fv(top.b, u)}` } : { t: "El que más cambió", v: "—", nota: "ningún material cambió" },
    ];
    const th = (H1 - G * (tarjetas.length - 1)) / tarjetas.length;
    tarjetas.forEach((k, i) => {
      const y = Y1 + i * (th + G);
      ctx.fillStyle = k.oscura ? "#111111" : "#FFFFFF"; ctx.fillRect(xK, y, wK, th);
      if (!k.oscura) { ctx.strokeStyle = BORDE; ctx.strokeRect(xK + .5, y + .5, wK - 1, th - 1) }
      ctx.fillStyle = ACENTO; ctx.fillRect(xK, y + th - 4, wK, 4);
      letra(ctx, 800, 12); ctx.fillStyle = k.oscura ? "rgba(255,255,255,.75)" : GRIS; ctx.textAlign = "left";
      espaciado(ctx, k.t.toUpperCase(), xK + 16, y + 22, 1);
      let px = k.oscura ? 50 : 32; letra(ctx, 900, px);
      while (ctx.measureText(k.v).width > wK - 32 && px > 14) { px -= 1; letra(ctx, 900, px) }
      ctx.fillStyle = k.oscura ? "#FFFFFF" : (k.col ?? TINTA);
      ctx.fillText(k.v, xK + 16, y + th / 2 + 4);
      if (k.nota) { letra(ctx, 500, 12); ctx.fillStyle = k.oscura ? "rgba(255,255,255,.7)" : GRIS; ctx.fillText(recortar(ctx, k.nota, wK - 32), xK + 16, y + th - 20) }
    });
  }

  /* ---------- FILA 2 ---------- */
  const wB = 760, xB2 = M, xD = xB2 + wB + G, wD = W - 2 * M - wB - G;

  // B · cómo está cada almacén
  {
    const a = panel(ctx, TINTA, ACENTO, { x: xB2, y: Y2, w: wB, h: H2 }, "Cómo está cada almacén", { nota: "día B contra día A" });
    const n = d.sitios.length, cols = n <= 2 ? Math.max(1, n) : 2, filas = Math.ceil(n / cols);
    const cw = (a.w - G * (cols - 1)) / cols, ch = (a.h - G * (filas - 1)) / Math.max(1, filas);
    d.sitios.forEach((s, i) => {
      const x = a.x + (i % cols) * (cw + G), y = a.y + Math.floor(i / cols) * (ch + G), col = colorSitio(s.clave);
      ctx.fillStyle = "#FAFBFC"; ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = BORDE; ctx.strokeRect(x + .5, y + .5, cw - 1, ch - 1);
      ctx.fillStyle = col.fondo; ctx.fillRect(x, y, 6, ch);
      letra(ctx, 800, 13); ctx.fillStyle = TINTA; ctx.textAlign = "left";
      ctx.fillText(recortar(ctx, (s.nombre || s.centro).toUpperCase(), cw - 120), x + 18, y + 20);
      letra(ctx, 600, 12); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(`conteo ${B}`, x + cw - 12, y + 20);
      const grande = fv(s.b, u);
      letra(ctx, 900, 34); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(grande, x + 18, y + ch / 2 + 2);
      const hw = ctx.measureText(grande).width;
      letra(ctx, 600, 13); ctx.fillStyle = GRIS; ctx.fillText(U, x + 24 + hw, y + ch / 2 + 7);
      letra(ctx, 600, 12.5); ctx.textAlign = "right"; ctx.fillStyle = GRIS; ctx.fillText("viajes", x + cw - 56, y + ch / 2 + 4);
      letra(ctx, 900, 22); ctx.fillStyle = TINTA; ctx.fillText(fmt.viajes(s.viajesB), x + cw - 12, y + ch / 2 + 2);
      const pct = d.tot.b ? Math.round((s.b / d.tot.b) * 100) : 0;
      letra(ctx, 600, 12.5); ctx.textAlign = "left"; ctx.fillStyle = GRIS;
      const linea = `${pct}% del total · ${fmt.est(s.estB)} estibas`;
      ctx.fillText(linea, x + 18, y + ch - 32);
      const lw = ctx.measureText(linea).width;
      ctx.fillText(" · ", x + 18 + lw, y + ch - 32);
      letra(ctx, 800, 12.5); ctx.fillStyle = colDe(s.d, u);
      ctx.fillText(`${sg(s.d, u)} vs ${A}`, x + 18 + lw + ctx.measureText(" · ").width, y + ch - 32);
      letra(ctx, 500, 12); ctx.fillStyle = GRIS; ctx.fillText(`día A: ${fv(s.a, u)} ${U}`, x + 18, y + ch - 14);
    });
  }

  // D · lo que más se movió
  {
    const a = panel(ctx, TINTA, ACENTO, { x: xD, y: Y2, w: wD, h: H2 }, `Lo que más se movió (${U})`, { nota: "día B por almacén · cambio contra el día A" });
    const n = Math.max(1, Math.min(10, Math.floor(a.h / 28)));
    const filas = d.topes.slice(0, n);
    if (!filas.length) { letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.textAlign = "center"; ctx.fillText("Ningún material cambió", a.x + a.w / 2, a.y + a.h / 2) }
    else {
      const NOM = 250, VT = 70, VD = 84, fila = Math.min(34, a.h / filas.length), bh = Math.min(22, fila * 0.7);
      const X0 = a.x + NOM + 12, X1 = a.x + a.w - VT - VD - 8;
      const max = Math.max(1e-9, ...filas.map((f) => Math.max(f.b, f.a)));
      filas.forEach((f, i) => {
        const cy = a.y + i * fila + fila / 2;
        letra(ctx, 600, 13); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(recortar(ctx, f.nombre, NOM), a.x + NOM, cy);
        ctx.fillStyle = SUAVE; ctx.fillRect(X0, cy - bh / 2, X1 - X0, bh);
        let x = X0;
        for (const s of d.sitios) {
          const v = f.porSitioB[s.clave] ?? 0; if (v <= 0) continue;
          const w = (v / max) * (X1 - X0), col = colorSitio(s.clave);
          ctx.fillStyle = col.fondo; ctx.fillRect(x, cy - bh / 2, Math.max(1, w - 2), bh);
          letra(ctx, 700, 12); const t = fv(v, u);
          if (ctx.measureText(t).width + 10 < w) { ctx.fillStyle = col.tinta; ctx.textAlign = "center"; ctx.fillText(t, x + w / 2, cy) }
          x += w;
        }
        letra(ctx, 800, 13.5); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(fv(f.b, u), a.x + a.w - VD, cy);
        letra(ctx, 900, 13.5); ctx.fillStyle = colDe(f.d, u); ctx.fillText(sg(f.d, u), a.x + a.w, cy);
      });
    }
  }

  pie(ctx, W, H, extra.generado ?? new Date(), `Cifras en ${U}. Rojo: más casco por partir; verde: menos. Cada color es un almacén.`);
  return c;
}

/* =====================================================================
   TABLA — la del Excel, con sus colores
   ===================================================================== */
const XL = {
  titulo: "#FFEBA6", cab: "#FFE699", difCab: "#FFF45C", oro: "#E0B100", gris: "#D9D9D9", blanco: "#FFFFFF", total: "#FFF2CC",
  estadoFondo: "#FFE699", estadoTinta: "#B45F06", sube: "#FFC7CE", subeTinta: "#B00020", bien: "#C6EFCE", bienTinta: "#1C6B2C",
  sitio: {
    "BODEGA 38": { f: "#C6EFCE", t: "#1C6B2C" }, FABRICA: { f: "#BDD7EE", t: "#1F3F7A" },
    EXPORTACION: { f: "#E4DFEC", t: "#4B3A7A" }, BTS: { f: "#FCE4D6", t: "#843C0C" },
  } as Record<string, { f: string; t: string }>,
} as const;

export function dibujarTablaComparativo(d: DatosTablaFoto, extra: Extra = {}): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`;
  const W = FOTO.ancho, M = MARGEN;
  const FILA = 26, TIT = 28, CAB = 34, GEN = 32;
  const filas = d.tabla.grupos.reduce((n, g) => n + g.filas.length + 1, 0);
  const H = 120 + TIT + CAB + filas * FILA + GEN + 44;
  const { c, ctx } = nuevoLienzo(W, H);
  cabecera(ctx, W, d.chips, P, extra.logo, "Casco de vidrio · Comparativo por ubicación",
    `${TXT_U[d.unidad]} por ubicación · conteo del ${dmy(d.fA)} contra el del ${dmy(d.fB)}${d.estado ? ` · ${d.estado}` : ""}`);

  const x0 = M, ancho = W - 2 * M;
  const fijas = [110, 170, 0, 130, 170, 170, 130, 130, 130];
  const resto = ancho - fijas.reduce((s, w) => s + w, 0);
  const ws = fijas.map((w) => w || resto);
  const xs: number[] = []; ws.reduce((x, w) => { xs.push(x); return x + w }, x0);
  const cx = (i: number) => xs[i] + ws[i] / 2;
  let y = 112;
  const FUENTE_PESO = (p: number, px = 13.5) => letra(ctx, p, px);

  // título y FECHA
  ctx.fillStyle = XL.titulo; ctx.fillRect(x0, y, ancho, TIT);
  FUENTE_PESO(700); ctx.fillStyle = "#000"; ctx.textAlign = "left"; ctx.fillText(`Suma de TOTAL ${TXT_U[d.unidad].toUpperCase()}`, x0 + 10, y + TIT / 2);
  ctx.textAlign = "center"; ctx.fillText("FECHA", xs[6] + (ws[6] + ws[7]) / 2, y + TIT / 2);
  y += TIT;
  // encabezados
  const enc = ["CODIGO", "UBICACIÓN", "DESCRIPCION", "MODULO", "NUMERO", "ESTADO ENVASE", dmy(d.fA), dmy(d.fB), "Diferencia"];
  enc.forEach((t, i) => {
    ctx.fillStyle = i === 8 ? XL.difCab : XL.cab; ctx.fillRect(xs[i], y, ws[i], CAB);
    FUENTE_PESO(800, i === 8 ? 14.5 : 13.5); ctx.fillStyle = "#000"; ctx.textAlign = "center"; ctx.fillText(t, cx(i), y + CAB / 2);
  });
  ctx.fillStyle = XL.oro; ctx.fillRect(x0, y + CAB - 1, ancho, 1);
  y += CAB;

  const fu = d.unidad === "est" ? fmt.est : d.unidad === "hl" ? fmt.hl : fmt.hl0;
  const celdaDif = (v: number, yy: number, fondoTotal: boolean) => {
    const sube = v > 0.0005;
    ctx.fillStyle = sube ? XL.sube : XL.bien; ctx.fillRect(xs[8], yy, ws[8], FILA);
    FUENTE_PESO(fondoTotal ? 800 : 700); ctx.fillStyle = sube ? XL.subeTinta : XL.bienTinta; ctx.textAlign = "center";
    ctx.fillText(Math.abs(v) < 0.0005 ? "0" : (v > 0 ? "" : "-") + fu(Math.abs(v)), cx(8), yy + FILA / 2);
  };
  const num = (v: number) => (Math.abs(v) < 0.0005 ? "" : fu(v));

  let n = 0;
  for (const g of d.tabla.grupos) {
    for (const f of g.filas) {
      const fondo = n++ % 2 === 0 ? XL.gris : XL.blanco;
      ctx.fillStyle = fondo; ctx.fillRect(x0, y, ancho, FILA);
      const sc = XL.sitio[f.sitio] ?? { f: "#EEE", t: "#333" };
      ctx.fillStyle = sc.f; ctx.fillRect(xs[1] + 1, y, ws[1] - 2, FILA);
      ctx.fillStyle = XL.estadoFondo; ctx.fillRect(xs[5], y, ws[5], FILA);
      ctx.textAlign = "center";
      FUENTE_PESO(800); ctx.fillStyle = "#000"; ctx.fillText(f.codigo, cx(0), y + FILA / 2);
      ctx.fillStyle = sc.t; ctx.fillText(f.sitio, cx(1), y + FILA / 2);
      ctx.fillStyle = "#000"; ctx.fillText(recortar(ctx, f.material, ws[2] - 16), cx(2), y + FILA / 2);
      FUENTE_PESO(600); ctx.fillText(f.modulo, cx(3), y + FILA / 2);
      FUENTE_PESO(800); ctx.fillText(f.numero, cx(4), y + FILA / 2);
      FUENTE_PESO(700); ctx.fillStyle = XL.estadoTinta; ctx.fillText(f.estado, cx(5), y + FILA / 2);
      FUENTE_PESO(600); ctx.fillStyle = "#000"; ctx.fillText(num(f.a), cx(6), y + FILA / 2); ctx.fillText(num(f.b), cx(7), y + FILA / 2);
      celdaDif(f.d, y, false);
      y += FILA;
    }
    // total del material
    ctx.fillStyle = XL.total; ctx.fillRect(x0, y, ancho, FILA);
    ctx.fillStyle = XL.oro; ctx.fillRect(x0, y, ancho, 1); ctx.fillRect(x0, y + FILA - 1, ancho, 1);
    FUENTE_PESO(800); ctx.fillStyle = "#000"; ctx.textAlign = "left"; ctx.fillText(`Total ${g.codigo}`, x0 + 10, y + FILA / 2);
    ctx.textAlign = "center"; ctx.fillText(num(g.a), cx(6), y + FILA / 2); ctx.fillText(num(g.b), cx(7), y + FILA / 2);
    celdaDif(g.d, y, true);
    y += FILA;
  }
  // total general
  ctx.fillStyle = XL.cab; ctx.fillRect(x0, y, ancho, GEN);
  ctx.fillStyle = XL.oro; ctx.fillRect(x0, y, ancho, 2);
  letra(ctx, 800, 15); ctx.fillStyle = "#000"; ctx.textAlign = "left"; ctx.fillText("Total general", x0 + 10, y + GEN / 2 + 1);
  ctx.textAlign = "center"; ctx.fillText(fu(d.tabla.a), cx(6), y + GEN / 2 + 1); ctx.fillText(fu(d.tabla.b), cx(7), y + GEN / 2 + 1);
  const sub = d.tabla.d > 0.0005;
  ctx.fillStyle = sub ? XL.sube : XL.bien; ctx.fillRect(xs[8], y + 2, ws[8], GEN - 2);
  ctx.fillStyle = sub ? XL.subeTinta : XL.bienTinta; ctx.fillText(Math.abs(d.tabla.d) < 0.0005 ? "0" : (d.tabla.d > 0 ? "" : "-") + fu(Math.abs(d.tabla.d)), cx(8), y + GEN / 2 + 1);

  void TINTA; void anchoEspaciado;
  pie(ctx, W, H, extra.generado ?? new Date(), `${TXT_U[d.unidad]} del conteo físico. Rosa: subió; verde: igual o bajó.`);
  return c;
}

export const nombreDashboardComparativo = (a: string | null, b: string | null) => `casco-comparativo-dashboard-${a ?? "A"}-${b ?? "B"}.png`;
export const nombreTablaComparativo = (a: string, b: string) => `casco-comparativo-tabla-${a}-${b}.png`;
