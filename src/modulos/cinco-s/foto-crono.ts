/**
 * 5S · EL CRONOGRAMA EN UNA IMAGEN — «así como copio mis cierres de turno»: el Gantt tal como está en pantalla
 * (el mismo rango, la misma agrupación, los mismos estados visibles) en una imagen para pegar en WhatsApp o correo.
 *
 *   ARRIBA   las cuatro cifras del rango: auditorías, cumplimiento del plan, vencidas, próximos 7 días.
 *   ABAJO    el Gantt: meses, semanas y días; fines de semana sombreados; la raya de hoy; cada auditoría como barra
 *            con su estado (hecha con su %, y el rombo del día en que se hizo).
 *
 * El alto crece con las filas: con 4 áreas sale de 1800 × 1000, con 15 sale más larga y nada se aprieta.
 * Tonos de los informes; rojo de Bavaria solo para lo vencido y lo que quedó bajo la meta.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import { BORDE, FONDO, FOTO, GRIS, HUECO, MARGEN, cabecera, espaciado, letra, pie, recortar } from "@/modulos/foto";
import { ESTADOS, type EstadoProg, type Programada5S } from "./cinco-s";

const CARBON = "#3B3B3B", ROJO = "#C8102E", AMARILLO = "#FFC300", OCRE = "#B58200";
const DIA = 86400000;
const aD = (f: string) => new Date(f + "T00:00:00Z");
const mas = (f: string, n: number) => new Date(aD(f).getTime() + n * DIA).toISOString().slice(0, 10);
const dias = (a: string, b: string) => Math.round((aD(b).getTime() - aD(a).getTime()) / DIA);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const corta = (f: string) => `${aD(f).getUTCDate()} ${MESES[aD(f).getUTCMonth()].slice(0, 3)}`;
const semIso = (f: string) => {
  const d = aD(f); d.setUTCHours(12); const dia = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dia + 3);
  const p = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - p.getTime()) / DIA - 3 + ((p.getUTCDay() + 6) % 7)) / 7);
};

export type GrupoGantt = { nombre: string; barras: Programada5S[]; lane: Map<string, number>; carriles: number };
export type DatosCrono = {
  grupos: GrupoGantt[]; inicio: string; dias: number; hoy: string; porArea: boolean; rango: string;
  kpis: { enRango: number; cumplido: number | null; hechas: number; cerradas: number; vencidas: number; proximas: number; proximasTxt: string };
  visibles: EstadoProg[];
};

export function nombreCrono5S(inicio: string, fin: string) {
  return `Cronograma 5S - ${inicio} a ${fin}.png`;
}

export function dibujarCrono5S(d: DatosCrono, o: { logo?: CanvasImageSource | null; paleta?: Paleta; generado?: Date } = {}): HTMLCanvasElement {
  const P = o.paleta ?? PALETA_MARCA;
  const TINTA = `rgb(${P.tinta.join(",")})`, ACENTO = `rgb(${P.acento.join(",")})`;
  const { ancho: W, escala: S } = FOTO;
  const M = MARGEN, G = HUECO;
  const CARRIL = 40, PAD = 10, IZQ = 270;
  const Y0 = 106, HK = 128, Y1 = Y0 + HK + G;
  const CAB = 96; // meses + semanas + días
  const base = d.grupos.reduce((t, g) => t + g.carriles * CARRIL + PAD * 2, 0);
  const H = Math.max(FOTO.alto, Y1 + 56 + CAB + base + 26 + 40);
  /* CON POCAS FILAS, CADA FILA CRECE hasta llenar el panel (sin pasar de 120): nada de media imagen vacía. */
  const libre = H - (Y1 + 48 + CAB) - 26 - 40 - base;
  const extra = d.grupos.length ? Math.max(0, Math.min(libre / d.grupos.length, 120 - (CARRIL + PAD * 2))) : 0;
  const altoDe = (g: { carriles: number }) => g.carriles * CARRIL + PAD * 2 + extra;
  const filasAlto = d.grupos.reduce((t, g) => t + altoDe(g), 0);

  const c = document.createElement("canvas");
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S); ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, H);

  const fin = mas(d.inicio, d.dias - 1);
  cabecera(ctx, W, [d.rango, d.porArea ? "Por área" : "Por auditor"], P, o.logo, "Cronograma de auditorías 5S · CD38",
    `Del ${corta(d.inicio)} al ${corta(fin)} de ${aD(fin).getUTCFullYear()} · ${d.kpis.enRango} auditorías programadas`);

  /* ---------------- LAS CUATRO CIFRAS ---------------- */
  const WK = (W - 2 * M - 3 * G) / 4;
  const k = d.kpis;
  const tiles = [
    { t: "En el rango", v: String(k.enRango), sub: `${corta(d.inicio)} – ${corta(fin)}`, mal: false },
    { t: "Cumplimiento del plan", v: k.cumplido == null ? "—" : `${Math.round(k.cumplido)} %`, sub: k.cerradas ? `${k.hechas} ${k.hechas === 1 ? "hecha" : "hechas"} de ${k.cerradas} que ya cerraron` : "aún no cierra ninguna", mal: k.cumplido != null && k.cumplido < 100 },
    { t: "Vencidas", v: String(k.vencidas), sub: "pasó la fecha sin inspección", mal: k.vencidas > 0 },
    { t: "Próximos 7 días", v: String(k.proximas), sub: k.proximasTxt || "nada pendiente", mal: false },
  ];
  tiles.forEach((x, i) => {
    const tx = M + i * (WK + G);
    ctx.fillStyle = "#fff"; ctx.fillRect(tx, Y0, WK, HK);
    ctx.strokeStyle = BORDE; ctx.strokeRect(tx + .5, Y0 + .5, WK - 1, HK - 1);
    ctx.fillStyle = x.mal ? ROJO : AMARILLO; ctx.fillRect(tx, Y0, WK, 6);
    letra(ctx, 700, 13); ctx.fillStyle = GRIS; ctx.textAlign = "left"; espaciado(ctx, x.t.toUpperCase(), tx + 22, Y0 + 30, 1.2);
    letra(ctx, 900, 52); ctx.fillStyle = x.mal ? ROJO : TINTA; ctx.fillText(x.v, tx + 22, Y0 + 74);
    letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.fillText(recortar(ctx, x.sub, WK - 44), tx + 22, Y0 + 108);
  });

  /* ---------------- EL PANEL DEL GANTT ---------------- */
  const PH = H - Y1 - 40;
  ctx.fillStyle = "#fff"; ctx.fillRect(M, Y1, W - 2 * M, PH);
  ctx.strokeStyle = BORDE; ctx.strokeRect(M + .5, Y1 + .5, W - 2 * M - 1, PH - 1);
  ctx.fillStyle = ACENTO; ctx.fillRect(M + 16, Y1 + 19, 8, 8);
  letra(ctx, 800, 15); ctx.fillStyle = TINTA; ctx.textAlign = "left"; espaciado(ctx, "DIAGRAMA DE GANTT", M + 32, Y1 + 24);
  /* La leyenda, con los estados que se están viendo. */
  {
    letra(ctx, 600, 12.5); let lx = W - M - 16;
    const est: EstadoProg[] = (["programada", "en_curso", "hecha", "vencida", "cancelada"] as EstadoProg[]).filter((e) => d.visibles.includes(e));
    for (const e of [...est].reverse()) {
      const t = ESTADOS[e]; const tw = ctx.measureText(t).width; lx -= tw;
      ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(t, lx, Y1 + 24);
      lx -= 24; pintarBarra(ctx, e, lx, Y1 + 18, 18, 12, TINTA); lx -= 18;
    }
  }

  const x0 = M + 16 + IZQ, ancho = W - M - 16 - x0, px = ancho / d.dias;
  const yc = Y1 + 48, yf = yc + CAB;
  const xDia = (f: string) => x0 + dias(d.inicio, f) * px;

  /* Cabecera de fechas: meses, semanas, días. */
  let mi = 0;
  while (mi < d.dias) {
    const f = mas(d.inicio, mi); const m = aD(f).getUTCMonth();
    let n = 0; while (mi + n < d.dias && aD(mas(d.inicio, mi + n)).getUTCMonth() === m) n++;
    const xm = x0 + mi * px;
    ctx.fillStyle = BORDE; ctx.fillRect(xm, yc, 1, CAB);
    letra(ctx, 900, 16); ctx.fillStyle = TINTA; ctx.textAlign = "left";
    /* El nombre del mes, el que quepa: «Enero 2027», «Ene 2027», «Ene» o nada. */
    const nom = `${MESES[m][0].toUpperCase()}${MESES[m].slice(1)}`, yy = aD(f).getUTCFullYear();
    const cabe = n * px - 14;
    const t = [`${nom} ${yy}`, `${nom.slice(0, 3)} ${yy}`, nom.slice(0, 3)].find((x) => ctx.measureText(x).width <= cabe);
    if (t) ctx.fillText(t, xm + 8, yc + 16);
    mi += n;
  }
  for (let i = 0; i < d.dias; i++) {
    const f = mas(d.inicio, i), dw = aD(f).getUTCDay(), x = x0 + i * px;
    if (dw === 1 || i === 0) {
      letra(ctx, 700, 12.5); ctx.fillStyle = GRIS; ctx.textAlign = "left";
      if (px * 7 > 34) ctx.fillText(`S${semIso(f)}`, x + 6, yc + 42);
      ctx.fillStyle = BORDE; ctx.fillRect(x, yc + 32, 1, CAB - 32 + filasAlto);
    }
    if (dw === 0 || dw === 6) { ctx.fillStyle = "#F6F7F8"; ctx.fillRect(x, yc + 56, px, CAB - 56 + filasAlto) }
    const esHoy = f === d.hoy;
    if (esHoy) { ctx.fillStyle = AMARILLO; ctx.fillRect(x, yc + 58, px, 34) }
    if (px >= 16 || dw === 1) {
      letra(ctx, esHoy ? 800 : 600, px >= 24 ? 13 : 11.5); ctx.fillStyle = esHoy ? "#1b1b1b" : GRIS; ctx.textAlign = "center";
      ctx.fillText(String(aD(f).getUTCDate()), x + px / 2, yc + 75);
    }
  }
  ctx.fillStyle = AMARILLO; ctx.fillRect(M + 16, yf - 3, W - 2 * M - 32, 3);
  letra(ctx, 700, 12); ctx.fillStyle = GRIS; ctx.textAlign = "left";
  espaciado(ctx, d.porArea ? "ÁREA" : "AUDITOR", M + 16, yf - 18, 1.4);

  /* Las filas. */
  let y = yf;
  for (const g of d.grupos) {
    const alto = altoDe(g);
    letra(ctx, 800, 17); ctx.fillStyle = TINTA; ctx.textAlign = "left";
    ctx.fillText(recortar(ctx, g.nombre, IZQ - 20), M + 16, y + alto / 2 - 9);
    const vivas = g.barras.filter((b) => b.estado !== "cancelada");
    letra(ctx, 500, 13); ctx.fillStyle = GRIS;
    ctx.fillText(`${vivas.filter((b) => b.estado === "hecha").length}/${vivas.length} hechas`, M + 16, y + alto / 2 + 12);
    ctx.fillStyle = BORDE; ctx.fillRect(M + 16, y + alto - 1, W - 2 * M - 32, 1);
    ctx.fillStyle = BORDE; ctx.fillRect(x0 - 1, y, 1, alto);

    for (const b of g.barras) {
      const a = Math.max(0, dias(d.inicio, b.desde)), z = Math.min(d.dias, dias(d.inicio, b.hasta) + 1);
      if (z <= 0 || a >= d.dias) continue;
      const bx = x0 + a * px + 1.5, bw = Math.max(px - 3, (z - a) * px - 3);
      const by = y + PAD + extra / 2 + (g.lane.get(b.id) ?? 0) * CARRIL + 3, bh = CARRIL - 8;
      pintarBarra(ctx, b.estado, bx, by, bw, bh, TINTA);
      const claro = b.estado === "hecha" || b.estado === "vencida";
      let tx = bx + 10;
      if (b.prioridad === "alta" && b.estado !== "hecha") {
        letra(ctx, 900, 15); ctx.fillStyle = claro ? "#fff" : ROJO; ctx.textAlign = "left"; ctx.fillText("!", tx, by + bh / 2); tx += 12;
      }
      const pctTxt = b.estado === "hecha" && b.cumplimiento != null ? `${Math.round(b.cumplimiento)}%` : "";
      letra(ctx, 900, 14); const wp = pctTxt ? ctx.measureText(pctTxt).width + 12 : 0;
      const etiqueta = d.porArea ? (b.auditor ?? "Sin auditor") : b.area;
      letra(ctx, 700, 13); ctx.fillStyle = claro ? "#fff" : b.estado === "cancelada" ? GRIS : "#1b1b1b"; ctx.textAlign = "left";
      const adentro = bw - (tx - bx) - wp > 30 && ctx.measureText(etiqueta).width <= bw - (tx - bx) - wp - 8;
      if (adentro) ctx.fillText(etiqueta, tx, by + bh / 2);
      else {
        /* NO CABE ADENTRO: el nombre (y el %) va al lado de la barra, en tinta. Una auditoría de un día también dice quién. */
        letra(ctx, 800, 13); ctx.fillStyle = TINTA;
        ctx.fillText(etiqueta + (pctTxt ? ` · ${pctTxt}` : ""), bx + bw + 8, by + bh / 2);
      }
      if (pctTxt && adentro) {
        letra(ctx, 900, 14); ctx.fillStyle = b.meta != null && b.cumplimiento! < b.meta ? "#FFB4BE" : "#fff"; ctx.textAlign = "right";
        ctx.fillText(pctTxt, bx + bw - 8, by + bh / 2);
      }
      if (b.hecha_el && b.hecha_el >= d.inicio && b.hecha_el <= fin) {
        const rx = xDia(b.hecha_el) + px / 2;
        ctx.save(); ctx.translate(rx, by); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = AMARILLO; ctx.fillRect(-6, -6, 12, 12); ctx.strokeStyle = "#1b1b1b"; ctx.lineWidth = 1.5; ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
      }
    }
    y += alto;
  }
  if (d.grupos.length === 0) { letra(ctx, 600, 16); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText("No hay auditorías en este rango.", x0, yf + 30) }

  /* La raya de hoy, encima de todo. */
  if (d.hoy >= d.inicio && d.hoy <= fin) {
    const hx = xDia(d.hoy) + px / 2;
    ctx.fillStyle = OCRE; ctx.fillRect(hx - 1, yc + 92, 2.5, yf - yc - 92 + filasAlto);
  }

  pie(ctx, W, H, o.generado ?? new Date(), "5S · CRONOGRAMA");
  return c;
}

/** Una barra según su estado, igual que en la pantalla. */
function pintarBarra(ctx: CanvasRenderingContext2D, e: EstadoProg, x: number, y: number, w: number, h: number, tinta: string) {
  ctx.lineWidth = 1.8; ctx.setLineDash([]);
  if (e === "programada") { ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = tinta; ctx.strokeRect(x + .9, y + .9, w - 1.8, h - 1.8) }
  else if (e === "en_curso") { ctx.fillStyle = AMARILLO; ctx.fillRect(x, y, w, h); ctx.strokeStyle = OCRE; ctx.strokeRect(x + .9, y + .9, w - 1.8, h - 1.8) }
  else if (e === "hecha") { ctx.fillStyle = CARBON; ctx.fillRect(x, y, w, h) }
  else if (e === "vencida") { ctx.fillStyle = ROJO; ctx.fillRect(x, y, w, h) }
  else {
    ctx.fillStyle = "#F1F3F5"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#AEB6C0"; ctx.setLineDash([5, 4]); ctx.strokeRect(x + .9, y + .9, w - 1.8, h - 1.8); ctx.setLineDash([]);
  }
}
