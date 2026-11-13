/**
 * EL PDF DEL INFORME DE CIERRE (análisis de diferencia) — con el diseño aprobado.
 *
 * «Tamaño carta, no A4. Logo de Bavaria arriba a la izquierda en cada página, y la B grande como marca de
 *  agua muy suave al fondo (~7 %). Estilo sobrio: sin tarjetas de colores, sin pastillas ni rejilla de
 *  cajas. Rojo solo para negativos; estados como texto.»
 *
 * Pinta la misma lista de bloques que arma `cierre-informe.ts` (y que el Word también pinta). Medidas
 * sacadas del diseño en HTML (816 × 1056 px = carta a 96 ppp): 1 px = 0,2646 mm; 1 px de letra = 0,75 pt.
 * No calcula nada.
 */
import type { jsPDF as JsPDF } from "jspdf";
import type { Bloque, CeldaT } from "./evidencias-informe";

type RGB = [number, number, number];
export type OpcionesCierrePdf = {
  /** Lo que dice el pie: «Periodo: lunes, 9 de noviembre de 2026 · Análisis de diferencia». */
  pie: string;
  /** La fecha de arriba a la derecha: en la portada, el día en que se generó; en las demás, el día del análisis. */
  fechaPortada: string; fechaHojas: string;
  /** La cabecera de la portada («INVENTARIO · BALANCE · BODEGA 38») y la de las hojas sin `ojo` propio. */
  ojoPortada: string; ojo: string;
  /** data URL de /marca/logo-bavaria.png (540×160) y de /marca/logo-b.png. */
  logo?: string; sello?: string;
};

const px = (v: number) => v * 0.2646;          // px del diseño → mm
const pt = (v: number) => v * 0.75;            // px de letra → pt
const hexRGB = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const TINTA: RGB = [21, 24, 28];                 // #15181c
const ROTULO: RGB = [59, 64, 71];                // #3b4047
const GRIS: RGB = [107, 112, 120];               // #6b7078
const SUB: RGB = [74, 79, 87];                   // #4a4f57
const TEXTO: RGB = [35, 39, 45];                 // #23272d
const LINEA: RGB = [225, 227, 230];              // #e1e3e6
const LINEA_PIE: RGB = [207, 210, 214];          // #cfd2d6
const SEP: RGB = [154, 158, 164];                // #9a9ea4

export function dibujarCierre(JsPDFCtor: typeof JsPDF, bloques: Bloque[], o: OpcionesCierrePdf): JsPDF {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "letter" });
  const W = 215.9, H = 279.4, M = px(48), CW = W - 2 * M, ARRIBA = px(46);
  const TOPE = H - 16;
  let y = ARRIBA;
  let ojoActual = o.ojo;

  const color = (c: RGB) => doc.setTextColor(...c);
  const fuente = (peso: "normal" | "bold", tamPx: number) => { doc.setFont("helvetica", peso); doc.setFontSize(pt(tamPx)) };
  const lh = (tamPx: number, k = 1.3) => px(tamPx * k);
  const partir = (s: string, ancho: number): string[] => doc.splitTextToSize(s, Math.max(ancho, 4));
  const raya = (x1: number, yy: number, x2: number, grosorPx: number, c: RGB) => { doc.setDrawColor(...c); doc.setLineWidth(px(grosorPx)); doc.line(x1, yy, x2, yy) };

  const agua = () => {
    if (!o.sello) return;
    const lado = px(520);
    try {
      doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown }).GState({ opacity: 0.07 }));
      doc.addImage(o.sello, "PNG", (W - lado) / 2, H * 0.56 - lado / 2, lado, lado, "sello", "FAST");
    } catch { /* sin marca de agua */ } finally {
      try { doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown }).GState({ opacity: 1 })) } catch { /* sigue */ }
    }
  };

  /* LA CABECERA DE CADA HOJA: el logo de Bavaria a la izquierda con el rótulo en mayúscula espaciada,
     la fecha a la derecha y una raya gruesa debajo. */
  const cabecera = (ojo: string, fecha: string) => {
    agua();
    const AL = px(30), AN = AL * 540 / 160;
    let xx = M;
    if (o.logo) { try { doc.addImage(o.logo, "PNG", M, ARRIBA, AN, AL, "logo", "FAST"); xx = M + AN + px(14) } catch { /* sin logo */ } }
    if (xx === M) { fuente("bold", 16); doc.setTextColor(200, 16, 46); doc.text("Bavaria", M, ARRIBA + AL * 0.72); xx = M + 24 }
    fuente("bold", 10); color(TINTA); doc.setCharSpace(px(10 * 0.14));
    doc.text(ojo, xx, ARRIBA + AL / 2 + 1.2); doc.setCharSpace(0);
    fuente("normal", 9); color(GRIS); doc.text(fecha, W - M, ARRIBA + AL / 2 + 1.1, { align: "right" });
    y = ARRIBA + AL + px(9);
    raya(M, y, W - M, 2, TINTA);
    y += px(2);
  };
  const hojaNueva = () => { doc.addPage("letter", "portrait"); cabecera(ojoActual, o.fechaHojas) };
  const cabe = (alto: number) => { if (y + alto > TOPE) { hojaNueva(); y += px(14) } };

  /* ----------------- bloques ----------------- */
  const portada = (b: Extract<Bloque, { t: "portada" }>) => {
    cabecera(o.ojoPortada, o.fechaPortada);
    y += px(22);
    fuente("bold", 23); color(TINTA);
    const ls = partir(b.titulo, CW);
    ls.forEach((l, i) => doc.text(l, M, y + px(19) + i * lh(23, 1.2)));
    y += px(19) + (ls.length - 1) * lh(23, 1.2) + px(5);
    fuente("normal", 11.5); color(SUB); doc.text(b.sub, M, y + px(11)); y += px(11) + px(10);
    fuente("normal", 9); color(GRIS);
    for (const m of b.meta) { const t = partir(m, CW); doc.text(t, M, y + px(9)); y += t.length * lh(9, 1.55) }
  };

  /* EL TÍTULO DE SECCIÓN: «1  Resumen del cierre» — el número en tinta, el nombre en gris, raya debajo. */
  const encabezadoSeccion = (fuerte: string, suave: string | undefined) => {
    fuente("bold", 13);
    const wF = doc.getTextWidth(fuerte);
    fuente("normal", 13);
    const lineasSuave = suave ? partir(suave, CW - wF - px(10)) : [];
    const alto = Math.max(1, lineasSuave.length) * lh(13, 1.25) + px(6);
    cabe(px(26) + alto + px(40));
    y += px(26);
    fuente("bold", 13); color(TINTA); doc.text(fuerte, M, y + px(13));
    if (lineasSuave.length) { fuente("normal", 13); color(GRIS); doc.text(lineasSuave, M + wF + px(10), y + px(13)) }
    y += alto;
    raya(M, y, W - M, 1, TINTA);
    y += px(9);
  };

  const modulo = (b: Extract<Bloque, { t: "modulo" }>) => {
    if (b.ojo) ojoActual = b.ojo;
    if (!b.seguido) { hojaNueva(); y -= px(12) }      // la sección abre la hoja: su margen de arriba es menor
    encabezadoSeccion(b.n, b.titulo);
    if (b.sub) { fuente("normal", 9); color(GRIS); const t = partir(b.sub, CW); doc.text(t, M, y + px(9)); y += t.length * lh(9, 1.45) + px(4) }
  };

  const parrafo = (txt: string, tenue?: boolean) => {
    const tam = tenue ? 8.5 : 10.5, k = tenue ? 1.5 : 1.6;
    fuente("normal", tam);
    const t = partir(txt, CW);
    y += tenue ? px(8) : px(14);
    let i = 0;
    while (i < t.length) {
      cabe(lh(tam, k) + 1);
      const caben = Math.max(1, Math.floor((TOPE - y) / lh(tam, k)));
      const trozo = t.slice(i, i + caben);
      fuente("normal", tam); color(tenue ? GRIS : TEXTO);
      trozo.forEach((l, j) => doc.text(l, M, y + px(tam) + j * lh(tam, k)));
      y += trozo.length * lh(tam, k);
      i += trozo.length;
    }
  };

  const texto = (c: CeldaT) => (typeof c === "string" ? c : c.x);
  const tinta = (c: CeldaT, base: RGB) => { const col = typeof c === "string" ? undefined : c.color; if (col) doc.setTextColor(...hexRGB(col)); else color(base) };

  /* EL RESUMEN EN DOS COLUMNAS: rótulo | cifra || rótulo | cifra. Raya de tinta arriba y abajo, rayas finas entre filas. */
  const pares = (b: Extract<Bloque, { t: "pares" }>) => {
    const G = px(28), wL = (CW - G) * 0.62 / 2, wV = (CW - G) * 0.38 / 2;
    const xA = M, xAv = M + wL + wV, xB = M + wL + wV + G, xBv = W - M;
    const PAD = px(6), TAM = 10.5;
    const altoFila = (f: (typeof b.filas)[number]) => {
      fuente("normal", TAM);
      const la = partir(f.a[0], wL - px(4)).length, lb = f.b ? partir(f.b[0], wL - px(4)).length : 1;
      return Math.max(la, lb) * lh(TAM) + 2 * PAD + (f.fuerte ? px(2) : 0);
    };
    cabe(Math.min(b.filas.reduce((t, f) => t + altoFila(f), 0), 60));
    raya(M, y, W - M, 1, TINTA);
    y += px(2);
    b.filas.forEach((f, i) => {
      const alto = altoFila(f);
      if (y + alto > TOPE) { raya(M, y, W - M, 1, TINTA); hojaNueva(); y += px(14); raya(M, y, W - M, 1, TINTA) }
      if (f.sep && i > 0) raya(M, y, W - M, 1, SEP);
      const base = y + PAD + px(TAM);
      const lado = (par: [string, CeldaT] | undefined, xL: number, xV: number, grande: boolean) => {
        if (!par) return;
        fuente("normal", TAM); color(ROTULO);
        doc.text(partir(par[0], wL - px(4)), xL, base);
        fuente("bold", grande ? 12 : TAM); tinta(par[1], TINTA);
        doc.text(texto(par[1]), xV - px(4), base + (grande ? px(0.8) : 0), { align: "right" });
      };
      lado(f.a, xA, xAv, !!f.fuerte);
      lado(f.b, xB, xBv, false);
      y += alto;
      if (i < b.filas.length - 1 && !b.filas[i + 1].sep) {
        raya(xA, y, xAv, 0.75, LINEA); raya(xB, y, xBv, 0.75, LINEA);
      }
    });
    raya(M, y, W - M, 1, TINTA);
    y += px(4);
  };

  const tabla = (b: Extract<Bloque, { t: "tabla" }>) => {
    const suma = b.cols.reduce((s, c) => s + c.w, 0);
    const anchos = b.cols.map((c) => (c.w / suma) * CW);
    const TAM = 9.5, PADX = px(6), PADY = b.compacta ? px(4) : px(6), LH = lh(TAM, 1.25);
    const alinea = (al: "l" | "r" | "c" | undefined) => (al === "r" ? "right" : al === "c" ? "center" : "left") as "left" | "right" | "center";
    const xTexto = (xx: number, i: number) => {
      const al = b.cols[i].al;
      return al === "r" ? xx + anchos[i] - PADX : al === "c" ? xx + anchos[i] / 2 : xx + PADX;
    };
    const pintaEncabezado = () => {
      fuente("bold", 8);
      const lineas = b.cols.map((c, i) => partir(c.h.toUpperCase(), anchos[i] - 2 * PADX));
      const alto = Math.max(...lineas.map((l) => l.length)) * lh(8, 1.2) + px(14);
      cabe(alto + px(30));
      y += px(4);
      color(GRIS);
      let xx = M;
      b.cols.forEach((c, i) => {
        doc.text(lineas[i], xTexto(xx, i), y + px(7) + px(8), { align: alinea(c.al) });
        xx += anchos[i];
      });
      y += alto;
      raya(M, y, W - M, 1, TINTA);
    };
    pintaEncabezado();
    if (!b.filas.length && b.nota) { fuente("normal", 8.5); color(GRIS); cabe(8); doc.text(partir(b.nota, CW), M, y + px(16)); y += px(26); return }
    b.filas.forEach((fila, r) => {
      const esTotal = !!b.total && r === b.filas.length - 1;
      const lineas = fila.map((c, i) => {
        fuente(esTotal || (typeof c !== "string" && c.bold) ? "bold" : "normal", TAM);
        return partir(texto(c), anchos[i] - 2 * PADX);
      });
      const nl = Math.max(...lineas.map((l) => l.length));
      const alto = nl * LH + 2 * PADY + (esTotal ? px(2) : 0);
      if (y + alto > TOPE) { hojaNueva(); y += px(14); pintaEncabezado() }
      if (esTotal) raya(M, y, W - M, 1.5, TINTA);
      let xx = M;
      fila.forEach((c, i) => {
        const obj = typeof c === "string" ? null : c;
        fuente(esTotal || obj?.bold ? "bold" : "normal", TAM);
        tinta(c, TINTA);
        doc.text(lineas[i], xTexto(xx, i), y + PADY + px(TAM) + (esTotal ? px(2) : 0), { align: alinea(b.cols[i].al) });
        xx += anchos[i];
      });
      y += alto;
      if (!esTotal) raya(M, y, W - M, 0.75, LINEA);
    });
    if (b.nota) { fuente("normal", 8.5); const t = partir(b.nota, CW); cabe(t.length * lh(8.5, 1.5) + px(9)); color(GRIS); doc.text(t, M, y + px(9) + px(8.5)); y += px(9) + t.length * lh(8.5, 1.5) }
    y += px(6);
  };

  const lista = (items: string[]) => {
    for (const it of items) parrafo(`· ${it}`);
  };

  /* ----------------- recorrido ----------------- */
  for (const b of bloques) {
    switch (b.t) {
      case "portada": portada(b); break;
      case "modulo": modulo(b); break;
      case "sub": encabezadoSeccion(b.texto, b.extra); break;
      case "p": parrafo(b.texto, b.gris); break;
      case "lista": lista(b.items); break;
      case "pares": pares(b); break;
      case "tabla": tabla(b); break;
      /* El informe de cierre no lleva tarjetas, gráficas ni fotos. */
      default: break;
    }
  }

  /* Pie de TODAS las hojas: el periodo a la izquierda y «Página n de N» a la derecha. */
  const N = doc.getNumberOfPages();
  for (let i = 1; i <= N; i++) {
    doc.setPage(i);
    raya(M, H - px(26) - px(7) - px(8.5), W - M, 0.75, LINEA_PIE);
    fuente("normal", 8.5); color(GRIS);
    doc.text(partir(o.pie, CW - 30)[0], M, H - px(26));
    doc.text(`Página ${i} de ${N}`, W - M, H - px(26), { align: "right" });
  }
  return doc;
}
