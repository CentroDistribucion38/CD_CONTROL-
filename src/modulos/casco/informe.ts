/**
 * EL INFORME DEL CASCO DE VIDRIO — PDF (y la gráfica que comparte con el Word).
 *
 * «Quiero generar el informe con todo lo que está y cómo está cada almacén: AG22, AG18, AG07,
 *  todo. PDF y Word, con la gráfica y todo bien presentable.»
 * «Que muestre lo que tiene inventario: los 0 no me interesan.»
 *
 * MISMO DISEÑO QUE LOS DEMÁS INFORMES. La paleta, la cinta del degradado, el sello de agua y la
 * cabecera salen de `@/modulos/rotlinea/hoja`, igual que el de salida de vidrio: A4 vertical,
 * márgenes de 14 mm, banda oscura del total, tablas de cabecera oscura y pie con la página.
 *
 * NO CALCULA NADA. La pantalla arma `DatosInformeCasco` con las mismas funciones de `serie.ts`
 * que pintan el tablero: si una cifra está mal, está mal en los dos lados — que es la única
 * forma de que se note.
 *
 * LA GRÁFICA ES UNA SOLA. Se pinta una vez en un lienzo (`pintarGrafica`) a 3× y ese PNG va al
 * PDF y al Word: dos dibujos de la misma gráfica se separan la primera vez que alguien toque uno.
 */
import type { jsPDF as JsPDF } from "jspdf";
import { PALETA_MARCA, type Marca, type Paleta } from "@/modulos/rotlinea/hoja";
import type { DiaSerie } from "./serie";

type RGB = [number, number, number];

/* LOS COLORES DE CADA ALMACÉN son los del tablero (tablero.css, la gama ámbar de tu gráfica). */
export const COLOR_SITIO: Record<string, { fondo: string; tinta: string }> = {
  "BODEGA 38": { fondo: "#B58200", tinta: "#FFFFFF" },
  FABRICA: { fondo: "#FFC300", tinta: "#1B1B1B" },
  CARNAVAL: { fondo: "#FFDCA3", tinta: "#1B1B1B" },
  "CARNAVAL PALMAR": { fondo: "#3B3B3B", tinta: "#FFFFFF" },
};
export const colorSitio = (k: string) => COLOR_SITIO[k] ?? { fondo: "#999999", tinta: "#FFFFFF" };

/* EL ORDEN DE LOS ALMACENES EN EL INFORME: «Carnaval, Bodega, Fábrica y Atlántico». Manda en las
   tarjetas, en las secciones, en las columnas de las tablas y en la leyenda de la gráfica. */
export const ORDEN_INFORME = ["CARNAVAL", "BODEGA 38", "FABRICA", "CARNAVAL PALMAR"];
export const enOrdenInforme = (a: string, b: string) => {
  const i = (k: string) => { const n = ORDEN_INFORME.indexOf(k); return n < 0 ? 99 : n };
  return i(a) - i(b);
};

export type FilaInformeCasco = {
  sku: string; nombre: string;
  inventario: number; baja: number; hl: number;
  puesto: string | null; calidad: string | null;
};

export type SitioInforme = {
  clave: string;
  /** «AG22» */
  centro: string;
  /** «AG22 EER Barranquilla» */
  nombre: string;
  /** «Extrasucio con baja», «Lavado con baja», o null si ese almacén no lleva baja. */
  rotuloBaja: string | null;
  fecha: string | null;
  total: number; estibas: number;
  /** Viajes SERPRO de ESTE almacén: sus estibas del último conteo ÷ 36 (Fábrica, Bodega) o ÷ 100 (Carnaval y los demás). */
  viajes: number;
  anterior: { fecha: string; total: number } | null;
  filas: FilaInformeCasco[];
};

export type DatosInformeCasco = {
  /** Día en que se genera (AAAA-MM-DD): cabecera y nombre del archivo. */
  hoy: string;
  /** El último día con registros en el periodo. */
  corte: string;
  /** «del 10 de septiembre al 8 de octubre» */
  periodo: string;
  /** Los filtros puestos, en palabras. Vacío = ninguno. */
  filtros: string;
  /** HL del último día (la barra de la derecha de la gráfica) y contra el día anterior. */
  total: number;
  anterior: { fecha: string; total: number } | null;
  pico: { fecha: string; total: number } | null;
  /** Viajes SERPRO como los dice el tablero (la suma de los viajes de cada almacén). */
  viajes: number;
  sitios: SitioInforme[];
  /** Los sitios visibles, en el orden de la gráfica (de abajo hacia arriba). */
  claves: string[];
  serie: DiaSerie[];
  /** «POR MATERIAL» del tablero: el día escogido allá, material × almacén. Solo lo que tiene algo. */
  porMaterial?: { fecha: string; filas: FilaPorMaterial[] };
};

export type FilaPorMaterial = { sku: string; nombre: string; porSitio: Record<string, number>; estibas: number; total: number };

/** Las columnas de «Por material»: código, material, un almacén por columna, estibas y total. */
export function columnasPorMaterial(d: DatosInformeCasco, ancho = 182) {
  const cod = 19, sitio = 21, est = 17, tot = 20;
  const mat = Math.max(36, ancho - cod - d.claves.length * sitio - est - tot);
  return { cod, mat, sitio, est, tot };
}
/** 0 o sin registro se escriben «—»: un cero en una celda se lee como dato y aquí no lo es. */
export const hlCelda = (v: number | undefined) => (v == null || Math.abs(v) < 0.5 ? "—" : nf0.format(v));

export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const corta = (iso: string) => `${Number(iso.slice(8, 10))}-${MESES[Number(iso.slice(5, 7)) - 1]}`;
/** «jueves 8 de octubre de 2026» — sin `toLocaleDateString`, que en el servidor y en el arnés cambia. */
export const larga = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return `${DIAS_L[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_L[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};
export const media = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES_L[Number(iso.slice(5, 7)) - 1]}`;

const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
export const fmt = { hl: (v: number) => nf1.format(v), hl0: (v: number) => nf0.format(v), est: (v: number) => nf2.format(v), viajes: (v: number) => nf1.format(v) };
/** El signo con guion ASCII: la helvetica de jsPDF no tiene «−» (U+2212) y lo pinta como comilla. */
export const conSigno = (v: number, f: (n: number) => string = fmt.hl0) => (v > 0 ? "+" : v < 0 ? "-" : "") + f(Math.abs(v));

export const nombreInformeCasco = (hoy: string, ext: "pdf" | "docx") => `casco-de-vidrio-${hoy}.${ext}`;

const hexRGB = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const rgbHex = (c: RGB) => c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

/* =====================================================================
   LA GRÁFICA — barras apiladas por día, una por almacén, como el tablero.
   ===================================================================== */
export const GRAFICA = { ancho: 182, alto: 82 } as const;   // mm en el papel; el lienzo va a 12 px/mm

export function pintarGrafica(ctx: CanvasRenderingContext2D, d: DatosInformeCasco, tinta: RGB = PALETA_MARCA.tinta) {
  const K = 12;                                  // px por mm
  const W = GRAFICA.ancho * K, H = GRAFICA.alto * K;
  const ML = 15 * K, MR = 2 * K, MT = 7 * K, MB = 9 * K;
  const s = d.serie, n = s.length;
  const max = Math.max(1, ...s.map((x) => x.total));
  /* El mismo «tope redondo» del tablero. */
  const crudo = max / 5, mag = Math.pow(10, Math.floor(Math.log10(crudo))), f = crudo / mag;
  const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const tope = Math.ceil(max / paso) * paso;
  const y = (v: number) => MT + (H - MT - MB) * (1 - v / tope);
  const T = `rgb(${tinta.join(",")})`;

  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "middle";
  const letra = (peso: number, mm: number) => { ctx.font = `${peso} ${Math.round(mm * K)}px Helvetica, Arial, sans-serif` };

  for (let v = 0; v <= tope + paso / 1000; v += paso) {
    ctx.strokeStyle = v === 0 ? "#9AA5B1" : "#E3E8EE"; ctx.lineWidth = v === 0 ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(ML, Math.round(y(v)) + .5); ctx.lineTo(W - MR, Math.round(y(v)) + .5); ctx.stroke();
    letra(500, 2.6); ctx.fillStyle = "#5F6B79"; ctx.textAlign = "right";
    ctx.fillText(nf0.format(v), ML - 1.5 * K, y(v));
  }
  if (!n) return;

  const PASO = (W - ML - MR) / n;
  const BW = Math.max(3, Math.min(16 * K, PASO * 0.72));

  /* UN SOLO TAMAÑO DE LETRA PARA TODOS LOS NÚMEROS DE UNA CLASE. Achicar cada número hasta que
     quepa dejaba «967» grande al lado de «1.716» diminuto: se veía desordenado. Ahora se mide el
     número MÁS ANCHO y con ese tamaño van todos (los de adentro, los totales y las fechas). */
  const anchoA1mm = (textos: string[], peso: number) => {
    letra(peso, 10); return Math.max(1, ...textos.map((t) => ctx.measureText(t).width)) / 10;
  };
  const tamano = (textos: string[], peso: number, cabe: number, tope: number) =>
    Math.min(tope, Math.floor((cabe / anchoA1mm(textos, peso)) * 10) / 10);

  const segs = s.flatMap((dia) => d.claves.map((k) => dia.porSitio[k] ?? 0).filter((v) => v > 0).map((v) => nf0.format(v)));
  const fSeg = tamano(segs, 700, BW - 0.8 * K, 2.4);
  const fTot = tamano(s.map((x) => nf0.format(x.total)), 800, PASO - 0.5 * K, 2.6);
  let fFec = tamano(s.map((x) => corta(x.fecha)), 500, PASO - 0.5 * K, 2.5);
  /* Las fechas: todas si caben con una letra legible; si no, una de cada tantas, del mismo tamaño. */
  let cadaK = 1;
  if (fFec < 1.9) { fFec = 2.2; cadaK = Math.max(1, Math.ceil((anchoA1mm(s.map((x) => corta(x.fecha)), 500) * fFec + 1.2 * K) / PASO)) }
  /* CON MUCHOS DÍAS la barra es angosta y el número no cabe acostado: entonces va PARADO
     (girado 90°), todos del mismo tamaño. Así con 30 o 60 días se sigue viendo cuánto pone cada
     almacén, que es lo que se pidió. */
  const parado = fSeg < 1.9;
  const fSegP = Math.min(2.2, Math.floor(((BW - 0.5 * K) / K) * 10 / 1.05) / 10);
  const tamSeg = parado ? fSegP : fSeg;
  const conSeg = tamSeg >= 1.5, conTot = fTot >= 1.5;

  s.forEach((dia, i) => {
    const x = ML + i * PASO + (PASO - BW) / 2;
    let base = 0;
    for (const k of d.claves) {
      const v = dia.porSitio[k] ?? 0; if (v <= 0) continue;
      const y1 = y(base + v), y0 = y(base); base += v;
      const c = colorSitio(k);
      ctx.fillStyle = c.fondo;
      /* 2 px de papel entre segmentos: así se separan sin raya. */
      ctx.fillRect(x, y1, BW, Math.max(0, y0 - y1 - 2));
      /* EL VALOR DENTRO DE CADA PEDAZO, como en el tablero, si el pedazo tiene alto para la letra. */
      if (conSeg) {
        const t = nf0.format(v);
        letra(700, tamSeg); ctx.fillStyle = c.tinta; ctx.textAlign = "center";
        if (!parado && y0 - y1 >= tamSeg * K * 1.6) ctx.fillText(t, x + BW / 2, (y0 + y1) / 2);
        else if (parado && y0 - y1 >= ctx.measureText(t).width + 1.2 * K) {
          ctx.save(); ctx.translate(x + BW / 2, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
          ctx.fillText(t, 0, 0); ctx.restore();
        }
      }
    }
    if (conTot) {
      letra(800, fTot); ctx.fillStyle = T; ctx.textAlign = "center";
      ctx.fillText(nf0.format(dia.total), x + BW / 2, y(dia.total) - fTot * K * 0.75);
    }
    /* La fecha: la última siempre y en negrita, sin pisar la de antes. */
    if (i === n - 1 || (i % cadaK === 0 && n - 1 - i >= cadaK * 0.6)) {
      letra(i === n - 1 ? 800 : 500, fFec); ctx.fillStyle = i === n - 1 ? T : "#5F6B79"; ctx.textAlign = "center";
      ctx.fillText(corta(dia.fecha), x + BW / 2, H - MB + 4 * K);
    }
  });
}

/** Crea el lienzo, pinta y devuelve el PNG. Solo en el navegador. */
export function graficaPNG(d: DatosInformeCasco, tinta?: RGB): string {
  const c = document.createElement("canvas");
  c.width = GRAFICA.ancho * 12; c.height = GRAFICA.alto * 12;
  pintarGrafica(c.getContext("2d")!, d, tinta);
  return c.toDataURL("image/png");
}

/* =====================================================================
   LAS COLUMNAS DE LA TABLA DE UN ALMACÉN — las mismas en PDF y Word.
   ===================================================================== */
export type Columna = { id: "cod" | "mat" | "inv" | "baja" | "hl" | "ubi" | "cal"; titulo: string; mm: number; num: boolean };
export function columnasAlmacen(s: SitioInforme, ancho = 182): Columna[] {
  const conBaja = !!s.rotuloBaja || s.filas.some((f) => f.baja !== 0);
  const conUbi = s.filas.some((f) => f.puesto);
  const cols: Columna[] = [
    { id: "cod", titulo: "COD", mm: 19, num: false },
    { id: "mat", titulo: "MATERIAL", mm: 0, num: false },
    { id: "inv", titulo: "ESTIBAS", mm: 17, num: true },
  ];
  if (conBaja) cols.push({ id: "baja", titulo: (s.rotuloBaja ?? "Con baja").toUpperCase(), mm: 25, num: true });
  cols.push({ id: "hl", titulo: "HL", mm: 17, num: true });
  if (conUbi) cols.push({ id: "ubi", titulo: "UBICACIÓN", mm: 27, num: false });
  /* CALIDAD NO VA EN EL INFORME («quita esto»): es una nota de trabajo de la pantalla Control. */
  const resto = ancho - cols.reduce((t, c) => t + c.mm, 0);
  cols[1].mm = Math.max(34, resto);
  return cols;
}
export function celda(c: Columna, f: FilaInformeCasco): string {
  switch (c.id) {
    case "cod": return f.sku;
    case "mat": return f.nombre;
    case "inv": return f.inventario ? fmt.est(f.inventario) : "—";
    case "baja": return f.baja ? fmt.est(f.baja) : "—";
    case "hl": return fmt.hl(f.hl);
    case "ubi": return f.puesto ?? "";
    case "cal": return f.calidad ?? "";
  }
}

/* =====================================================================
   EL PDF
   ===================================================================== */
export function dibujarInformeCasco(
  JsPDFCtor: typeof JsPDF,
  d: DatosInformeCasco,
  extra: { generado: Date; marca?: Marca; paleta?: Paleta; grafica?: string | null },
): JsPDF {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, ANCHO = W - 2 * M;
  const PIE = H - 10, TOPE = PIE - 7;
  let y = M;

  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = P.tinta;
  const TENUE: RGB = TINTA.map((c) => Math.round(255 - (255 - c) * 0.16)) as RGB;
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso: "normal" | "bold", tam: number) => { doc.setFont("helvetica", peso); doc.setFontSize(tam) };
  const marca = extra.marca ?? {};

  const cinta = (x: number, yy: number, ancho: number, alto: number) => {
    const N = Math.max(12, Math.round(ancho / 1.5));
    const paso = ancho / N;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let k = 0;
      while (k < P.cinta.length - 2 && t > P.cinta[k + 1][0]) k++;
      const [ta, a] = P.cinta[k], [tb, b] = P.cinta[k + 1];
      const u = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
      doc.setFillColor(Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u));
      doc.rect(x + i * paso, yy, paso + 0.15, alto, "F");
    }
  };
  const opacidad = (o: number) =>
    doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown }).GState({ opacity: o }));
  const aguaDeFondo = () => {
    if (!marca.sello) return;
    try { opacidad(0.04); doc.addImage(marca.sello, "PNG", (W - 120) / 2, 118, 120, 120, "sello", "FAST") }
    catch { /* sigue */ } finally { opacidad(1) }
  };
  const hojaNueva = () => {
    doc.addPage();
    aguaDeFondo();
    cinta(0, 0, W, 2.2);
    if (marca.sello) { try { doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ } }
    const x = M + (marca.sello ? 12 : 0);
    fuente("bold", 10); tinta(); doc.text("Casco de vidrio", x, 12.2);
    fuente("normal", 8.5); gris(); doc.text(d.periodo, x, 15.8);
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.3); doc.line(M, 19.5, W - M, 19.5);
    y = 24;
  };
  const cabe = (alto: number) => { if (y + alto > TOPE) hojaNueva() };
  /* EL TÍTULO DE CADA PARTE es el de todos los informes: cuadrito de acento, negrita 11 y la nota
     a la derecha. En la parte de un almacén el cuadrito lleva SU color, el de la gráfica. */
  const titulo = (t: string, nota?: string, color?: RGB) => {
    doc.setFillColor(...(color ?? P.acento)); doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11); tinta(); doc.text(t, M + 4.5, y + 4);
    if (nota) { fuente("normal", 8.5); gris(); doc.text(nota, W - M, y + 4, { align: "right" }) }
    y += 7;
  };

  /* ---------------- CABECERA ---------------- */
  aguaDeFondo();
  cinta(0, 0, W, 4.5);
  let conLogo = false;
  if (marca.palabra) {
    try { doc.addImage(marca.palabra, "PNG", M, 11, 15 * 540 / 160, 15, "palabra", "FAST"); conLogo = true } catch { /* sigue */ }
  }
  if (!conLogo) { fuente("bold", 16); doc.setTextColor(255, 0, 15); doc.text("Bavaria", M, 21) }
  fuente("bold", 7.5); gris(); doc.text("CENTRO DE DISTRIBUCIÓN CD38 · CONTROL", W - M, 13.5, { align: "right" });
  fuente("bold", 20); tinta(); doc.text("Casco de vidrio por partir", W - M, 21.5, { align: "right" });
  fuente("normal", 10); gris();
  doc.text(d.periodo.charAt(0).toUpperCase() + d.periodo.slice(1), W - M, 27.5, { align: "right" });
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.5); doc.line(M, 32, W - M, 32);
  y = 37;

  if (d.filtros) {
    const ALTO_F = 9;
    doc.setFillColor(...TINTA); doc.rect(M, y, 2.2, ALTO_F, "F");
    doc.setDrawColor(213, 220, 229); doc.setLineWidth(0.2); doc.rect(M + 2.2, y, ANCHO - 2.2, ALTO_F);
    fuente("bold", 7.5); gris(); doc.text("FILTRADO", M + 6, y + 5.8);
    fuente("normal", 8.5); tinta(); doc.text(doc.splitTextToSize(d.filtros, ANCHO - 34)[0] ?? "", M + 26, y + 5.8);
    y += ALTO_F + 6;
  }

  /* ---------------- LA BANDA DEL TOTAL ----------------
     La de todos los informes: la respuesta arriba y en grande. */
  const ALTO_KPI = 21;
  doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, ALTO_KPI, "F");
  doc.setFillColor(...P.acento); doc.rect(M, y, 3, ALTO_KPI, "F");
  doc.setTextColor(255, 255, 255); fuente("bold", 26);
  const cifra = fmt.hl0(d.total);
  doc.text(cifra, M + 9, y + 14);
  fuente("normal", 10.5); doc.setTextColor(...TENUE);
  doc.text(`HL por partir al ${corta(d.corte)}`, M + 11 + doc.getTextWidth(cifra) * 26 / 10.5, y + 14);
  fuente("bold", 11); doc.setTextColor(255, 255, 255);
  doc.text(`${fmt.viajes(d.viajes)} viajes SERPRO`, W - M - 6, y + 9.5, { align: "right" });
  fuente("normal", 8.5); doc.setTextColor(...TENUE);
  const vs = d.anterior ? `${conSigno(d.total - d.anterior.total)} HL vs ${corta(d.anterior.fecha)}` : "sin día anterior";
  doc.text(`${vs} · generado el ${extra.generado.toLocaleDateString("es-CO")} a las ` +
           `${extra.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`,
           W - M - 6, y + 15.5, { align: "right" });
  y += ALTO_KPI + 8;

  /* ---------------- LAS CIFRAS DE CADA ALMACÉN ----------------
     Las mismas tarjetas de «las cuatro cifras» de los demás informes, una por almacén. */
  titulo("Cómo está cada almacén", "su último conteo en el periodo");
  const ns = Math.max(1, d.sitios.length), GAP = 3;
  const kw = (ANCHO - GAP * (ns - 1)) / ns, KH = 24;
  d.sitios.forEach((s, i) => {
    const x = M + i * (kw + GAP);
    doc.setFillColor(243, 246, 249); doc.rect(x, y, kw, KH, "F");
    doc.setFillColor(...hexRGB(colorSitio(s.clave).fondo)); doc.rect(x + 3, y + 2.6, 2.6, 2.6, "F");
    fuente("bold", 6.3); gris();
    /* El nombre entero, en dos renglones si hace falta: «AG07 ALM. BODEGA» a secas no dice cuál es. */
    doc.text((doc.splitTextToSize(s.nombre.toUpperCase(), kw - 10) as string[]).slice(0, 2), x + 7, y + 5, { lineHeightFactor: 1.15 });
    fuente("bold", 16); tinta(); doc.text(fmt.hl(s.total), x + 3, y + 15.5);
    /* LOS VIAJES DE ESTE ALMACÉN, a la derecha de su HL. */
    fuente("bold", 12); tinta(); doc.text(fmt.viajes(s.viajes), x + kw - 3, y + 15.5, { align: "right" });
    const anchoV = doc.getTextWidth(fmt.viajes(s.viajes));
    fuente("normal", 6.2); gris(); doc.text("viajes", x + kw - 4 - anchoV, y + 15.5, { align: "right" });
    const dl = s.anterior ? s.total - s.anterior.total : null;
    const nota = `HL al ${s.fecha ? corta(s.fecha) : "—"}${d.total > 0 ? ` · ${nf0.format(s.total / d.total * 100)} %` : ""} · ` +
      (dl == null ? `${s.filas.length} mat.` : `${conSigno(dl, fmt.hl)} vs ${corta(s.anterior!.fecha)}`);
    fuente("normal", 6.2);
    if (dl != null && dl > 0.05) doc.setTextColor(200, 16, 46); else gris();
    doc.text(doc.splitTextToSize(nota, kw - 6), x + 3, y + 20);
  });
  y += KH + 3;
  fuente("normal", 7); gris();
  doc.text("Viajes SERPRO = estibas del último conteo ÷ 100 en Carnaval y ÷ 36 en Fábrica y Bodega. El % es la parte de cada almacén en el total del último día. En rojo: subió contra su conteo anterior.", M, y + 1);
  y += 8;

  /* ---------------- LA GRÁFICA ---------------- */
  cabe(GRAFICA.alto + 16);
  const yTit = y;
  titulo("Envases pendientes por partir (HL)");
  /* La leyenda a la derecha del título, de derecha a izquierda. */
  let lx = W - M;
  fuente("normal", 7.5);
  for (const k of [...d.claves].reverse()) {
    const s = d.sitios.find((x) => x.clave === k);
    const t = s?.centro ?? k;
    const w = doc.getTextWidth(t);
    lx -= w; gris(); doc.text(t, lx, yTit + 4);
    lx -= 4; doc.setFillColor(...hexRGB(colorSitio(k).fondo)); doc.rect(lx, yTit + 1.6, 2.8, 2.8, "F");
    lx -= 4;
  }
  if (extra.grafica) {
    try { doc.addImage(extra.grafica, "PNG", M, y, GRAFICA.ancho, GRAFICA.alto, "grafica", "SLOW") } catch { /* sigue */ }
  } else {
    fuente("normal", 9); gris(); doc.text("La gráfica no se pudo dibujar en este equipo.", M, y + 8);
  }
  y += GRAFICA.alto + 3;
  fuente("normal", 7); gris();
  doc.text(`Una barra por día con registros, del ${corta(d.serie[0]?.fecha ?? d.corte)} al ${corta(d.corte)}: cada color es un almacén y encima va el total del día.`, M, y + 1);
  y += 9;

  const FILA = 6.2;

  /* ---------------- EL DETALLE DE CADA ALMACÉN ---------------- */
  for (const s of d.sitios) {
    const cols = columnasAlmacen(s, ANCHO);
    /* La cabecera de columnas en DOS renglones cuando un título no cabe («EXTRASUCIO / CON BAJA»):
       cortado en «EXTRASUCIO» se pierde de qué es esa columna. */
    fuente("bold", 8);
    const titCols = cols.map((c) => doc.splitTextToSize(c.titulo, c.mm - 3) as string[]);
    const ALTO_CAB = titCols.some((l) => l.length > 1) ? 9.4 : FILA;
    const cab = (sigue: boolean) => {
      titulo(`${s.nombre}${sigue ? " (continúa)" : ""}`,
             s.fecha ? `conteo del ${larga(s.fecha)} · ${fmt.hl(s.total)} HL · ${fmt.viajes(s.viajes)} viajes` : "sin conteo en el periodo",
             hexRGB(colorSitio(s.clave).fondo));
      doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, ALTO_CAB, "F");
      doc.setTextColor(255, 255, 255); fuente("bold", 8);
      let x = M;
      cols.forEach((col, i) => {
        /* CENTRADO EN ALTO: un título de un renglón va a la mitad de la franja, no pegado abajo
           al lado del que ocupa dos. (8 pt a 1,2 de interlínea = 3,4 mm por renglón.) */
        const l = titCols[i].slice(0, 2), y0 = y + ALTO_CAB / 2 - (l.length - 1) * 1.7 + 1;
        if (col.num) doc.text(l, x + col.mm - 2, y0, { align: "right", lineHeightFactor: 1.2 });
        else doc.text(l, x + 2, y0, { lineHeightFactor: 1.2 });
        x += col.mm;
      });
      y += ALTO_CAB;
    };
    /* UN ALMACÉN NO SE PARTE si cabe entero en una hoja: mejor empezarlo arriba de la siguiente
       que dejar cinco renglones aquí y cuatro allá. Si no cabe ni en una hoja, sí se parte. */
    fuente("normal", 8.3);
    const altoFila = (f: FilaInformeCasco) => Math.max(FILA, 2.4 + 3.6 * Math.max(...cols.map((c) =>
      (c.num ? 1 : (doc.splitTextToSize(celda(c, f), c.mm - 3.5) as string[]).length))));
    const altoTodo = 7 + ALTO_CAB + s.filas.reduce((t, f) => t + altoFila(f), 0) + FILA + 1;
    if (altoTodo <= TOPE - 25) cabe(altoTodo); else cabe(7 + ALTO_CAB + FILA * 4);
    cab(false);
    if (!s.filas.length) {
      fuente("normal", 9); gris();
      doc.text("Sin casco con inventario en este conteo.", M + 2, y + 4.5); y += 12; continue;
    }
    s.filas.forEach((f, i) => {
      /* Renglones que crecen si el material o la ubicación no caben: no se corta el dato. */
      fuente("normal", 8.3);
      const lineas = cols.map((c) => (c.num ? [celda(c, f)] : doc.splitTextToSize(celda(c, f), c.mm - 3.5) as string[]));
      const alto = Math.max(FILA, 2.4 + 3.6 * Math.max(...lineas.map((l) => l.length)));
      if (y + alto > TOPE) { hojaNueva(); cab(true) }
      if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, alto, "F") }
      let x = M;
      cols.forEach((c, j) => {
        if (c.id === "hl") fuente("bold", 8.3); else if (c.id === "cod" || c.id === "ubi" || c.id === "cal") fuente("normal", 7.6); else fuente("normal", 8.3);
        if (c.id === "cod" || c.id === "ubi" || c.id === "cal") gris(); else tinta();
        /* Igual en los renglones: si el material ocupa dos líneas, los demás datos van a la mitad. */
        const nl = c.num ? 1 : lineas[j].length;
        const yb = y + alto / 2 - (nl - 1) * 1.8 + 1;
        if (c.num) doc.text(lineas[j][0], x + c.mm - 2, yb, { align: "right" });
        else doc.text(lineas[j], x + 2, yb, { lineHeightFactor: 1.2 });
        x += c.mm;
      });
      y += alto;
    });
    /* EL TOTAL, con la raya oscura encima: lo que se compara contra el Excel. */
    if (y + FILA + 1 > TOPE) { hojaNueva(); cab(true) }
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.4); doc.line(M, y, W - M, y);
    let x = M;
    fuente("bold", 8.5); tinta();
    cols.forEach((c) => {
      if (c.id === "cod") doc.text("TOTAL", x + 2, y + 4.4);
      if (c.id === "mat") { fuente("normal", 7.6); gris(); doc.text(`${s.filas.length} material${s.filas.length === 1 ? "" : "es"} con inventario`, x + 2, y + 4.4); fuente("bold", 8.5); tinta() }
      if (c.id === "inv") doc.text(fmt.est(s.filas.reduce((t, r) => t + r.inventario, 0)), x + c.mm - 2, y + 4.4, { align: "right" });
      if (c.id === "baja") doc.text(fmt.est(s.filas.reduce((t, r) => t + r.baja, 0)), x + c.mm - 2, y + 4.4, { align: "right" });
      if (c.id === "hl") doc.text(fmt.hl(s.total), x + c.mm - 2, y + 4.4, { align: "right" });
      x += c.mm;
    });
    y += FILA + 9;
  }

  /* ---------------- POR MATERIAL ----------------
     La tabla «POR MATERIAL» del tablero: cada material con lo que hay en cada almacén, sus estibas
     y el total. ORDEN DEL INFORME: primero cada almacén (AG22, AG18, AG07, CA22), después Por
     material y al final HL pendiente por disposición. */
  const pm = d.porMaterial;
  if (pm && pm.filas.length) {
    const c = columnasPorMaterial(d, ANCHO);
    const xs: number[] = []; { let x = M + c.cod + c.mat; d.claves.forEach(() => { x += c.sitio; xs.push(x) }) }
    const xEst = xs[xs.length - 1] + c.est, xTot = W - M;
    const cabPM = (sigue: boolean) => {
      titulo(`Por material${sigue ? " (continúa)" : ""}`, `${larga(pm.fecha)} · HL`);
      doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, FILA, "F");
      doc.setTextColor(255, 255, 255); fuente("bold", 8);
      doc.text("COD", M + 2, y + 4.2); doc.text("MATERIAL", M + c.cod + 2, y + 4.2);
      d.claves.forEach((k, i) => doc.text(d.sitios.find((s) => s.clave === k)?.centro ?? k, xs[i] - 2, y + 4.2, { align: "right" }));
      doc.text("ESTIBAS", xEst - 2, y + 4.2, { align: "right" });
      doc.text("TOTAL HL", xTot - 2, y + 4.2, { align: "right" });
      y += FILA;
    };
    fuente("normal", 8.3);
    const altoPM = (f: FilaPorMaterial) => Math.max(FILA, 2.4 + 3.6 * (doc.splitTextToSize(f.nombre, c.mat - 3.5) as string[]).length);
    const todoPM = 7 + FILA * 2 + pm.filas.reduce((t, f) => t + altoPM(f), 0) + 1;
    if (todoPM <= TOPE - 25) cabe(todoPM); else cabe(7 + FILA * 5);
    cabPM(false);
    pm.filas.forEach((f, i) => {
      fuente("normal", 8.3);
      const ln = doc.splitTextToSize(f.nombre, c.mat - 3.5) as string[];
      const alto = altoPM(f);
      if (y + alto > TOPE) { hojaNueva(); cabPM(true) }
      if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, alto, "F") }
      const yb = y + alto / 2 + 1, ybm = y + alto / 2 - (ln.length - 1) * 1.8 + 1;
      fuente("normal", 7.6); gris(); doc.text(f.sku, M + 2, yb);
      fuente("normal", 8.3); tinta(); doc.text(ln, M + c.cod + 2, ybm, { lineHeightFactor: 1.2 });
      d.claves.forEach((k, j) => {
        const t = hlCelda(f.porSitio[k]);
        if (t === "—") gris(); else tinta();
        doc.text(t, xs[j] - 2, yb, { align: "right" });
      });
      tinta(); doc.text(fmt.est(f.estibas), xEst - 2, yb, { align: "right" });
      fuente("bold", 8.3); doc.text(fmt.hl0(f.total), xTot - 2, yb, { align: "right" });
      y += alto;
    });
    if (y + FILA + 1 > TOPE) { hojaNueva(); cabPM(true) }
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.4); doc.line(M, y, W - M, y);
    fuente("bold", 8.5); tinta();
    doc.text("TOTAL", M + 2, y + 4.4);
    d.claves.forEach((k, j) => doc.text(hlCelda(pm.filas.reduce((t, f) => t + (f.porSitio[k] ?? 0), 0)), xs[j] - 2, y + 4.4, { align: "right" }));
    doc.text(fmt.est(pm.filas.reduce((t, f) => t + f.estibas, 0)), xEst - 2, y + 4.4, { align: "right" });
    doc.text(fmt.hl0(pm.filas.reduce((t, f) => t + f.total, 0)), xTot - 2, y + 4.4, { align: "right" });
    y += FILA + 9;
  }

  /* ---------------- LA DINÁMICA: HL POR DÍA Y ALMACÉN ---------------- */
  const TOPE_DIAS = 62;
  const dias = [...d.serie].reverse().slice(0, TOPE_DIAS);
  const ncol = d.claves.length;
  const cF = 26, cT = 28, cS = (ANCHO - cF - cT) / Math.max(1, ncol);
  const cabDin = (sigue: boolean) => {
    titulo(`HL pendiente por disposición${sigue ? " (continúa)" : ""}`, d.serie.length > TOPE_DIAS ? `los ${TOPE_DIAS} días más recientes de ${d.serie.length}` : "el día más nuevo arriba");
    doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, FILA, "F");
    doc.setTextColor(255, 255, 255); fuente("bold", 7.5);
    doc.text("FECHA", M + 2, y + FILA - 2);
    d.claves.forEach((k, i) => {
      const s = d.sitios.find((x) => x.clave === k);
      doc.text(s?.centro ?? k, M + cF + cS * (i + 1) - 2, y + FILA - 2, { align: "right" });
    });
    doc.text("TOTAL", W - M - 2, y + FILA - 2, { align: "right" });
    y += FILA;
  };
  cabe(8 + FILA * 6);
  cabDin(false);
  dias.forEach((dia, i) => {
    if (y + FILA > TOPE) { hojaNueva(); cabDin(true) }
    if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, FILA, "F") }
    fuente(i === 0 ? "bold" : "normal", 8.3); tinta();
    doc.text(corta(dia.fecha), M + 2, y + 4.2);
    d.claves.forEach((k, j) => {
      const v = dia.porSitio[k];
      if (v == null) gris(); else tinta();
      doc.text(v == null ? "—" : fmt.hl0(v), M + cF + cS * (j + 1) - 2, y + 4.2, { align: "right" });
    });
    fuente("bold", 8.3); tinta();
    doc.text(fmt.hl0(dia.total), W - M - 2, y + 4.2, { align: "right" });
    y += FILA;
  });

  /* ---------------- PIE ---------------- */
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5); gris();
    const anchoIzq = W / 2 - M - doc.getTextWidth("Bavaria") / 2 - 4;
    const trozos = [`Casco de vidrio · ${d.periodo}`, d.filtros ? `Filtrado · ${d.filtros}` : "Sin filtros"];
    let izq = trozos.join(" · ");
    while (trozos.length > 1 && doc.getTextWidth(izq) > anchoIzq) { trozos.pop(); izq = trozos.join(" · ") }
    doc.text(doc.splitTextToSize(izq, anchoIzq)[0] ?? "", M, PIE);
    doc.text("Bavaria", W / 2, PIE, { align: "center" });
    doc.text(`Página ${i} de ${n}`, W - M, PIE, { align: "right" });
  }
  return doc;
}
