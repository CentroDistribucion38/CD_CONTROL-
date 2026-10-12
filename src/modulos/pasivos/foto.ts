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
import { COLOR_ALMACEN, colorEstado, corta, f0, f1, larga, millones, plata, tintaSobre, type DatosInformePasivo } from "./informe";

type Ctx = CanvasRenderingContext2D;
export const FOTO = { ancho: 1800, alto: 1000, escala: 2 } as const;
const FONDO = "#F3F5F8", BORDE = "#DEE3EA", GRIS = "#5F6B79", SUAVE = "#EEF1F5", SUBE = "#C8102E", BAJA_OK = "#1E8E3E";
const FUENTE = `"Segoe UI", Helvetica, Arial, sans-serif`;

const letra = (ctx: Ctx, peso: number, px: number) => { ctx.font = `${peso} ${px}px ${FUENTE}` };
function recortar(ctx: Ctx, t: string, ancho: number) {
  if (ctx.measureText(t).width <= ancho) return t;
  let s = t; while (s.length > 3 && ctx.measureText(s + "…").width > ancho) s = s.slice(0, -1);
  return s + "…";
}
/** El texto con un poco de aire entre letras (los títulos en mayúscula). */
function espaciado(ctx: Ctx, t: string, x: number, y: number, aire = 0.8) {
  for (const ch of t) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + aire }
  return x;
}
function anchoEspaciado(ctx: Ctx, t: string, aire = 0.8) { let w = 0; for (const ch of t) w += ctx.measureText(ch).width + aire; return w }

type Caja = { x: number; y: number; w: number; h: number };

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

  /* ---------- CABECERA ---------- */
  const M = 16, G = 12;
  // la cinta del tema arriba
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  for (const [t, col] of P.cinta) grad.addColorStop(t, `rgb(${col.join(",")})`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 6);
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(M, 18, W - 2 * M, 76);
  ctx.strokeStyle = BORDE; ctx.strokeRect(M + .5, 18.5, W - 2 * M - 1, 75);
  let tx = M + 22;
  if (extra.logo) {
    try { const lh = 44, lw = lh * 540 / 160; ctx.drawImage(extra.logo, tx, 34, lw, lh); tx += lw + 26 } catch { /* sin logo */ }
  } else { letra(ctx, 900, 32); ctx.fillStyle = "#E30613"; ctx.textAlign = "left"; ctx.fillText("Bavaria", tx, 56); tx += ctx.measureText("Bavaria").width + 26 }
  ctx.fillStyle = BORDE; ctx.fillRect(tx - 13, 34, 1, 44);
  letra(ctx, 800, 30); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText("Pasivos BAQ AG01", tx, 46);
  letra(ctx, 500, 16); ctx.fillStyle = GRIS;
  const sub = `EER bloqueados al ${larga(d.dia)}`;
  ctx.fillText(sub, tx, 74);

  // los filtros como chips, a la derecha
  {
    const partes = d.filtros ? d.filtros.split(" · ").filter(Boolean) : ["Todos los almacenes", "Todos los estados"];
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

  /* ---------- PIE ---------- */
  const gen = extra.generado ?? new Date();
  letra(ctx, 500, 12.5); ctx.fillStyle = GRIS; ctx.textAlign = "left";
  ctx.fillText(`CONTROL · CD38 — generado el ${gen.toLocaleDateString("es-CO")} ${gen.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`, M, H - 16);
  ctx.textAlign = "right";
  ctx.fillText("Cifras en HL salvo donde dice $. El día del informe va resaltado.", W - M, H - 16);
  return c;
}

export const nombreFotoPasivo = (dia: string) => `pasivos-${dia}.png`;
