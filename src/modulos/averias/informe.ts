/**
 * EL INFORME DE AVERÍAS.
 *
 * MISMAS PIEZAS QUE LA HOJA DE ROTURA DE LÍNEA —paleta, cinta, marca de
 * agua, cabecera, banda del total y pie—, importadas de
 * `@/modulos/rotlinea/hoja` y no copiadas: dos copias del mismo diseño
 * se separan a la tercera vez que alguien cambia una.
 *
 * ---------------------------------------------------------------------
 * LOS HALLAZGOS VAN ARRIBA, ANTES DE LAS TABLAS
 * ---------------------------------------------------------------------
 * Un informe de averías que empieza por una tabla de veinte renglones
 * obliga a cada quien a sacar sus propias conclusiones — y cada quien
 * saca otra. Aquí las conclusiones van primero, en orden de peso, y con
 * LA CUENTA QUE LAS SOSTIENE al lado: un informe que afirma cosas sin
 * mostrar de dónde salen es un informe al que hay que creerle.
 *
 * Los hallazgos los calcula `hallazgos.ts`, en una función pura que se
 * puede medir sin generar un PDF. Aquí solo se dibujan. Una conclusión
 * mal sacada se lee perfectamente normal en un papel bonito.
 *
 * ---------------------------------------------------------------------
 * LA TABLA LLEVA LA FOTO, Y NO ES ADORNO
 * ---------------------------------------------------------------------
 * Una avería sin foto no se le reclama a nadie. En el papel va la
 * miniatura de la primera foto de cada avería: es lo que convierte el
 * informe en algo que se manda al transportador.
 */
import type { jsPDF as JsPDF } from "jspdf";
import { PALETA_MARCA, type Marca, type Paleta } from "@/modulos/rotlinea/hoja";
import { hallazgos, CAUSAL_NOMBRE, type Averia } from "./hallazgos";

export type DatosAverias = {
  hoy: string;
  periodo: string;
  filtros: string;
  averias: Averia[];
  /** La primera foto de cada avería, como data URL. Opcional: sin ella
   *  el informe sale igual, con el hueco marcado. */
  fotos?: Record<string, string>;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
type RGB = [number, number, number];
const fecha6 = (f: string) => f.slice(8, 10) + "/" + f.slice(5, 7) + "/" + f.slice(2, 4);

export function dibujarInformeAverias(
  JsPDFCtor: typeof JsPDF,
  d: DatosAverias,
  extra: { generado: Date; marca?: Marca; paleta?: Paleta },
): JsPDF {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, ANCHO = W - 2 * M;
  const PIE = H - 10, TOPE = PIE - 6;
  let y = M;

  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = P.tinta;
  const TENUE: RGB = TINTA.map((c) => Math.round(255 - (255 - c) * 0.16)) as RGB;
  const MAL: RGB = [200, 16, 46];
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (p: "normal" | "bold", t: number) => { doc.setFont("helvetica", p); doc.setFontSize(t) };
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
      doc.setFillColor(Math.round(a[0] + (b[0] - a[0]) * u),
                       Math.round(a[1] + (b[1] - a[1]) * u),
                       Math.round(a[2] + (b[2] - a[2]) * u));
      doc.rect(x + i * paso, yy, paso + 0.15, alto, "F");
    }
  };
  const opacidad = (o: number) =>
    doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown })
      .GState({ opacity: o }));
  const aguaDeFondo = () => {
    if (!marca.sello) return;
    try { opacidad(0.04); doc.addImage(marca.sello, "PNG", (W - 120) / 2, 118, 120, 120, "sello", "FAST") }
    catch { /* sin marca de agua el informe sale igual */ }
    finally { opacidad(1) }
  };
  const hojaNueva = () => {
    doc.addPage(); aguaDeFondo(); cinta(0, 0, W, 2.2);
    if (marca.sello) { try { doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ } }
    const x = M + (marca.sello ? 12 : 0);
    fuente("bold", 10); tinta(); doc.text("Averías", x, 12.2);
    fuente("normal", 8.5); gris(); doc.text(d.periodo, x, 15.8);
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.3); doc.line(M, 19.5, W - M, 19.5);
    y = 24;
  };
  const cabe = (alto: number) => { if (y + alto > TOPE) hojaNueva() };

  /* ---------------- CABECERA ---------------- */
  aguaDeFondo();
  cinta(0, 0, W, 4.5);
  let conLogo = false;
  if (marca.palabra) {
    try { doc.addImage(marca.palabra, "PNG", M, 11, 15 * 540 / 160, 15, "palabra", "FAST"); conLogo = true }
    catch { /* sin logo sale igual */ }
  }
  if (!conLogo) { fuente("bold", 16); doc.setTextColor(255, 0, 15); doc.text("Bavaria", M, 21) }
  fuente("bold", 7.5); gris();
  doc.text("CENTRO DE DISTRIBUCIÓN CD38 · CONTROL", W - M, 13.5, { align: "right" });
  fuente("bold", 20); tinta();
  doc.text("Averías del período", W - M, 21.5, { align: "right" });
  fuente("normal", 10); gris();
  doc.text(d.periodo.charAt(0).toUpperCase() + d.periodo.slice(1), W - M, 27.5, { align: "right" });
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.5); doc.line(M, 32, W - M, 32);
  y = 37;

  if (d.filtros) {
    doc.setFillColor(...TINTA); doc.rect(M, y, 2.2, 9, "F");
    doc.setDrawColor(213, 220, 229); doc.setLineWidth(0.2); doc.rect(M + 2.2, y, ANCHO - 2.2, 9);
    fuente("bold", 7.5); gris(); doc.text("FILTRADO", M + 6, y + 5.8);
    fuente("normal", 8.5); tinta();
    doc.text(doc.splitTextToSize(d.filtros, ANCHO - 34)[0] ?? "", M + 26, y + 5.8);
    y += 15;
  }

  /* ---------------- LA BANDA DEL TOTAL ---------------- */
  const cajas = d.averias.reduce((t, a) => t + a.cajas, 0);
  const uds = d.averias.reduce((t, a) => t + a.unidades, 0);
  const sinDoc = d.averias.filter((a) => !a.documento);
  const ALTO_KPI = 21;
  doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, ALTO_KPI, "F");
  doc.setFillColor(...P.acento); doc.rect(M, y, 3, ALTO_KPI, "F");
  doc.setTextColor(255, 255, 255); fuente("bold", 26);
  const cifra = nf.format(cajas);
  doc.text(cifra, M + 9, y + 14);
  fuente("normal", 10.5); doc.setTextColor(...TENUE);
  doc.text("cajas averiadas", M + 11 + doc.getTextWidth(cifra) * 26 / 10.5, y + 14);
  fuente("bold", 11); doc.setTextColor(255, 255, 255);
  doc.text(`${nf.format(d.averias.length)} aver${d.averias.length === 1 ? "ía" : "ías"}`,
           W - M - 6, y + 9.5, { align: "right" });
  fuente("normal", 8.5); doc.setTextColor(...TENUE);
  doc.text(`${nf.format(uds)} unidades · generado el ${extra.generado.toLocaleDateString("es-CO")}`,
           W - M - 6, y + 15.5, { align: "right" });
  y += ALTO_KPI + 8;

  const titulo = (t: string, nota?: string) => {
    doc.setFillColor(...P.acento); doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11); tinta(); doc.text(t, M + 4.5, y + 4);
    if (nota) { fuente("normal", 8.5); gris(); doc.text(nota, W - M, y + 4, { align: "right" }) }
    y += 7;
  };

  /* ---------------- LOS HALLAZGOS ----------------
     Antes que cualquier tabla: ver la nota de arriba. */
  const hh = hallazgos(d.averias, d.hoy);
  titulo("Hallazgos", hh.length ? `${hh.length} · lo alto primero` : "");
  if (hh.length === 0) {
    fuente("normal", 9.5); gris();
    doc.text("No hay suficientes averías en el período para sacar conclusiones.", M + 2, y + 4);
    y += 12;
  }
  for (const h of hh) {
    /* EL ALTO DEL RECUADRO SALE DEL TEXTO, no al revés: un hallazgo
       recortado a la mitad deja de ser un hallazgo. */
    const anchoTexto = ANCHO - 34;
    const l1 = doc.splitTextToSize(h.dice, anchoTexto);
    const l2 = doc.splitTextToSize(h.porque, anchoTexto);
    const l3 = doc.splitTextToSize(h.cuenta, anchoTexto);
    const alto = 7 + l1.length * 4.6 + l2.length * 4 + l3.length * 3.6 + 3;
    cabe(alto + 4);
    const color: RGB = h.peso === "alto" ? MAL : h.peso === "medio" ? P.acento : [150, 160, 172];
    doc.setFillColor(...color); doc.rect(M, y, 2.4, alto, "F");
    doc.setFillColor(249, 250, 252); doc.rect(M + 2.4, y, ANCHO - 2.4, alto, "F");
    fuente("bold", 13);
    doc.setTextColor(...(h.peso === "alto" ? MAL : TINTA));
    doc.text(h.cifra, M + 7, y + 9);
    let yy = y + 6.5;
    fuente("bold", 9.5); tinta();
    doc.text(l1, M + 30, yy); yy += l1.length * 4.6;
    fuente("normal", 8.5); gris();
    doc.text(l2, M + 30, yy); yy += l2.length * 4;
    fuente("normal", 7); doc.setTextColor(140, 150, 162);
    doc.text(l3, M + 30, yy);
    y += alto + 4;
  }
  y += 4;

  /* ---------------- POR CAUSAL ---------------- */
  const porCausal = (["transporte", "deposito", "contaminado"] as const).map((c) => ({
    etiqueta: CAUSAL_NOMBRE[c],
    cajas: d.averias.filter((a) => a.causal === c).reduce((t, a) => t + a.cajas, 0),
  }));
  cabe(9 + porCausal.length * 7.6 + 4);
  titulo("Por causal", "cajas");
  {
    const max = Math.max(1, ...porCausal.map((c) => c.cajas));
    for (const c of porCausal) {
      fuente("normal", 8.5); tinta(); doc.text(c.etiqueta, M, y + 3);
      const bx = M + 46, bw = ANCHO - 46 - 18;
      doc.setFillColor(233, 236, 240); doc.rect(bx, y, bw, 4, "F");
      if (c.cajas > 0) { doc.setFillColor(...P.acento); doc.rect(bx, y, bw * (c.cajas / max), 4, "F") }
      fuente("bold", 8.5);
      if (c.cajas > 0) tinta(); else gris();
      doc.text(c.cajas > 0 ? nf.format(c.cajas) : "—", M + ANCHO, y + 3.4, { align: "right" });
      y += 7.6;
    }
    y += 6;
  }

  /* ---------------- LA TABLA, CON LA FOTO ---------------- */
  const COL = [13, 20, 16, 20, ANCHO - 155, 13, 16, 30, 27];
  const CAB = ["FOTO", "AVERÍA", "FECHA", "UBIC.", "PRODUCTO", "CJS", "UNID.", "CAUSAL", "DOC. BAJA"];
  const FILA = 11;
  const encabezado = (sigue: boolean) => {
    fuente("bold", 11); tinta();
    doc.setFillColor(...P.acento); doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    doc.text(`Las averías${sigue ? " (continúa)" : ""}`, M + 4.5, y + 4);
    fuente("normal", 8.5); gris();
    doc.text(`${d.averias.length} · ${sinDoc.length} sin documento`, W - M, y + 4, { align: "right" });
    y += 7;
    doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, 6, "F");
    doc.setTextColor(255, 255, 255); fuente("bold", 7);
    let x = M;
    CAB.forEach((t, i) => {
      if (i === 5 || i === 6) doc.text(t, x + COL[i] - 2, y + 4, { align: "right" });
      else doc.text(t, x + 2, y + 4);
      x += COL[i];
    });
    y += 6;
  };
  cabe(10 + FILA * 3);
  encabezado(false);

  d.averias.forEach((a, i) => {
    if (y + FILA > TOPE) { hojaNueva(); encabezado(true) }
    if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, FILA, "F") }
    let x = M;
    /* LA FOTO. Sin ella queda el recuadro punteado: un hueco marcado
       dice «a esta le falta la prueba», y un hueco liso no dice nada. */
    const f = d.fotos?.[a.codigo];
    if (f) {
      try { doc.addImage(f, "JPEG", x + 1.5, y + 1.5, COL[0] - 3, FILA - 3, a.codigo, "FAST") }
      catch { /* sigue sin foto */ }
    } else {
      doc.setDrawColor(200, 208, 218); doc.setLineWidth(0.25);
      doc.setLineDashPattern([0.7, 0.7], 0);
      doc.rect(x + 1.5, y + 1.5, COL[0] - 3, FILA - 3);
      doc.setLineDashPattern([], 0);
    }
    x += COL[0];
    const celdas = [a.codigo, fecha6(a.fecha), a.ubicacion, a.producto,
                    String(a.cajas), nf.format(a.unidades), CAUSAL_NOMBRE[a.causal],
                    a.documento ?? "Pendiente"];
    fuente("normal", 8); tinta();
    celdas.forEach((c, j) => {
      const k = j + 1;
      if (k === 8 && !a.documento) { fuente("bold", 8); doc.setTextColor(...MAL) }
      if (k === 7) { fuente("normal", 6.8); gris() }
      const lineas = doc.splitTextToSize(c, COL[k] - 3).slice(0, 2);
      if (k === 5 || k === 6) doc.text(String(c), x + COL[k] - 2, y + 5, { align: "right" });
      else doc.text(lineas, x + 2, y + 4.5);
      fuente("normal", 8); tinta();
      x += COL[k];
    });
    /* EL PRODUCTO LLEVA SU CÓDIGO Y SU VENCIMIENTO en letra chica: son
       los dos datos que se piden cuando alguien reclama. */
    fuente("normal", 6.2); doc.setTextColor(140, 150, 162);
    doc.text(`${a.producto_codigo}${a.vence ? " · vence " + fecha6(a.vence) : ""}`,
             M + COL[0] + COL[1] + COL[2] + COL[3] + 2, y + 9);
    fuente("normal", 6.2); gris();
    doc.text(a.reporto, M + 2, y + FILA - 0.8);
    y += FILA;
  });

  const pie = d.filtros ? `Filtrado · ${d.filtros}` : "Sin filtros";
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5); gris();
    const anchoIzq = W / 2 - M - doc.getTextWidth("Bavaria") / 2 - 4;
    /* SE CORTA POR PARTES, NO A LA MITAD DE UNA PALABRA. Con el texto
       entero, `splitTextToSize` devolvía «…todas las averías del» y ahí
       quedaba: un pie cortado en seco se lee como un error de la app.
       Se va quitando de atrás hacia adelante hasta que quepa. */
    const trozos = [`Averías · ${d.periodo}`, pie];
    let izq = trozos.join(" · ");
    while (trozos.length > 1 && doc.getTextWidth(izq) > anchoIzq) {
      trozos.pop(); izq = trozos.join(" · ");
    }
    doc.text(doc.splitTextToSize(izq, anchoIzq)[0] ?? "", M, PIE);
    doc.text("Bavaria", W / 2, PIE, { align: "center" });
    doc.text(`Página ${i} de ${n}`, W - M, PIE, { align: "right" });
  }
  return doc;
}

export const nombreInformeAverias = (hoy: string) => `averias-${hoy}.pdf`;
