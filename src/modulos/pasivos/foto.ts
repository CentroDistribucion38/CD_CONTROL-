/**
 * LA FOTO DEL INFORME PASIVO — todo el tablero en una sola imagen para pegar en un correo o en
 * WhatsApp.
 *
 * «Ellos ahora envían la foto así; con el nuestro quiero un botón que me muestre todo así,
 *  compactado, y yo pueda copiar y pegar donde quiera.»
 *
 * MISMO ORDEN QUE LA FOTO QUE YA CIRCULA: arriba bloqueados por día, SKU en HL, ubicación por
 * almacén y los totales; abajo SKU en $, el % por almacén y los HL diarios. NO CALCULA NADA: pinta
 * el mismo `DatosInformePasivo` que va al PDF y al Word, con los filtros puestos.
 *
 * Se dibuja a 1800 × 1000 puntos y al doble de resolución, para que no se vea borrosa al ampliar en
 * el celular.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import { gruposDeUbicacion } from "@/modulos/casco/informe";
import { COLOR_ALMACEN, colorEstado, corta, f0, f1, larga, millones, plata, tintaSobre, type DatosInformePasivo, type FilaConsolidado } from "./informe";

import {
  BAJA_OK, BORDE, FONDO, FOTO, GRIS, HUECO, MARGEN, SUAVE, SUBE,
  altoTabla, anchoEspaciado, anchosTabla, cabecera, dibujarTabla, espaciado, letra, medidor, pie, recortar,
  type Caja, type ColTabla,
} from "@/modulos/foto";

export { FOTO };

export function dibujarFotoPasivo(
  d: DatosInformePasivo,
  extra: { paleta?: Paleta; logo?: CanvasImageSource | null; generado?: Date } = {},
): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const { ancho: W, alto: H, escala: S } = FOTO;
  const c = document.createElement("canvas");
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S);
  ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);

  /* ---------- piezas ---------- */
  const panel = (b: Caja, titulo: string, leyenda?: { t: string; col: string }[]) => {
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
    ctx.fillStyle = ACENTO; ctx.fillRect(b.x + 16, b.y + 19, 8, 8);
    letra(ctx, 800, 15); ctx.fillStyle = TINTA; ctx.textAlign = "left";
    espaciado(ctx, titulo.toUpperCase(), b.x + 32, b.y + 24);
    if (leyenda?.length) {
      letra(ctx, 600, 12.5); let lx = b.x + b.w - 16;
      for (const l of [...leyenda].reverse()) {
        const tw = ctx.measureText(l.t).width; lx -= tw;
        ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(l.t, lx, b.y + 24);
        lx -= 16; ctx.fillStyle = l.col; ctx.fillRect(lx, b.y + 19, 10, 10); lx -= 14;
      }
    }
    return { x: b.x + 16, y: b.y + 48, w: b.w - 32, h: b.h - 62 };
  };
  const leyendaEstados = d.estados.map((e) => ({ t: e, col: colorEstado(e) }));
  const vacio = (a: Caja) => { letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.textAlign = "center"; ctx.fillText("Sin datos con estos filtros", a.x + a.w / 2, a.y + a.h / 2) };

  /** Barras horizontales apiladas por estado, con la cifra de cada tramo adentro y el total al final. */
  const barrasH = (a: Caja, filas: { k: string; partes: Record<string, number>; total: number }[], fmt: (v: number) => string, nombre: number) => {
    if (!filas.length) return vacio(a);
    const VAL = 78, X0 = a.x + nombre + 10, X1 = a.x + a.w - VAL;
    const fila = Math.min(40, a.h / filas.length), bh = Math.min(24, fila * 0.68);
    const max = Math.max(1e-9, ...filas.map((f) => f.total));
    filas.forEach((f, i) => {
      const cy = a.y + i * fila + fila / 2;
      letra(ctx, 600, 13); ctx.fillStyle = TINTA; ctx.textAlign = "right";
      ctx.fillText(recortar(ctx, f.k, nombre), a.x + nombre, cy);
      ctx.fillStyle = SUAVE; ctx.fillRect(X0, cy - bh / 2, X1 - X0, bh);
      let x = X0;
      for (const e of d.estados) {
        const v = f.partes[e] ?? 0; if (v <= 0) continue;
        const w = (v / max) * (X1 - X0), col = colorEstado(e);
        ctx.fillStyle = col; ctx.fillRect(x, cy - bh / 2, Math.max(1, w - 2), bh);
        letra(ctx, 700, 12); const t = fmt(v);
        if (ctx.measureText(t).width + 10 < w) { ctx.fillStyle = tintaSobre(col); ctx.textAlign = "center"; ctx.fillText(t, x + w / 2, cy) }
        x += w;
      }
      letra(ctx, 800, 13.5); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(fmt(f.total), a.x + a.w, cy);
    });
  };

  const M = MARGEN, G = HUECO;
  cabecera(ctx, W, chipsPasivo(d), P, extra.logo, "Pasivos BAQ AG01", `EER bloqueados al ${larga(d.dia)}`);

  /* ---------- FILA 1 ---------- */
  const Y1 = 106, H1 = 440, Y2 = Y1 + H1 + G, H2 = H - Y2 - 34;
  const wA = 640, wB = 520, wK = 250, wC = W - 2 * M - wA - wB - wK - 3 * G;
  const xA = M, xB = xA + wA + G, xC = xB + wB + G, xK = xC + wC + G;

  // A · bloqueados por día
  {
    const a = panel({ x: xA, y: Y1, w: wA, h: H1 }, "EER bloqueados por día (HL)", leyendaEstados);
    const p = d.porDia;
    if (!p.length) vacio(a);
    else {
      const top = a.y + 24, base = a.y + a.h - 26, max = Math.max(1, ...p.map((x) => x.total));
      ctx.strokeStyle = "#E6EAF0"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
      for (const t of [0.25, 0.5, 0.75]) { const yy = Math.round(base - t * (base - top)) + .5; ctx.beginPath(); ctx.moveTo(a.x, yy); ctx.lineTo(a.x + a.w, yy); ctx.stroke() }
      ctx.setLineDash([]);
      ctx.strokeStyle = "#9AA5B1"; ctx.beginPath(); ctx.moveTo(a.x, base + .5); ctx.lineTo(a.x + a.w, base + .5); ctx.stroke();
      const paso = a.w / p.length, bw = Math.min(64, paso * 0.66);
      p.forEach((dia, i) => {
        const x = a.x + i * paso + (paso - bw) / 2; let y = base;
        for (const e of d.estados) {
          const v = dia.e[e] ?? 0; if (v <= 0) continue;
          const h = (v / max) * (base - top), col = colorEstado(e);
          y -= h; ctx.fillStyle = col; ctx.fillRect(x, y, bw, Math.max(1, h - 2));
          if (h >= 17) { letra(ctx, 700, 12.5); ctx.fillStyle = tintaSobre(col); ctx.textAlign = "center"; ctx.fillText(f0(v), x + bw / 2, y + h / 2 - 1) }
        }
        const hoy = dia.fecha === d.dia;
        letra(ctx, 800, 14); ctx.fillStyle = TINTA; ctx.textAlign = "center"; ctx.fillText(f0(dia.total), x + bw / 2, y - 12);
        letra(ctx, hoy ? 800 : 500, 13); ctx.fillStyle = hoy ? TINTA : GRIS; ctx.fillText(corta(dia.fecha), x + bw / 2, base + 15);
      });
    }
  }

  // B · SKU en HL
  {
    const a = panel({ x: xB, y: Y1, w: wB, h: H1 }, "SKU bloqueados (HL)", leyendaEstados);
    const filas = [...d.sku].sort((x, y) => y.th - x.th).slice(0, 12).map((s) => ({ k: s.desc, partes: s.hl, total: s.th }));
    barrasH(a, filas, f0, 176);
  }

  // C · ubicación por almacén
  {
    const a = panel({ x: xC, y: Y1, w: wC, h: H1 }, "Ubicación (HL)");
    const al = d.almacenes;
    if (!al.length) vacio(a);
    else {
      const max = Math.max(1e-9, ...al.map((x) => x.total)), bloque = Math.min(170, (a.h - 24) / al.length);
      al.forEach((x, i) => {
        const y0 = a.y + i * bloque + 8;
        letra(ctx, 900, 20); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(x.a, a.x, y0 + 10);
        const aw = ctx.measureText(x.a).width;
        letra(ctx, 500, 13); ctx.fillStyle = GRIS; ctx.fillText(x.nombre, a.x + aw + 10, y0 + 11);
        letra(ctx, 800, 20); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(f0(x.total), a.x + a.w, y0 + 10);
        const by = y0 + 30, bh = 40;
        ctx.fillStyle = SUAVE; ctx.fillRect(a.x, by, a.w, bh);
        let bx = a.x;
        for (const e of d.estados) {
          const v = x.e[e] ?? 0; if (v <= 0) continue;
          const w = (v / max) * a.w, col = colorEstado(e);
          ctx.fillStyle = col; ctx.fillRect(bx, by, Math.max(1, w - 2), bh);
          letra(ctx, 800, 13.5); const t = f0(v);
          if (ctx.measureText(t).width + 10 < w) { ctx.fillStyle = tintaSobre(col); ctx.textAlign = "center"; ctx.fillText(t, bx + w / 2, by + bh / 2) }
          bx += w;
        }
        letra(ctx, 600, 12.5); ctx.fillStyle = GRIS; ctx.textAlign = "left";
        const pct = d.total ? Math.round((x.total / d.total) * 100) : 0;
        ctx.fillText(`${pct}% del total · ${plata(x.costo)}`, a.x, by + bh + 16);
      });
      // la leyenda abajo
      letra(ctx, 600, 12.5); let lx = a.x; const ly = a.y + a.h - 4;
      for (const e of d.estados) { ctx.fillStyle = colorEstado(e); ctx.fillRect(lx, ly - 5, 10, 10); lx += 14; ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(e, lx, ly); lx += ctx.measureText(e).width + 14 }
    }
  }

  // K · los totales
  {
    const cajas = d.cajas.reduce((s, x) => s + x.cajas, 0);
    const dif = d.anterior ? d.total - d.anterior.total : null;
    const tarjetas: { t: string; v: string; nota?: string; oscura?: boolean; col?: string }[] = [
      { t: "Total pasivos (HL)", v: f0(d.total), oscura: true },
      { t: "Costo pasivos", v: plata(d.costo) },
      dif == null
        ? { t: "Vs día anterior", v: "—", nota: "primer día del mes" }
        : { t: "Vs día anterior", v: `${dif >= 0 ? "+" : "-"}${f0(Math.abs(dif))} HL`, nota: `contra ${corta(d.anterior!.fecha)} (${f0(d.anterior!.total)})`, col: dif > 0 ? SUBE : BAJA_OK },
      { t: "Cajas plásticas", v: f0(cajas), nota: `${d.cajas.length} referencia${d.cajas.length === 1 ? "" : "s"} comprometidas` },
    ];
    const th = (H1 - G * (tarjetas.length - 1)) / tarjetas.length;
    tarjetas.forEach((k, i) => {
      const y = Y1 + i * (th + G);
      ctx.fillStyle = k.oscura ? TINTA : "#FFFFFF"; ctx.fillRect(xK, y, wK, th);
      if (!k.oscura) { ctx.strokeStyle = BORDE; ctx.strokeRect(xK + .5, y + .5, wK - 1, th - 1) }
      ctx.fillStyle = ACENTO; ctx.fillRect(xK, y + th - 4, wK, 4);
      letra(ctx, 800, 12); ctx.fillStyle = k.oscura ? "rgba(255,255,255,.75)" : GRIS; ctx.textAlign = "left";
      espaciado(ctx, k.t.toUpperCase(), xK + 16, y + 22, 1);
      let px = k.oscura ? 46 : 30; letra(ctx, 900, px);
      while (ctx.measureText(k.v).width > wK - 32 && px > 16) { px -= 1; letra(ctx, 900, px) }
      ctx.fillStyle = k.oscura ? "#FFFFFF" : (k.col ?? TINTA);
      ctx.fillText(k.v, xK + 16, y + th / 2 + (k.nota ? 4 : 8));
      if (k.nota) { letra(ctx, 500, 12); ctx.fillStyle = GRIS; ctx.fillText(recortar(ctx, k.nota, wK - 32), xK + 16, y + th - 20) }
    });
  }

  /* ---------- FILA 2 ---------- */
  const wD = 640, wE = 300, wF = W - 2 * M - wD - wE - 2 * G;
  const xD = M, xE = xD + wD + G, xF = xE + wE + G;

  // D · SKU en $
  {
    const a = panel({ x: xD, y: Y2, w: wD, h: H2 }, "SKU bloqueados ($ millones)", leyendaEstados);
    const filas = [...d.sku].sort((x, y) => y.tc - x.tc).slice(0, 12).map((s) => ({ k: s.desc, partes: s.costo, total: s.tc }));
    barrasH(a, filas, millones, 196);
  }

  // E · % por almacén
  {
    const a = panel({ x: xE, y: Y2, w: wE, h: H2 }, "% bloqueados por almacén");
    if (!d.total) vacio(a);
    else {
      const filasLey = d.almacenes.length, ley = 22 * filasLey + 6;
      const cx = a.x + a.w / 2, cy = a.y + (a.h - ley) / 2, R = Math.min(a.w, a.h - ley) / 2 - 22, grosor = 40;
      let a0 = -Math.PI / 2;
      d.almacenes.forEach((x, i) => {
        const fr = x.total / d.total, a1 = a0 + fr * Math.PI * 2, col = COLOR_ALMACEN[i] ?? "#8C8C8C";
        ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.lineWidth = grosor; ctx.strokeStyle = col; ctx.stroke();
        // el corte blanco entre tramos
        ctx.beginPath(); ctx.moveTo(cx + (R - grosor / 2) * Math.cos(a1), cy + (R - grosor / 2) * Math.sin(a1));
        ctx.lineTo(cx + (R + grosor / 2) * Math.cos(a1), cy + (R + grosor / 2) * Math.sin(a1)); ctx.lineWidth = 3; ctx.strokeStyle = "#FFFFFF"; ctx.stroke();
        if (fr >= 0.05) {
          const m = (a0 + a1) / 2; letra(ctx, 900, 16); ctx.fillStyle = tintaSobre(col); ctx.textAlign = "center";
          ctx.fillText(`${Math.round(fr * 100)}%`, cx + R * Math.cos(m), cy + R * Math.sin(m));
        }
        a0 = a1;
      });
      letra(ctx, 900, 26); ctx.fillStyle = TINTA; ctx.textAlign = "center"; ctx.fillText(f0(d.total), cx, cy - 6);
      letra(ctx, 600, 12.5); ctx.fillStyle = GRIS; ctx.fillText("HL", cx, cy + 16);
      d.almacenes.forEach((x, i) => {
        const ly = a.y + a.h - ley + 12 + i * 22;
        ctx.fillStyle = COLOR_ALMACEN[i] ?? "#8C8C8C"; ctx.fillRect(a.x + 4, ly - 6, 12, 12);
        letra(ctx, 700, 13.5); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(`${x.a} · ${x.nombre}`, a.x + 24, ly);
        ctx.textAlign = "right"; ctx.fillText(`${f0(x.total)} HL`, a.x + a.w - 4, ly);
      });
    }
  }

  // F · HL diarios
  {
    const a = panel({ x: xF, y: Y2, w: wF, h: H2 }, "HL diarios");
    const p = d.porDia;
    if (!p.length) vacio(a);
    else {
      const top = a.y + 30, base = a.y + a.h - 28, L = a.x + 30, R = a.x + a.w - 30;
      const vals = p.map((x) => x.total), mn = Math.min(...vals), mx = Math.max(...vals);
      const lo = Math.max(0, mn - (mx - mn) * 0.6 - 1), hi = mx + (mx - mn) * 0.05 + 1;
      const X = (i: number) => (p.length === 1 ? (L + R) / 2 : L + (i * (R - L)) / (p.length - 1));
      const Y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (base - top);
      ctx.strokeStyle = "#E6EAF0"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
      for (const t of [0, 0.25, 0.5, 0.75]) { const yy = Math.round(top + t * (base - top)) + .5; ctx.beginPath(); ctx.moveTo(a.x, yy); ctx.lineTo(a.x + a.w, yy); ctx.stroke() }
      ctx.setLineDash([]);
      ctx.strokeStyle = "#9AA5B1"; ctx.beginPath(); ctx.moveTo(a.x, base + .5); ctx.lineTo(a.x + a.w, base + .5); ctx.stroke();
      const area = ctx.createLinearGradient(0, top, 0, base);
      area.addColorStop(0, "rgba(255,195,0,.32)"); area.addColorStop(1, "rgba(255,195,0,.04)");
      ctx.fillStyle = area; ctx.beginPath(); ctx.moveTo(X(0), base);
      p.forEach((x, i) => ctx.lineTo(X(i), Y(x.total))); ctx.lineTo(X(p.length - 1), base); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#B58200"; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath();
      p.forEach((x, i) => (i ? ctx.lineTo(X(i), Y(x.total)) : ctx.moveTo(X(i), Y(x.total)))); ctx.stroke();
      p.forEach((x, i) => {
        const hoy = x.fecha === d.dia;
        ctx.beginPath(); ctx.arc(X(i), Y(x.total), hoy ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = hoy ? "#B58200" : "#FFFFFF"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#B58200"; ctx.stroke();
        letra(ctx, 800, 14); ctx.fillStyle = TINTA; ctx.textAlign = "center"; ctx.fillText(f1(x.total), X(i), Y(x.total) - 18);
        letra(ctx, hoy ? 800 : 500, 13); ctx.fillStyle = hoy ? TINTA : GRIS; ctx.fillText(corta(x.fecha), X(i), base + 15);
      });
    }
  }

  pie(ctx, W, H, extra.generado ?? new Date(), "Cifras en HL salvo donde dice $. El día del informe va resaltado.");
  return c;
}

export const nombreFotoPasivo = (dia: string) => `pasivos-${dia}.png`;

/* =====================================================================
   LA SEGUNDA FOTO: EL DETALLE POR ALMACÉN
   «Que se vea lo que está en el almacén AG22 – AG18, y le agregas una gráfica bacana para esas
    dos tablas; así enviaría yo dos fotos.»
   Arriba una tarjeta por almacén; en el medio la gráfica en espejo (AG22 a la izquierda, AG18 a
   la derecha, material por material); abajo las dos tablas lado a lado, como en el PDF.
   ===================================================================== */
export function dibujarDetallePasivo(
  d: DatosInformePasivo,
  extra: { paleta?: Paleta; logo?: CanvasImageSource | null; generado?: Date; ocultarCeroYNegativos?: boolean } = {},
): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const W = FOTO.ancho, S = FOTO.escala, M = MARGEN, G = HUECO;

  /* lo que hay en cada almacén, en el orden de la pantalla (AG22 primero) */
  const als = d.almacenes.map((a, i) => {
    const filas = d.consolidado.filter((f) => f.almacen === a.a).sort((x, y) => y.hl - x.hl);
    const suma = (k: "und" | "cajas" | "hl" | "costo") => filas.reduce((t, f) => t + (Number(f[k]) || 0), 0);
    /* para ENVIAR la foto: los renglones en 0 o negativos no se dibujan en la tabla (las cifras de arriba y el TOTAL siguen siendo las reales) */
    const filasVer = extra.ocultarCeroYNegativos ? filas.filter((f) => f.und > 0) : filas;
    return { ...a, col: COLOR_ALMACEN[i] ?? "#8C8C8C", filas, filasVer, und: suma("und"), cajas: suma("cajas"), hl: suma("hl"), cst: suma("costo") };
  }).filter((a) => a.filas.length);
  const n = Math.max(1, als.length);

  /* los materiales de la gráfica: todos los que tienen algo, ordenados por el total de los dos */
  const mats = new Map<string, { desc: string; v: number[] }>();
  als.forEach((a, i) => a.filas.forEach((f) => {
    if (!(f.hl >= 0.05)) return;
    const k = f.codigo || f.desc;
    const m = mats.get(k) ?? { desc: f.desc, v: als.map(() => 0) };
    m.v[i] += f.hl; mats.set(k, m);
  }));
  const materiales = [...mats.values()].sort((x, y) => y.v.reduce((s, v) => s + v, 0) - x.v.reduce((s, v) => s + v, 0));

  /* las medidas: la imagen crece con las filas */
  const FILA_G = 30;
  const yCards = 106, hCards = 104;
  const yGraf = yCards + hCards + G, hGraf = 62 + Math.max(1, materiales.length) * FILA_G * (n === 2 ? 1 : n) + 2;
  /* LAS TABLAS CRECEN CON LA UBICACIÓN: cada zona en su renglón, y nada se corta. */
  const colW0 = (W - 2 * M - G * (Math.max(1, als.length) - 1)) / Math.max(1, als.length);
  const med = medidor();
  const cols = anchosTabla(columnasPasivo(als.some((a) => a.filasVer.some((f) => f.ubic))), colW0 - 32);
  const yTab = yGraf + hGraf + G, hTab = 62 + Math.max(0, ...als.map((a) => altoTabla(med, cols, a.filasVer))) + 6;
  const H = yTab + hTab + 34;

  const c = document.createElement("canvas");
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S); ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);
  cabecera(ctx, W, chipsPasivo(d), P, extra.logo, "Detalle por almacén", `Pasivos BAQ AG01 · EER bloqueados al ${larga(d.dia)}`);

  const panel = (b: Caja, titulo: string, nota?: string, marca = ACENTO) => {
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
    ctx.fillStyle = marca; ctx.fillRect(b.x + 16, b.y + 18, 10, 10);
    letra(ctx, 800, 15); ctx.fillStyle = TINTA; ctx.textAlign = "left";
    espaciado(ctx, titulo.toUpperCase(), b.x + 34, b.y + 24);
    if (nota) { letra(ctx, 600, 13); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(nota, b.x + b.w - 16, b.y + 24) }
    return { x: b.x + 16, y: b.y + 48, w: b.w - 32, h: b.h - 62 };
  };
  const colW = (W - 2 * M - G * (n - 1)) / n;

  /* ---------- LAS TARJETAS ---------- */
  if (!als.length) {
    letra(ctx, 600, 18); ctx.fillStyle = GRIS; ctx.textAlign = "center"; ctx.fillText("Sin materiales con estos filtros", W / 2, yCards + 60);
  }
  als.forEach((a, i) => {
    const x = M + i * (colW + G), y = yCards, w = colW, h = hCards;
    ctx.fillStyle = TINTA; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = a.col; ctx.fillRect(x, y, 8, h);
    letra(ctx, 900, 26); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left"; ctx.fillText(a.a, x + 28, y + 34);
    const aw = ctx.measureText(a.a).width;
    letra(ctx, 500, 15); ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillText(a.nombre, x + 28 + aw + 12, y + 36);
    letra(ctx, 600, 13.5); ctx.fillStyle = "rgba(255,255,255,.7)";
    const pct = d.total ? Math.round((a.total / d.total) * 100) : 0;
    ctx.fillText(`${pct}% del total · ${a.filas.length} materiales`, x + 28, y + 72);
    // las cifras a la derecha
    const cifras: [string, string][] = [["HL", f1(a.hl)], ["Costo", plata(a.cst)], ["Cajas", f0(a.cajas)], ["Unidades", f0(a.und)]];
    let cx = x + w - 24;
    for (const [t, v] of [...cifras].reverse()) {
      const grande = t === "HL";
      letra(ctx, 900, grande ? 34 : 21); const vw = ctx.measureText(v).width;
      letra(ctx, 800, 11); const tw = anchoEspaciado(ctx, t.toUpperCase(), 1);
      const ancho = Math.max(vw, tw);
      letra(ctx, 900, grande ? 34 : 21); ctx.fillStyle = grande ? a.col : "#FFFFFF"; ctx.textAlign = "right"; ctx.fillText(v, cx, y + 62);
      letra(ctx, 800, 11); ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.textAlign = "left"; espaciado(ctx, t.toUpperCase(), cx - tw, y + 28, 1);
      cx -= ancho + 30;
    }
  });

  /* ---------- LA GRÁFICA ---------- */
  {
    const titulo = n === 2 ? `${als[0].a} vs ${als[1].a} por material (HL)` : "HL por material";
    const a = panel({ x: M, y: yGraf, w: W - 2 * M, h: hGraf }, titulo);
    // leyenda
    letra(ctx, 700, 13); let lx = a.x + a.w;
    for (const al of [...als].reverse()) {
      const t = `${al.a} · ${al.nombre}`; const tw = ctx.measureText(t).width; lx -= tw;
      ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(t, lx, yGraf + 24);
      lx -= 18; ctx.fillStyle = al.col; ctx.fillRect(lx, yGraf + 18, 12, 12); lx -= 22;
    }
    if (!materiales.length) { letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.textAlign = "center"; ctx.fillText("Sin datos con estos filtros", a.x + a.w / 2, a.y + a.h / 2) }
    else if (n === 2) {
      // EN ESPEJO: el material en el centro, AG22 crece a la izquierda y AG18 a la derecha
      const NOM = 300, cx = a.x + a.w / 2, VAL = 74;
      const L0 = cx - NOM / 2, R0 = cx + NOM / 2, largo = L0 - (a.x + VAL);
      const max = Math.max(1e-9, ...materiales.flatMap((m) => m.v));
      const bh = 20;
      // las guías
      ctx.strokeStyle = "#E6EAF0"; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
      for (const t of [0.25, 0.5, 0.75, 1]) for (const x of [L0 - t * largo, R0 + t * largo]) { ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, a.y - 4); ctx.lineTo(Math.round(x) + .5, a.y + materiales.length * FILA_G); ctx.stroke() }
      ctx.setLineDash([]);
      materiales.forEach((m, i) => {
        const cy = a.y + i * FILA_G + FILA_G / 2;
        if (i % 2 === 0) { ctx.fillStyle = "#F8F9FB"; ctx.fillRect(L0, cy - FILA_G / 2, NOM, FILA_G) }
        letra(ctx, 600, 13.5); ctx.fillStyle = TINTA; ctx.textAlign = "center"; ctx.fillText(recortar(ctx, m.desc, NOM - 16), cx, cy);
        [0, 1].forEach((k) => {
          const v = m.v[k] >= 0.05 ? m.v[k] : 0; const w = (v / max) * largo, col = als[k].col;
          const izq = k === 0;
          if (v > 0) {
            ctx.fillStyle = col;
            const x = izq ? L0 - 6 - w : R0 + 6;
            ctx.fillRect(x, cy - bh / 2, Math.max(2, w), bh);
          }
          letra(ctx, 800, 13); ctx.fillStyle = v > 0 ? TINTA : "#AAB3BE";
          const t = v > 0 ? f1(v) : "—";
          ctx.textAlign = izq ? "right" : "left";
          ctx.fillText(t, izq ? L0 - 14 - w : R0 + 14 + w, cy);
        });
      });
    } else {
      // uno o más de dos almacenes: barras agrupadas por material
      const NOM = 260, X0 = a.x + NOM + 12, X1 = a.x + a.w - 80;
      const max = Math.max(1e-9, ...materiales.flatMap((m) => m.v)), bh = Math.min(20, FILA_G - 8);
      materiales.forEach((m, i) => {
        const y0 = a.y + i * FILA_G * n;
        letra(ctx, 600, 13.5); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(recortar(ctx, m.desc, NOM), a.x + NOM, y0 + (FILA_G * n) / 2);
        als.forEach((al, k) => {
          const cy = y0 + k * FILA_G + FILA_G / 2, w = (m.v[k] / max) * (X1 - X0);
          ctx.fillStyle = al.col; ctx.fillRect(X0, cy - bh / 2, Math.max(2, w), bh);
          letra(ctx, 800, 13); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(f1(m.v[k]), X0 + w + 8, cy);
        });
      });
    }
  }

  /* ---------- LAS TABLAS ---------- */
  als.forEach((al, i) => {
    const x = M + i * (colW + G);
    const a = panel({ x, y: yTab, w: colW, h: hTab }, `${al.a} · ${al.nombre}`, `${f1(al.hl)} HL · ${plata(al.cst)}`, al.col);
    dibujarTabla(ctx, TINTA, a.x, a.y, a.w, cols, al.filasVer, (c) => (
      c.t === "CÓDIGO" ? "TOTAL" : c.t === "MATERIAL" ? `${al.filasVer.length} materiales`
      : c.t === "UNIDADES" ? f0(al.und) : c.t === "CAJAS" ? f0(al.cajas) : c.t === "HL" ? f1(al.hl) : c.t === "COSTO" ? plata(al.cst) : ""),
    (f) => !(Math.abs(f.hl) >= 0.05));
  });

  pie(ctx, W, H, extra.generado ?? new Date(), "Cifras en HL. El costo es el de los pasivos del día.");
  return c;
}

export const nombreDetallePasivo = (dia: string) => `pasivos-detalle-${dia}.png`;

/** Los filtros como chips; sin filtros, «todos». */
const chipsPasivo = (d: DatosInformePasivo) => (d.filtros ? d.filtros.split(" · ").filter(Boolean) : ["Todos los almacenes", "Todos los estados"]);

/** Las columnas del consolidado de un almacén; la ubicación (del conteo de ese día) solo si hay. */
function columnasPasivo(conUbi: boolean): ColTabla<FilaConsolidado>[] {
  const cols: ColTabla<FilaConsolidado>[] = [
    { t: "CÓDIGO", w: 82, gris: true, v: (f) => f.codigo },
    { t: "MATERIAL", w: 0, envuelve: true, v: (f) => f.desc },
    { t: "UNIDADES", w: conUbi ? 98 : 112, num: true, rojoNegativo: true, v: (f) => f0(f.und) },
    { t: "CAJAS", w: conUbi ? 76 : 90, num: true, rojoNegativo: true, v: (f) => f0(f.cajas) },
    { t: "HL", w: conUbi ? 74 : 90, num: true, rojoNegativo: true, v: (f) => f1(f.hl) },
    { t: "COSTO", w: conUbi ? 128 : 146, num: true, fuerte: true, rojoNegativo: true, v: (f) => plata(f.costo) },
  ];
  if (conUbi) cols.push({ t: "UBICACIÓN", w: 210, v: () => "", lineas: (f) => gruposDeUbicacion(f.ubic) });
  return cols;
}
