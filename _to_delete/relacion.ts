/**
 * LA RELACIÓN DEL PERÍODO — un solo PDF con todos los días.
 *
 * «Ayúdame a descargar la relación de un rango de fechas en los informes
 * de la rotura de línea.» Un PDF consolidado, con TODOS los días que
 * tuvieron rotura: los que tienen su hoja y los que no, marcados.
 *
 * Una fila por día, en orden de calendario, con lo que dice la base y lo
 * que dice su hoja:
 *
 *   VIGENTE          la última hoja del día y la base dicen lo mismo.
 *   CAMBIÓ DESPUÉS   la hoja dice una cifra y la base hoy dice otra.
 *   ANULADA          el día solo tiene hojas anuladas.
 *   SIN HOJA         tuvo rotura y nadie generó su hoja.
 *   ANTES DE LA HOJA el día es de antes de que la hoja existiera: no
 *                    se le puede pedir.
 *
 * Mismo papel que la hoja del día: los logos tal cual, los colores del
 * tema de quien la baja, el pie en «Bavaria».
 */
import type { jsPDF as JsPDF } from "jspdf";
import { PALETA_MARCA, type Marca, type Paleta } from "./hoja";
import { DESDE_HOJAS } from "./historial";

type RGB = [number, number, number];

export type EstadoDia = "vigente" | "cambio" | "anulada" | "sin" | "antes";

export type FilaRelacion = {
  fecha: string;
  und: number;
  kg: number;
  estado: EstadoDia;
  /** De la hoja que cuenta (la última vigente, o la última anulada). */
  hora: string | null;
  elaboro: string | null;
  supervisor: string | null;
  undHoja: number | null;
};

export type Relacion = {
  desde: string; hasta: string;
  filas: FilaRelacion[];
  und: number; kg: number;
  conHoja: number; sinHoja: number; cambio: number; anuladas: number;
};

type HojaMin = {
  id: string; fecha: string; unidades: number; generado_en: string;
  elaboro: string | null; supervisor: string | null; anulada_en?: string | null;
};

export const ROTULO: Record<EstadoDia, string> = {
  vigente: "CON HOJA",
  cambio: "CAMBIÓ DESPUÉS",
  anulada: "ANULADA",
  sin: "SIN HOJA",
  antes: "ANTES DE LA HOJA",
};

/** Las filas de la relación: un día por fila, solo los que tuvieron
 *  rotura, del más viejo al más nuevo —como se lee un período—. */
export function armarRelacion(
  dias: { fecha: string; und: number | string; kg: number | string }[],
  hojas: HojaMin[],
  desde: string, hasta: string,
): Relacion {
  const base = new Map<string, { und: number; kg: number }>();
  for (const d of dias) {
    if (d.fecha < desde || d.fecha > hasta) continue;
    const a = base.get(d.fecha) ?? { und: 0, kg: 0 };
    a.und += Number(d.und) || 0; a.kg += Number(d.kg) || 0;
    base.set(d.fecha, a);
  }
  const vigente = new Map<string, HojaMin>(), anulada = new Map<string, HojaMin>();
  for (const h of hojas) {
    const m = h.anulada_en != null ? anulada : vigente;
    const u = m.get(h.fecha);
    if (!u || h.generado_en > u.generado_en) m.set(h.fecha, h);
  }

  const filas: FilaRelacion[] = [...base.entries()]
    .filter(([, v]) => v.und > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => {
      const h = vigente.get(fecha) ?? anulada.get(fecha) ?? null;
      const estado: EstadoDia = vigente.has(fecha)
        ? (Number(h!.unidades) === v.und ? "vigente" : "cambio")
        : anulada.has(fecha) ? "anulada"
        : fecha < DESDE_HOJAS ? "antes" : "sin";
      return {
        fecha, und: v.und, kg: v.kg, estado,
        hora: h ? h.generado_en : null,
        elaboro: h?.elaboro ?? null, supervisor: h?.supervisor ?? null,
        undHoja: h ? Number(h.unidades) : null,
      };
    });

  const cuenta = (e: EstadoDia) => filas.filter((f) => f.estado === e).length;
  return {
    desde, hasta, filas,
    und: filas.reduce((a, f) => a + f.und, 0),
    kg: filas.reduce((a, f) => a + f.kg, 0),
    conHoja: cuenta("vigente") + cuenta("cambio"),
    sinHoja: cuenta("sin"), cambio: cuenta("cambio"), anuladas: cuenta("anulada"),
  };
}

export const nombreRelacion = (desde: string, hasta: string) =>
  `relacion-rotura-linea-${desde}-a-${hasta}.pdf`;

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const fechaCorta = (f: string) => {
  const d = new Date(f + "T00:00:00");
  return `${DIAS[d.getDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
};
const fechaTitulo = (f: string) =>
  new Date(f + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
const horaCorta = (s: string) =>
  new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Bogota" });

const ROJO: RGB = [255, 0, 15];

/** PINTA LA RELACIÓN EN UN PDF A4 VERTICAL. */
export function dibujarRelacion(
  JsPDFCtor: typeof JsPDF,
  rel: Relacion,
  datos: { generado: Date; marca?: Marca; paleta?: Paleta },
): JsPDF {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const W = 210, H = 297, M = 14, ANCHO = W - 2 * M;
  const PIE = H - 10, TOPE = PIE - 7;
  const P = datos.paleta ?? PALETA_MARCA;
  const TINTA = P.tinta;
  const TENUE: RGB = TINTA.map((c) => Math.round(255 - (255 - c) * 0.16)) as RGB;
  const FONDO_FILA: RGB = TINTA.map((c) => Math.round(255 - (255 - c) * 0.05)) as RGB;
  const marca = datos.marca ?? {};
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso: "normal" | "bold", tam: number) => { doc.setFont("helvetica", peso); doc.setFontSize(tam) };
  const periodo = `${fechaTitulo(rel.desde)} a ${fechaTitulo(rel.hasta)}`;

  const cinta = (x: number, yy: number, ancho: number, alto: number) => {
    const N = Math.max(12, Math.round(ancho / 1.5));
    const paso = ancho / N;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let k = 0;
      while (k < P.cinta.length - 2 && t > P.cinta[k + 1][0]) k++;
      const [ta, a] = P.cinta[k], [tb, b] = P.cinta[k + 1];
      const u = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
      doc.setFillColor(
        Math.round(a[0] + (b[0] - a[0]) * u),
        Math.round(a[1] + (b[1] - a[1]) * u),
        Math.round(a[2] + (b[2] - a[2]) * u));
      doc.rect(x + i * paso, yy, paso + 0.15, alto, "F");
    }
  };

  /* LAS COLUMNAS, en mm. Suman el ancho útil (182). */
  const COL = [
    { t: "DÍA", w: 30, der: false },
    { t: "UNIDADES", w: 22, der: true },
    { t: "KG", w: 18, der: true },
    { t: "HOJA", w: 34, der: false },
    { t: "HORA", w: 14, der: false },
    { t: "ELABORÓ", w: 36, der: false },
    { t: "SUPERVISOR", w: 28, der: false },
  ];
  const FILA = 6.4;
  let y = M;

  const titulos = () => {
    doc.setFillColor(...TINTA);
    doc.rect(M, y, ANCHO, 7, "F");
    fuente("bold", 7.5); doc.setTextColor(255, 255, 255);
    let x = M;
    for (const c of COL) {
      doc.text(c.t, c.der ? x + c.w - 2 : x + 2, y + 4.8, c.der ? { align: "right" } : undefined);
      x += c.w;
    }
    y += 7;
  };

  const hojaNueva = () => {
    doc.addPage();
    cinta(0, 0, W, 2.2);
    if (marca.sello) {
      try { doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ }
    }
    fuente("bold", 10); tinta();
    doc.text("Rotura en línea · Relación del período", M + (marca.sello ? 12 : 0), 12.2);
    fuente("normal", 8.5); gris();
    doc.text(periodo, M + (marca.sello ? 12 : 0), 15.8);
    y = 22;
    titulos();
  };

  /* Recorta un nombre al ancho de su columna, con puntos suspensivos. */
  const cabeEn = (s: string, w: number) => {
    if (doc.getTextWidth(s) <= w) return s;
    let t = s;
    while (t.length > 1 && doc.getTextWidth(t + "…") > w) t = t.slice(0, -1);
    return t + "…";
  };

  /* ---------------- CABECERA ---------------- */
  cinta(0, 0, W, 4.5);
  let conLogo = false;
  if (marca.palabra) {
    try { doc.addImage(marca.palabra, "PNG", M, 11, 15 * 540 / 160, 15, "palabra", "FAST"); conLogo = true }
    catch { /* sin logo, sale igual */ }
  }
  if (!conLogo) { fuente("bold", 16); doc.setTextColor(...ROJO); doc.text("Bavaria", M, 21) }
  fuente("bold", 7.5); gris();
  doc.text("CENTRO DE DISTRIBUCIÓN CD38 · CONTROL", W - M, 13.5, { align: "right" });
  fuente("bold", 18); tinta();
  doc.text("Rotura en línea", W - M, 21.5, { align: "right" });
  fuente("normal", 10); gris();
  doc.text(`Relación del período · ${periodo}`, W - M, 27.5, { align: "right" });
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.5);
  doc.line(M, 32, W - M, 32);
  y = 37;

  /* LA BANDA: el total del período y lo que falta. */
  const ALTO = 21;
  doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, ALTO, "F");
  doc.setFillColor(...P.acento); doc.rect(M, y, 3, ALTO, "F");
  doc.setTextColor(255, 255, 255); fuente("bold", 24);
  const cifra = nf.format(rel.und);
  doc.text(cifra, M + 9, y + 13.5);
  const ac = doc.getTextWidth(cifra);
  fuente("normal", 10); doc.setTextColor(...TENUE);
  doc.text("unidades rotas", M + 11 + ac, y + 13.5);
  fuente("bold", 11); doc.setTextColor(255, 255, 255);
  doc.text(`${nf1.format(rel.kg)} kg · ${rel.filas.length} día${rel.filas.length === 1 ? "" : "s"} con rotura`,
           W - M - 6, y + 9, { align: "right" });
  fuente("normal", 8.5); doc.setTextColor(...TENUE);
  const partes = [`${rel.conHoja} con hoja`, `${rel.sinHoja} sin hoja`];
  if (rel.cambio) partes.push(`${rel.cambio} cambiaron después`);
  if (rel.anuladas) partes.push(`${rel.anuladas} anulada${rel.anuladas === 1 ? "" : "s"}`);
  doc.text(partes.join(" · "), W - M - 6, y + 15, { align: "right" });
  y += ALTO + 7;

  /* ---------------- LA TABLA ---------------- */
  if (rel.filas.length === 0) {
    fuente("normal", 11); gris();
    doc.text("No hubo rotura registrada en este período.", M, y + 6);
    y += 12;
  } else {
    titulos();
    rel.filas.forEach((f, i) => {
      if (y + FILA > TOPE) hojaNueva();
      if (i % 2 === 1) { doc.setFillColor(...FONDO_FILA); doc.rect(M, y, ANCHO, FILA, "F") }
      const base = y + FILA - 2;
      let x = M;
      const celda = (k: number, s: string, peso: "normal" | "bold" = "normal") => {
        const c = COL[k];
        fuente(peso, 8.5);
        const t = cabeEn(s, c.w - 4);
        doc.text(t, c.der ? x + c.w - 2 : x + 2, base, c.der ? { align: "right" } : undefined);
        x += c.w;
      };
      tinta();
      celda(0, fechaCorta(f.fecha));
      celda(1, nf.format(f.und), "bold");
      celda(2, nf1.format(f.kg));
      /* EL ESTADO: lo que hay que mirar va en negrita y con el cuadrito
         del acento; lo que está bien, en letra normal. Nada va en color
         de letra: en una impresora en blanco y negro se perdería. */
      const ojo = f.estado === "sin" || f.estado === "cambio";
      if (ojo) { doc.setFillColor(...P.acento); doc.rect(x + 1.2, y + 2, 2.2, 2.2, "F") }
      if (f.estado === "anulada" || f.estado === "antes") gris(); else tinta();
      const est = f.estado === "cambio" && f.undHoja != null
        ? `CAMBIÓ (hoja ${nf.format(f.undHoja)})` : ROTULO[f.estado];
      fuente(ojo ? "bold" : "normal", 8);
      doc.text(cabeEn(est, COL[3].w - 6), x + 5, base);
      x += COL[3].w;
      tinta();
      celda(4, f.hora ? horaCorta(f.hora) : "—");
      celda(5, f.elaboro?.trim() || "—");
      celda(6, f.supervisor?.trim() || "—");
      doc.setDrawColor(215, 221, 228); doc.setLineWidth(0.15);
      doc.line(M, y + FILA, W - M, y + FILA);
      y += FILA;
    });

    /* EL TOTAL, cerrando la tabla. */
    if (y + 8 > TOPE) hojaNueva();
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    fuente("bold", 9); tinta();
    doc.text("TOTAL DEL PERÍODO", M + 2, y + 5.2);
    doc.text(nf.format(rel.und), M + COL[0].w + COL[1].w - 2, y + 5.2, { align: "right" });
    doc.text(nf1.format(rel.kg), M + COL[0].w + COL[1].w + COL[2].w - 2, y + 5.2, { align: "right" });
    y += 9;
  }

  /* ---------------- LA NOTA ---------------- */
  if (y + 14 > TOPE) hojaNueva();
  fuente("normal", 7.5); gris();
  const nota = doc.splitTextToSize(
    "Unidades y kg: lo que dice CONTROL hoy, todas las líneas. Hoja: la última hoja del día que no se anuló. " +
    "«Cambió después»: la hoja firmada dice otra cifra que la base de hoy. «Antes de la hoja»: días anteriores al " +
    `${fechaTitulo(DESDE_HOJAS)}, cuando todavía no existía la hoja del día. ` +
    `Generada el ${datos.generado.toLocaleDateString("es-CO")} a las ` +
    `${datos.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}.`, ANCHO) as string[];
  doc.text(nota, M, y + 4);

  /* ---------------- PIE ---------------- */
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5); gris();
    doc.text(`Relación · ${rel.desde} a ${rel.hasta}`, M, PIE);
    doc.text("Bavaria", W / 2, PIE, { align: "center" });
    doc.text(`Página ${i} de ${n}`, W - M, PIE, { align: "right" });
  }
  return doc;
}
