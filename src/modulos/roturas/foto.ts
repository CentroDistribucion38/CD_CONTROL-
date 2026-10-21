/**
 * LAS DOS IMÁGENES DEL CIERRE DE ROTURAS EN SITIO — para copiar y pegar en un correo o en WhatsApp.
 *
 *   DASHBOARD         EXACTAMENTE la ficha del cierre: la banda negra con el sello, la franja del acento con registros /
 *                     reportadas / encontradas, «Por turno» (solo los turnos con registros) y «A qué corresponde».
 *   FOTOS DEL REPORTE «Las roturas» (la tabla, una por una) y debajo la foto de cada rotura.
 *
 * NO CALCULA NADA: pinta el mismo `Cierre` que ve la pantalla, el PDF y el texto. Las medidas son las del CSS de la ficha
 * (`cierre.css`, 1120 px de ancho) para que la imagen se vea igual que la pantalla.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import { BORDE, GRIS, SUAVE, anchoEspaciado, envolver, espaciado, letra, medidor, pie, recortar, type Ctx } from "@/modulos/foto";
import { HORARIO_TURNO, ORIGEN_TXT, diaLargo, ddmm, type Cierre, type Cuenta, type FilaCierre, type TurnoCierre } from "./cierre";

const W = 1120, S = 2, PX = 24, AN = W - 2 * PX; // ancho de la ficha, escala y margen lateral
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const rgb = (c: readonly number[]) => `rgb(${c.join(",")})`;
const mezcla = (c: readonly number[], p: number) => rgb(c.map((v) => Math.round(v * p + 255 * (1 - p))));
const hhmm = (d: Date) => d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const OJO = "#6B5518", VERDE = "#1E7A3C", VERDE_S = "#E8F5EC", MAL = "#C8102E", MAL_S = "#FDECEC", PAPEL = "#FFFFFF", FINA = "#EEF1F5";

type Extra = {
  paleta?: Paleta; logo?: CanvasImageSource | null; sello?: CanvasImageSource | null; generado?: Date;
  titulo: string; ojo: string; periodo: string; filtros: string;
};

function lienzo(alto: number) {
  const c = document.createElement("canvas");
  c.width = W * S; c.height = Math.round(alto * S);
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S);
  ctx.textBaseline = "middle";
  ctx.fillStyle = PAPEL; ctx.fillRect(0, 0, W, alto);
  return { c, ctx };
}

/** El nombre del archivo, con el día. */
export const nombreFotoCierre = (c: Cierre, parte: "dashboard" | "fotos") =>
  `cierre-roturas-${c.desde || "sin-datos"}${c.hasta && c.hasta !== c.desde ? "-a-" + c.hasta : ""}-${parte === "dashboard" ? "dashboard" : "fotos"}.png`;

/* ------------------------------------------------------------------ piezas comunes */

/** Texto con partes en negrita: [texto, negrita][]. */
function mixta(ctx: Ctx, partes: [string, boolean][], x: number, y: number, px: number, normal: string, fuerte: string, derecha = false) {
  const ancho = partes.reduce((s, [t, b]) => { letra(ctx, b ? 800 : 500, px); return s + ctx.measureText(t).width }, 0);
  let cx = derecha ? x - ancho : x;
  ctx.textAlign = "left";
  for (const [t, b] of partes) {
    letra(ctx, b ? 800 : 500, px); ctx.fillStyle = b ? fuerte : normal; ctx.fillText(t, cx, y); cx += ctx.measureText(t).width;
  }
  return ancho;
}

/** El relleno rayado del «sin origen». */
function rayado(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = MAL; ctx.lineWidth = 4;
  for (let i = -h; i < w + h; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke() }
  ctx.restore();
}

/** La banda negra con el sello, el título y la hora de la foto. */
const ALTO_BANDA = 108;
function banda(ctx: Ctx, x: Extra, sub: string, P: Paleta) {
  ctx.fillStyle = rgb(P.tinta); ctx.fillRect(0, 0, W, ALTO_BANDA);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, ALTO_BANDA); ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,.03)"; ctx.lineWidth = 2;
  for (let i = -ALTO_BANDA; i < W; i += 20) { ctx.beginPath(); ctx.moveTo(i, ALTO_BANDA); ctx.lineTo(i + ALTO_BANDA * .49, 0); ctx.stroke() }
  ctx.restore();
  let tx = PX;
  if (x.sello) { try { ctx.drawImage(x.sello, PX, (ALTO_BANDA - 34) / 2, 34, 34); tx = PX + 34 + 18 } catch { /* sin sello */ } }
  letra(ctx, 700, 10); ctx.fillStyle = mezcla(P.acento, .28); ctx.textAlign = "left";
  espaciado(ctx, `ROTURAS EN SITIO · ${x.ojo}`, tx, 27, 1.6);
  letra(ctx, 900, 27); ctx.fillStyle = "#FFFFFF"; ctx.fillText(x.titulo, tx, 56);
  letra(ctx, 500, 12.5); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillText(sub, tx, 84);
}

/** «Por turno» y compañía: título 16 px con la raya negra debajo. Devuelve dónde empieza el contenido. */
function seccion(ctx: Ctx, y: number, t: string, nota: string, P: Paleta) {
  letra(ctx, 900, 16); ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "left"; ctx.fillText(t, PX, y + 32);
  letra(ctx, 500, 12.5); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(nota, W - PX, y + 32);
  ctx.fillStyle = rgb(P.tinta); ctx.fillRect(PX, y + 50, AN, 2);
  return y + 62;
}
const ALTO_SEC = 62;

const subtitulo = (x: Extra) => {
  const p = x.periodo.charAt(0).toUpperCase() + x.periodo.slice(1);
  return `${p} · foto de las ${hhmm(x.generado ?? new Date())}`;
};

/* ===================================================================== DASHBOARD */
const ALTO_HERO = 112, ALTO_TURNO = 250, ALTO_FILA_L = 38;

function cintaTurno(ctx: Ctx, x: number, y: number, w: number, a: number, b: number, c: number, P: Paleta) {
  ctx.fillStyle = FINA; ctx.fillRect(x, y, w, 10);
  const t = a + b + c;
  if (t > 0) {
    let cx = x;
    for (const [v, k] of [[a, "r"], [b, "e"], [c, "s"]] as [number, string][]) {
      if (v <= 0) continue;
      const ww = (v / t) * w;
      if (k === "s") rayado(ctx, cx, y, ww, 10); else { ctx.fillStyle = k === "r" ? rgb(P.tinta) : rgb(P.acento); ctx.fillRect(cx, y, ww, 10) }
      cx += ww;
    }
  }
  ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, 9);
}

function tarjetaTurno(ctx: Ctx, x: number, y: number, w: number, t: TurnoCierre, varios: boolean, P: Paleta) {
  ctx.fillStyle = PAPEL; ctx.fillRect(x, y, w, ALTO_TURNO);
  ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, ALTO_TURNO - 1);
  ctx.fillStyle = rgb(P.tinta); ctx.fillRect(x, y, w, 3);
  const ix = x + 16;
  // cabecera: la letra, «Turno C», el horario
  ctx.fillStyle = rgb(P.tinta); ctx.fillRect(ix, y + 17, 40, 40);
  letra(ctx, 900, 22); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.fillText(t.turno, ix + 20, y + 38);
  letra(ctx, 900, 15); ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "left"; ctx.fillText(`Turno ${t.turno}`, ix + 52, y + 29);
  letra(ctx, 500, 12); ctx.fillStyle = GRIS; ctx.fillText(`${HORARIO_TURNO[t.turno]}${varios ? " · " + diaLargo(t.dia) : ""}`, ix + 52, y + 47);
  // cifras
  const cols: [string, number, boolean][] = [["REGISTROS", t.registros, true], ["REPORTADAS", t.reportadas, false], ["ENCONTRADAS", t.encontradas, false]];
  if (t.sinOrigen > 0) cols.push(["SIN ORIGEN", t.sinOrigen, false]);
  let cx = ix;
  for (const [k, v, reg] of cols) {
    letra(ctx, 700, 9.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; espaciado(ctx, k, cx, y + 76, 1.3);
    const wk = anchoEspaciado(ctx, k, 1.3);
    letra(ctx, 900, reg ? 34 : 24); ctx.fillStyle = k === "SIN ORIGEN" ? MAL : rgb(P.tinta); ctx.fillText(String(v), cx, y + (reg ? 101 : 98));
    cx += Math.max(wk, ctx.measureText(String(v)).width) + 22;
  }
  cintaTurno(ctx, ix, y + 128, w - 32, t.reportadas, t.encontradas, t.sinOrigen, P);
  mixta(ctx, [[nf.format(t.rotas), true], [" rotas", false], ...(t.contaminadas > 0 ? [[" · ", false], [nf.format(t.contaminadas), true], [" contaminadas", false]] as [string, boolean][] : []),
    ...(t.anuladas > 0 ? [[` · ${t.anuladas} anulada${t.anuladas === 1 ? "" : "s"}`, false]] as [string, boolean][] : [])],
    ix, y + 154, 13, rgb(P.tinta), rgb(P.tinta));
  mixta(ctx, [["A cobro ", false], [String(t.aCobro), true], [" · espera al OL ", false], [String(t.esperanOL), true], [" · en desacuerdo ", false], [String(t.desacuerdo), true],
    ...(t.noSeCobra > 0 ? [[" · no se cobra ", false], [String(t.noSeCobra), true]] as [string, boolean][] : [])],
    ix, y + 175, 12.5, GRIS, rgb(P.tinta));
  // «A qué corresponde ▾», tal cual está en la ficha
  ctx.fillStyle = BORDE; ctx.fillRect(ix, y + 195, w - 32, 1);
  letra(ctx, 700, 13); ctx.fillStyle = OJO; ctx.textAlign = "left"; ctx.fillText("A qué corresponde", ix, y + 220);
  ctx.textAlign = "right"; letra(ctx, 500, 12); ctx.fillText("▾", ix + w - 32, y + 220);
}

function lista(ctx: Ctx, x: number, y: number, w: number, nombre: string, nota: string, filas: Cuenta[], total: number, P: Paleta, dibujar: boolean) {
  const tope = filas.slice(0, 8), mas = filas.length > 8;
  const h = 42 + Math.max(1, tope.length) * ALTO_FILA_L + (mas ? 26 : 0) + 4;
  if (!dibujar) return h;
  letra(ctx, 900, 13); ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "left"; ctx.fillText(nombre, x, y + 8);
  letra(ctx, 500, 11.5); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(nota, x + w, y + 8);
  const cReg = x + w - 118, cRot = x + w - 62, cCon = x + w, ancho = w - 150;
  letra(ctx, 700, 9.5); ctx.fillStyle = "#6B7686"; ctx.textAlign = "left"; espaciado(ctx, "NOMBRE", x, y + 33, 1.1);
  ctx.textAlign = "right";
  for (const [t, px] of [["REG.", cReg], ["ROTAS", cRot], ["CONTAM.", cCon]] as [string, number][]) {
    let cx = px; for (const ch of [...t].reverse()) { ctx.fillText(ch, cx, y + 33); cx -= ctx.measureText(ch).width + 1.1 }
  }
  ctx.fillStyle = BORDE; ctx.fillRect(x, y + 42, w, 1);
  if (!tope.length) { letra(ctx, 500, 13.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText("Sin registros.", x, y + 62) }
  tope.forEach((f, i) => {
    const ry = y + 43 + i * ALTO_FILA_L;
    letra(ctx, 500, 12.5); ctx.textAlign = "left";
    ctx.fillStyle = f.nombre === "Sin dato" ? MAL : rgb(P.tinta);
    ctx.fillText(recortar(ctx, f.nombre, ancho), x, ry + 15);
    ctx.fillStyle = FINA; ctx.fillRect(x, ry + 26, ancho, 4);
    ctx.fillStyle = rgb(P.tinta); ctx.fillRect(x, ry + 26, (total > 0 ? f.n / total : 0) * ancho, 4);
    ctx.textAlign = "right"; letra(ctx, 800, 12.5); ctx.fillStyle = rgb(P.tinta); ctx.fillText(String(f.n), cReg, ry + 15);
    letra(ctx, 500, 12.5); ctx.fillText(nf.format(f.rotas), cRot, ry + 15); ctx.fillText(f.contaminadas ? nf.format(f.contaminadas) : "—", cCon, ry + 15);
    ctx.fillStyle = FINA; ctx.fillRect(x, ry + 37, w, 1);
  });
  if (mas) { letra(ctx, 500, 11.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(`y ${filas.length - 8} más (están en el PDF y en el detalle)`, x, y + h - 17) }
  return h;
}

export function dibujarDashboardCierre(c: Cierre, x: Extra): HTMLCanvasElement {
  const P = x.paleta ?? PALETA_MARCA, t = c.total;
  const turnos = c.turnos.filter((q) => q.registros > 0);
  const varios = c.dias > 1 || c.desde !== c.hasta;
  const m = medidor();
  const conTurnos = turnos.length > 0 && turnos.length !== 1;
  const colsT = 3, anchoT = (AN - (colsT - 1) * 14) / colsT, filasT = Math.ceil(turnos.length / colsT);
  const colsL = 3, wl = (AN - (colsL - 1) * 20) / colsL;
  const listas: [string, string, Cuenta[]][] = [["Por causa", "qué la rompió", t.porCausa], ["Por proceso", "dónde pasó", t.porProceso], ["Por área", "en qué zona", t.porArea], ["Quién registró", "en la app", t.porQuien]];
  const altosFila: number[] = [];
  listas.forEach(([n, o, f], i) => { const r = Math.floor(i / colsL); altosFila[r] = Math.max(altosFila[r] ?? 0, lista(m, 0, 0, wl, n, o, f, t.registros, P, false)) });
  const altoListas = altosFila.reduce((s, h) => s + h, 0) + (altosFila.length - 1) * 16;

  const H = ALTO_BANDA + ALTO_HERO + (x.filtros ? 40 : 0) + 8
    + (conTurnos ? ALTO_SEC + filasT * ALTO_TURNO + (filasT - 1) * 14 : 0)
    + (t.registros > 0 ? ALTO_SEC + altoListas : 0) + 70;
  const { c: cv, ctx } = lienzo(H);

  banda(ctx, x, subtitulo(x), P);

  // ---- la franja del acento: registros, reportadas, encontradas, la cinta y las fases
  const y0 = ALTO_BANDA, tinta = rgb(P.tinta);
  ctx.fillStyle = rgb(P.acento); ctx.fillRect(0, y0, W, ALTO_HERO);
  letra(ctx, 500, 12); const sub = `${nf.format(t.rotas)} rotas${t.contaminadas > 0 ? " y " + nf.format(t.contaminadas) + " contaminadas" : ""}`;
  const wTot = Math.max(150, ctx.measureText(sub).width);
  letra(ctx, 700, 10); ctx.fillStyle = tinta; ctx.globalAlpha = .8; ctx.textAlign = "left"; espaciado(ctx, "REGISTROS", PX, y0 + 20, 1.6); ctx.globalAlpha = 1;
  letra(ctx, 900, 48); ctx.fillStyle = tinta; ctx.fillText(String(t.registros), PX, y0 + 54);
  letra(ctx, 500, 12); ctx.globalAlpha = .85; ctx.fillText(sub, PX, y0 + 92); ctx.globalAlpha = 1;
  const xr = PX + wTot + 22, wr = W - PX - xr;
  const mini: [string, number, string][] = [["REPORTADAS", t.reportadas, "por un OPM con su PIN"], ["ENCONTRADAS", t.encontradas, "sin dueño · van a cobro"]];
  if (t.sinOrigen > 0) mini.push(["SIN ORIGEN", t.sinOrigen, "hay que completarlas"]);
  let mx = xr;
  for (const [k, v, n] of mini) {
    letra(ctx, 700, 10); ctx.fillStyle = tinta; ctx.globalAlpha = .8; ctx.textAlign = "left"; espaciado(ctx, k, mx, y0 + 20, 1.6); ctx.globalAlpha = 1;
    const wk = anchoEspaciado(ctx, k, 1.6);
    letra(ctx, 900, 30);
    if (k === "SIN ORIGEN") { const wv = ctx.measureText(String(v)).width + 16; ctx.fillStyle = "#FFFFFF"; ctx.fillRect(mx, y0 + 28, wv, 30); ctx.fillStyle = MAL; ctx.fillText(String(v), mx + 8, y0 + 44) }
    else { ctx.fillStyle = tinta; ctx.fillText(String(v), mx, y0 + 44) }
    letra(ctx, 500, 11.5); ctx.fillStyle = tinta; ctx.globalAlpha = .8; ctx.fillText(n, mx, y0 + 70); ctx.globalAlpha = 1;
    mx += Math.max(wk, ctx.measureText(n).width, 40) + 38;
  }
  // la cinta grande y su leyenda
  const cy = y0 + 78, T = t.registros;
  ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(xr, cy, wr, 12);
  if (T > 0) {
    let cx = xr;
    for (const [v, k] of [[t.reportadas, "r"], [t.encontradas, "e"], [t.sinOrigen, "s"]] as [number, string][]) {
      if (v <= 0) continue;
      const ww = (v / T) * wr;
      if (k === "s") rayado(ctx, cx, cy, ww, 12); else { ctx.fillStyle = k === "r" ? tinta : "#FFFFFF"; ctx.fillRect(cx, cy, ww, 12) }
      cx += ww;
    }
  }
  ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.strokeRect(xr + .5, cy + .5, wr - 1, 11);
  let lx = xr; const ly = y0 + 100;
  const ley: [string, string][] = [["reportadas", "r"], ["encontradas", "e"], ...(t.sinOrigen > 0 ? [["sin origen", "s"] as [string, string]] : [])];
  for (const [txt, k] of ley) {
    if (k === "s") rayado(ctx, lx, ly - 6, 12, 12); else { ctx.fillStyle = k === "r" ? tinta : "#FFFFFF"; ctx.fillRect(lx, ly - 6, 12, 12) }
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.strokeRect(lx + .5, ly - 5.5, 11, 11);
    letra(ctx, 500, 12.5); ctx.fillStyle = tinta; ctx.textAlign = "left"; ctx.fillText(txt, lx + 19, ly); lx += 19 + ctx.measureText(txt).width + 18;
  }
  mixta(ctx, [["a cobro ", false], [String(t.aCobro), true], [" · espera al OL ", false], [String(t.esperanOL), true], [" · en desacuerdo ", false], [String(t.desacuerdo), true],
    ...(t.anuladas > 0 ? [[" · anuladas ", false], [String(t.anuladas), true]] as [string, boolean][] : [])], W - PX, ly, 12.5, tinta, tinta, true);

  let y = y0 + ALTO_HERO;
  if (x.filtros) {
    ctx.fillStyle = "#FBF7EE"; ctx.fillRect(0, y, W, 40); ctx.fillStyle = BORDE; ctx.fillRect(0, y + 39, W, 1);
    letra(ctx, 700, 10); ctx.fillStyle = OJO; ctx.textAlign = "left"; espaciado(ctx, "FILTRADO", PX, y + 20, 1.6);
    const wf = anchoEspaciado(ctx, "FILTRADO", 1.6);
    letra(ctx, 500, 13); ctx.fillStyle = tinta; ctx.fillText(recortar(ctx, x.filtros, AN - wf - 20), PX + wf + 12, y + 20);
    y += 40;
  }
  y += 8;

  // ---- por turno (solo los que tuvieron registros; con uno solo, la franja ya lo dice)
  if (conTurnos) {
    y = seccion(ctx, y, "Por turno", `${turnos.length} turnos · el C abre el día`, P);
    turnos.forEach((q, i) => tarjetaTurno(ctx, PX + (i % colsT) * (anchoT + 14), y + Math.floor(i / colsT) * (ALTO_TURNO + 14), anchoT, q, varios, P));
    y += filasT * ALTO_TURNO + (filasT - 1) * 14;
  }
  // ---- a qué corresponde
  if (t.registros > 0) {
    y = seccion(ctx, y, "A qué corresponde", "todo lo del cierre, junto", P);
    let fy = y;
    listas.forEach(([n, o, f], i) => {
      const r = Math.floor(i / colsL), col = i % colsL;
      if (col === 0 && r > 0) fy += altosFila[r - 1] + 16;
      lista(ctx, PX + col * (wl + 20), fy, wl, n, o, f, t.registros, P, true);
    });
  }
  pie(ctx, W, H, x.generado ?? new Date(), x.periodo);
  return cv;
}

/* ===================================================================== FOTOS DEL REPORTE */
export type FotoRotura = {
  codigo: string; turno: string; dia: string; hora: string; material: string;
  rotas: number; contaminadas: number; eer: boolean; causa: string; proceso: string; area: string; estado: string;
  /** La primera foto de la rotura ya descargada (null si no hay o no se pudo traer). */
  imagen: ImageBitmap | null; tieneFoto: boolean;
};

/** Cuántas fotos caben en la imagen: más serían una imagen que no se puede pegar en ningún lado. */
export const TOPE_FOTOS = 24;

type ColT = { t: string; w: number; n?: boolean };

export function dibujarFotosCierre(c: Cierre, fotos: FotoRotura[], x: Extra): HTMLCanvasElement {
  const P = x.paleta ?? PALETA_MARCA, tinta = rgb(P.tinta);
  const varios = c.dias > 1 || c.desde !== c.hasta;
  const filas: FilaCierre[] = c.turnos.flatMap((q) => q.filas);
  const lista = fotos.slice(0, TOPE_FOTOS), resto = fotos.length - lista.length;
  const m = medidor();

  // ---- las columnas de «Las roturas», con el ancho que tienen en la ficha
  const cols: ColT[] = [
    ...(varios ? [{ t: "DÍA", w: 56 }] : []),
    { t: "TURNO", w: 54 }, { t: "HORA", w: 58 }, { t: "ROTURA", w: 70 }, { t: "MATERIAL", w: varios ? 140 : 170 },
    { t: "ROTAS", w: 56, n: true }, { t: "CONTAM.", w: 62, n: true }, { t: "CAUSA", w: varios ? 114 : 132 }, { t: "PROCESO", w: 76 }, { t: "ÁREA", w: 76 },
    { t: "ORIGEN", w: 96 }, { t: "QUIÉN", w: varios ? 66 : 66 }, { t: "ESTADO", w: 156 },
  ];
  const suma = cols.reduce((s, q) => s + q.w, 0); cols[cols.findIndex((q) => q.t === "MATERIAL")].w += AN - suma; // lo que sobre o falte lo absorbe el material
  const LH = 17, PADV = 9, PADH = 10;
  const textos = (f: FilaCierre): string[] => [
    ...(varios ? [ddmm(f.dia)] : []), f.turno, f.hora, f.codigo, f.material_nombre, nf.format(f.rotas), f.tipo === "eer" ? "—" : String(f.contaminadas || "—"),
    f.causa || "Sin dato", f.proceso || "Sin dato", f.area || "Sin dato", ORIGEN_TXT[f.origen], f.registro || "—", f.estado,
  ];
  const lineasDe = (f: FilaCierre) => {
    const tx = textos(f); letra(m, 500, 13);
    return cols.map((q, i) => {
      if (q.t === "TURNO" || q.t === "ORIGEN" || q.t === "ESTADO" || q.t === "ROTURA") return [tx[i]];
      return envolver(m, tx[i], q.w - 2 * PADH);
    });
  };
  const altos = filas.map((f) => {
    const l = lineasDe(f);
    const origenAlto = f.origen === "opm" && f.opm ? 26 + envolver(m, f.opm.toUpperCase(), cols.find((q) => q.t === "ORIGEN")!.w - 2 * PADH).length * 14 : 0;
    return Math.max(PADV * 2 + Math.max(...l.map((q) => q.length)) * LH, 2 * PADV + Math.max(26, origenAlto) , 36);
  });
  const altoTabla = filas.length ? 31 + altos.reduce((s, h) => s + h, 0) : 40;
  const fin = "Las anuladas no cuentan como registros. La foto es de las " + hhmm(x.generado ?? new Date()) + "; si alguien registra algo después, el cierre cambia. El turno sale de la hora de registro (hora de Colombia): C 22:00–06:00 abre el día, A 06:00–14:00, B 14:00–22:00.";
  letra(m, 500, 12); const finL = envolver(m, fin, AN);

  const colsF = 3, cw = (AN - (colsF - 1) * 14) / colsF, foto = 270, pieAlto = 90, ch = foto + pieAlto;
  const filasF = Math.ceil(lista.length / colsF);
  const altoFotos = lista.length ? filasF * ch + (filasF - 1) * 14 : 36;

  const H = ALTO_BANDA + 8 + ALTO_SEC + altoTabla + 18 + finL.length * 18 + 8 + ALTO_SEC + altoFotos + (resto > 0 ? 34 : 0) + 70;
  const { c: cv, ctx } = lienzo(H);
  banda(ctx, x, subtitulo(x), P);

  // ---- LAS ROTURAS, una por una
  let y = seccion(ctx, ALTO_BANDA + 8, "Las roturas", `${c.total.registros} registrada${c.total.registros === 1 ? "" : "s"}${c.total.anuladas > 0 ? ` · ${c.total.anuladas} anulada${c.total.anuladas === 1 ? "" : "s"} aparte` : ""}`, P);
  if (!filas.length) { letra(ctx, 500, 13.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText("Nada que listar.", PX, y + 12); y += 40 }
  else {
    const y1 = y;
    ctx.fillStyle = tinta; ctx.fillRect(PX, y, AN, 31);
    let cx = PX;
    for (const q of cols) {
      letra(ctx, 700, 10); ctx.fillStyle = "#FFFFFF";
      if (q.n) { ctx.textAlign = "right"; let rx = cx + q.w - PADH; for (const ch2 of [...q.t].reverse()) { ctx.fillText(ch2, rx, y + 16); rx -= ctx.measureText(ch2).width + 1.2 } }
      else { ctx.textAlign = "left"; espaciado(ctx, q.t, cx + PADH, y + 16, 1.2) }
      cx += q.w;
    }
    y += 31;
    filas.forEach((f, ri) => {
      const h = altos[ri], tx = textos(f), l = lineasDe(f);
      if (ri % 2 === 1) { ctx.fillStyle = "#FAFBFC"; ctx.fillRect(PX, y, AN, h) }
      ctx.fillStyle = FINA; ctx.fillRect(PX, y + h - 1, AN, 1);
      let cx2 = PX;
      cols.forEach((q, i) => {
        const gris = f.anulada ? GRIS : tinta;
        if (q.t === "TURNO") { ctx.fillStyle = tinta; ctx.fillRect(cx2 + PADH, y + PADV - 1, 24, 24); letra(ctx, 900, 12); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.fillText(f.turno, cx2 + PADH + 12, y + PADV + 11) }
        else if (q.t === "ORIGEN") {
          letra(ctx, 700, 10.5); const txt = tx[i].toUpperCase(), wc = Math.min(q.w - 2 * PADH, ctx.measureText(txt).width + 16 + txt.length * .6);
          const cyy = y + PADV - 1;
          if (f.origen === "opm") { ctx.fillStyle = tinta; ctx.fillRect(cx2 + PADH, cyy, wc, 22) }
          else if (f.origen === "encontrada") { ctx.fillStyle = rgb(P.acento); ctx.fillRect(cx2 + PADH, cyy, wc, 22) }
          else { ctx.fillStyle = MAL_S; ctx.fillRect(cx2 + PADH, cyy, wc, 22); ctx.setLineDash([3, 2]); ctx.strokeStyle = MAL; ctx.strokeRect(cx2 + PADH + .5, cyy + .5, wc - 1, 21); ctx.setLineDash([]) }
          ctx.fillStyle = f.origen === "opm" ? "#FFFFFF" : f.origen === "encontrada" ? tinta : MAL; ctx.textAlign = "left"; espaciado(ctx, txt, cx2 + PADH + 8, cyy + 11, .6);
          if (f.origen === "opm" && f.opm) { letra(ctx, 500, 11); ctx.fillStyle = GRIS; envolver(ctx, f.opm.toUpperCase(), q.w - 2 * PADH).forEach((ln, k) => ctx.fillText(ln, cx2 + PADH, cyy + 34 + k * 14)) }
        } else if (q.t === "ESTADO") {
          const cl = f.clase; const bg = cl === "tb-ok" ? VERDE_S : cl === "tb-mal" ? MAL_S : cl === "tb-esp" ? "#FFF3D6" : FINA;
          const fg = cl === "tb-ok" ? VERDE : cl === "tb-mal" ? MAL : cl === "tb-esp" ? OJO : GRIS;
          let px = 10; letra(ctx, 700, px); let wt = anchoEspaciado(ctx, tx[i], 1);
          while (wt + 18 > q.w - 2 * PADH + 4 && px > 7.5) { px -= .5; letra(ctx, 700, px); wt = anchoEspaciado(ctx, tx[i], 1) }
          ctx.fillStyle = bg; ctx.fillRect(cx2 + PADH - 2, y + PADV - 1, wt + 18, 22);
          ctx.fillStyle = fg; ctx.textAlign = "left"; espaciado(ctx, tx[i], cx2 + PADH + 7, y + PADV + 10, 1);
        } else {
          const bold = q.t === "ROTURA";
          letra(ctx, bold ? 700 : 500, 13); ctx.fillStyle = (q.t === "CAUSA" || q.t === "PROCESO" || q.t === "ÁREA") && tx[i] === "Sin dato" ? MAL : (bold ? (f.anulada ? GRIS : "#444C57") : gris);
          ctx.textAlign = q.n ? "right" : "left";
          l[i].forEach((ln, k) => {
            const tx0 = q.n ? cx2 + q.w - PADH : cx2 + PADH, ty = y + PADV + 8 + k * LH;
            ctx.fillText(ln, tx0, ty);
            if (f.anulada) { const wl = ctx.measureText(ln).width; ctx.fillStyle = "#9AA4B2"; ctx.fillRect(q.n ? tx0 - wl : tx0, ty, wl, 1); ctx.fillStyle = gris }
          });
        }
        cx2 += q.w;
      });
      y += h;
    });
    ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(PX + .5, y1 + .5, AN - 1, y - y1 - 1);
  }
  y += 18;
  letra(ctx, 500, 12); ctx.fillStyle = GRIS; ctx.textAlign = "left";
  finL.forEach((ln, k) => ctx.fillText(ln, PX, y + 8 + k * 18));
  y += finL.length * 18 + 8;

  // ---- FOTOS DEL REPORTE
  y = seccion(ctx, y, "Fotos del reporte", `${fotos.length} rotura${fotos.length === 1 ? "" : "s"} con foto`, P);
  if (!lista.length) { letra(ctx, 500, 13.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText("Ninguna rotura de este cierre tiene foto.", PX, y + 12) }
  lista.forEach((f, i) => {
    const px = PX + (i % colsF) * (cw + 14), py = y + Math.floor(i / colsF) * (ch + 14);
    ctx.fillStyle = PAPEL; ctx.fillRect(px, py, cw, ch);
    ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(px + .5, py + .5, cw - 1, ch - 1);
    ctx.save(); ctx.beginPath(); ctx.rect(px + 1, py + 1, cw - 2, foto - 1); ctx.clip();
    if (f.imagen) {
      const r = Math.max(cw / f.imagen.width, foto / f.imagen.height), dw = f.imagen.width * r, dh = f.imagen.height * r;
      ctx.drawImage(f.imagen, px + (cw - dw) / 2, py + (foto - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = SUAVE; ctx.fillRect(px, py, cw, foto);
      letra(ctx, 600, 14); ctx.fillStyle = GRIS; ctx.textAlign = "center";
      ctx.fillText(f.tieneFoto ? "La foto no se pudo traer" : "Sin foto", px + cw / 2, py + foto / 2);
    }
    ctx.restore();
    ctx.fillStyle = tinta; ctx.fillRect(px, py, 96, 26);
    letra(ctx, 800, 13.5); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left"; ctx.fillText(f.codigo, px + 9, py + 14);
    ctx.fillStyle = rgb(P.acento); ctx.fillRect(px + 96, py, 32, 26);
    ctx.fillStyle = tinta; ctx.textAlign = "center"; ctx.fillText(f.turno, px + 112, py + 14);
    const tx = px + 12, ancho = cw - 24;
    letra(ctx, 800, 13.5); ctx.fillStyle = tinta; ctx.textAlign = "left";
    ctx.fillText(recortar(ctx, `${varios ? ddmm(f.dia) + " · " : ""}${f.hora} · ${f.material}`, ancho), tx, py + foto + 18);
    letra(ctx, 700, 12.5);
    ctx.fillText(`${nf.format(f.rotas)} rotas${!f.eer && f.contaminadas ? " · " + nf.format(f.contaminadas) + " contaminadas" : ""}`, tx, py + foto + 40);
    letra(ctx, 500, 12); ctx.fillStyle = GRIS;
    const causa = [f.causa, f.proceso, f.area].filter(Boolean).join(" · ") || "Sin dato";
    envolver(ctx, causa, ancho).slice(0, 2).forEach((l, k) => ctx.fillText(l, tx, py + foto + 60 + k * 16));
  });
  if (resto > 0) {
    letra(ctx, 600, 13); ctx.fillStyle = GRIS; ctx.textAlign = "left";
    ctx.fillText(`y ${resto} más con foto (están en el detalle de cada rotura)`, PX, y + altoFotos + 18);
  }
  pie(ctx, W, H, x.generado ?? new Date(), x.periodo);
  return cv;
}

/** El sello de la marca de la banda negra, tal cual. */
export async function traerSello(): Promise<ImageBitmap | null> {
  try { const r = await fetch("/marca/logo-b.png"); if (!r.ok) return null; return await createImageBitmap(await r.blob()) } catch { return null }
}

/** Trae la primera foto de cada rotura (de a pocas a la vez) y la deja lista para dibujar. Lo que no llega queda en null: la imagen sale igual. */
export async function traerFotosRotura(ids: string[], cuantas = 6): Promise<Map<string, ImageBitmap | null>> {
  const salida = new Map<string, ImageBitmap | null>();
  let i = 0;
  async function una(id: string) {
    try {
      const r = await fetch(`/api/roturas/evidencia/${id}`, { cache: "no-store" });
      const j = await r.json();
      const url = (j.fotos?.find((f: { url: string | null }) => f.url)?.url ?? null) as string | null;
      if (!url) { salida.set(id, null); return }
      const b = await (await fetch(url)).blob();
      salida.set(id, await createImageBitmap(b));
    } catch { salida.set(id, null) }
  }
  await Promise.all(Array.from({ length: Math.min(cuantas, ids.length) }, async () => {
    while (i < ids.length) await una(ids[i++]);
  }));
  return salida;
}
