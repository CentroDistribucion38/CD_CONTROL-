/**
 * LA FOTO DEL PLAN DEL DÍA — se dibuja en un lienzo (canvas), sin React, para COPIARLA y pegarla en WhatsApp o Teams.
 *
 * Es lo mismo que se ve en la pantalla del plan, ordenado para leerse de un vistazo en un chat: las cifras del día,
 * la rejilla tipo × turno (con la columna Día), el total, los vacíos y la carga por turno. Solo lo PLANEADO y, si el
 * día es hoy, cuántos viajes van hechos. Rectas, con el sello «B» de la marca (sin la palabra Bavaria).
 */
import { TURNOS, HORARIO } from "./formato";

type Ctx = CanvasRenderingContext2D;
const TINTA = "#111111", ORO = "#FFC400", ROJO = "#C8102E", GRIS = "#5b6b7f", PALIDO = "#B4BEC9", LINEA = "#E6EAF0", VERDE = "#0F7A4A";
const FUENTE = `"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
const TITULO = `"Archivo", "IBM Plex Sans", system-ui, sans-serif`;
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const DIA = "D";
const sp = (t: string) => t.split("").join(" ");

export type DatosFotoPlan = {
  /** «miércoles, 11 de noviembre de 2026» */
  fechaLarga: string;
  estado: "PUBLICADO" | "BORRADOR" | "SIN PLAN";
  tipos: { clave: string; nombre: string }[];
  /** "turno|tipo" → viajes planeados (el turno «D» es el general del día). */
  plan: Record<string, number>;
  /** turno → vacíos planeados. */
  vacios: Record<string, number>;
  /** Viajes ya hechos hoy; null si el día no es hoy. */
  hechos: number | null;
  generado: Date;
  logo?: HTMLImageElement | null;
};

/** El sello de la marca SOLO (la «B»). null si no carga: la foto sale con un círculo dibujado. */
export async function cargarLogoB(): Promise<HTMLImageElement | null> {
  try { const i = new Image(); i.src = "/marca/logo-b.png"; await i.decode(); return i } catch { return null }
}

function cifra(ctx: Ctx, xx: number, k: string, val: string, sub: string) {
  ctx.textAlign = "left";
  ctx.fillStyle = TINTA; ctx.globalAlpha = 0.8; ctx.font = `700 10.5px ${FUENTE}`; ctx.fillText(sp(k), xx, 122); ctx.globalAlpha = 1;
  ctx.font = `900 38px ${TITULO}`; ctx.fillText(val, xx, 158);
  ctx.globalAlpha = 0.85; ctx.font = `500 12px ${FUENTE}`; ctx.fillText(sub, xx, 176); ctx.globalAlpha = 1;
}

export function dibujarPlanFoto(d: DatosFotoPlan): HTMLCanvasElement {
  const val = (t: string, tipo: string) => d.plan[`${t}|${tipo}`] ?? 0;
  const porTurnos = (tipo: string) => TURNOS.reduce((a, t) => a + val(t, tipo), 0);
  const totTipo = (tipo: string) => porTurnos(tipo) + val(DIA, tipo);
  const filas = d.tipos.filter((x) => totTipo(x.clave) > 0);
  const totTurno = (t: string) => d.tipos.reduce((a, x) => a + val(t, x.clave), 0);
  const totGeneral = d.tipos.reduce((a, x) => a + val(DIA, x.clave), 0);
  const conCarga = d.tipos.reduce((a, x) => a + totTipo(x.clave), 0);
  const vacTurnos = TURNOS.reduce((a, t) => a + (d.vacios[t] ?? 0), 0);
  const vacGeneral = d.vacios[DIA] ?? 0;
  const totVac = vacTurnos + vacGeneral;
  const hayPlan = conCarga + totVac > 0;

  const W = 1280, escala = 2, FILA = 34;
  const abajoTabla = 361 + Math.max(filas.length, 1) * FILA;
  const abajoLado = 234 + 62 + 52 + (3 + (totGeneral + vacGeneral > 0 ? 1 : 0)) * 34 + 24 + (d.estado === "BORRADOR" ? 26 : 0);
  const alto = Math.max(abajoTabla, abajoLado) + 44;
  const cv = document.createElement("canvas"); cv.width = W * escala; cv.height = alto * escala;
  const ctx = cv.getContext("2d")!; ctx.scale(escala, escala);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, alto);

  /* La banda negra con el sello. */
  ctx.fillStyle = TINTA; ctx.fillRect(0, 0, W, 96); ctx.fillStyle = ROJO; ctx.fillRect(0, 96, W, 4);
  if (d.logo) ctx.drawImage(d.logo, 30, 24, 48, 48);
  else { ctx.beginPath(); ctx.arc(54, 48, 24, 0, Math.PI * 2); ctx.fillStyle = ORO; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = ROJO; ctx.stroke(); ctx.fillStyle = TINTA; ctx.font = `900 22px ${TITULO}`; ctx.textAlign = "center"; ctx.fillText("B", 54, 56) }
  ctx.textAlign = "left";
  ctx.font = `700 11px ${FUENTE}`; ctx.fillStyle = "#FFE08A"; ctx.fillText(sp("TRASPASOS · PLAN DEL DÍA"), 98, 30);
  ctx.font = `900 30px ${TITULO}`; ctx.fillStyle = "#fff"; ctx.fillText("Plan del día", 98, 62);
  ctx.font = `500 13px ${FUENTE}`; ctx.fillStyle = "#d6dce4";
  ctx.fillText(`${d.fechaLarga.charAt(0).toUpperCase() + d.fechaLarga.slice(1)} · foto de las ${d.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`, 98, 84);
  /* El estado, en una caja con filo. */
  ctx.font = `800 12px ${FUENTE}`; const et = sp(d.estado); const ew = ctx.measureText(et).width + 28;
  ctx.strokeStyle = ORO; ctx.lineWidth = 2; ctx.strokeRect(W - 30 - ew, 31, ew, 34);
  ctx.fillStyle = ORO; ctx.textAlign = "center"; ctx.fillText(et, W - 30 - ew / 2, 53);

  /* La franja amarilla con las cifras. */
  ctx.fillStyle = ORO; ctx.fillRect(0, 100, W, 100);
  cifra(ctx, 34, "VIAJES CON CARGA", nf.format(conCarga), "planeados para el día");
  cifra(ctx, 334, "VIAJES VACÍOS", nf.format(totVac), "no mueven producto");
  cifra(ctx, 634, "CARGA DEL DÍA", nf.format(conCarga + totVac), "con carga + vacíos");
  if (d.hechos != null) {
    const pct = conCarga > 0 ? ` · ${Math.round((d.hechos / conCarga) * 100)} % del plan` : "";
    cifra(ctx, 934, "YA HECHOS", nf.format(d.hechos), `al corte${pct}`);
  }

  /* Rejilla de la izquierda. */
  const X0 = 34, TW = 848;
  const cw = { tipo: 248, c: 150 };
  let y = 200 + 22 + 12;
  ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `900 18px ${TITULO}`; ctx.fillText("Viajes planeados por turno", X0, y);
  ctx.textAlign = "right"; ctx.fillStyle = GRIS; ctx.font = `500 12.5px ${FUENTE}`; ctx.fillText(`${d.tipos.length} tipos · 3 turnos`, X0 + TW, y);
  ctx.fillStyle = TINTA; ctx.fillRect(X0, y + 9, TW, 2);
  y += 11;
  /* Encabezado de columnas. */
  ctx.fillStyle = "#F7F9FC"; ctx.fillRect(X0, y, TW, 44);
  ctx.strokeStyle = LINEA; ctx.lineWidth = 1; ctx.strokeRect(X0 + 0.5, y + 0.5, TW - 1, 43);
  const centro = (i: number) => X0 + cw.tipo + cw.c * i + cw.c / 2;
  ctx.textAlign = "left"; ctx.fillStyle = GRIS; ctx.font = `700 10.5px ${FUENTE}`; ctx.fillText(sp("TIPO DE VIAJE"), X0 + 12, y + 27);
  const cab = [...TURNOS.map((t) => [`TURNO ${t}`, HORARIO[t]]), ["DÍA", "general o suma"]];
  cab.forEach(([a, b], i) => {
    ctx.textAlign = "center"; ctx.fillStyle = GRIS; ctx.font = `700 10.5px ${FUENTE}`; ctx.fillText(sp(a), centro(i), y + 19);
    ctx.font = `500 11px ${FUENTE}`; ctx.fillStyle = "#8794a5"; ctx.fillText(b, centro(i), y + 35);
  });
  y += 44;
  const desdeDia = X0 + cw.tipo + cw.c * 3;
  const y1 = y;
  if (!filas.length) {
    ctx.textAlign = "left"; ctx.fillStyle = GRIS; ctx.font = `500 14px ${FUENTE}`; ctx.fillText("Este día no tiene viajes con carga planeados.", X0 + 12, y + 22); y += FILA;
  }
  filas.forEach((x, i) => {
    if (i % 2) { ctx.fillStyle = "#FAFBFC"; ctx.fillRect(X0, y, TW, FILA) }
    ctx.fillStyle = "#FFF8DC"; ctx.fillRect(desdeDia, y, cw.c, FILA);
    ctx.fillStyle = "#EEF1F5"; ctx.fillRect(X0, y + FILA - 1, TW, 1);
    ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `600 14px ${FUENTE}`; ctx.fillText(x.nombre, X0 + 12, y + 22);
    TURNOS.forEach((t, j) => {
      const n = val(t, x.clave); ctx.textAlign = "center";
      ctx.fillStyle = n ? TINTA : PALIDO; ctx.font = `500 14px ${FUENTE}`; ctx.fillText(n ? nf.format(n) : "—", centro(j), y + 22);
    });
    const general = val(DIA, x.clave) > 0;
    ctx.fillStyle = TINTA; ctx.font = `800 14px ${FUENTE}`; ctx.textAlign = "center";
    if (general) {
      const num = nf.format(val(DIA, x.clave)); const w1 = ctx.measureText(num).width;
      ctx.font = `500 11.5px ${FUENTE}`; const w2 = ctx.measureText(" general").width;
      const x0 = centro(3) - (w1 + w2) / 2;
      ctx.textAlign = "left"; ctx.font = `800 14px ${FUENTE}`; ctx.fillStyle = TINTA; ctx.fillText(num, x0, y + 22);
      ctx.font = `500 11.5px ${FUENTE}`; ctx.fillStyle = GRIS; ctx.fillText(" general", x0 + w1, y + 22);
    } else ctx.fillText(nf.format(porTurnos(x.clave)), centro(3), y + 22);
    y += FILA;
  });
  void y1;
  /* Totales. */
  ctx.fillStyle = TINTA; ctx.fillRect(X0, y, TW, 2); ctx.fillStyle = "#F7F9FC"; ctx.fillRect(X0, y + 2, TW, 36);
  ctx.textAlign = "left"; ctx.font = `800 14px ${FUENTE}`; ctx.fillStyle = TINTA; ctx.fillText("TOTAL CON CARGA", X0 + 12, y + 26);
  ctx.textAlign = "center";
  TURNOS.forEach((t, j) => ctx.fillText(nf.format(totTurno(t)), centro(j), y + 26));
  ctx.fillText(nf.format(conCarga), centro(3), y + 26);
  y += 38;
  ctx.fillStyle = "#EEF1F5"; ctx.fillRect(X0, y + 33, TW, 1);
  ctx.textAlign = "left"; ctx.font = `500 14px ${FUENTE}`; ctx.fillStyle = GRIS; ctx.fillText("Viajes vacíos", X0 + 12, y + 22);
  ctx.textAlign = "center";
  TURNOS.forEach((t, j) => ctx.fillText(nf.format(d.vacios[t] ?? 0), centro(j), y + 22));
  ctx.fillText(nf.format(totVac), centro(3), y + 22);
  const yFin = y + 34;

  /* La carga por turno, a la derecha. */
  const RX = X0 + TW + 34, RW = W - 34 - RX;
  let ry = 200 + 22 + 12;
  ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `900 18px ${TITULO}`; ctx.fillText("Carga por turno", RX, ry);
  ctx.textAlign = "right"; ctx.fillStyle = GRIS; ctx.font = `500 12.5px ${FUENTE}`; ctx.fillText("con carga + vacíos", RX + RW, ry);
  ctx.fillStyle = TINTA; ctx.fillRect(RX, ry + 9, RW, 2);
  ry += 62;
  ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `900 46px ${TITULO}`; ctx.fillText(nf.format(conCarga + totVac), RX, ry);
  ctx.fillStyle = GRIS; ctx.font = `500 12.5px ${FUENTE}`; ctx.fillText(`${nf.format(conCarga)} con carga · ${nf.format(totVac)} vacíos`, RX, ry + 22);
  ry += 52;
  const barras = [
    ...TURNOS.map((t) => [`Turno ${t}`, totTurno(t) + (d.vacios[t] ?? 0)] as const),
    ...(totGeneral + vacGeneral > 0 ? [["General", totGeneral + vacGeneral] as const] : []),
  ];
  const tope = Math.max(1, ...barras.map((b) => b[1]));
  const mayor = barras.findIndex((b) => b[1] === tope);
  barras.forEach(([n, v], i) => {
    ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `600 13px ${FUENTE}`; ctx.fillText(n, RX, ry + 11);
    const bx = RX + 72, bw = RW - 72 - 40;
    ctx.fillStyle = "#EEF1F5"; ctx.fillRect(bx, ry + 2, bw, 10);
    ctx.fillStyle = hayPlan && i === mayor ? ROJO : TINTA; ctx.fillRect(bx, ry + 2, v > 0 ? Math.max(2, bw * (v / tope)) : 0, 10);
    ctx.textAlign = "right"; ctx.fillStyle = TINTA; ctx.font = `800 13px ${FUENTE}`; ctx.fillText(nf.format(v), RX + RW, ry + 11);
    ry += 34;
  });
  if (d.estado === "BORRADOR") {
    ctx.textAlign = "left"; ctx.fillStyle = VERDE; ctx.font = `700 12px ${FUENTE}`;
    ctx.fillText("Borrador: el turno todavía no lo ve.", RX, ry + 8);
  }

  /* El pie. */
  ctx.textAlign = "left"; ctx.fillStyle = GRIS; ctx.font = `500 11.5px ${FUENTE}`;
  ctx.fillText("Solo cuenta lo planeado, no lo cumplido. «General» = tipos planeados para el día completo sin repartir por turno. Turnos: C 22:00–06:00 abre el día, A 06:00–14:00, B 14:00–22:00.", 34, alto - 18);
  return cv;
}
