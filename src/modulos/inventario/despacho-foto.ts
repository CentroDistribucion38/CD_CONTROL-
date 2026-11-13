/**
 * EL DESPACHO FIFO, EN IMAGEN — «Filtro por estado y descargar en imagen», «que la imagen se copie así como todo lo
 * que tenemos, brutal», como el Cierre del día de Traspasos.
 *
 * Mismo reparto que la foto del cierre (traspasos/foto.ts):
 *   armarFotoDespacho()  junta lo que la imagen enseña (función pura: entra el plan, salen renglones de texto).
 *   dibujarFotoDespacho() lo pinta en un canvas a 1080 de ancho y al doble de resolución.
 * La banda negra con las rayas y el sello, la franja del acento con las cifras grandes, y un bloque por material
 * con las posiciones en el orden en que se sacan. Se entrega con `entregarFoto` (compartir / copiar / bajar).
 */
import { textoCajas } from "./unidades";

export type ColoresDespacho = { tinta: string; acento: string; sobre: string };

export type FilaFoto = { n: number; ubicacion: string; zona: string; estado: string | null; estibas: number; cajas: number; fechaFifo: string | null; dias: number | null };
export type BloqueFoto = { codigo: string; material: string; color: string; filas: FilaFoto[]; cajas: number; estibas: number; total: number; restoModulos: number; restoCajas: number };
export type DatosFotoDespacho = {
  dia: string; zona: string; estado: string; tope: number; hecha: string;
  posiciones: number; cajas: number; estibas: number;
  masViejo: { dias: number; ubicacion: string } | null;
  bloques: BloqueFoto[];
};

const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const larga = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const corta = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}` : "—");

/* ---------- LA PINTURA ---------- */
const ANCHO = 1080, M = 44;
const BANDA = 196, HERO = 236, CAB_BLOQUE = 104, CAB_TABLA = 40, FILA = 52, TOTAL = 50, RESTO = 40, ENTRE = 28, PIE = 96;
const hx = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (h: string, a: number) => `rgba(${hx(h).join(",")},${a})`;
const claro = (h: string, t: number) => "#" + hx(h).map((c) => Math.round(255 - (255 - c) * t).toString(16).padStart(2, "0")).join("");
const VERDE = "#0F7A4A", AMBAR = "#FFC000", MOSTAZA = "#C08A16", ROJO = "#E4002B";
const tonoDias = (d: number | null) => (d == null ? null : d > 60 ? ROJO : d > 30 ? MOSTAZA : d > 15 ? AMBAR : VERDE);

const cargar = (src: string) => new Promise<HTMLImageElement | null>((ok) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src;
});

export function altoFotoDespacho(d: DatosFotoDespacho) {
  return BANDA + HERO + 20
    + d.bloques.reduce((t, b) => t + CAB_BLOQUE + (b.filas.length ? CAB_TABLA + b.filas.length * FILA + TOTAL : 56) + (b.restoModulos ? RESTO : 0) + ENTRE, 0)
    + PIE;
}

export async function dibujarFotoDespacho(d: DatosFotoDespacho, c: ColoresDespacho): Promise<Blob> {
  const ALTO = altoFotoDespacho(d), E = 2;
  const cv = document.createElement("canvas");
  cv.width = ANCHO * E; cv.height = ALTO * E;
  const g = cv.getContext("2d")!; g.scale(E, E);

  const tinta = "#" + c.tinta, acento = "#" + c.acento, sobre = "#" + c.sobre;
  const gris = claro(c.tinta, 0.58), linea = claro(c.tinta, 0.14);
  const sans = "Archivo, 'IBM Plex Sans', system-ui, sans-serif";
  const cuerpo = "'IBM Plex Sans', system-ui, sans-serif";
  const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
  const esp = (px: number) => { (g as unknown as { letterSpacing: string }).letterSpacing = `${px}px` };
  const t = (txt: string, x: number, y: number, font: string, color: string, al: CanvasTextAlign = "left", ls = 0) => {
    g.font = font; g.fillStyle = color; g.textAlign = al; esp(ls); g.fillText(txt, x, y); esp(0);
  };
  const caja = (x: number, y: number, w: number, h: number, relleno: string) => { g.fillStyle = relleno; g.fillRect(x, y, w, h) };
  /** La letra más grande que cabe en ese ancho. */
  const cabe = (txt: string, peso: number, tam: number, fam: string, ancho: number, ls = 0) => {
    let z = tam;
    for (; z > 10; z--) { g.font = `${peso} ${z}px ${fam}`; esp(ls); const w = g.measureText(txt).width; esp(0); if (w <= ancho) break }
    return `${peso} ${z}px ${fam}`;
  };

  caja(0, 0, ANCHO, ALTO, "#fff");

  /* ---------- 1 · LA BANDA NEGRA (la misma del cierre) ---------- */
  caja(0, 0, ANCHO, BANDA, tinta);
  g.save(); g.beginPath(); g.rect(0, 0, ANCHO, BANDA); g.clip();
  g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 2;
  for (let x = -220; x < ANCHO + 220; x += 20) { g.beginPath(); g.moveTo(x, BANDA); g.lineTo(x + 110, 0); g.stroke() }
  g.restore();
  const sello = await cargar("/marca/logo-b.png");
  if (sello) g.drawImage(sello, M, 52, 62, 62);
  const xT = M + (sello ? 82 : 0);
  t(`DESPACHO FIFO · CONTEO DEL ${larga(d.dia)}`, xT, 66, `700 17px ${sans}`, acento, "left", 2.6);
  t("FIFO", xT, 112, `900 44px ${sans}`, "#fff", "left", -0.8);
  const filtros = [d.zona || "Todas las zonas", d.estado ? `Estado ${d.estado}` : "Todos los estados", d.tope ? `las ${d.tope} posiciones más antiguas` : "todas las posiciones"].join(" · ");
  t(filtros, xT, 146, cabe(filtros, 500, 20, cuerpo, ANCHO - xT - M), "#9A9A95");

  /* ---------- 2 · LA FRANJA DEL ACENTO: cuatro cifras grandes ---------- */
  const yH = BANDA;
  caja(0, yH, ANCHO, HERO, acento);
  g.save(); g.beginPath(); g.rect(0, yH, ANCHO, HERO); g.clip();
  g.beginPath(); g.moveTo(ANCHO - 250, yH); g.lineTo(ANCHO, yH); g.lineTo(ANCHO, yH + HERO); g.lineTo(ANCHO - 170, yH + HERO); g.closePath();
  g.fillStyle = rgba(c.sobre, 0.08); g.fill(); g.restore();
  const cifras: { rot: string; val: string; bajo: string; mal?: boolean }[] = [
    { rot: "POSICIONES", val: nf0.format(d.posiciones), bajo: `${d.bloques.length} material${d.bloques.length === 1 ? "" : "es"}` },
    { rot: "CAJAS", val: textoCajas(d.cajas), bajo: "en esas posiciones" },
    { rot: "ESTIBAS", val: nf1.format(d.estibas), bajo: "a mover" },
    { rot: "MÁS VIEJO", val: d.masViejo ? `${nf0.format(d.masViejo.dias)} d` : "—", bajo: d.masViejo ? d.masViejo.ubicacion : "sin fecha FIFO", mal: (d.masViejo?.dias ?? 0) > 30 },
  ];
  const wC = (ANCHO - M * 2) / cifras.length;
  cifras.forEach((x, i) => {
    const xx = M + i * wC;
    caja(xx, yH + 44, 7, 140, sobre);
    t(x.rot, xx + 26, yH + 72, cabe(x.rot, 700, 16, sans, wC - 40, 2.2), sobre, "left", 2.2);
    t(x.val, xx + 26, yH + 146, cabe(x.val, 900, 64, sans, wC - 40, -2), x.mal ? "#A4102A" : sobre, "left", -2);
    t(x.bajo, xx + 26, yH + 180, cabe(x.bajo, 600, 18, cuerpo, wC - 40), rgba(c.sobre, 0.8));
  });

  /* ---------- 3 · UN BLOQUE POR MATERIAL ---------- */
  /* Las columnas, medidas: cada número a la derecha de su columna y nada se pisa. */
  const X = {
    n: M + 20, mod: M + 52, zona: M + 250, est: M + 384,
    estib: M + 596, cajas: M + 712, fecha: M + 736, dias: ANCHO - M - 108, barra: ANCHO - M - 96,
  };
  let y = yH + HERO + 20;
  for (const b of d.bloques) {
    /* Cabecera del material: su color a la izquierda, código, nombre y lo que suma. */
    caja(M, y, ANCHO - M * 2, CAB_BLOQUE - 12, claro(c.acento, 0.12));
    caja(M, y, 10, CAB_BLOQUE - 12, b.color);
    t(b.codigo, M + 28, y + 34, `700 17px ${mono}`, gris);
    const res = `${nf0.format(b.filas.length)} de ${nf0.format(b.total)} posiciones · ${textoCajas(b.cajas)} cajas · ${nf1.format(b.estibas)} est.`;
    t(res, ANCHO - M - 18, y + 34, `700 17px ${cuerpo}`, tinta, "right");
    t(b.material, M + 28, y + 70, cabe(b.material, 900, 28, sans, ANCHO - M * 2 - 46), tinta, "left", -0.4);
    y += CAB_BLOQUE;

    if (!b.filas.length) {
      t("No hay existencia con estos filtros.", M + 28, y + 30, `500 18px ${cuerpo}`, gris);
      y += 56;
    } else {
      /* Encabezado de la tabla. */
      caja(M, y, ANCHO - M * 2, CAB_TABLA, tinta);
      const th = (txt: string, x: number, al: CanvasTextAlign = "left") => t(txt, x, y + 26, `700 13px ${sans}`, "#fff", al, 1.4);
      th("#", X.n + 2, "center"); th("MÓDULO", X.mod); th("ZONA", X.zona); th("ESTADO", X.est);
      th("ESTIBAS", X.estib, "right"); th("CAJAS", X.cajas, "right"); th("FECHA FIFO", X.fecha); th("DÍAS EN SITIO", ANCHO - M - 10, "right");
      y += CAB_TABLA;
      const maxDias = Math.max(1, ...b.filas.map((f) => f.dias ?? 0));
      b.filas.forEach((f, i) => {
        const yy = y + i * FILA;
        if (i % 2 === 1) caja(M, yy, ANCHO - M * 2, FILA, "#FAFBFC");
        /* El número de salida: el #1 en amarillo con su anillo, como en la pantalla. */
        g.beginPath(); g.arc(X.n + 2, yy + FILA / 2, 16, 0, Math.PI * 2);
        g.fillStyle = f.n === 1 ? AMBAR : "#EEF1F5"; g.fill();
        if (f.n === 1) { g.lineWidth = 3; g.strokeStyle = tinta; g.stroke() }
        t(String(f.n), X.n + 2, yy + FILA / 2 + 6, `800 16px ${sans}`, tinta, "center");
        t(f.ubicacion, X.mod, yy + 33, cabe(f.ubicacion, 700, 21, mono, X.zona - X.mod - 12), tinta);
        t(f.zona, X.zona, yy + 33, cabe(f.zona, 500, 18, cuerpo, X.est - X.zona - 12), tinta);
        if (f.estado) {
          const fnt = cabe(f.estado, 600, 15, cuerpo, X.estib - X.est - 90);
          g.font = fnt; const w = g.measureText(f.estado).width + 16;
          caja(X.est, yy + 14, w, 26, "#EEF1F5");
          t(f.estado, X.est + 8, yy + 32, fnt, tinta);
        } else t("—", X.est, yy + 33, `500 18px ${cuerpo}`, gris);
        t(nf1.format(f.estibas), X.estib, yy + 33, `500 19px ${cuerpo}`, tinta, "right");
        t(textoCajas(f.cajas), X.cajas, yy + 33, `800 20px ${sans}`, tinta, "right");
        t(corta(f.fechaFifo), X.fecha, yy + 33, `500 17px ${cuerpo}`, tinta);
        const col = tonoDias(f.dias);
        t(f.dias == null ? "—" : `${nf0.format(f.dias)} d`, X.dias, yy + 33, `800 18px ${sans}`, col === ROJO ? "#A4102A" : col === MOSTAZA ? "#8A5A00" : tinta, "right");
        caja(X.barra, yy + 22, 96, 10, "#F1F3F6");
        if (f.dias != null && col) caja(X.barra, yy + 22, Math.max(4, Math.round((96 * f.dias) / maxDias)), 10, col);
        caja(M, yy + FILA - 1, ANCHO - M * 2, 1, linea);
      });
      y += b.filas.length * FILA;
      /* El total del material. */
      caja(M, y, ANCHO - M * 2, TOTAL, "#FFF3CC");
      caja(M, y, ANCHO - M * 2, 2, tinta);
      t(`TOTAL · ${b.codigo} · ${nf0.format(b.filas.length)} posiciones`, X.n - 14, y + 32, `800 16px ${sans}`, tinta, "left", 0.6);
      t(nf1.format(b.estibas), X.estib, y + 32, `800 18px ${sans}`, tinta, "right");
      t(textoCajas(b.cajas), X.cajas, y + 32, `900 20px ${sans}`, tinta, "right");
      y += TOTAL;
    }
    if (b.restoModulos) {
      caja(M, y, ANCHO - M * 2, RESTO, "#F1F3F6");
      t(`Quedan ${nf0.format(b.restoModulos)} posiciones más recientes · ${textoCajas(b.restoCajas)} cajas que no se tocan en este plan`, M + 14, y + 26, `500 15px ${cuerpo}`, gris);
      y += RESTO;
    }
    y += ENTRE;
  }

  /* ---------- 4 · EL PIE ---------- */
  caja(0, y, ANCHO, ALTO - y, claro(c.tinta, 0.04));
  caja(0, y, ANCHO, 1, linea);
  t("Salida #1 = el que más tiempo lleva en su módulo (fecha FIFO más vieja). Se toma en ese orden.", M, y + 40, `500 17px ${cuerpo}`, gris);
  /* La leyenda de los días, con sus colores. */
  let xl = M;
  for (const [txt, col] of [["0–15 d", VERDE], ["16–30", AMBAR], ["31–60", MOSTAZA], ["+60 días", ROJO]] as const) {
    caja(xl, y + 58, 14, 14, col);
    t(txt, xl + 20, y + 71, `600 15px ${cuerpo}`, gris);
    g.font = `600 15px ${cuerpo}`; xl += 20 + g.measureText(txt).width + 22;
  }
  t(`CD38 · CONTROL · ${d.hecha}`, ANCHO - M, y + 71, `600 15px ${cuerpo}`, gris, "right");

  return new Promise((ok, mal) => cv.toBlob((x) => (x ? ok(x) : mal(new Error("sin imagen"))), "image/png"));
}

/** Baja la imagen como archivo (el botón «Descargar»), sin pasar por compartir ni el portapapeles. */
export function bajarPng(b: Blob, nombre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
