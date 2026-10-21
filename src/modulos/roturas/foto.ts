/**
 * LAS DOS IMÁGENES DEL CIERRE DE ROTURAS EN SITIO — para copiar y pegar en un correo o en WhatsApp, como el
 * Dashboard y el Detalle del casco y de Pasivos.
 *
 *   DASHBOARD         las cifras del cierre: registros, reportadas / encontradas, un cuadro por turno (solo los que
 *                     tuvieron registros) y «a qué corresponde» (causa, proceso, área, quién registró).
 *   FOTOS DEL REPORTE la foto de cada rotura registrada, con su código, hora, material y causa debajo.
 *
 * NO CALCULA NADA: pinta el mismo `Cierre` que ve la pantalla y que sale en el PDF y en el texto.
 */
import { PALETA_MARCA, type Paleta } from "@/modulos/rotlinea/hoja";
import { BORDE, FONDO, GRIS, MARGEN, HUECO, SUAVE, cabecera, envolver, espaciado, letra, pie, recortar, type Ctx } from "@/modulos/foto";
import { HORARIO_TURNO, diaLargo, ddmm, type Cierre, type Cuenta, type TurnoCierre } from "./cierre";

const W = 1800, S = 2;
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const rgb = (c: readonly number[]) => `rgb(${c.join(",")})`;

type Extra = {
  paleta?: Paleta; logo?: CanvasImageSource | null; generado?: Date;
  titulo: string; ojo: string; periodo: string; filtros: string;
};

function lienzo(alto: number) {
  const c = document.createElement("canvas");
  c.width = W * S; c.height = Math.round(alto * S);
  const ctx = c.getContext("2d")!;
  ctx.scale(S, S);
  ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO; ctx.fillRect(0, 0, W, alto);
  return { c, ctx };
}

const chipsDe = (x: Extra) => [x.ojo, ...(x.filtros ? [x.filtros] : [])];

/** El nombre del archivo, con el día. */
export const nombreFotoCierre = (c: Cierre, parte: "dashboard" | "fotos") =>
  `cierre-roturas-${c.desde || "sin-datos"}${c.hasta && c.hasta !== c.desde ? "-a-" + c.hasta : ""}-${parte === "dashboard" ? "dashboard" : "fotos"}.png`;

/* ===================================================================== DASHBOARD */
const M = MARGEN, G = HUECO;

function panel(ctx: Ctx, x: number, y: number, w: number, h: number, P: Paleta) {
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = BORDE; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  void P;
}
function titulo(ctx: Ctx, t: string, nota: string, y: number, P: Paleta) {
  ctx.fillStyle = rgb(P.acento); ctx.fillRect(M, y - 5, 8, 10);
  letra(ctx, 800, 16); ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "left";
  espaciado(ctx, t.toUpperCase(), M + 18, y);
  letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(nota, W - M, y);
}
/** La cinta de reportadas / encontradas / sin origen. */
function cinta(ctx: Ctx, x: number, y: number, w: number, h: number, a: number, b: number, c: number, P: Paleta) {
  const t = a + b + c;
  ctx.fillStyle = SUAVE; ctx.fillRect(x, y, w, h);
  if (t <= 0) return;
  let cx = x;
  for (const [v, col] of [[a, rgb(P.tinta)], [b, rgb(P.acento)], [c, "#C8102E"]] as [number, string][]) {
    if (v <= 0) continue;
    const ww = (v / t) * w; ctx.fillStyle = col; ctx.fillRect(cx, y, ww, h); cx += ww;
  }
}

function tarjetaTurno(ctx: Ctx, x: number, y: number, w: number, h: number, t: TurnoCierre, varios: boolean, P: Paleta) {
  panel(ctx, x, y, w, h, P);
  ctx.fillStyle = rgb(P.tinta); ctx.fillRect(x, y, w, 4);
  // letra del turno
  ctx.fillStyle = rgb(P.tinta); ctx.fillRect(x + 16, y + 18, 46, 46);
  letra(ctx, 900, 28); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.fillText(t.turno, x + 39, y + 42);
  letra(ctx, 800, 20); ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "left"; ctx.fillText(`Turno ${t.turno}`, x + 76, y + 31);
  letra(ctx, 500, 14); ctx.fillStyle = GRIS;
  ctx.fillText(`${HORARIO_TURNO[t.turno]}${varios ? " · " + diaLargo(t.dia) : ""}`, x + 76, y + 54);
  // cifras
  const cols: [string, number][] = [["REGISTROS", t.registros], ["REPORTADAS", t.reportadas], ["ENCONTRADAS", t.encontradas]];
  if (t.sinOrigen > 0) cols.push(["SIN ORIGEN", t.sinOrigen]);
  const cw = (w - 32) / cols.length;
  cols.forEach(([k, v], i) => {
    const cx = x + 16 + i * cw;
    letra(ctx, 800, 11.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; espaciado(ctx, k, cx, y + 86, 1);
    letra(ctx, 900, 34); ctx.fillStyle = rgb(P.tinta); ctx.fillText(String(v), cx, y + 114);
  });
  cinta(ctx, x + 16, y + 136, w - 32, 8, t.reportadas, t.encontradas, t.sinOrigen, P);
  letra(ctx, 700, 15); ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "left";
  ctx.fillText(`${nf.format(t.rotas)} rotas${t.contaminadas > 0 ? " · " + nf.format(t.contaminadas) + " contaminadas" : ""}`, x + 16, y + 164);
  letra(ctx, 500, 13.5); ctx.fillStyle = GRIS;
  ctx.fillText(`A cobro ${t.aCobro} · espera al OL ${t.esperanOL} · en desacuerdo ${t.desacuerdo}`, x + 16, y + 188);
}

function lista(ctx: Ctx, x: number, y: number, w: number, nombre: string, nota: string, filas: Cuenta[], total: number, P: Paleta) {
  const FILA = 34, tope = filas.slice(0, 8), h = 56 + 22 + Math.max(1, tope.length) * FILA + (filas.length > 8 ? 26 : 0) + 10;
  panel(ctx, x, y, w, h, P);
  letra(ctx, 800, 16); ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "left"; ctx.fillText(nombre, x + 16, y + 24);
  letra(ctx, 500, 13); ctx.fillStyle = GRIS; ctx.textAlign = "right"; ctx.fillText(nota, x + w - 16, y + 24);
  // cabecera de columnas
  const cReg = x + w - 150, cRot = x + w - 88, cCon = x + w - 16;
  letra(ctx, 800, 11); ctx.fillStyle = GRIS; ctx.textAlign = "right";
  ctx.fillText("REG.", cReg, y + 56); ctx.fillText("ROTAS", cRot, y + 56); ctx.fillText("CONTAM.", cCon, y + 56);
  ctx.fillStyle = BORDE; ctx.fillRect(x + 16, y + 66, w - 32, 1);
  if (!tope.length) { letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText("Sin registros.", x + 16, y + 92) }
  tope.forEach((f, i) => {
    const cy = y + 66 + 18 + i * FILA;
    letra(ctx, 600, 14.5); ctx.fillStyle = f.nombre === "Sin dato" ? GRIS : rgb(P.tinta); ctx.textAlign = "left";
    ctx.fillText(recortar(ctx, f.nombre, w - 190), x + 16, cy - 4);
    ctx.fillStyle = SUAVE; ctx.fillRect(x + 16, cy + 9, w - 190, 5);
    ctx.fillStyle = rgb(P.acento); ctx.fillRect(x + 16, cy + 9, (total > 0 ? f.n / total : 0) * (w - 190), 5);
    letra(ctx, 800, 15); ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "right"; ctx.fillText(String(f.n), cReg, cy);
    letra(ctx, 500, 15); ctx.fillText(nf.format(f.rotas), cRot, cy);
    ctx.fillText(f.contaminadas ? nf.format(f.contaminadas) : "—", cCon, cy);
  });
  if (filas.length > 8) { letra(ctx, 500, 13); ctx.fillStyle = GRIS; ctx.textAlign = "left"; ctx.fillText(`y ${filas.length - 8} más`, x + 16, y + h - 20) }
  return h;
}

export function dibujarDashboardCierre(c: Cierre, x: Extra): HTMLCanvasElement {
  const P = x.paleta ?? PALETA_MARCA, t = c.total;
  const turnos = c.turnos.filter((q) => q.registros > 0);
  const varios = c.dias > 1 || c.desde !== c.hasta;
  const porFila = 3, anchoT = (W - 2 * M - (porFila - 1) * G) / porFila, altoT = 206;
  const filasT = turnos.length > 1 ? Math.ceil(turnos.length / porFila) : 0;
  const altoListas = 56 + 22 + 8 * 34 + 26 + 10; // tope de la lista más alta
  // alto: cabecera 106 + hero 168 + turnos + listas + pie
  const H = 106 + 168 + G + (filasT ? 40 + filasT * (altoT + G) : 0) + (t.registros > 0 ? 40 + altoListas : 0) + 56;
  const { c: cv, ctx } = lienzo(H);

  cabecera(ctx, W, chipsDe(x), P, x.logo, x.titulo, `Roturas en sitio · ${x.periodo}`);

  // ---- la franja: registros, reportadas, encontradas, la cinta y las fases
  const y0 = 106;
  panel(ctx, M, y0, W - 2 * M, 168, P);
  ctx.fillStyle = rgb(P.acento); ctx.fillRect(M, y0, 8, 168);
  letra(ctx, 800, 13); ctx.fillStyle = GRIS; ctx.textAlign = "left"; espaciado(ctx, "REGISTROS", M + 32, y0 + 28, 1.2);
  letra(ctx, 900, 78); ctx.fillStyle = rgb(P.tinta); ctx.fillText(String(t.registros), M + 32, y0 + 88);
  letra(ctx, 500, 15); ctx.fillStyle = GRIS;
  ctx.fillText(`${nf.format(t.rotas)} rotas${t.contaminadas > 0 ? " y " + nf.format(t.contaminadas) + " contaminadas" : ""}`, M + 32, y0 + 144);
  const xr = M + 420, wr = W - 2 * M - 420 - 32;
  const mini: [string, number, string][] = [["REPORTADAS", t.reportadas, "por un OPM con su PIN"], ["ENCONTRADAS", t.encontradas, "sin dueño · van a cobro"]];
  if (t.sinOrigen > 0) mini.push(["SIN ORIGEN", t.sinOrigen, "hay que completarlas"]);
  mini.forEach(([k, v, n], i) => {
    const mx = xr + i * 300;
    letra(ctx, 800, 12.5); ctx.fillStyle = GRIS; ctx.textAlign = "left"; espaciado(ctx, k, mx, y0 + 28, 1.1);
    letra(ctx, 900, 52); ctx.fillStyle = rgb(P.tinta); ctx.fillText(String(v), mx, y0 + 70);
    letra(ctx, 500, 14); ctx.fillStyle = GRIS; ctx.fillText(n, mx, y0 + 104);
  });
  cinta(ctx, xr, y0 + 120, wr, 12, t.reportadas, t.encontradas, t.sinOrigen, P);
  letra(ctx, 500, 14.5); ctx.fillStyle = GRIS; ctx.textAlign = "left";
  ctx.fillText(`a cobro ${t.aCobro} · espera al OL ${t.esperanOL} · en desacuerdo ${t.desacuerdo}${t.anuladas > 0 ? " · anuladas " + t.anuladas : ""}`, xr, y0 + 150);

  let y = y0 + 168 + G;
  // ---- por turno (solo los que tuvieron registros; con un solo turno la franja ya lo dice)
  if (filasT) {
    titulo(ctx, "Por turno", `${turnos.length} turnos · el C abre el día`, y + 18, P);
    y += 40;
    turnos.forEach((q, i) => tarjetaTurno(ctx, M + (i % porFila) * (anchoT + G), y + Math.floor(i / porFila) * (altoT + G), anchoT, altoT, q, varios, P));
    y += filasT * (altoT + G);
  }
  // ---- a qué corresponde
  if (t.registros > 0) {
    titulo(ctx, "A qué corresponde", "todo lo del cierre, junto", y + 18, P);
    y += 40;
    const wl = (W - 2 * M - 3 * G) / 4;
    lista(ctx, M, y, wl, "Por causa", "qué la rompió", t.porCausa, t.registros, P);
    lista(ctx, M + (wl + G), y, wl, "Por proceso", "dónde pasó", t.porProceso, t.registros, P);
    lista(ctx, M + 2 * (wl + G), y, wl, "Por área", "en qué zona", t.porArea, t.registros, P);
    lista(ctx, M + 3 * (wl + G), y, wl, "Quién registró", "en la app", t.porQuien, t.registros, P);
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

/** Cuántas fotos caben en la imagen: más serían una imagen de 10 000 puntos de alto que no se puede pegar en ningún lado. */
export const TOPE_FOTOS = 24;

export function dibujarFotosCierre(c: Cierre, fotos: FotoRotura[], x: Extra): HTMLCanvasElement {
  const P = x.paleta ?? PALETA_MARCA;
  const varios = c.dias > 1 || c.desde !== c.hasta;
  const lista = fotos.slice(0, TOPE_FOTOS), resto = fotos.length - lista.length;
  const cols = 3, cw = (W - 2 * M - (cols - 1) * G) / cols, foto = 330, pieAlto = 96, ch = foto + pieAlto;
  const filas = Math.ceil(lista.length / cols);
  const H = 106 + 40 + (lista.length ? filas * (ch + G) : 90) + (resto > 0 ? 34 : 0) + 56;
  const { c: cv, ctx } = lienzo(H);

  cabecera(ctx, W, chipsDe(x), P, x.logo, x.titulo, `Fotos del reporte · ${x.periodo}`);
  titulo(ctx, "Fotos del reporte", `${fotos.length} rotura${fotos.length === 1 ? "" : "s"} con foto`, 106 + 14, P);

  if (!lista.length) {
    letra(ctx, 500, 18); ctx.fillStyle = GRIS; ctx.textAlign = "center";
    ctx.fillText("Ninguna rotura de este cierre tiene foto.", W / 2, 106 + 40 + 40);
  }
  lista.forEach((f, i) => {
    const px = M + (i % cols) * (cw + G), py = 106 + 40 + Math.floor(i / cols) * (ch + G);
    panel(ctx, px, py, cw, ch, P);
    // la foto, recortada para llenar el cuadro (sin deformarla)
    ctx.save(); ctx.beginPath(); ctx.rect(px + 1, py + 1, cw - 2, foto - 1); ctx.clip();
    if (f.imagen) {
      const r = Math.max(cw / f.imagen.width, foto / f.imagen.height), dw = f.imagen.width * r, dh = f.imagen.height * r;
      ctx.drawImage(f.imagen, px + (cw - dw) / 2, py + (foto - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = SUAVE; ctx.fillRect(px, py, cw, foto);
      letra(ctx, 600, 16); ctx.fillStyle = GRIS; ctx.textAlign = "center";
      ctx.fillText(f.tieneFoto ? "La foto no se pudo traer" : "Sin foto", px + cw / 2, py + foto / 2);
    }
    ctx.restore();
    // el código y el turno sobre la foto
    ctx.fillStyle = rgb(P.tinta); ctx.fillRect(px, py, 120, 30);
    letra(ctx, 800, 16); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left"; ctx.fillText(f.codigo, px + 10, py + 16);
    ctx.fillStyle = rgb(P.acento); ctx.fillRect(px + 120, py, 38, 30);
    ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "center"; ctx.fillText(f.turno, px + 139, py + 16);
    // el pie de la tarjeta: hora, qué se rompió y por qué
    const tx = px + 14, ancho = cw - 28;
    letra(ctx, 800, 15.5); ctx.fillStyle = rgb(P.tinta); ctx.textAlign = "left";
    ctx.fillText(recortar(ctx, `${varios ? ddmm(f.dia) + " · " : ""}${f.hora} · ${f.material}`, ancho), tx, py + foto + 20);
    letra(ctx, 700, 14.5);
    ctx.fillText(`${nf.format(f.rotas)} rotas${!f.eer && f.contaminadas ? " · " + nf.format(f.contaminadas) + " contaminadas" : ""}`, tx, py + foto + 44);
    letra(ctx, 500, 13.5); ctx.fillStyle = GRIS;
    const causa = [f.causa, f.proceso, f.area].filter(Boolean).join(" · ") || "Sin dato";
    const ls = envolver(ctx, causa, ancho).slice(0, 2);
    ls.forEach((l, k) => ctx.fillText(l, tx, py + foto + 66 + k * 18));
  });
  if (resto > 0) {
    letra(ctx, 600, 14); ctx.fillStyle = GRIS; ctx.textAlign = "left";
    ctx.fillText(`y ${resto} más con foto (están en el detalle de cada rotura)`, M, H - 56 + 8);
  }
  pie(ctx, W, H, x.generado ?? new Date(), x.periodo);
  return cv;
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
