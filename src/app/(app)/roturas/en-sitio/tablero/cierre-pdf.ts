/**
 * EL PDF DEL CIERRE DE TURNO DE ROTURAS EN SITIO.
 *
 * «…con exportables PDF, así como en el control de traspasos.»
 *
 * SALE DE LAS MISMAS PIEZAS que el informe de Análisis: la paleta, la
 * cinta del degradado, la marca de agua y la forma de la cabecera se
 * importan de `@/modulos/rotlinea/hoja`. Los papeles de este centro se
 * mandan a las mismas personas; que se parezcan no es un detalle.
 *
 * NO CALCULA NADA. Recibe el `Cierre` ya armado por `armarCierre` —la
 * misma cuenta que pinta la ficha y que copia el texto—. Si el PDF
 * sumara por su cuenta, el día que cambie una regla diría otra cifra y
 * la que se manda por correo es la del PDF.
 *
 * LLEVA ESCRITOS LOS FILTROS: un PDF se lee semanas después sin la
 * pantalla al lado, y un cierre filtrado que no lo diga se lee como el
 * día entero. Va en una franja bajo la cabecera y en el pie de TODAS las
 * hojas.
 *
 * SIEMPRE VERTICAL, y la tabla de roturas parte en cada turno: así el
 * papel se lee como la ficha —un turno, y debajo lo que se registró en
 * él— y no como una lista de trescientas filas sin dónde cortar.
 */
import type { jsPDF as JsPDF } from "jspdf";
import { PALETA_MARCA, type Marca, type Paleta } from "@/modulos/rotlinea/hoja";
import {
  ddmm, diaLargo, HORARIO_TURNO, ORIGEN_TXT, type Cierre, type Cuenta,
} from "@/modulos/roturas/cierre";

type RGB = [number, number, number];

export type ExtraCierre = {
  titulo: string;
  ojo: string;
  periodo: string;
  filtros: string;
  generado: Date;
  marca?: Marca;
  paleta?: Paleta;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function dibujarCierre(JsPDFCtor: typeof JsPDF, c: Cierre, x: ExtraCierre): JsPDF {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, ANCHO = W - 2 * M;
  const PIE = H - 10;
  const TOPE = PIE - 6;
  let y = M;

  const P = x.paleta ?? PALETA_MARCA;
  const TINTA = P.tinta;
  const TENUE: RGB = TINTA.map((v) => Math.round(255 - (255 - v) * 0.16)) as RGB;
  const MAL: RGB = [200, 16, 46];
  const marca = x.marca ?? {};
  const t = c.total;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso: "normal" | "bold", tam: number) => { doc.setFont("helvetica", peso); doc.setFontSize(tam) };
  const cabeEn = (s: string, ancho: number) => doc.splitTextToSize(s, Math.max(ancho, 4))[0] ?? "";

  const cinta = (xx: number, yy: number, ancho: number, alto: number) => {
    const N = Math.max(12, Math.round(ancho / 1.5));
    const paso = ancho / N;
    for (let i = 0; i < N; i++) {
      const u0 = i / (N - 1);
      let k = 0;
      while (k < P.cinta.length - 2 && u0 > P.cinta[k + 1][0]) k++;
      const [ta, a] = P.cinta[k], [tb, b] = P.cinta[k + 1];
      const u = Math.min(1, Math.max(0, (u0 - ta) / (tb - ta)));
      doc.setFillColor(
        Math.round(a[0] + (b[0] - a[0]) * u),
        Math.round(a[1] + (b[1] - a[1]) * u),
        Math.round(a[2] + (b[2] - a[2]) * u));
      doc.rect(xx + i * paso, yy, paso + 0.15, alto, "F");
    }
  };
  const opacidad = (o: number) =>
    doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown }).GState({ opacity: o }));
  const aguaDeFondo = () => {
    if (!marca.sello) return;
    try {
      opacidad(0.04);
      doc.addImage(marca.sello, "PNG", (W - 120) / 2, 118, 120, 120, "sello", "FAST");
    } catch { /* una marca de agua que no carga no frena el cierre */ }
    finally { opacidad(1) }
  };

  /** Hoja nueva con su cabecera chica: un papel suelto de la página 3, sin
   *  eso, no se sabe de dónde salió ni de qué turno es. */
  const hojaNueva = () => {
    doc.addPage([W, H], "portrait");
    aguaDeFondo();
    cinta(0, 0, W, 2.2);
    if (marca.sello) { try { doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ } }
    const xx = M + (marca.sello ? 12 : 0);
    fuente("bold", 10); tinta();
    doc.text(`Roturas en sitio · ${x.titulo.toLowerCase()}`, xx, 12.2);
    fuente("normal", 8.5); gris();
    doc.text(cap(x.periodo), xx, 15.8);
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.3);
    doc.line(M, 19.5, W - M, 19.5);
    y = 24;
  };
  const cabe = (alto: number) => { if (y + alto > TOPE) hojaNueva() };

  const titulo = (txt: string, nota?: string) => {
    doc.setFillColor(...P.acento);
    doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11); tinta();
    doc.text(txt, M + 4.5, y + 4);
    if (nota) { fuente("normal", 8.5); gris(); doc.text(nota, W - M, y + 4, { align: "right" }) }
    y += 7;
  };

  /* ---------------- CABECERA ---------------- */
  aguaDeFondo();
  cinta(0, 0, W, 4.5);
  const ALTO_LOGO = 15;
  let conLogo = false;
  if (marca.palabra) {
    try {
      doc.addImage(marca.palabra, "PNG", M, 11, ALTO_LOGO * 540 / 160, ALTO_LOGO, "palabra", "FAST");
      conLogo = true;
    } catch { /* sin logo, el cierre sale igual */ }
  }
  if (!conLogo) { fuente("bold", 16); doc.setTextColor(255, 0, 15); doc.text("Bavaria", M, 21) }
  fuente("bold", 7.5); gris();
  doc.text("CENTRO DE DISTRIBUCIÓN CD38 · CONTROL", W - M, 13.5, { align: "right" });
  fuente("bold", 20); tinta();
  doc.text(x.titulo, W - M, 21.5, { align: "right" });
  fuente("normal", 10); gris();
  doc.text(`Roturas en sitio · ${cap(x.periodo)}`, W - M, 27.5, { align: "right" });
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.5);
  doc.line(M, 32, W - M, 32);
  y = 37;

  if (x.filtros) {
    const ALTO_F = 9;
    doc.setFillColor(...TINTA); doc.rect(M, y, 2.2, ALTO_F, "F");
    doc.setDrawColor(213, 220, 229); doc.setLineWidth(0.2);
    doc.rect(M + 2.2, y, ANCHO - 2.2, ALTO_F);
    fuente("bold", 7.5); gris(); doc.text("FILTRADO", M + 6, y + 5.8);
    fuente("normal", 8.5); tinta();
    doc.text(cabeEn(x.filtros, ANCHO - 34), M + 26, y + 5.8);
    y += ALTO_F + 6;
  }

  /* ---------------- LA BANDA: REGISTROS · REPORTADAS · ENCONTRADAS ----------------
     Las tres cifras que se pidieron, antes que cualquier tabla. */
  const ALTO_KPI = 25;
  doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, ALTO_KPI, "F");
  doc.setFillColor(...P.acento); doc.rect(M, y, 3, ALTO_KPI, "F");
  doc.setTextColor(255, 255, 255);
  fuente("bold", 30);
  const cifra = String(t.registros);
  doc.text(cifra, M + 9, y + 16);
  fuente("normal", 10.5); doc.setTextColor(...TENUE);
  doc.text(`registro${t.registros === 1 ? "" : "s"}`, M + 11 + doc.getTextWidth(cifra) * 30 / 10.5, y + 16);
  const colX = [M + 78, M + 112, M + 146];
  [["REPORTADAS", t.reportadas], ["ENCONTRADAS", t.encontradas], ["SIN ORIGEN", t.sinOrigen]].forEach(([r, n], i) => {
    fuente("bold", 6.8); doc.setTextColor(...TENUE);
    doc.text(String(r), colX[i], y + 8.5);
    fuente("bold", 17);
    if (i === 2 && Number(n) > 0) doc.setTextColor(255, 120, 130); else doc.setTextColor(255, 255, 255);
    doc.text(String(n), colX[i], y + 17);
  });
  fuente("normal", 8); doc.setTextColor(...TENUE);
  doc.text(`${nf.format(t.rotas)} rotas${t.contaminadas ? ` y ${nf.format(t.contaminadas)} contaminadas` : ""}` +
           `${t.anuladas ? ` · ${t.anuladas} anulada${t.anuladas === 1 ? "" : "s"} aparte` : ""}`, M + 9, y + 21.8);
  fuente("normal", 7.5);
  doc.text(`Foto de las ${x.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} del ` +
           `${x.generado.toLocaleDateString("es-CO")}`, W - M - 4, y + 21.8, { align: "right" });
  y += ALTO_KPI;

  /* LO QUE FALTA, PEGADO A LA CIFRA. Sin origen es un hueco que se ve. */
  if (t.sinOrigen > 0) {
    doc.setFillColor(...MAL); doc.rect(M, y, ANCHO, 7, "F");
    doc.setTextColor(255, 255, 255); fuente("bold", 8);
    doc.text(`${nf.format(t.sinOrigen)} registro${t.sinOrigen === 1 ? "" : "s"} sin origen: no dicen si las reportó un OPM o si se encontraron`, M + 4, y + 4.8);
    y += 7;
  }
  y += 8;

  /* ---------------- POR TURNO ---------------- */
  titulo("Por turno", `${c.turnos.length} turno${c.turnos.length === 1 ? "" : "s"} · el C abre el día`);
  {
    const COL = [24, 22, 22, 22, 22, 20, 20, ANCHO - 152];
    const CAB = ["DÍA", "TURNO", "REGISTROS", "REPORT.", "ENCONTR.", "ROTAS", "CONTAM.", "A COBRO"];
    doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, 6, "F");
    doc.setTextColor(255, 255, 255); fuente("bold", 7);
    let xx = M;
    CAB.forEach((h, i) => { if (i >= 2) doc.text(h, xx + COL[i] - 2, y + 4, { align: "right" }); else doc.text(h, xx + 2, y + 4); xx += COL[i] });
    y += 6;
    if (c.turnos.length === 0) { fuente("normal", 9.5); gris(); doc.text("No hay roturas con estos filtros.", M + 2, y + 5); y += 10 }
    c.turnos.forEach((tt, i) => {
      cabe(7);
      if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, 7, "F") }
      const celdas = [ddmm(tt.dia), `${tt.turno} · ${HORARIO_TURNO[tt.turno]}`, String(tt.registros), String(tt.reportadas),
        String(tt.encontradas), nf.format(tt.rotas), tt.contaminadas ? nf.format(tt.contaminadas) : "—", String(tt.aCobro)];
      xx = M;
      celdas.forEach((s, j) => {
        fuente(j === 2 ? "bold" : "normal", j === 1 ? 7.5 : 8.5); tinta();
        if (tt.registros === 0) doc.setTextColor(150, 160, 172);
        if (j >= 2) doc.text(s, xx + COL[j] - 2, y + 4.8, { align: "right" });
        else doc.text(cabeEn(s, COL[j] - 3), xx + 2, y + 4.8);
        xx += COL[j];
      });
      y += 7;
    });
    if (t.sinOrigen > 0) {
      /* Los sin origen se dicen por turno solo cuando los hay, y en rojo. */
      fuente("normal", 7.5); doc.setTextColor(...MAL);
      doc.text("Sin origen por turno: " + c.turnos.filter((q) => q.sinOrigen).map((q) => `${ddmm(q.dia)} ${q.turno}: ${q.sinOrigen}`).join(" · "),
               M + 2, y + 5);
      y += 7;
    }
    y += 5;
  }

  /* ---------------- A QUÉ CORRESPONDE ---------------- */
  if (t.registros > 0) {
    const lista = (nom: string, nota: string, filas: Cuenta[]) => {
      const mostrar = filas.slice(0, 8);
      cabe(10 + 5.6 * (mostrar.length + 1));
      fuente("bold", 9.5); tinta(); doc.text(nom, M + 1, y + 3.6);
      fuente("normal", 8); gris(); doc.text(nota, M + 2 + doc.getTextWidth(nom) * 9.5 / 8 + 2, y + 3.6);
      y += 6;
      const aN = ANCHO - 118;
      fuente("bold", 6.6); doc.setTextColor(95, 107, 121);
      doc.text("NOMBRE", M + 1, y + 2.8);
      doc.text("REG.", M + aN + 14, y + 2.8, { align: "right" });
      doc.text("ROTAS", M + aN + 32, y + 2.8, { align: "right" });
      doc.text("CONTAM.", M + aN + 52, y + 2.8, { align: "right" });
      doc.text("PESO", M + ANCHO - 1, y + 2.8, { align: "right" });
      doc.setDrawColor(213, 220, 229); doc.setLineWidth(0.2); doc.line(M, y + 4, W - M, y + 4);
      y += 5;
      mostrar.forEach((f) => {
        const sd = f.nombre === "Sin dato";
        fuente(sd ? "normal" : "bold", 8); if (sd) doc.setTextColor(...MAL); else tinta();
        doc.text(cabeEn(f.nombre, aN - 2), M + 1, y + 3.4);
        fuente("bold", 8); tinta();
        doc.text(String(f.n), M + aN + 14, y + 3.4, { align: "right" });
        fuente("normal", 8); gris();
        doc.text(nf.format(f.rotas), M + aN + 32, y + 3.4, { align: "right" });
        doc.text(f.contaminadas ? nf.format(f.contaminadas) : "—", M + aN + 52, y + 3.4, { align: "right" });
        const p = f.n / t.registros;
        doc.setFillColor(238, 241, 245); doc.rect(M + aN + 58, y + 1.4, 56, 2.4, "F");
        doc.setFillColor(...TINTA); doc.rect(M + aN + 58, y + 1.4, Math.max(0.6, 56 * p), 2.4, "F");
        y += 5.6;
      });
      if (filas.length > 8) {
        fuente("normal", 7); doc.setTextColor(140, 150, 162);
        doc.text(`y ${filas.length - 8} más`, M + 1, y + 3); y += 4.6;
      }
      y += 4;
    };
    titulo("A qué corresponde", "todo lo del cierre, junto");
    lista("Por causa", "qué la rompió", t.porCausa);
    lista("Por proceso", "dónde pasó", t.porProceso);
    lista("Por área", "en qué zona", t.porArea);
    lista("Quién registró", "en la app", t.porQuien);
  }

  /* ---------------- LAS ROTURAS, TURNO POR TURNO ---------------- */
  const COL = [13, 21, 46, 12, 12, ANCHO - 104];
  const CAB = ["HORA", "ROTURA", "MATERIAL", "ROTAS", "CONTAM.", "CAUSA · PROCESO"];
  const FILA = 9.4;
  const conFilas = c.turnos.filter((q) => q.filas.length > 0);
  conFilas.forEach((tt, k) => {
    const cabeza = (sigue: boolean) => {
      doc.setFillColor(...TINTA); doc.rect(M, y, ANCHO, 8, "F");
      doc.setFillColor(...P.acento); doc.rect(M, y, 3, 8, "F");
      doc.setTextColor(255, 255, 255); fuente("bold", 10.5);
      doc.text(`Turno ${tt.turno}${sigue ? " (continúa)" : ""}`, M + 7, y + 5.5);
      fuente("normal", 8); doc.setTextColor(...TENUE);
      doc.text(`${HORARIO_TURNO[tt.turno]} · ${cap(diaLargo(tt.dia))}`, M + 7 + 28, y + 5.5);
      doc.text(`${tt.registros} registro${tt.registros === 1 ? "" : "s"} · ${tt.reportadas} reportadas · ${tt.encontradas} encontradas` +
               `${tt.sinOrigen ? ` · ${tt.sinOrigen} sin origen` : ""}`, W - M - 3, y + 5.5, { align: "right" });
      y += 8;
      doc.setFillColor(238, 241, 245); doc.rect(M, y, ANCHO, 5.4, "F");
      doc.setTextColor(95, 107, 121); fuente("bold", 6.6);
      let xx = M;
      CAB.forEach((h, i) => { if (i === 3 || i === 4) doc.text(h, xx + COL[i] - 1.5, y + 3.8, { align: "right" }); else doc.text(h, xx + 1.5, y + 3.8); xx += COL[i] });
      y += 5.4;
    };
    cabe(8 + 5.4 + FILA * 2 + (k > 0 ? 6 : 0));
    if (k > 0) y += 6;
    cabeza(false);
    tt.filas.forEach((f, i) => {
      if (y + FILA > TOPE) { hojaNueva(); cabeza(true) }
      if (i % 2 === 1) { doc.setFillColor(250, 251, 252); doc.rect(M, y, ANCHO, FILA, "F") }
      let xx = M;
      const v = f.anulada;
      const celdas = [f.hora, f.codigo, f.material_nombre, nf.format(f.rotas), f.tipo === "eer" ? "—" : f.contaminadas ? nf.format(f.contaminadas) : "—",
        `${f.causa || "Sin dato"} · ${f.proceso || "Sin dato"}`];
      celdas.forEach((s, j) => {
        fuente(j === 1 ? "bold" : "normal", 8);
        if (v) doc.setTextColor(140, 150, 162); else tinta();
        if (j === 5 && !f.causa) doc.setTextColor(...MAL);
        if (j === 3 || j === 4) doc.text(s, xx + COL[j] - 1.5, y + 4.2, { align: "right" });
        else doc.text(cabeEn(s, COL[j] - 2.5), xx + 1.5, y + 4.2);
        xx += COL[j];
      });
      /* EL RENGLÓN CHICO: lo que se pregunta cuando alguien discute una —el
         origen, quién la registró y en qué parte del camino va—. El origen
         va bajo la hora y el código; el resto, bajo el material. */
      const origen = f.origen === "sin" ? "SIN ORIGEN" : ORIGEN_TXT[f.origen].toUpperCase();
      fuente("bold", 6.4);
      if (f.origen === "sin") doc.setTextColor(...MAL); else doc.setTextColor(...TINTA);
      doc.text(origen, M + 1.5, y + 7.8);
      fuente("normal", 6.4); doc.setTextColor(140, 150, 162);
      const resto = [f.material, f.area, f.opm ? `OPM ${f.opm}` : "", f.registro ? `registró ${f.registro}` : "", v ? "ANULADA" : f.estado.toLowerCase()].filter(Boolean).join(" · ");
      doc.text(cabeEn(resto, ANCHO - COL[0] - COL[1] - 3), M + COL[0] + COL[1] + 1.5, y + 7.8);
      y += FILA;
    });
  });
  if (conFilas.length === 0) {
    fuente("normal", 9.5); gris();
    doc.text("No hay roturas registradas en este cierre.", M + 2, y + 4);
    y += 10;
  }

  /* ---------------- PIE DE CADA PÁGINA ---------------- */
  const pie = x.filtros ? `Filtrado · ${x.filtros}` : "Sin filtros";
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5); gris();
    const anchoIzq = W / 2 - M - doc.getTextWidth("Bavaria") / 2 - 4;
    /* EL FILTRO PRIMERO: si no cabe todo, lo que NO se puede perder es que
       el papel está filtrado. */
    const trozos = [pie, `Cierre de roturas · ${x.periodo}`];
    let izq = trozos.join(" · ");
    while (trozos.length > 1 && doc.getTextWidth(izq) > anchoIzq) { trozos.pop(); izq = trozos.join(" · ") }
    doc.text(cabeEn(izq, anchoIzq), M, PIE);
    doc.text("Bavaria", W / 2, PIE, { align: "center" });
    doc.text(`Página ${i} de ${n}`, W - M, PIE, { align: "right" });
  }
  return doc;
}

/** Dice qué es, de qué día y de qué turno, para que en el chat no llegue «documento (3).pdf». */
export const nombreCierre = (c: Cierre, turnos: string[]) =>
  `cierre-roturas-sitio-${c.desde || "sin-fecha"}${c.hasta && c.hasta !== c.desde ? "-a-" + c.hasta : ""}` +
  `${turnos.length && turnos.length < 3 ? "-turno-" + turnos.join("") : ""}.pdf`;
