/**
 * EL DASHBOARD DE LICENCIAS VACA — todo en una sola imagen para copiar, compartir o descargar, como el de Pasivos.
 *
 *   ARRIBA   la ola de vencimientos por semana (contra el ritmo de validación) · cumplimiento por empresa ·
 *            las alertas de hoy (vencidas, 7 días, este mes) · las cifras grandes.
 *   ABAJO    el mapa de calor empresa × semana · la cobertura de cada permiso hoy y en 30 días ·
 *            las validaciones por mes.
 *
 * Tonos de los informes: carbón, ocre, amarillo y crema; rojo solo para lo que está mal. No calcula nada nuevo:
 * pinta los mismos `Indicadores` y `TableroCert` que la pantalla.
 * Se dibuja a 1800 × 1000 y al doble de resolución para que no se vea borrosa en el celular.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import { BORDE, FONDO, FOTO, GRIS, HUECO, MARGEN, SUAVE, cabecera, espaciado, letra, pie, recortar, type Caja } from "@/modulos/foto";
import { fechaCorta, type Indicadores, type TableroCert } from "./certificaciones";

const CARBON = "#3B3B3B", OCRE = "#B58200", AMARILLO = "#FFC300", CREMA = "#FFDCA3", ROJO = "#C8102E";
const nf = new Intl.NumberFormat("es-CO");
const pct = (x: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(x * 100) + "%";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const larga = (f: string) => {
  const d = new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10))));
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};

export function dibujarDashboardCert(I: Indicadores, t: TableroCert, extra: { paleta?: Paleta; logo?: CanvasImageSource | null; generado?: Date; deptos?: string } = {}): HTMLCanvasElement {
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const { ancho: W, alto: H, escala: S } = FOTO;
  const c = document.createElement("canvas");
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S); ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);

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
  const tintaSobre = (col: string) => (col === CARBON || col === OCRE ? "#FFFFFF" : "#1B1B1B");

  const deptos = extra.deptos ?? "Logística";
  cabecera(ctx, W, [deptos, `Aviso ${t.config.diasAviso} días`], P, extra.logo, `Licencias VACA · ${deptos}`,
    `Licencia para cuidar al ${larga(t.hoy)} · ${nf.format(I.activos)} personas trabajando`);

  const M = MARGEN, G = HUECO;
  const Y1 = 106, H1 = 430, Y2 = Y1 + H1 + G, H2 = H - Y2 - 34;
  const wA = 640, wB = 500, wK = 270, wC = W - 2 * M - wA - wB - wK - 3 * G;
  const xA = M, xB = xA + wA + G, xC = xB + wB + G, xK = xC + wC + G;

  /* ---------- A · LA OLA: vencen por semana contra el ritmo de validación ---------- */
  {
    const a = panel({ x: xA, y: Y1, w: wA, h: H1 }, "Vencen por semana", [{ t: "pasa el ritmo", col: OCRE }, { t: "alcanza", col: CREMA }]);
    const s = I.semanas, top = a.y + 44, base = a.y + a.h - 26;
    const max = Math.max(4, I.ritmo, ...s.map((x) => x.vencen)) * 1.08;
    letra(ctx, 700, 13); ctx.fillStyle = OCRE; ctx.textAlign = "left";
    ctx.fillText(`Ritmo actual ≈ ${nf.format(I.ritmo)} validaciones por semana`, a.x, a.y + 8);
    ctx.strokeStyle = "#9AA5B1"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, base + .5); ctx.lineTo(a.x + a.w, base + .5); ctx.stroke();
    const paso = a.w / s.length, bw = Math.min(40, paso * 0.72);
    s.forEach((x, i) => {
      const bx = a.x + i * paso + (paso - bw) / 2, h = (x.vencen / max) * (base - top), sobre = x.vencen > I.ritmo;
      ctx.fillStyle = sobre ? OCRE : CREMA; ctx.fillRect(bx, base - h, bw, h);
      letra(ctx, 800, 14); ctx.fillStyle = TINTA; ctx.textAlign = "center"; ctx.fillText(String(x.vencen), bx + bw / 2, base - h - 11);
      letra(ctx, i === 0 ? 800 : 500, 12); ctx.fillStyle = i === 0 ? TINTA : GRIS; ctx.fillText(fechaCorta(x.desde), bx + bw / 2, base + 14);
    });
    if (I.ritmo > 0) {
      const yR = base - (I.ritmo / max) * (base - top);
      ctx.strokeStyle = TINTA; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
      ctx.beginPath(); ctx.moveTo(a.x, yR); ctx.lineTo(a.x + a.w, yR); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  /* ---------- B · CUMPLIMIENTO POR EMPRESA (las de más gente) ---------- */
  {
    const a = panel({ x: xB, y: Y1, w: wB, h: H1 }, "Cumplimiento por empresa", [{ t: "% activos al día", col: AMARILLO }]);
    const filas = [...I.empresas].sort((x, y) => y.activos - x.activos).slice(0, 12).sort((x, y) => x.pct - y.pct || y.activos - x.activos);
    const NOM = 168, VAL = 116, X0 = a.x + NOM + 10, X1 = a.x + a.w - VAL;
    const fila = Math.min(30, a.h / Math.max(1, filas.length)), bh = Math.min(18, fila * 0.62);
    filas.forEach((f, i) => {
      const cy = a.y + i * fila + fila / 2;
      letra(ctx, 600, 12.5); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(recortar(ctx, f.empresa.toUpperCase(), NOM), a.x + NOM, cy);
      ctx.fillStyle = SUAVE; ctx.fillRect(X0, cy - bh / 2, X1 - X0, bh);
      const col = f.pct >= 0.95 ? AMARILLO : f.pct >= 0.8 ? OCRE : ROJO;
      ctx.fillStyle = col; ctx.fillRect(X0, cy - bh / 2, Math.max(2, (X1 - X0) * f.pct), bh);
      letra(ctx, 900, 14); ctx.fillStyle = f.pct < 0.8 ? ROJO : TINTA; ctx.textAlign = "right"; ctx.fillText(pct(f.pct), a.x + a.w - 46, cy);
      letra(ctx, 500, 11.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(`${f.activos} act.`, a.x + a.w - 40, cy);
    });
  }

  /* ---------- C · LAS ALERTAS DE HOY ---------- */
  {
    const a = panel({ x: xC, y: Y1, w: wC, h: H1 }, "Alertas de hoy");
    const bloques = [
      { t: "VENCIDAS · TRABAJANDO", n: t.vencidas, sub: "exigir hoy", col: "#FFFFFF" },
      { t: `VENCEN EN ${t.config.diasCriticos} DÍAS`, n: t.criticas, sub: "renovar esta semana", col: OCRE },
      { t: "VENCEN ESTE MES", n: t.avisos, sub: "programar la renovación", col: AMARILLO },
    ];
    const bh = (a.h - 2 * 10) / 3;
    bloques.forEach((b, i) => {
      const y = a.y + i * (bh + 10);
      ctx.fillStyle = b.col; ctx.fillRect(a.x, y, a.w, bh);
      if (i === 0) { ctx.strokeStyle = BORDE; ctx.strokeRect(a.x + .5, y + .5, a.w - 1, bh - 1); ctx.fillStyle = ROJO; ctx.fillRect(a.x, y, 6, bh); ctx.fillRect(a.x, y + bh - 5, a.w, 5) }
      const tc = i === 0 ? TINTA : tintaSobre(b.col);
      letra(ctx, 800, 12); ctx.fillStyle = tc; ctx.textAlign = "left"; espaciado(ctx, b.t, a.x + 16, y + 22, 1.1);
      letra(ctx, 500, 12.5); ctx.fillText(b.sub, a.x + 16, y + bh - 22);
      letra(ctx, 900, 52); ctx.textAlign = "right"; if (i === 0) ctx.fillStyle = b.n ? ROJO : TINTA; ctx.fillText(String(b.n), a.x + a.w - 16, y + bh / 2 + 4);
    });
  }

  /* ---------- K · LAS CIFRAS GRANDES ---------- */
  {
    const kpis: { t: string; v: string; s: string; mal?: boolean; anillo?: number }[] = [
      { t: "ÍNDICE DE CUMPLIMIENTO", v: pct(I.cumplimiento), s: `${nf.format(I.alDia)} de ${nf.format(I.activos)} activos al día`, anillo: I.cumplimiento },
      { t: "PERSONAS ACTIVAS", v: nf.format(I.activos), s: `de ${nf.format(t.total)} en la base · ${nf.format(t.bloqueados)} bloqueadas` },
      { t: "VALIDADAS ESTE MES", v: nf.format(I.validadasMes), s: `${nf.format(I.validadasMesAnterior)} el mes pasado` },
      { t: "DÍAS PROMEDIO A VENCER", v: nf.format(I.diasPromedio), s: `de ${t.config.vigencia} que dura la licencia` },
    ];
    const kh = (H1 - 3 * G) / 4;
    kpis.forEach((k, i) => {
      const y = Y1 + i * (kh + G);
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(xK, y, wK, kh);
      ctx.strokeStyle = BORDE; ctx.strokeRect(xK + .5, y + .5, wK - 1, kh - 1);
      ctx.fillStyle = k.mal ? ROJO : ACENTO; ctx.fillRect(xK, y + kh - 4, wK, 4);
      letra(ctx, 800, 11.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; espaciado(ctx, k.t, xK + 16, y + 20, 1.1);
      letra(ctx, 900, 38); ctx.fillStyle = k.mal ? ROJO : TINTA; ctx.fillText(k.v, xK + 16, y + kh / 2 + 2);
      letra(ctx, 500, 12); ctx.fillStyle = GRIS; ctx.fillText(recortar(ctx, k.s, wK - 32 - (k.anillo != null ? 60 : 0)), xK + 16, y + kh - 20);
      if (k.anillo != null) {
        const cx = xK + wK - 38, cy = y + 44, r = 20;
        ctx.lineWidth = 9; ctx.strokeStyle = SUAVE; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = AMARILLO; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k.anillo); ctx.stroke();
      }
    });
  }

  /* ---------- D · MAPA DE CALOR: empresa × semana ---------- */
  const wD = wA, wE = wB, wF = W - 2 * M - wD - wE - 2 * G;
  {
    const a = panel({ x: xA, y: Y2, w: wD, h: H2 }, "Quién vence cuándo", [{ t: "empresa × semana", col: OCRE }]);
    const NOM = 140, cols = I.semanas.length, cw = (a.w - NOM - 8) / cols;
    const filas = I.calor, rh = Math.min(36, (a.h - 24) / Math.max(1, filas.length));
    const max = Math.max(1, ...filas.flatMap((f) => f.semanas));
    letra(ctx, 600, 10); ctx.fillStyle = GRIS; ctx.textAlign = "center";
    I.semanas.forEach((s, j) => ctx.fillText(recortar(ctx, fechaCorta(s.desde), cw - 2), a.x + NOM + 8 + j * cw + cw / 2, a.y + 6));
    filas.forEach((f, i) => {
      const y = a.y + 20 + i * rh;
      letra(ctx, 700, 12.5); ctx.fillStyle = TINTA; ctx.textAlign = "left"; ctx.fillText(recortar(ctx, f.empresa.toUpperCase(), NOM - 6), a.x, y + rh / 2);
      f.semanas.forEach((n, j) => {
        const x = a.x + NOM + 8 + j * cw;
        ctx.fillStyle = n ? `rgba(181,130,0,${0.18 + 0.82 * (n / max)})` : "#F6F7F9";
        ctx.fillRect(x + 1, y + 2, cw - 2, rh - 4);
        if (n) { letra(ctx, 800, 12.5); ctx.fillStyle = n / max > 0.5 ? "#FFFFFF" : "#5A4100"; ctx.textAlign = "center"; ctx.fillText(String(n), x + cw / 2, y + rh / 2) }
      });
    });
  }

  /* ---------- E · COBERTURA DE PERMISOS: hoy y en 30 días ---------- */
  {
    const a = panel({ x: xB, y: Y2, w: wE, h: H2 }, "Cobertura de permisos", [{ t: "hoy", col: OCRE }, { t: `en ${t.config.diasAviso} días`, col: AMARILLO }]);
    const filas = I.cobertura, NOM = 86, VAL = 120, X0 = a.x + NOM + 10, X1 = a.x + a.w - VAL;
    const max = Math.max(1, ...filas.map((f) => f.hoy)), fila = Math.min(48, a.h / Math.max(1, filas.length));
    filas.forEach((f, i) => {
      const cy = a.y + i * fila + fila / 2;
      letra(ctx, 700, 13); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(f.t, a.x + NOM, cy);
      ctx.fillStyle = SUAVE; ctx.fillRect(X0, cy - 11, X1 - X0, 22);
      ctx.fillStyle = OCRE; ctx.fillRect(X0, cy - 11, (X1 - X0) * (f.hoy / max), 11);
      ctx.fillStyle = AMARILLO; ctx.fillRect(X0, cy + 1, (X1 - X0) * (f.en30 / max), 10);
      const baja = f.hoy ? (f.en30 - f.hoy) / f.hoy : 0;
      letra(ctx, 900, 15); ctx.fillStyle = TINTA; ctx.textAlign = "right"; ctx.fillText(String(f.hoy), a.x + a.w - 80, cy);
      ctx.fillStyle = baja < -0.1 ? ROJO : OCRE; ctx.fillText(String(f.en30), a.x + a.w - 44, cy);
      letra(ctx, 700, 11); ctx.textAlign = "left"; ctx.fillText(baja < 0 ? `${Math.round(baja * 100)}%` : "=", a.x + a.w - 38, cy);
    });
  }

  /* ---------- F · VALIDACIONES POR MES ---------- */
  {
    const a = panel({ x: xB + wE + G, y: Y2, w: wF, h: H2 }, "Validaciones por mes", [{ t: "licencias expedidas", col: OCRE }]);
    const m = I.meses, top = a.y + 40, base = a.y + a.h - 26, max = Math.max(1, ...m.map((x) => x.n)) * 1.1;
    const paso = a.w / m.length, pts = m.map((x, i) => ({ x: a.x + paso * i + paso / 2, y: base - (x.n / max) * (base - top), n: x.n, mes: x.mes }));
    ctx.strokeStyle = "#E6EAF0"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    for (const k of [0.25, 0.5, 0.75]) { const yy = Math.round(base - k * (base - top)) + .5; ctx.beginPath(); ctx.moveTo(a.x, yy); ctx.lineTo(a.x + a.w, yy); ctx.stroke() }
    ctx.setLineDash([]);
    const g = ctx.createLinearGradient(0, top, 0, base); g.addColorStop(0, "rgba(255,195,0,.35)"); g.addColorStop(1, "rgba(255,195,0,.04)");
    ctx.beginPath(); ctx.moveTo(pts[0].x, base); pts.forEach((p) => ctx.lineTo(p.x, p.y)); ctx.lineTo(pts[pts.length - 1].x, base); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = OCRE; ctx.lineWidth = 2.5; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    pts.forEach((p, i) => {
      const ult = i === pts.length - 1;
      ctx.fillStyle = ult ? OCRE : "#FFFFFF"; ctx.strokeStyle = OCRE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, ult ? 6 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      letra(ctx, 800, 13); ctx.fillStyle = TINTA; ctx.textAlign = "center"; ctx.fillText(String(p.n), p.x, p.y - 16);
      letra(ctx, ult ? 800 : 500, 12); ctx.fillStyle = ult ? TINTA : GRIS; ctx.fillText(p.mes.slice(0, 3), p.x, base + 14);
    });
  }

  pie(ctx, W, H, extra.generado ?? new Date(), "Solo personas activas. Vence = fecha de vencimiento de la licencia vigente.");
  return c;
}

export const nombreDashboardCert = (hoy: string) => `licencias-vaca-dashboard-${hoy}.png`;
