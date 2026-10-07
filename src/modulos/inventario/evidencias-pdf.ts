/**
 * EL PDF DE EVIDENCIAS — pinta la lista de bloques de `evidencias-informe.ts`.
 *
 * Horizontal (A4): el mapa de calor y las tablas son anchos. Misma casa que los demás papeles de
 * Inventario: cinta del tema, logo de Bavaria, marca de agua, pie con el periodo y «Página n de N».
 * Cada MÓDULO arranca en hoja nueva con su banda, y las tablas repiten su encabezado al partir.
 * No calcula nada.
 */
import type { jsPDF as JsPDF } from "jspdf";
import { PALETA_MARCA, type Marca, type Paleta } from "@/modulos/rotlinea/hoja";
import type { Bloque, CeldaT } from "./evidencias-informe";

type RGB = [number, number, number];
export type ExtraPdf = { periodo: string; filtros: string; generado: string; marca?: Marca; paleta?: Paleta };

const hexRGB = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

export function dibujarEvidencias(JsPDFCtor: typeof JsPDF, bloques: Bloque[], x: ExtraPdf): JsPDF {
  const doc = new JsPDFCtor({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297, H = 210, M = 12, CW = W - 2 * M;
  const TOPE = H - 14;
  const P = x.paleta ?? PALETA_MARCA;
  const TINTA = P.tinta;
  const TENUE: RGB = TINTA.map((v) => Math.round(255 - (255 - v) * 0.07)) as RGB;
  const marca = x.marca ?? {};
  let y = M;

  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso: "normal" | "bold", tam: number) => { doc.setFont("helvetica", peso); doc.setFontSize(tam) };
  const lh = (tam: number) => tam * 0.3528 * 1.28;       // alto de línea en mm
  const partir = (s: string, ancho: number): string[] => doc.splitTextToSize(s, Math.max(ancho, 4));

  const cinta = (xx: number, yy: number, ancho: number, alto: number) => {
    const N = Math.max(12, Math.round(ancho / 1.5)), paso = ancho / N;
    for (let i = 0; i < N; i++) {
      const u0 = i / (N - 1); let k = 0;
      while (k < P.cinta.length - 2 && u0 > P.cinta[k + 1][0]) k++;
      const [ta, a] = P.cinta[k], [tb, b] = P.cinta[k + 1];
      const u = Math.min(1, Math.max(0, (u0 - ta) / (tb - ta)));
      doc.setFillColor(Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u));
      doc.rect(xx + i * paso, yy, paso + 0.15, alto, "F");
    }
  };
  const opacidad = (o: number) => doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown }).GState({ opacity: o }));
  const aguaDeFondo = () => {
    if (!marca.sello) return;
    try { opacidad(0.035); doc.addImage(marca.sello, "PNG", (W - 130) / 2, 40, 130, 130, "sello", "FAST") } catch { /* sin marca de agua */ } finally { opacidad(1) }
  };

  /* Hoja nueva con su cabecera chica: una hoja suelta, sin esto, no dice de dónde salió. */
  const hojaNueva = () => {
    doc.addPage([W, H], "landscape");
    aguaDeFondo();
    cinta(0, 0, W, 2.2);
    if (marca.sello) { try { doc.addImage(marca.sello, "PNG", M, 6, 8, 8, "sello", "FAST") } catch { /* sigue */ } }
    const xx = M + (marca.sello ? 11 : 0);
    fuente("bold", 9.5); tinta(); doc.text("Inventario · Informe de evidencias del conteo", xx, 10.4);
    fuente("normal", 8); gris(); doc.text(x.periodo, xx, 14);
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.3); doc.line(M, 17, W - M, 17);
    y = 22;
  };
  const cabe = (alto: number) => { if (y + alto > TOPE) hojaNueva() };

  const pieDeImagen = (txt: string, xx: number, ancho: number) => { fuente("normal", 8); gris(); doc.text(txt, xx + ancho / 2, y + 3.4, { align: "center" }); y += 5 };

  /* ----------------- bloques ----------------- */
  const portada = (b: Extract<Bloque, { t: "portada" }>) => {
    aguaDeFondo();
    cinta(0, 0, W, 4.5);
    const AL = 15; let conLogo = false;
    if (marca.palabra) { try { doc.addImage(marca.palabra, "PNG", M, 10, AL * 540 / 160, AL, "palabra", "FAST"); conLogo = true } catch { /* sin logo */ } }
    if (!conLogo) { fuente("bold", 16); doc.setTextColor(255, 0, 15); doc.text("Bavaria", M, 21) }
    fuente("bold", 7.5); gris(); doc.text("INVENTARIO · CONTEO", W - M, 14, { align: "right" });
    fuente("normal", 8); doc.text(x.generado, W - M, 18.5, { align: "right" });
    y = 10 + AL + 6;
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.5); doc.line(M, y, W - M, y);
    y += 9;
    fuente("bold", 24); tinta(); doc.text(b.titulo, M, y); y += 8;
    fuente("normal", 12.5); gris(); doc.text(b.sub, M, y); y += 7;
    fuente("normal", 9); for (const m of b.meta) { doc.text(m, M, y); y += 4.6 }
    y += 3;
  };

  const modulo = (b: Extract<Bloque, { t: "modulo" }>) => {
    hojaNueva();
    doc.setFillColor(...TINTA); doc.rect(M, y, CW, 12, "F");
    doc.setFillColor(...P.acento); doc.rect(M, y, 3, 12, "F");
    fuente("bold", 8); doc.setTextColor(255, 255, 255); doc.text(b.n, M + 7, y + 4.6);
    fuente("bold", 14.5); doc.text(b.titulo, M + 7, y + 9.6);
    y += 15;
    if (b.sub) { fuente("normal", 9.5); gris(); const t = partir(b.sub, CW); doc.text(t, M, y + 2.5); y += t.length * lh(9.5) + 3 }
  };

  const sub = (txt: string) => {
    cabe(12);
    doc.setFillColor(...P.acento); doc.rect(M, y + 1.3, 2.6, 2.6, "F");
    fuente("bold", 11); tinta(); doc.text(txt, M + 4.5, y + 4); y += 8;
  };

  const parrafo = (txt: string, tenue?: boolean) => {
    fuente("normal", 9.5); if (tenue) gris(); else tinta();
    const t = partir(txt, CW); cabe(t.length * lh(9.5) + 2);
    doc.text(t, M, y + 3); y += t.length * lh(9.5) + 2;
  };

  const lista = (items: string[]) => {
    fuente("normal", 9.5);
    for (const it of items) {
      const t = partir(it, CW - 6); cabe(t.length * lh(9.5) + 1.5);
      tinta(); doc.setFillColor(...P.acento); doc.rect(M + 0.5, y + 1.6, 1.6, 1.6, "F");
      doc.text(t, M + 5, y + 3); y += t.length * lh(9.5) + 1.6;
    }
    y += 2;
  };

  const kpis = (items: Extract<Bloque, { t: "kpis" }>["items"]) => {
    const n = items.length, gap = 3, w = (CW - gap * (n - 1)) / n, alto = 22;
    cabe(alto + 3);
    items.forEach((k, i) => {
      const xx = M + i * (w + gap);
      doc.setFillColor(...TENUE); doc.setDrawColor(213, 220, 229); doc.setLineWidth(0.25); doc.rect(xx, y, w, alto, "FD");
      doc.setFillColor(...(k.color ? hexRGB(k.color) : P.acento)); doc.rect(xx, y, 1.6, alto, "F");
      fuente("bold", 6.8); gris(); doc.text(partir(k.rotulo.toUpperCase(), w - 6)[0], xx + 4, y + 5);
      fuente("bold", 19); tinta(); doc.text(k.valor, xx + 4, y + 14);
      if (k.detalle) { fuente("normal", 6.8); gris(); doc.text(partir(k.detalle, w - 6)[0], xx + 4, y + 19.2) }
    });
    y += alto + 5;
  };

  const imagen = (img: { png: string; w: number; h: number }, ancho: number, xx: number, tope: number): number => {
    let w = ancho, h = (img.h / img.w) * w;
    if (h > tope) { h = tope; w = (img.w / img.h) * h }
    try { doc.addImage(img.png, "PNG", xx + (ancho - w) / 2, y, w, h, undefined, "FAST") } catch { /* una gráfica que no entra no frena el informe */ }
    return h;
  };
  const bloqueImg = (b: Extract<Bloque, { t: "img" }>) => {
    const ancho = CW * (b.ancho ?? 1);
    const alto = (b.img.h / b.img.w) * ancho;
    const extra = b.pie ? 6 : 3;
    /* Si no cabe aquí y ya hay contenido arriba, hoja nueva; si es lo primero de la hoja, se achica para que quepa. */
    if (y + alto + extra > TOPE && y > 50) hojaNueva();
    const h = imagen(b.img, ancho, M, TOPE - y - extra);
    y += h; if (b.pie) pieDeImagen(b.pie, M, ancho); else y += 3;
  };
  const bloqueImgs2 = (b: Extract<Bloque, { t: "imgs2" }>) => {
    const gap = 6, w = (CW - gap) / 2;
    const alto = Math.max((b.a.h / b.a.w) * w, (b.b.h / b.b.w) * w);
    if (y + alto + 8 > TOPE && y > 50) hojaNueva();
    const top = y;
    const ha = imagen(b.a, w, M, TOPE - y - 8);
    y = top; const hb = imagen(b.b, w, M + w + gap, TOPE - y - 8);
    y = top + Math.max(ha, hb);
    if (b.pieA || b.pieB) {
      if (b.pieA) { fuente("normal", 8); gris(); doc.text(b.pieA, M + w / 2, y + 3.4, { align: "center" }) }
      if (b.pieB) { fuente("normal", 8); gris(); doc.text(b.pieB, M + w + gap + w / 2, y + 3.4, { align: "center" }) }
      y += 6;
    } else y += 3;
  };

  const texto = (c: CeldaT) => (typeof c === "string" ? c : c.x);
  const tabla = (b: Extract<Bloque, { t: "tabla" }>) => {
    const suma = b.cols.reduce((s, c) => s + c.w, 0);
    const anchos = b.cols.map((c) => (c.w / suma) * CW);
    const TAM = 8, PAD = 1.8, LH = lh(TAM);
    const pintaEncabezado = () => {
      fuente("bold", 7.2);
      const lineas = b.cols.map((c, i) => partir(c.h, anchos[i] - 2 * PAD));
      const alto = Math.max(...lineas.map((l) => l.length)) * lh(7.2) + 3.2;
      cabe(alto + 8);
      doc.setFillColor(...TINTA); doc.rect(M, y, CW, alto, "F");
      doc.setTextColor(255, 255, 255);
      let xx = M;
      b.cols.forEach((c, i) => {
        const tx = c.al === "r" ? xx + anchos[i] - PAD : c.al === "c" ? xx + anchos[i] / 2 : xx + PAD;
        doc.text(lineas[i], tx, y + 3.9, { align: c.al === "r" ? "right" : c.al === "c" ? "center" : "left" });
        xx += anchos[i];
      });
      y += alto;
    };
    pintaEncabezado();
    if (!b.filas.length && b.nota) { fuente("normal", 9); gris(); cabe(8); doc.text(b.nota, M + PAD, y + 5); y += 8; return }
    b.filas.forEach((fila, r) => {
      fuente("normal", TAM);
      const lineas = fila.map((c, i) => { fuente(typeof c !== "string" && c.bold ? "bold" : "normal", TAM); return partir(texto(c), anchos[i] - 2 * PAD) });
      const nl = Math.max(...lineas.map((l) => l.length));
      const alto = nl * LH + 2.6;
      if (y + alto > TOPE) { hojaNueva(); pintaEncabezado() }
      if (r % 2 === 1) { doc.setFillColor(...TENUE); doc.rect(M, y, CW, alto, "F") }
      let xx = M;
      fila.forEach((c, i) => {
        const obj = typeof c === "string" ? null : c;
        if (obj?.fill) { doc.setFillColor(...hexRGB(obj.fill)); doc.rect(xx, y, anchos[i], alto, "F") }
        fuente(obj?.bold ? "bold" : "normal", TAM);
        if (obj?.color) doc.setTextColor(...hexRGB(obj.color)); else tinta();
        const al = b.cols[i].al;
        const tx = al === "r" ? xx + anchos[i] - PAD : al === "c" ? xx + anchos[i] / 2 : xx + PAD;
        doc.text(lineas[i], tx, y + 3.9, { align: al === "r" ? "right" : al === "c" ? "center" : "left" });
        xx += anchos[i];
      });
      doc.setDrawColor(226, 231, 238); doc.setLineWidth(0.15); doc.line(M, y + alto, W - M, y + alto);
      y += alto;
    });
    y += 2;
    if (b.nota) { fuente("normal", 8.5); gris(); const t = partir(b.nota, CW); cabe(t.length * lh(8.5) + 2); doc.text(t, M, y + 3); y += t.length * lh(8.5) + 3 }
    y += 3;
  };

  const fotos = (b: Extract<Bloque, { t: "fotos" }>) => {
    const COLS = 5, gap = 4, w = (CW - gap * (COLS - 1)) / COLS, FH = 36, TXT = 14;
    b.items.forEach((it, i) => {
      const col = i % COLS;
      if (col === 0) cabe(FH + TXT + 3);
      const xx = M + col * (w + gap);
      doc.setFillColor(...TENUE); doc.setDrawColor(213, 220, 229); doc.setLineWidth(0.2); doc.rect(xx, y, w, FH, "FD");
      let iw = w, ih = (it.foto.h / it.foto.w) * iw;
      if (ih > FH) { ih = FH; iw = (it.foto.w / it.foto.h) * ih }
      try { doc.addImage(it.foto.jpg, "JPEG", xx + (w - iw) / 2, y + (FH - ih) / 2, iw, ih, undefined, "FAST") } catch { /* foto dañada */ }
      fuente("bold", 7.4); tinta(); doc.text(partir(it.titulo, w)[0], xx, y + FH + 3.6);
      fuente("normal", 6.6); gris(); doc.text(partir(it.detalle, w).slice(0, 3), xx, y + FH + 7.1);
      if (col === COLS - 1 || i === b.items.length - 1) y += FH + TXT;
    });
    if (b.nota) { fuente("normal", 8.5); gris(); cabe(8); doc.text(b.nota, M, y + 3); y += 7 }
  };

  /* ----------------- recorrido ----------------- */
  for (const b of bloques) {
    switch (b.t) {
      case "portada": portada(b); break;
      case "modulo": modulo(b); break;
      case "sub": sub(b.texto); break;
      case "p": parrafo(b.texto, b.gris); break;
      case "lista": lista(b.items); break;
      case "kpis": kpis(b.items); break;
      case "img": bloqueImg(b); break;
      case "imgs2": bloqueImgs2(b); break;
      case "tabla": tabla(b); break;
      case "fotos": fotos(b); break;
    }
  }

  /* Pie de TODAS las hojas, con «Página n de N». */
  const N = doc.getNumberOfPages();
  for (let i = 1; i <= N; i++) {
    doc.setPage(i);
    doc.setDrawColor(213, 220, 229); doc.setLineWidth(0.2); doc.line(M, H - 10, W - M, H - 10);
    fuente("normal", 7.5); gris();
    doc.text(partir(`Periodo: ${x.periodo} · ${x.filtros}`, CW - 40)[0], M, H - 6);
    doc.text(`Página ${i} de ${N}`, W - M, H - 6, { align: "right" });
  }
  return doc;
}

export const nombreEvidenciasPdf = (desde: string, hasta: string) => `evidencias-inventario-${desde}${hasta !== desde ? `_${hasta}` : ""}.pdf`;
