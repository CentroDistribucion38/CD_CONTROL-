/**
 * LA FOTO DEL CIERRE DE TIEMPOS DE CONTEO — se dibuja en un lienzo (canvas), sin React, igual que la del cierre de SIDER:
 * banda negra con el sello «B» y el filo rojo, franja del acento con las cifras, el ranking, la LÍNEA DE TIEMPO
 * (inicio → final de cada conteo, de la hora más temprana a la más tarde) y las observaciones que escribió la persona.
 * Todas las cifras van alineadas a la derecha en columnas fijas.
 */
import { duracion } from "./tiempos";
import { diaTxt, horasEje, marcaEstado, num, num1, type CierreTiempos } from "./tiempos-cierre";

type Ctx = CanvasRenderingContext2D;
const TINTA = "#111111", ORO = "#FFC400", ROJO = "#C8102E", GRIS = "#5b6b7f", LINEA = "#E6EAF0";
const FUENTE = `"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
const TITULO = `"Archivo", "IBM Plex Sans", system-ui, sans-serif`;
/** Tope de filas de la línea de tiempo en la foto: más que eso es una imagen que nadie lee. */
export const TOPE_FILAS_FOTO = 120;

export type ExtraTiempos = { titulo: string; ojo: string; periodo: string; generado: Date; logo?: HTMLImageElement | null; obs: string[] };

function partir(ctx: Ctx, texto: string, ancho: number): string[] {
  const out: string[] = []; let l = "";
  for (const p of texto.split(/\s+/)) { const t = l ? `${l} ${p}` : p; if (ctx.measureText(t).width <= ancho || !l) l = t; else { out.push(l); l = p } }
  if (l) out.push(l);
  return out;
}
function cortar(ctx: Ctx, t: string, ancho: number) {
  if (ctx.measureText(t).width <= ancho) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > ancho) t = t.slice(0, -1);
  return t + "…";
}
const esp = (t: string) => t.split("").join(" ");

export function dibujarTiemposFoto(c: CierreTiempos, x: ExtraTiempos): HTMLCanvasElement {
  const W = 1280, escala = 2, FILA = 34, FL = 26, DIA = 30;
  /* Cuántas filas de la línea de tiempo caben en la foto. */
  let cupo = TOPE_FILAS_FOTO;
  const dias = c.dias.map((d) => { const filas = d.filas.slice(0, Math.max(0, cupo)); cupo -= filas.length; return { ...d, filas, total: d.filas.length } }).filter((d) => d.filas.length);
  const total = c.dias.reduce((t, d) => t + d.filas.length, 0), mostradas = dias.reduce((t, d) => t + d.filas.length, 0);

  const medir = document.createElement("canvas").getContext("2d")!;
  medir.font = `500 14px ${FUENTE}`;
  const obsLineas = x.obs.flatMap((o) => partir(medir, o, W - 68 - 60).map((l, i) => ({ l, punto: i === 0 })));
  const nota = `Renglones por hora = renglones ÷ horas de trabajo activo (sin las pausas de más de 30 min); solo cuentan los conteos enviados. Inicio = primer renglón · final = envío. La foto es de las ${x.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
  medir.font = `500 11.5px ${FUENTE}`;
  const notaL = partir(medir, nota, W - 68);

  const altoRank = 34 + 32 + Math.max(c.rank.length, 1) * FILA + 14;
  const altoLinea = 6 + 34 + 44 + (dias.length * DIA) + mostradas * FL + (total > mostradas ? 26 : 0) + (dias.length ? 0 : 36) + 14;
  const altoObs = obsLineas.length ? 20 + 26 + obsLineas.length * 21 + 16 : 0;
  const alto = 100 + 84 + 22 + altoRank + altoLinea + altoObs + 22 + notaL.length * 16 + 24;

  const cv = document.createElement("canvas"); cv.width = W * escala; cv.height = alto * escala;
  const ctx = cv.getContext("2d")!; ctx.scale(escala, escala);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, alto); ctx.textBaseline = "alphabetic";

  /* LA BANDA NEGRA CON EL SELLO Y EL FILO ROJO */
  ctx.fillStyle = TINTA; ctx.fillRect(0, 0, W, 96); ctx.fillStyle = ROJO; ctx.fillRect(0, 96, W, 4);
  if (x.logo) ctx.drawImage(x.logo, 30, 24, 48, 48);
  else { ctx.beginPath(); ctx.arc(54, 48, 24, 0, Math.PI * 2); ctx.fillStyle = ORO; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = ROJO; ctx.stroke(); ctx.fillStyle = TINTA; ctx.font = `900 22px ${TITULO}`; ctx.textAlign = "center"; ctx.fillText("B", 54, 56) }
  ctx.textAlign = "left";
  ctx.font = `700 11px ${FUENTE}`; ctx.fillStyle = "#FFE08A"; ctx.fillText(esp(x.ojo.toUpperCase()), 98, 30);
  ctx.font = `900 30px ${TITULO}`; ctx.fillStyle = "#fff"; ctx.fillText(x.titulo, 98, 62);
  ctx.font = `500 13px ${FUENTE}`; ctx.fillStyle = "#d6dce4";
  ctx.fillText(`${x.periodo.charAt(0).toUpperCase() + x.periodo.slice(1)} · foto de las ${x.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`, 98, 84);

  /* LA FRANJA DEL ACENTO */
  ctx.fillStyle = ORO; ctx.fillRect(0, 100, W, 84);
  const cifra = (xx: number, k: string, val: string, sub: string) => {
    ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.globalAlpha = 0.8; ctx.font = `700 10.5px ${FUENTE}`; ctx.fillText(esp(k), xx, 122); ctx.globalAlpha = 1;
    ctx.font = `900 38px ${TITULO}`; ctx.fillText(val, xx, 158);
    ctx.globalAlpha = 0.85; ctx.font = `500 12px ${FUENTE}`; ctx.fillText(sub, xx, 176); ctx.globalAlpha = 1;
  };
  cifra(34, "RENGLONES POR HORA ACTIVA", num1(c.rph), `${c.personas} persona${c.personas === 1 ? "" : "s"}`);
  cifra(430, "CONTEOS ENVIADOS", num(c.conteos), c.sinEnviar ? `${c.sinEnviar} sin enviar` : "todos enviados");
  cifra(700, "RENGLONES", num(c.renglones), "contados");
  cifra(930, "TIEMPO ACTIVO", duracion(c.activoMin), c.pausasMin > 0 ? `y ${duracion(c.pausasMin)} de pausas` : "sin pausas largas");

  /* EL RANKING */
  let y = 184 + 22 + 12;
  const titulo = (t: string, der: string) => {
    ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `900 18px ${TITULO}`; ctx.fillText(t, 34, y);
    ctx.textAlign = "right"; ctx.fillStyle = GRIS; ctx.font = `500 12.5px ${FUENTE}`; ctx.fillText(der, W - 34, y);
    ctx.fillStyle = TINTA; ctx.fillRect(34, y + 9, W - 68, 2); y += 22;
  };
  titulo("Ranking · renglones por hora activa", `${c.rank.length} persona${c.rank.length === 1 ? "" : "s"}`);
  const R = { n: 64, nom: 84, con: 640, ren: 780, act: 930, pau: 1070, rph: W - 50 };
  const cabecera = (cols: [string, number, boolean][]) => {
    ctx.fillStyle = "#F7F9FC"; ctx.fillRect(34, y, W - 68, 32); ctx.strokeStyle = LINEA; ctx.lineWidth = 1; ctx.strokeRect(34.5, y + 0.5, W - 69, 31);
    ctx.fillStyle = GRIS; ctx.font = `700 10.5px ${FUENTE}`;
    for (const [t, xx, der] of cols) { ctx.textAlign = der ? "right" : "left"; ctx.fillText(esp(t), xx, y + 20) }
    y += 32;
  };
  cabecera([["#", R.n, true], ["PERSONA", R.nom, false], ["CONTEOS", R.con, true], ["RENGLONES", R.ren, true], ["TIEMPO ACTIVO", R.act, true], ["PAUSAS", R.pau, true], ["RENGL. / HORA", R.rph, true]]);
  const tope = Math.max(0.0001, ...c.rank.map((p) => p.rph ?? 0));
  if (!c.rank.length) { ctx.textAlign = "left"; ctx.fillStyle = GRIS; ctx.font = `500 14px ${FUENTE}`; ctx.fillText("Todavía no hay conteos enviados en este periodo.", 44, y + 22); y += FILA }
  c.rank.forEach((p, i) => {
    if (i === 0 && p.rph != null) { ctx.fillStyle = "#FFF4CC"; ctx.fillRect(35, y, W - 70, FILA) } else if (i % 2) { ctx.fillStyle = "#FAFBFC"; ctx.fillRect(35, y, W - 70, FILA) }
    ctx.fillStyle = "#EEF1F5"; ctx.fillRect(35, y + FILA - 1, W - 70, 1);
    ctx.textAlign = "right"; ctx.font = `500 13px ${FUENTE}`; ctx.fillStyle = GRIS; ctx.fillText(p.rph == null ? "·" : String(i + 1), R.n, y + 20);
    ctx.fillStyle = TINTA; ctx.fillText(String(p.conteos), R.con, y + 20); ctx.fillText(num(p.renglones), R.ren, y + 20); ctx.fillText(duracion(p.activo_min), R.act, y + 20); ctx.fillText(p.pausas_min > 0 ? duracion(p.pausas_min) : "·", R.pau, y + 20);
    ctx.font = `800 13.5px ${FUENTE}`; ctx.fillText(num1(p.rph), R.rph, y + 20);
    ctx.textAlign = "left"; ctx.font = `600 13.5px ${FUENTE}`; ctx.fillText(cortar(ctx, p.persona, 330), R.nom, y + 20);
    ctx.fillStyle = "#EEF1F5"; ctx.fillRect(R.nom, y + 26, 300, 3);
    ctx.fillStyle = i === 0 ? ROJO : TINTA; ctx.fillRect(R.nom, y + 26, Math.max(2, 300 * ((p.rph ?? 0) / tope)), 3);
    y += FILA;
  });
  ctx.fillStyle = TINTA; ctx.fillRect(34, y, W - 68, 2); y += 2 + 12;

  /* LA LÍNEA DE TIEMPO */
  y += 22;
  titulo("Línea de tiempo · inicio → final de cada conteo", `${total} conteo${total === 1 ? "" : "s"}`);
  const T = { ini: 84, per: 140, g0: 300, g1: 880, fin: 962, dur: 1054, ren: 1146, rph: W - 50 };
  const gw = T.g1 - T.g0, eje = c.eje, span = eje.fin - eje.ini;
  const px = (m: number) => T.g0 + ((m - eje.ini) / span) * gw;
  /* La cabecera con las horas del eje. */
  ctx.fillStyle = "#F7F9FC"; ctx.fillRect(34, y, W - 68, 32); ctx.strokeStyle = LINEA; ctx.lineWidth = 1; ctx.strokeRect(34.5, y + 0.5, W - 69, 31);
  ctx.fillStyle = GRIS; ctx.font = `700 10.5px ${FUENTE}`;
  ctx.textAlign = "right"; ctx.fillText(esp("INICIO"), T.ini + 14, y + 20);
  ctx.textAlign = "left"; ctx.fillText(esp("PERSONA"), T.per, y + 20);
  for (const [t, xx] of [["FINAL", T.fin], ["DURACIÓN", T.dur], ["RENGL.", T.ren], ["R. / HORA", T.rph]] as [string, number][]) { ctx.textAlign = "right"; ctx.fillText(esp(t), xx, y + 20) }
  const paso = span / 60 <= 12 ? 60 : 120;
  ctx.textAlign = "center"; ctx.font = `600 10.5px ${FUENTE}`;
  for (let m = eje.ini; m <= eje.fin; m += paso) ctx.fillText(horasEje(m), px(m), y + 20);
  y += 32;
  const yGrid0 = y;
  /* Las filas, día por día. */
  const filasY: { y: number; f: (typeof dias)[number]["filas"][number] }[] = [];
  const bandas: { y: number; t: string; der: string }[] = [];
  for (const d of dias) {
    bandas.push({ y, t: diaTxt(d.dia), der: `${d.total} conteo${d.total === 1 ? "" : "s"} · ${num(d.renglones)} renglones` }); y += DIA;
    for (const f of d.filas) { filasY.push({ y, f }); y += FL }
  }
  /* Las líneas de las horas, detrás de las barras. */
  ctx.strokeStyle = LINEA; ctx.lineWidth = 1;
  for (let m = eje.ini; m <= eje.fin; m += paso) { ctx.beginPath(); ctx.moveTo(px(m) + 0.5, yGrid0); ctx.lineTo(px(m) + 0.5, y); ctx.stroke() }
  for (const b of bandas) {
    ctx.fillStyle = "#EEF1F5"; ctx.fillRect(35, b.y, W - 70, DIA);
    ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `800 13px ${FUENTE}`; ctx.fillText(b.t, T.ini - 14, b.y + 20);
    ctx.textAlign = "right"; ctx.fillStyle = GRIS; ctx.font = `600 12px ${FUENTE}`; ctx.fillText(b.der, W - 50, b.y + 20);
  }
  for (const { y: fy, f } of filasY) {
    ctx.fillStyle = "#EEF1F5"; ctx.fillRect(35, fy + FL - 1, W - 70, 1);
    ctx.textAlign = "right"; ctx.font = `700 13px ${FUENTE}`; ctx.fillStyle = TINTA; ctx.fillText(f.horaIni, T.ini + 14, fy + 18);
    ctx.textAlign = "left"; ctx.font = `600 13px ${FUENTE}`; ctx.fillText(cortar(ctx, f.persona, 150), T.per, fy + 18);
    /* La barra: de la hora de inicio a la del final. Lo que no se envió va rayado, con borde. */
    const x0 = px(f.ini), x1 = Math.max(x0 + 3, px(Math.min(eje.fin, f.ini + f.dur)));
    if (f.estado === "enviado") { ctx.fillStyle = TINTA; ctx.fillRect(x0, fy + 7, x1 - x0, 11) }
    else { ctx.fillStyle = "#fff"; ctx.fillRect(x0, fy + 7, x1 - x0, 11); ctx.strokeStyle = GRIS; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(x0 + 0.75, fy + 7.75, x1 - x0 - 1.5, 9.5); ctx.setLineDash([]) }
    ctx.textAlign = "right"; ctx.font = `600 13px ${FUENTE}`; ctx.fillStyle = f.estado === "enviado" ? TINTA : GRIS;
    ctx.fillText(f.estado === "enviado" ? f.horaFin : marcaEstado(f.estado) === "en curso" ? "en curso" : `${f.horaFin} · s/e`, T.fin, fy + 18);
    ctx.fillStyle = TINTA; ctx.font = `500 13px ${FUENTE}`; ctx.fillText(duracion(f.dur), T.dur, fy + 18); ctx.fillText(num(f.renglones), T.ren, fy + 18);
    ctx.font = `800 13px ${FUENTE}`; ctx.fillText(num1(f.rph), T.rph, fy + 18);
  }
  if (!dias.length) { ctx.textAlign = "left"; ctx.fillStyle = GRIS; ctx.font = `500 14px ${FUENTE}`; ctx.fillText("No hay conteos en este periodo.", 44, y + 24); y += 36 }
  ctx.fillStyle = TINTA; ctx.fillRect(34, y, W - 68, 2); y += 2;
  if (total > mostradas) { ctx.textAlign = "left"; ctx.fillStyle = GRIS; ctx.font = `600 12px ${FUENTE}`; ctx.fillText(`… y ${total - mostradas} conteos más (los de los últimos días no caben en la foto).`, 34, y + 18); y += 26 }
  y += 14;

  /* LAS OBSERVACIONES QUE ESCRIBIÓ LA PERSONA */
  if (obsLineas.length) {
    y += 20;
    const h = 26 + obsLineas.length * 21 + 16 - 6;
    ctx.fillStyle = "#FFFBEA"; ctx.fillRect(34, y, W - 68, h); ctx.strokeStyle = "#E6D58A"; ctx.lineWidth = 1; ctx.strokeRect(34.5, y + 0.5, W - 69, h - 1);
    ctx.fillStyle = ORO; ctx.fillRect(34, y, 6, h);
    ctx.textAlign = "left"; ctx.fillStyle = TINTA; ctx.font = `800 10.5px ${FUENTE}`; ctx.fillText(esp("OBSERVACIONES DEL TURNO"), 58, y + 22);
    ctx.font = `500 14px ${FUENTE}`;
    obsLineas.forEach((o, i) => {
      const ly = y + 46 + i * 21;
      if (o.punto) { ctx.fillStyle = TINTA; ctx.fillRect(60, ly - 9, 5, 5) }
      ctx.fillStyle = TINTA; ctx.fillText(o.l, 78, ly);
    });
    y += h;
  }

  /* EL PIE */
  y += 22; ctx.textAlign = "left"; ctx.font = `500 11.5px ${FUENTE}`; ctx.fillStyle = GRIS;
  notaL.forEach((l, i) => ctx.fillText(l, 34, y + i * 16));
  return cv;
}
