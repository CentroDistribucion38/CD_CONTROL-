/**
 * LAS FOTOS DEL CASCO DE VIDRIO — Dashboard y Detalle, cada una en una imagen para copiar y pegar
 * en un correo o en WhatsApp. «En casco de vidrio quiero lo mismo: la dashboard y el detalle.»
 *
 * DASHBOARD: la gráfica de envases pendientes por partir por día y almacén, los totales (HL al
 * corte, contra el día anterior, viajes SERPRO y el pico), cómo está cada almacén, el % de cada uno
 * y el top de materiales.
 * DETALLE: una tarjeta por almacén, la gráfica de HL por material partida por almacén y la tabla de
 * cada almacén con su último conteo, como en el PDF.
 *
 * NO CALCULA NADA: pinta el mismo `DatosInformeCasco` que va al PDF y al Word, con los filtros.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import {
  BAJA_OK, BORDE, FONDO, FOTO, GRIS, HUECO, MARGEN, SUAVE, SUBE,
  altoTabla, anchosTabla, cabecera, dibujarTabla, espaciado, letra, medidor, pie, recortar,
  type Caja, type ColTabla, type Ctx,
} from "@/modulos/foto";
import { colorSitio, conSigno, corta, fmt, gruposDeUbicacion, larga, type DatosInformeCasco, type SitioInforme } from "./informe";

type Extra = { paleta?: Paleta; logo?: CanvasImageSource | null; generado?: Date };

const chipsCasco = (d: DatosInformeCasco) => (d.filtros ? d.filtros.split(" · ").filter(Boolean) : ["Todas las ubicaciones", "Todos los SKU"]);
const titulo = (s: SitioInforme) => s.nombre || s.centro;

function nuevoLienzo(W: number, H: number) {
  const c = document.createElement("canvas");
  c.width = W * FOTO.escala; c.height = H * FOTO.escala;
  const ctx = c.getContext("2d")!;
  ctx.scale(FOTO.escala, FOTO.escala); ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);
  return { c, ctx };
}

/** Un panel blanco con su título; devuelve el área de adentro. */
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

/** Barras horizontales por material partidas por almacén, con la cifra de cada tramo adentro. */
function barrasMaterial(ctx: Ctx, TINTA: string, a: Caja, d: DatosInformeCasco, filas: { nombre: string; porSitio: Record<string, number>; total: number }[], nombre: number, fila: number) {
  if (!filas.length) { letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.textAlign = "center"; ctx.fillText("Sin materiales con estos filtros", a.x + a.w / 2, a.y + a.h / 2); return }
  const VAL = 70, X0 = a.x + nombre + 12, X1 = a.x + a.w - VAL, bh = Math.min(22, fila * 0.7);
  const max = Math.max(1e-9, ...filas.map((f) => f.total));
  filas.forEach((f, i) => {
    const cy = a.y + i * fila + fila / 2;
    letra(ctx, 600, 13); ctx.fillStyle = TINTA; ctx.textAlign = "right";
    ctx.fillText(recortar(ctx, f.nombre, nombre), a.x + nombre, cy);
    ctx.fillStyle = SUAVE; ctx.fillRect(X0, cy - bh / 2, X1 - X0, bh);
    let x = X0;
    for (const k of d.claves) {
      const v = f.porSitio[k] ?? 0; if (v <= 0) continue;
      const w = (v / max) * (X1 - X0), col = colorSitio(k);
      ctx.fillStyle = col.fondo; ctx.fillRect(x, cy - bh / 2, Math.max(1, w - 2), bh);
      letra(ctx, 700, 12); const t = fmt.hl0(v);
      if (ctx.measureText(t).width + 10 < w) { ctx.fillStyle = col.tinta; ctx.textAlign = "center"; ctx.fillText(t, x + w / 2, cy) }
      x += w;
    }
    letra(ctx, 800, 13.5); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(fmt.hl0(f.total), a.x + a.w, cy);
  });
}

const leyendaSitios = (d: DatosInformeCasco) => d.claves.map((k) => ({ t: d.sitios.find((s) => s.clave === k)?.centro ?? k, col: colorSitio(k).fondo }));

/* =====================================================================
   DASHBOARD
   ===================================================================== */
export function dibujarDashboardCasco(d: DatosInformeCasco, extra: Extra = {}): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const W = FOTO.ancho, H = FOTO.alto, M = MARGEN, G = HUECO;
  const { c, ctx } = nuevoLienzo(W, H);
  const periodo = d.periodo ? d.periodo.charAt(0).toUpperCase() + d.periodo.slice(1) : "";
  cabecera(ctx, W, chipsCasco(d), P, extra.logo, "Casco de vidrio por partir", `HL pendientes · ${periodo}`);

  const Y1 = 106, H1 = 470, Y2 = Y1 + H1 + G, H2 = H - Y2 - 34;
  const wK = 290, wA = W - 2 * M - wK - G, xK = M + wA + G;

  /* ---------- A · la gráfica por día ---------- */
  {
    const a = panel(ctx, TINTA, ACENTO, { x: M, y: Y1, w: wA, h: H1 }, "Envases pendientes por partir (HL)", { leyenda: leyendaSitios(d) });
    const s = d.serie, n = s.length;
    if (!n) { letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.textAlign = "center"; ctx.fillText("Sin registros en el periodo", a.x + a.w / 2, a.y + a.h / 2) }
    else {
      const ML = 50, top = a.y + 26, base = a.y + a.h - 24;
      const max = Math.max(1, ...s.map((x) => x.total));
      const crudo = max / 5, mag = Math.pow(10, Math.floor(Math.log10(crudo))), f = crudo / mag;
      const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag, tope = Math.ceil(max / paso) * paso;
      const Y = (v: number) => base - (v / tope) * (base - top);
      for (let v = 0; v <= tope + paso / 1000; v += paso) {
        const yy = Math.round(Y(v)) + .5;
        ctx.strokeStyle = v === 0 ? "#9AA5B1" : "#E6EAF0"; ctx.lineWidth = 1; ctx.setLineDash(v === 0 ? [] : [4, 5]);
        ctx.beginPath(); ctx.moveTo(a.x + ML, yy); ctx.lineTo(a.x + a.w, yy); ctx.stroke();
        letra(ctx, 500, 12); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(fmt.hl0(v), a.x + ML - 8, yy);
      }
      ctx.setLineDash([]);
      const PASO = (a.w - ML) / n, BW = Math.max(4, Math.min(64, PASO * 0.72));
      // un mismo tamaño para todos los números de una clase
      letra(ctx, 700, 12); const anchoSeg = Math.max(...s.flatMap((x) => Object.values(x.porSitio).map((v) => ctx.measureText(fmt.hl0(v)).width)), 1);
      const segAcostado = anchoSeg + 6 <= BW, segParado = !segAcostado && BW >= 15;
      letra(ctx, 800, 13); const anchoTot = Math.max(...s.map((x) => ctx.measureText(fmt.hl0(x.total)).width));
      const totales = anchoTot + 4 <= PASO;
      letra(ctx, 500, 12.5); const anchoFec = Math.max(...s.map((x) => ctx.measureText(corta(x.fecha)).width));
      const cada = Math.max(1, Math.ceil((anchoFec + 10) / PASO));
      s.forEach((dia, i) => {
        const x = a.x + ML + i * PASO + (PASO - BW) / 2; let acum = 0;
        for (const k of d.claves) {
          const v = dia.porSitio[k] ?? 0; if (v <= 0) continue;
          const y1 = Y(acum + v), y0 = Y(acum); acum += v;
          const col = colorSitio(k);
          ctx.fillStyle = col.fondo; ctx.fillRect(x, y1, BW, Math.max(1, y0 - y1 - 2));
          const t = fmt.hl0(v); letra(ctx, 700, 12); ctx.fillStyle = col.tinta; ctx.textAlign = "center";
          if (segAcostado && y0 - y1 >= 17) ctx.fillText(t, x + BW / 2, (y0 + y1) / 2 - 1);
          else if (segParado && y0 - y1 >= ctx.measureText(t).width + 8) {
            ctx.save(); ctx.translate(x + BW / 2, (y0 + y1) / 2 - 1); ctx.rotate(-Math.PI / 2); ctx.fillText(t, 0, 0); ctx.restore();
          }
        }
        const ultimo = i === n - 1;
        if (totales || ultimo) { letra(ctx, 800, 13); ctx.fillStyle = TINTA; ctx.textAlign = "center"; ctx.fillText(fmt.hl0(dia.total), x + BW / 2, Y(dia.total) - 11) }
        if (ultimo || (i % cada === 0 && n - 1 - i >= cada * 0.6)) {
          letra(ctx, ultimo ? 800 : 500, 12.5); ctx.fillStyle = ultimo ? TINTA : GRIS; ctx.textAlign = "center"; ctx.fillText(corta(dia.fecha), x + BW / 2, base + 14);
        }
      });
    }
  }

  /* ---------- K · los totales ---------- */
  {
    const dif = d.anterior ? d.total - d.anterior.total : null;
    const tarjetas: { t: string; v: string; nota?: string; oscura?: boolean; col?: string }[] = [
      { t: `HL por partir al ${corta(d.corte)}`, v: fmt.hl0(d.total), oscura: true, nota: larga(d.corte) },
      dif == null
        ? { t: "Vs día anterior", v: "—", nota: "primer día del periodo" }
        /* MÁS CASCO POR PARTIR ES PEOR: sube en rojo, baja en verde. */
        : { t: `Vs ${corta(d.anterior!.fecha)}`, v: `${conSigno(dif)} HL`, nota: `ese día: ${fmt.hl0(d.anterior!.total)} HL`, col: dif > 0 ? SUBE : dif < 0 ? BAJA_OK : undefined },
      { t: "Viajes SERPRO", v: fmt.viajes(d.viajes), nota: "estibas del último conteo ÷ 36 o ÷ 100" },
      d.pico ? { t: "Pico del periodo", v: fmt.hl0(d.pico.total), nota: `el ${corta(d.pico.fecha)}` } : { t: "Pico del periodo", v: "—" },
    ];
    const th = (H1 - G * (tarjetas.length - 1)) / tarjetas.length;
    tarjetas.forEach((k, i) => {
      const y = Y1 + i * (th + G);
      ctx.fillStyle = k.oscura ? TINTA : "#FFFFFF"; ctx.fillRect(xK, y, wK, th);
      if (!k.oscura) { ctx.strokeStyle = BORDE; ctx.strokeRect(xK + .5, y + .5, wK - 1, th - 1) }
      ctx.fillStyle = ACENTO; ctx.fillRect(xK, y + th - 4, wK, 4);
      letra(ctx, 800, 12); ctx.fillStyle = k.oscura ? "rgba(255,255,255,.75)" : GRIS; ctx.textAlign = "left";
      espaciado(ctx, k.t.toUpperCase(), xK + 16, y + 22, 1);
      let px = k.oscura ? 50 : 32; letra(ctx, 900, px);
      while (ctx.measureText(k.v).width > wK - 32 && px > 16) { px -= 1; letra(ctx, 900, px) }
      ctx.fillStyle = k.oscura ? "#FFFFFF" : (k.col ?? TINTA);
      ctx.fillText(k.v, xK + 16, y + th / 2 + 4);
      if (k.nota) { letra(ctx, 500, 12); ctx.fillStyle = k.oscura ? "rgba(255,255,255,.7)" : GRIS; ctx.fillText(recortar(ctx, k.nota, wK - 32), xK + 16, y + th - 20) }
    });
  }

  /* ---------- FILA 2 ---------- */
  const wB = 760, wC = 300, wD = W - 2 * M - wB - wC - 2 * G;
  const xB = M, xC = xB + wB + G, xD = xC + wC + G;

  // B · cómo está cada almacén
  {
    const a = panel(ctx, TINTA, ACENTO, { x: xB, y: Y2, w: wB, h: H2 }, "Cómo está cada almacén", { nota: "su último conteo en el periodo" });
    const n = d.sitios.length, cols = n <= 2 ? n : 2, filas = Math.ceil(n / Math.max(1, cols));
    const cw = (a.w - G * (cols - 1)) / Math.max(1, cols), ch = (a.h - G * (filas - 1)) / Math.max(1, filas);
    d.sitios.forEach((s, i) => {
      const x = a.x + (i % cols) * (cw + G), y = a.y + Math.floor(i / cols) * (ch + G), col = colorSitio(s.clave);
      ctx.fillStyle = "#FAFBFC"; ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = BORDE; ctx.strokeRect(x + .5, y + .5, cw - 1, ch - 1);
      ctx.fillStyle = col.fondo; ctx.fillRect(x, y, 6, ch);
      letra(ctx, 800, 13); ctx.fillStyle = TINTA; ctx.textAlign = "left";
      ctx.fillText(recortar(ctx, titulo(s).toUpperCase(), cw - 120), x + 18, y + 20);
      letra(ctx, 600, 12); ctx.fillStyle = GRIS; ctx.textAlign = "right";
      ctx.fillText(s.fecha ? `conteo ${corta(s.fecha)}` : "sin conteo", x + cw - 12, y + 20);
      letra(ctx, 900, 34); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(fmt.hl(s.total), x + 18, y + ch / 2 + 4);
      const hw = ctx.measureText(fmt.hl(s.total)).width;
      letra(ctx, 600, 13); ctx.fillStyle = GRIS; ctx.fillText("HL", x + 24 + hw, y + ch / 2 + 9);
      letra(ctx, 600, 12.5); ctx.textAlign = "right"; ctx.fillStyle = GRIS; ctx.fillText("viajes", x + cw - 56, y + ch / 2 + 6);
      letra(ctx, 900, 22); ctx.fillStyle = TINTA; ctx.fillText(fmt.viajes(s.viajes), x + cw - 12, y + ch / 2 + 4);
      const pct = d.total ? Math.round((s.total / d.total) * 100) : 0;
      const dif = s.anterior ? s.total - s.anterior.total : null;
      letra(ctx, 600, 12.5); ctx.textAlign = "left"; ctx.fillStyle = GRIS;
      const linea = `${pct}% del total · ${fmt.est(s.estibas)} estibas`;
      ctx.fillText(linea, x + 18, y + ch - 18);
      if (dif != null) {
        const lw = ctx.measureText(linea + " · ").width;
        ctx.fillText(" · ", x + 18 + ctx.measureText(linea).width, y + ch - 18);
        ctx.fillStyle = dif > 0.5 ? SUBE : dif < -0.5 ? BAJA_OK : GRIS; letra(ctx, 800, 12.5);
        ctx.fillText(`${conSigno(dif)} vs ${corta(s.anterior!.fecha)}`, x + 18 + lw, y + ch - 18);
      }
    });
  }

  // C · % por almacén
  {
    const a = panel(ctx, TINTA, ACENTO, { x: xC, y: Y2, w: wC, h: H2 }, "% por almacén");
    const ley = 21 * d.sitios.length + 4;
    const cx = a.x + a.w / 2, cy = a.y + (a.h - ley) / 2, R = Math.min(a.w, a.h - ley) / 2 - 20, grosor = 36;
    let a0 = -Math.PI / 2;
    if (d.total > 0) d.sitios.forEach((s) => {
      const fr = Math.max(0, s.total) / d.total, a1 = a0 + fr * Math.PI * 2, col = colorSitio(s.clave);
      ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.lineWidth = grosor; ctx.strokeStyle = col.fondo; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + (R - grosor / 2) * Math.cos(a1), cy + (R - grosor / 2) * Math.sin(a1));
      ctx.lineTo(cx + (R + grosor / 2) * Math.cos(a1), cy + (R + grosor / 2) * Math.sin(a1)); ctx.lineWidth = 3; ctx.strokeStyle = "#FFFFFF"; ctx.stroke();
      if (fr >= 0.06) { const m = (a0 + a1) / 2; letra(ctx, 900, 14.5); ctx.fillStyle = col.tinta; ctx.textAlign = "center"; ctx.fillText(`${Math.round(fr * 100)}%`, cx + R * Math.cos(m), cy + R * Math.sin(m)) }
      a0 = a1;
    });
    letra(ctx, 900, 24); ctx.fillStyle = TINTA; ctx.textAlign = "center"; ctx.fillText(fmt.hl0(d.total), cx, cy - 6);
    letra(ctx, 600, 12); ctx.fillStyle = GRIS; ctx.fillText("HL", cx, cy + 15);
    d.sitios.forEach((s, i) => {
      const ly = a.y + a.h - ley + 10 + i * 21;
      ctx.fillStyle = colorSitio(s.clave).fondo; ctx.fillRect(a.x + 2, ly - 6, 12, 12);
      letra(ctx, 700, 13); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(s.centro, a.x + 22, ly);
      ctx.textAlign = "right"; ctx.fillText(`${fmt.hl0(s.total)} HL`, a.x + a.w - 2, ly);
    });
  }

  // D · top de materiales
  {
    const pm = d.porMaterial;
    const a = panel(ctx, TINTA, ACENTO, { x: xD, y: Y2, w: wD, h: H2 }, "Por material (HL)", { nota: pm ? `el ${corta(pm.fecha)}` : undefined });
    const n = Math.max(1, Math.min(10, Math.floor(a.h / 28)));
    const filas = [...(pm?.filas ?? [])].sort((x, y) => y.total - x.total).slice(0, n);
    barrasMaterial(ctx, TINTA, a, d, filas, 210, Math.min(34, a.h / Math.max(1, filas.length)));
  }

  pie(ctx, W, H, extra.generado ?? new Date(), "Cifras en HL. Una barra por día con registros; cada color es un almacén.");
  return c;
}

/** Las columnas de la tabla de un almacén: las mismas del PDF, con la ubicación por zona en renglones. */
type FilaC = SitioInforme["filas"][number];
function columnasCasco(s: SitioInforme): ColTabla<FilaC>[] {
  const conBaja = !!s.rotuloBaja || s.filas.some((f) => f.baja !== 0);
  const conUbi = s.filas.some((f) => f.puesto);
  const cols: ColTabla<FilaC>[] = [
    { t: "COD", w: 86, gris: true, v: (f) => f.sku },
    { t: "MATERIAL", w: 0, envuelve: true, v: (f) => f.nombre },
    { t: "INVENTARIO CASCO", w: 100, num: true, rojoNegativo: true, v: (f) => (f.inventario ? fmt.est(f.inventario) : "") },
  ];
  if (conBaja) cols.push({ t: (s.rotuloBaja ?? "Con baja").toUpperCase(), w: 100, num: true, rojoNegativo: true, v: (f) => (f.baja ? fmt.est(f.baja) : "") });
  cols.push({ t: "HL", w: 76, num: true, fuerte: true, rojoNegativo: true, v: (f) => fmt.hl(f.hl) });
  if (conUbi) cols.push({ t: "UBICACIÓN", w: 250, v: () => "", lineas: (f) => gruposDeUbicacion(f.puesto) });
  return cols;
}

/* =====================================================================
   DETALLE POR ALMACÉN
   ===================================================================== */
export function dibujarDetalleCasco(d: DatosInformeCasco, extra: Extra = {}): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const W = FOTO.ancho, M = MARGEN, G = HUECO;
  const sitios = d.sitios;
  const mats = [...(d.porMaterial?.filas ?? [])].sort((x, y) => y.total - x.total);

  /* las medidas: la imagen crece con las filas (y con las ubicaciones, que se parten en renglones) */
  const FILA_G = 30;
  const yCards = 106, hCards = 112;
  const yGraf = yCards + hCards + G, hGraf = 62 + Math.max(1, mats.length) * FILA_G + 2;
  const porFila = sitios.length === 1 ? 1 : 2;
  const tw = (W - 2 * M - G * (porFila - 1)) / porFila;
  const med = medidor();
  const columnas = new Map(sitios.map((s) => [s.clave, anchosTabla(columnasCasco(s), tw - 32)]));
  const pares: SitioInforme[][] = [];
  for (let i = 0; i < sitios.length; i += porFila) pares.push(sitios.slice(i, i + porFila));
  const altoPar = (par: SitioInforme[]) => 62 + Math.max(...par.map((s) => altoTabla(med, columnas.get(s.clave)!, s.filas))) + 6;
  const yTab = yGraf + hGraf + G;
  const H = yTab + pares.reduce((t, p) => t + altoPar(p) + G, 0) - G + 34 + (pares.length ? 0 : 40);

  const { c, ctx } = nuevoLienzo(W, H);
  cabecera(ctx, W, chipsCasco(d), P, extra.logo, "Detalle por almacén", `Casco de vidrio por partir · al ${larga(d.corte)}`);

  /* ---------- LAS TARJETAS ---------- */
  const n = Math.max(1, sitios.length), cw = (W - 2 * M - G * (n - 1)) / n;
  sitios.forEach((s, i) => {
    const x = M + i * (cw + G), y = yCards, col = colorSitio(s.clave);
    ctx.fillStyle = TINTA; ctx.fillRect(x, y, cw, hCards);
    ctx.fillStyle = col.fondo; ctx.fillRect(x, y, 8, hCards);
    letra(ctx, 900, 22); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left"; ctx.fillText(s.centro, x + 24, y + 26);
    const nw = ctx.measureText(s.centro).width;
    const resto = s.nombre.toUpperCase().startsWith(s.centro.toUpperCase()) ? s.nombre.slice(s.centro.length).trim() : s.nombre;
    letra(ctx, 500, 13.5); ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillText(recortar(ctx, resto, cw - nw - 60), x + 24 + nw + 10, y + 27);
    letra(ctx, 900, 36); ctx.fillStyle = col.fondo === "#3B3B3B" ? "#FFFFFF" : col.fondo; ctx.fillText(fmt.hl(s.total), x + 24, y + 66);
    const hw = ctx.measureText(fmt.hl(s.total)).width;
    letra(ctx, 700, 13); ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillText("HL", x + 30 + hw, y + 72);
    const pct = d.total ? Math.round((s.total / d.total) * 100) : 0;
    letra(ctx, 600, 12.5); ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillText(recortar(ctx, `${pct}% · ${fmt.est(s.estibas)} estibas · ${fmt.viajes(s.viajes)} viajes · conteo ${s.fecha ? corta(s.fecha) : "—"}`, cw - 40), x + 24, y + hCards - 18);
  });
  if (!sitios.length) { letra(ctx, 600, 18); ctx.fillStyle = GRIS; ctx.textAlign = "center"; ctx.fillText("Sin almacenes con estos filtros", W / 2, yCards + 56) }

  /* ---------- LA GRÁFICA POR MATERIAL ---------- */
  {
    const pm = d.porMaterial;
    const a = panel(ctx, TINTA, ACENTO, { x: M, y: yGraf, w: W - 2 * M, h: hGraf },
      `HL por material y almacén${pm ? ` · ${corta(pm.fecha)}` : ""}`, { leyenda: leyendaSitios(d) });
    barrasMaterial(ctx, TINTA, a, d, mats, 330, FILA_G);
  }

  /* ---------- LAS TABLAS ---------- */
  let y = yTab;
  for (const par of pares) {
    const h = altoPar(par);
    par.forEach((s, j) => {
      const x = M + j * (tw + G), col = colorSitio(s.clave);
      const nota = `${s.fecha ? `conteo ${corta(s.fecha)} · ` : ""}${fmt.hl(s.total)} HL · ${fmt.viajes(s.viajes)} viajes`;
      const a = panel(ctx, TINTA, col.fondo, { x, y, w: tw, h }, titulo(s), { nota });
      const rotulo = (s.rotuloBaja ?? "Con baja").toUpperCase();
      dibujarTabla(ctx, TINTA, a.x, a.y, a.w, columnas.get(s.clave)!, s.filas, (cc) => (
        cc.t === "COD" ? "TOTAL"
        : cc.t === "MATERIAL" ? `${s.filas.length} materiales con inventario`
        : cc.t === "INVENTARIO CASCO" ? fmt.est(s.filas.reduce((t, f) => t + f.inventario, 0))
        : cc.t === rotulo ? fmt.est(s.filas.reduce((t, f) => t + f.baja, 0))
        : cc.t === "HL" ? fmt.hl(s.total) : ""));
    });
    y += h + G;
  }

  pie(ctx, W, H, extra.generado ?? new Date(), "Cada almacén con su último conteo del periodo. Lo negativo va en rojo.");
  return c;
}

export const nombreDashboardCasco = (corte: string) => `casco-dashboard-${corte}.png`;
export const nombreDetalleCasco = (corte: string) => `casco-detalle-${corte}.png`;

