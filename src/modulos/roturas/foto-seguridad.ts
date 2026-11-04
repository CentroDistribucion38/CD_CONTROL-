/**
 * EL DASHBOARD DE SEGURIDAD PARA COPIAR Y COMPARTIR — una imagen con las cifras del mes y los CINCO
 * Paretos por evento (causa, persona, área, turno y tipo), en el mismo lenguaje que el cierre del Tablero:
 * banda negra, franja del acento y fondo blanco. Es para pegar en un correo o en WhatsApp.
 *
 * NO CALCULA NADA: pinta lo que ya calculó la pantalla (`pareto()` y las cifras). 1120 px de ancho, a 2×.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import { BORDE, GRIS, SUBE, anchoEspaciado, envolver, espaciado, letra, pie, recortar, type Ctx } from "@/modulos/foto";
import type { Barra, Dim, TipoEv } from "./seguridad";

const W = 1120, S = 2, PX = 24, AN = W - 2 * PX;
const NEGRO = "#0B0B0C", MAL = "#C8102E";
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const rgb = (c: readonly number[]) => `rgb(${c.join(",")})`;

export type ParetoFoto = { dim: Dim; titulo: string; nota: string; barras: Barra[]; total: number };
/** UN RENGLÓN DE «LOS EVENTOS»: lo que ya sabe la pantalla de cada rotura del mes (no se calcula aquí). */
export type FilaEventoFoto = {
  dia: string; turno: string; hora: string; codigo: string; cajas: number;
  tipo: TipoEv; causa: string; severidad: "leve" | "intermedia" | "grave";
  responsable: string | null; reportante: string | null; autorreporte: boolean;
  nMes: number | null; recurrente: boolean;
  /** Las acciones que exige el plan, con su estado; vacío = ninguna generada. */
  acciones: { nombre: string; estado: "pendiente" | "hecha" | "vencida" | "hecha_tarde" }[];
  /** Lo que se dice cuando no hay acciones: «Sin acción generada» o «Sin acción exigida». */
  sinAccion: string;
};
export type DatosSeguridadFoto = {
  mes: string; turno: string; periodo: string;
  total: number; comp: number; cond: number; graves: number; reinc: number; comite: number; sinResp: number; vencidas: number; abiertas: number;
  paretos: ParetoFoto[];
  eventos: FilaEventoFoto[];
};
export type ExtraSeguridad = { paleta?: Paleta; logo?: CanvasImageSource | null; generado?: Date };

export const nombreFotoSeguridad = (mes: string, turno: string) => `seguridad-plan-reaccion-${mes}${turno ? "-turno-" + turno : ""}.png`;

/** El sello de la marca (el mismo de la banda de la pantalla). null si no carga: la foto sale sin él. */
export async function traerLogo(): Promise<HTMLImageElement | null> {
  try { const i = new Image(); i.src = "/marca/logo-b.png"; await i.decode(); return i } catch { return null }
}

const COLOR = (P: Paleta): Record<TipoEv, string> => ({ comportamiento: "#14171C", condicion: rgb(P.acento), externa: "#9AA5B1", sin_clasificar: "#C9D0D9" });

const paso = (max: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1))));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= max / 4) ?? p;
};

/** Un Pareto: barras de mayor a menor (del color de lo que las compone), el acumulado y el corte del 80 %. */
function dibujarPareto(ctx: Ctx, x: number, y: number, w: number, h: number, p: ParetoFoto, P: Paleta, grande: boolean) {
  const L = 30, R = 40, T = 22, B = grande ? 46 : 44;
  const iw = w - L - R, ih = h - T - B;
  if (!p.barras.length) {
    letra(ctx, 500, 13); ctx.fillStyle = GRIS; ctx.textAlign = "center"; ctx.fillText("No hay eventos en este mes", x + w / 2, y + h / 2 - 10);
    return;
  }
  const colores = COLOR(P);
  const max = Math.max(...p.barras.map((b) => b.v), 1), st = paso(max), yMax = Math.ceil(max / st) * st;
  const yv = (v: number) => y + T + ih - (v / yMax) * ih, yp = (q: number) => y + T + ih - q * ih;
  const pw = iw / p.barras.length, bw = Math.min(grande ? 74 : 52, pw * 0.6), cx = (i: number) => x + L + pw * i + pw / 2;

  ctx.lineWidth = 1; ctx.textAlign = "right"; letra(ctx, 500, 10.5);
  for (let t = 0; t <= yMax + 1e-9; t += st) {
    ctx.strokeStyle = BORDE; ctx.beginPath(); ctx.moveTo(x + L, yv(t)); ctx.lineTo(x + w - R, yv(t)); ctx.stroke();
    ctx.fillStyle = GRIS; ctx.fillText(String(Math.round(t * 100) / 100), x + L - 8, yv(t));
  }
  ctx.textAlign = "left";
  for (const q of [0, 0.5, 1]) { ctx.fillStyle = GRIS; ctx.fillText(`${q * 100}%`, x + w - R + 8, yp(q)) }

  // el corte del 80 %
  ctx.save(); ctx.strokeStyle = MAL; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(x + L, yp(0.8)); ctx.lineTo(x + w - R, yp(0.8)); ctx.stroke(); ctx.restore();
  letra(ctx, 800, 10.5); ctx.fillStyle = MAL; ctx.textAlign = "right"; ctx.fillText("80 %", x + w - R - 4, yp(0.8) - 8);

  // barras, valor y nombre
  p.barras.forEach((b, i) => {
    const alto = Math.max(1.5, y + T + ih - yv(b.v));
    ctx.fillStyle = b.otros ? "#C9D0D9" : colores[b.dom]; ctx.fillRect(cx(i) - bw / 2, yv(b.v), bw, alto);
    letra(ctx, 900, grande ? 15 : 13); ctx.fillStyle = NEGRO; ctx.textAlign = "center"; ctx.fillText(nf.format(b.v), cx(i), yv(b.v) - 9);
    letra(ctx, 500, grande ? 11.5 : 10.5); ctx.fillStyle = NEGRO;
    const ls = envolver(ctx, b.k, pw - 6).slice(0, 2);
    ls.forEach((l, j) => ctx.fillText(j === 1 ? recortar(ctx, l, pw - 6) : l, cx(i), y + T + ih + 16 + j * 13));
  });

  // el acumulado
  ctx.strokeStyle = MAL; ctx.lineWidth = 2; ctx.beginPath();
  p.barras.forEach((b, i) => { if (i) ctx.lineTo(cx(i), yp(b.ac)); else ctx.moveTo(cx(i), yp(b.ac)) });
  ctx.stroke();
  p.barras.forEach((b, i) => { ctx.beginPath(); ctx.arc(cx(i), yp(b.ac), 3.6, 0, Math.PI * 2); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.strokeStyle = MAL; ctx.lineWidth = 2; ctx.stroke() });
}

function seccion(ctx: Ctx, y: number, t: string, nota: string) {
  letra(ctx, 900, 16); ctx.fillStyle = NEGRO; ctx.textAlign = "left"; ctx.fillText(t, PX, y + 32);
  letra(ctx, 500, 12.5); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(nota, W - PX, y + 32);
  ctx.fillStyle = NEGRO; ctx.fillRect(PX, y + 50, AN, 2);
  return y + 62;
}

const ALTO_BANDA = 100, ALTO_HERO = 112, ALTO_GRANDE = 296, ALTO_CHICO = 268;

/* LA TABLA «LOS EVENTOS», igual que en el cierre del Tablero: una fila por rotura. */
const OJO = "#6B5518", VERDE = "#1E7A3C", VERDE_S = "#E8F5EC", MAL_S = "#FDECEC", FINA = "#EEF1F5";
const TIPO_T: Record<TipoEv, string> = { comportamiento: "COMPORTAMIENTO", condicion: "CONDICIÓN", externa: "EXTERNA", sin_clasificar: "SIN CLASIFICAR" };
const SEV_T = { leve: "LEVE", intermedia: "INTERMEDIA", grave: "GRAVE" };
const LH = 17, PADV = 9, PADH = 8, ALTO_CAB_T = 31;
const COLS = [
  { t: "DÍA", w: 46 }, { t: "TURNO", w: 52 }, { t: "HORA", w: 50 }, { t: "ROTURA", w: 70 }, { t: "CAJAS", w: 54, n: true },
  { t: "TIPO", w: 160 }, { t: "SEVERIDAD", w: 94 }, { t: "RESPONSABLE", w: 150 }, { t: "EVENTO N.º", w: 108 }, { t: "REACCIÓN EXIGIDA", w: 0 },
];
const colsTabla = () => { const c = COLS.map((q) => ({ ...q })); c[c.length - 1].w = AN - c.slice(0, -1).reduce((a, q) => a + q.w, 0); return c };

type Renglon = { f: FilaEventoFoto; resp: { t: string; mal?: boolean; sub?: boolean }[]; reac: { t: string; a: FilaEventoFoto["acciones"][number] | null }[]; h: number };
function medirRenglones(ctx: Ctx, filas: FilaEventoFoto[]): Renglon[] {
  const cols = colsTabla(), wR = cols[7].w - 2 * PADH, wA = cols[9].w - 2 * PADH - 84;
  return filas.map((f) => {
    letra(ctx, 700, 13);
    const resp: Renglon["resp"] = [];
    if (f.responsable) {
      envolver(ctx, f.responsable, wR).forEach((t) => resp.push({ t }));
      if (f.autorreporte) resp.push({ t: "se reportó solo", sub: true });
      else if (f.reportante) resp.push({ t: "reportó: " + f.reportante, sub: true });
    } else if (f.tipo === "comportamiento") resp.push({ t: "Sin responsable", mal: true }, { t: "hay que asignarlo", sub: true });
    else resp.push({ t: "—" }, { t: "no suma a la persona", sub: true });
    letra(ctx, 500, 12);
    const reac: Renglon["reac"] = f.acciones.length
      ? f.acciones.flatMap((a) => envolver(ctx, a.nombre, wA).map((t, i) => ({ t, a: i === 0 ? a : null })))
      : [{ t: f.sinAccion, a: null }];
    return { f, resp, reac, h: Math.max(48, 2 * PADV + Math.max(resp.length, reac.length) * LH) };
  });
}

function etiqueta(ctx: Ctx, t: string, x: number, y: number, bg: string, fg: string, borde?: string) {
  letra(ctx, 700, 9.5); const w = anchoEspaciado(ctx, t, .7) + 14;
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, 20);
  if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, 19) }
  ctx.fillStyle = fg; ctx.textAlign = "left"; espaciado(ctx, t, x + 7, y + 10.5, .7);
  return w;
}

function dibujarTablaEventos(ctx: Ctx, y: number, rs: Renglon[], P: Paleta): number {
  const cols = colsTabla(), y1 = y;
  ctx.fillStyle = NEGRO; ctx.fillRect(PX, y, AN, ALTO_CAB_T);
  let cx = PX;
  for (const q of cols) {
    letra(ctx, 700, 10); ctx.fillStyle = "#FFFFFF";
    if (q.n) { ctx.textAlign = "right"; let rx = cx + q.w - PADH; for (const ch of [...q.t].reverse()) { ctx.fillText(ch, rx, y + 16); rx -= ctx.measureText(ch).width + 1.2 } }
    else { ctx.textAlign = "left"; espaciado(ctx, q.t, cx + PADH, y + 16, 1.2) }
    cx += q.w;
  }
  y += ALTO_CAB_T;
  rs.forEach(({ f, resp, reac, h }, ri) => {
    if (ri % 2 === 1) { ctx.fillStyle = "#FAFBFC"; ctx.fillRect(PX, y, AN, h) }
    ctx.fillStyle = FINA; ctx.fillRect(PX, y + h - 1, AN, 1);
    let c2 = PX;
    for (const q of cols) {
      const x0 = c2 + PADH, ty = y + PADV + 8;
      ctx.textAlign = "left";
      if (q.t === "DÍA") { letra(ctx, 500, 13); ctx.fillStyle = NEGRO; ctx.fillText(f.dia, x0, ty) }
      else if (q.t === "TURNO") { ctx.fillStyle = NEGRO; ctx.fillRect(x0, y + PADV - 1, 24, 24); letra(ctx, 900, 12); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.fillText(f.turno, x0 + 12, y + PADV + 11) }
      else if (q.t === "HORA") { letra(ctx, 500, 13); ctx.fillStyle = NEGRO; ctx.fillText(f.hora, x0, ty) }
      else if (q.t === "ROTURA") { letra(ctx, 700, 13); ctx.fillStyle = "#444C57"; ctx.fillText(f.codigo, x0, ty) }
      else if (q.t === "CAJAS") { letra(ctx, 700, 13); ctx.fillStyle = NEGRO; ctx.textAlign = "right"; ctx.fillText(nf.format(f.cajas), c2 + q.w - PADH, ty) }
      else if (q.t === "TIPO") {
        const tp = f.tipo;
        etiqueta(ctx, TIPO_T[tp], x0, y + PADV - 1, tp === "comportamiento" ? NEGRO : tp === "condicion" ? rgb(P.acento) : tp === "externa" ? FINA : MAL_S,
          tp === "comportamiento" ? "#FFFFFF" : tp === "sin_clasificar" ? MAL : NEGRO, tp === "sin_clasificar" ? MAL : undefined);
        letra(ctx, 500, 11); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(recortar(ctx, f.causa, q.w - 2 * PADH), x0, y + PADV + 31);
      } else if (q.t === "SEVERIDAD") {
        const sv = f.severidad;
        etiqueta(ctx, SEV_T[sv], x0, y + PADV - 1, sv === "grave" ? MAL : sv === "intermedia" ? "#FFF3D6" : VERDE_S, sv === "grave" ? "#FFFFFF" : sv === "intermedia" ? OJO : VERDE);
      } else if (q.t === "RESPONSABLE") {
        resp.forEach((ln, k) => { letra(ctx, ln.sub ? 500 : 700, ln.sub ? 11 : 13); ctx.textAlign = "left"; ctx.fillStyle = ln.mal ? MAL : ln.sub ? GRIS : NEGRO; ctx.fillText(ln.t, x0, ty + k * LH) });
      } else if (q.t === "EVENTO N.º") {
        if (f.nMes) {
          letra(ctx, 800, 13); ctx.fillStyle = f.nMes >= 3 ? MAL : NEGRO; ctx.fillText(`${f.nMes}.º del mes`, x0, ty);
          if (f.recurrente) etiqueta(ctx, "RECURRENTE", x0, y + PADV + 17, MAL_S, MAL, MAL);
        } else { letra(ctx, 500, 13); ctx.fillStyle = GRIS; ctx.fillText("—", x0, ty) }
      } else {
        reac.forEach((ln, k) => {
          const a = ln.a, yy = ty + k * LH;
          letra(ctx, 500, 12); ctx.textAlign = "left"; ctx.fillStyle = a ? NEGRO : GRIS; ctx.fillText(ln.t, x0, yy);
          if (a) {
            const txt = a.estado === "hecha" ? "hecha" : a.estado === "hecha_tarde" ? "hecha tarde" : a.estado === "vencida" ? "vencida" : "pendiente";
            const fg = a.estado === "hecha" ? VERDE : a.estado === "vencida" ? MAL : OJO;
            letra(ctx, 700, 10.5); ctx.fillStyle = fg; ctx.textAlign = "right"; ctx.fillText(txt.toUpperCase(), c2 + q.w - PADH, yy);
          }
        });
      }
      c2 += q.w;
    }
    y += h;
  });
  ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(PX + .5, y1 + .5, AN - 1, y - y1 - 1);
  return y;
}

export function dibujarSeguridadDashboard(d: DatosSeguridadFoto, x: ExtraSeguridad = {}): HTMLCanvasElement {
  const P = x.paleta ?? PALETA_MARCA;
  const [causa, ...otros] = d.paretos;
  const filas = Math.ceil(otros.length / 2);
  /* Se mide la tabla ANTES de crear el lienzo: su alto depende de cuántas líneas ocupa cada renglón. */
  const cvM = document.createElement("canvas").getContext("2d")!;
  const rs = medirRenglones(cvM, d.eventos);
  const altoTabla = rs.length ? ALTO_CAB_T + rs.reduce((a, r) => a + r.h, 0) : 40;
  const H = ALTO_BANDA + ALTO_HERO + 62 + ALTO_GRANDE + 14 + 62 + filas * ALTO_CHICO + (filas - 1) * 14 + 54 + 18 + 62 + altoTabla + 52;

  const cv = document.createElement("canvas"); cv.width = W * S; cv.height = Math.round(H * S);
  const ctx = cv.getContext("2d")!; ctx.scale(S, S); ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);

  // ---- la banda negra, lisa, con el sello
  ctx.fillStyle = NEGRO; ctx.fillRect(0, 0, W, ALTO_BANDA);
  let tx = PX;
  if (x.logo) { try { ctx.drawImage(x.logo, PX, (ALTO_BANDA - 46) / 2, 46, 46); tx = PX + 46 + 18 } catch { /* sin sello */ } }
  letra(ctx, 700, 10); ctx.fillStyle = "#FFE08A"; ctx.textAlign = "left"; espaciado(ctx, "ROTURAS · EN SITIO · SEGURIDAD", tx, 27, 1.6);
  letra(ctx, 900, 27); ctx.fillStyle = "#FFFFFF"; ctx.fillText("Plan de reacción · Paretos del mes", tx, 56);
  const g = x.generado ?? new Date();
  letra(ctx, 500, 12.5); ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillText(`${d.periodo} · foto de las ${g.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`, tx, 82);

  // ---- la franja del acento: eventos y las cifras que piden atención
  const y0 = ALTO_BANDA, tinta = NEGRO;
  ctx.fillStyle = rgb(P.acento); ctx.fillRect(0, y0, W, ALTO_HERO);
  const sub = `${nf.format(d.comp)} de comportamiento · ${nf.format(d.cond)} de condición`;
  letra(ctx, 500, 12); const wTot = Math.max(170, ctx.measureText(sub).width);
  letra(ctx, 700, 10); ctx.fillStyle = tinta; ctx.globalAlpha = .8; ctx.textAlign = "left"; espaciado(ctx, `EVENTOS · ${d.mes.toUpperCase()}`, PX, y0 + 20, 1.6); ctx.globalAlpha = 1;
  letra(ctx, 900, 48); ctx.fillStyle = tinta; ctx.fillText(String(d.total), PX, y0 + 54);
  letra(ctx, 500, 12); ctx.globalAlpha = .85; ctx.fillText(sub, PX, y0 + 92); ctx.globalAlpha = 1;
  const xr = PX + wTot + 30, paso5 = (W - PX - xr) / 5;
  const minis: [string, number, string, boolean][] = [
    ["GRAVES · SIF", d.graves, "30 cajas o más", d.graves > 0],
    ["CON REINCIDENCIA", d.reinc, "2.º evento o más", false],
    ["AL COMITÉ", d.comite, "4.º evento o recurrentes", false],
    ["SIN RESPONSABLE", d.sinResp, "hay que asignarlas", d.sinResp > 0],
    ["ACCIONES VENCIDAS", d.vencidas, `de ${d.abiertas} abiertas`, d.vencidas > 0],
  ];
  minis.forEach(([k, v, n, alerta], i) => {
    const mx = xr + paso5 * i;
    letra(ctx, 700, 10); ctx.fillStyle = tinta; ctx.globalAlpha = .8; ctx.textAlign = "left"; espaciado(ctx, k, mx, y0 + 20, 1.2); ctx.globalAlpha = 1;
    letra(ctx, 900, 30);
    /* LO QUE ALERTA SE PINTA EN ROJO OSCURO, sin recuadro: sobre el mostaza se lee bien y queda alineado con las demás cifras. */
    ctx.fillStyle = alerta ? "#A8001C" : tinta; ctx.fillText(String(v), mx, y0 + 45)
    letra(ctx, 500, 11.5); ctx.fillStyle = tinta; ctx.globalAlpha = .8; ctx.fillText(n, mx, y0 + 76); ctx.globalAlpha = 1;
  });
  void anchoEspaciado;

  // ---- el Pareto grande: por causa
  let y = seccion(ctx, y0 + ALTO_HERO + 4, causa.titulo, causa.nota);
  dibujarPareto(ctx, PX, y, AN, ALTO_GRANDE, causa, P, true);
  y += ALTO_GRANDE + 14;

  // ---- los otros cuatro, de dos en dos
  y = seccion(ctx, y, "Otras miradas", "los mismos eventos, vistos de otro lado");
  const wc = (AN - 24) / 2;
  otros.forEach((p, i) => {
    const cx = PX + (i % 2) * (wc + 24), cy = y + Math.floor(i / 2) * (ALTO_CHICO + 14);
    ctx.fillStyle = "#F7F8FA"; ctx.fillRect(cx, cy, wc, ALTO_CHICO);
    ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(cx + .5, cy + .5, wc - 1, ALTO_CHICO - 1);
    ctx.fillStyle = NEGRO; ctx.fillRect(cx, cy, wc, 3);
    letra(ctx, 800, 13); ctx.fillStyle = NEGRO; ctx.textAlign = "left"; ctx.fillText(p.titulo, cx + 14, cy + 22);
    letra(ctx, 500, 11.5); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(p.nota, cx + wc - 14, cy + 22);
    dibujarPareto(ctx, cx + 4, cy + 30, wc - 8, ALTO_CHICO - 36, p, P, false);
  });
  y += filas * ALTO_CHICO + (filas - 1) * 14 + 14;

  // ---- la leyenda de los Paretos
  const colores = COLOR(P);
  const ley: [string, string][] = [["Comportamiento", colores.comportamiento], ["Condición", colores.condicion], ["Externa u otros", colores.externa]];
  let lx = PX; letra(ctx, 500, 11.5); ctx.textAlign = "left";
  for (const [t, c] of ley) { ctx.fillStyle = c; ctx.fillRect(lx, y + 12, 10, 10); ctx.fillStyle = NEGRO; ctx.fillText(t, lx + 16, y + 17); lx += 16 + ctx.measureText(t).width + 22 }
  ctx.strokeStyle = MAL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, y + 17); ctx.lineTo(lx + 22, y + 17); ctx.stroke();
  ctx.fillStyle = NEGRO; ctx.fillText("Acumulado", lx + 28, y + 17);
  y += 18 + 36;

  // ---- LOS EVENTOS, uno por uno (igual que el cierre del Tablero)
  y = seccion(ctx, y, "Los eventos", `${d.total} evento${d.total === 1 ? "" : "s"} · ${d.comp} de comportamiento · ${d.cond} de condición`);
  if (!rs.length) { letra(ctx, 500, 13.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText("Nada que listar.", PX, y + 12); y += 40 }
  else y = dibujarTablaEventos(ctx, y, rs, P);

  // ---- el pie
  pie(ctx, W, H, g, `Eventos de roturas en sitio · ${d.periodo}`);
  void SUBE;
  return cv;
}
