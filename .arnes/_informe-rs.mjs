import { PALETA_MARCA } from "./_hoja-rs.mjs";
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
function dibujarInforme(JsPDFCtor, d, extra) {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, ANCHO = W - 2 * M;
  const PIE = H - 10;
  const TOPE = PIE - 6;
  let y = M;
  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = P.tinta;
  const TENUE = TINTA.map((c) => Math.round(255 - (255 - c) * 0.16));
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso, tam) => {
    doc.setFont("helvetica", peso);
    doc.setFontSize(tam);
  };
  const marca = extra.marca ?? {};
  const cinta = (x, yy, ancho, alto) => {
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
        Math.round(a[2] + (b[2] - a[2]) * u)
      );
      doc.rect(x + i * paso, yy, paso + 0.15, alto, "F");
    }
  };
  const opacidad = (o) => doc.setGState(new doc.GState({ opacity: o }));
  const aguaDeFondo = () => {
    if (!marca.sello) return;
    try {
      opacidad(0.04);
      const lado = 120;
      doc.addImage(marca.sello, "PNG", (W - lado) / 2, 118, lado, lado, "sello", "FAST");
    } catch {
    } finally {
      opacidad(1);
    }
  };
  const hojaNueva = () => {
    doc.addPage();
    aguaDeFondo();
    cinta(0, 0, W, 2.2);
    if (marca.sello) {
      try {
        doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST");
      } catch {
      }
    }
    const x = M + (marca.sello ? 12 : 0);
    fuente("bold", 10);
    tinta();
    doc.text("Salida de vidrio", x, 12.2);
    fuente("normal", 8.5);
    gris();
    doc.text(d.periodo, x, 15.8);
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.3);
    doc.line(M, 19.5, W - M, 19.5);
    y = 24;
  };
  const cabe = (alto) => {
    if (y + alto > TOPE) hojaNueva();
  };
  aguaDeFondo();
  cinta(0, 0, W, 4.5);
  const ALTO_LOGO = 15;
  let conLogo = false;
  if (marca.palabra) {
    try {
      doc.addImage(marca.palabra, "PNG", M, 11, ALTO_LOGO * 540 / 160, ALTO_LOGO, "palabra", "FAST");
      conLogo = true;
    } catch {
    }
  }
  if (!conLogo) {
    fuente("bold", 16);
    doc.setTextColor(255, 0, 15);
    doc.text("Bavaria", M, 21);
  }
  fuente("bold", 7.5);
  gris();
  doc.text("CENTRO DE DISTRIBUCI\xD3N CD38 \xB7 CONTROL", W - M, 13.5, { align: "right" });
  fuente("bold", 20);
  tinta();
  doc.text("Cu\xE1nto vidrio sali\xF3", W - M, 21.5, { align: "right" });
  fuente("normal", 10);
  gris();
  doc.text(d.periodo.charAt(0).toUpperCase() + d.periodo.slice(1), W - M, 27.5, { align: "right" });
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.5);
  doc.line(M, 32, W - M, 32);
  y = 37;
  if (d.filtros) {
    const ALTO_F = 9;
    doc.setFillColor(...TINTA);
    doc.rect(M, y, 2.2, ALTO_F, "F");
    doc.setDrawColor(213, 220, 229);
    doc.setLineWidth(0.2);
    doc.rect(M + 2.2, y, ANCHO - 2.2, ALTO_F);
    fuente("bold", 7.5);
    gris();
    doc.text("FILTRADO", M + 6, y + 5.8);
    fuente("normal", 8.5);
    tinta();
    let t = d.filtros;
    if (d.mirando) t += ` \xB7 mirando ${nf.format(d.mirando.de)} de ${nf.format(d.mirando.total)} salidas`;
    doc.text(doc.splitTextToSize(t, ANCHO - 34)[0] ?? "", M + 26, y + 5.8);
    y += ALTO_F + 6;
  }
  const ALTO_KPI = 21;
  doc.setFillColor(...TINTA);
  doc.rect(M, y, ANCHO, ALTO_KPI, "F");
  doc.setFillColor(...P.acento);
  doc.rect(M, y, 3, ALTO_KPI, "F");
  doc.setTextColor(255, 255, 255);
  fuente("bold", 26);
  const cifra = nf.format(d.kg);
  doc.text(cifra, M + 9, y + 14);
  fuente("normal", 10.5);
  doc.setTextColor(...TENUE);
  doc.text("kg netos despachados", M + 11 + doc.getTextWidth(cifra) * 26 / 10.5, y + 14);
  fuente("bold", 11);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `${nf.format(d.completas)} salida${d.completas === 1 ? "" : "s"}`,
    W - M - 6,
    y + 9.5,
    { align: "right" }
  );
  fuente("normal", 8.5);
  doc.setTextColor(...TENUE);
  doc.text(
    `${nf.format(d.tolvas)} tolva${d.tolvas === 1 ? "" : "s"} \xB7 generado el ${extra.generado.toLocaleDateString("es-CO")} a las ${extra.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`,
    W - M - 6,
    y + 15.5,
    { align: "right" }
  );
  y += ALTO_KPI + 8;
  const titulo = (t, nota) => {
    doc.setFillColor(...P.acento);
    doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11);
    tinta();
    doc.text(t, M + 4.5, y + 4);
    if (nota) {
      fuente("normal", 8.5);
      gris();
      doc.text(nota, W - M, y + 4, { align: "right" });
    }
    y += 7;
  };
  cabe(30);
  titulo("De d\xF3nde sale", "no hay ning\xFAn total guardado: se suman las tolvas");
  const ALTO_C = 16, hueco = 8;
  const anchoC = (ANCHO - hueco * 2 - 14) / 3;
  const cajita = (x, rot, val, fuerte) => {
    if (fuerte) {
      doc.setFillColor(...TINTA);
      doc.rect(x, y, anchoC, ALTO_C, "F");
    } else {
      doc.setDrawColor(213, 220, 229);
      doc.setLineWidth(0.3);
      doc.rect(x, y, anchoC, ALTO_C);
    }
    fuente("bold", 6.5);
    if (fuerte) doc.setTextColor(...TENUE);
    else gris();
    doc.text(rot, x + 3, y + 5.5);
    fuente("bold", 14);
    if (fuerte) doc.setTextColor(255, 255, 255);
    else tinta();
    doc.text(val, x + 3, y + 12.5);
  };
  const signo = (x, s) => {
    fuente("bold", 13);
    gris();
    doc.text(s, x, y + 10, { align: "center" });
  };
  cajita(M, "BRUTO", nf.format(d.bruto), false);
  signo(M + anchoC + hueco / 2, "-");
  cajita(M + anchoC + hueco, "TARA", nf.format(d.tara), false);
  signo(M + (anchoC + hueco) * 2 + hueco / 2 - 4, "=");
  cajita(M + (anchoC + hueco) * 2 + 7, "NETO KG", nf.format(d.kg), true);
  y += ALTO_C + 8;
  cabe(24);
  const cif = [
    ["Tolvas despachadas", nf.format(d.tolvas), "en esas mismas salidas"],
    ["Promedio por tolva", nf.format(d.promedio), "kg netos"],
    ["Esperando Vh", nf.format(d.porSalir), "cerradas sin salir \xB7 no cuentan"],
    ["Abiertas", nf.format(d.abiertas), "todav\xEDa pes\xE1ndose"]
  ];
  const kw = (ANCHO - 9) / 4;
  cif.forEach(([r, n2, p], i) => {
    const x = M + i * (kw + 3);
    doc.setFillColor(243, 246, 249);
    doc.rect(x, y, kw, 22, "F");
    fuente("bold", 6.3);
    gris();
    doc.text(r.toUpperCase(), x + 3, y + 5);
    fuente("bold", 16);
    tinta();
    doc.text(n2, x + 3, y + 13.5);
    fuente("normal", 6.2);
    gris();
    doc.text(doc.splitTextToSize(p, kw - 6), x + 3, y + 18);
  });
  y += 30;
  const barras = (x, an, filas, yy) => {
    const max = Math.max(1, ...filas.map((f) => f.kg));
    let cur = yy;
    for (const f of filas) {
      fuente("normal", 8);
      tinta();
      doc.text(doc.splitTextToSize(f.etiqueta, 20)[0] ?? "", x, cur + 3);
      const bx = x + 22, bw = an - 22 - 18;
      doc.setFillColor(233, 236, 240);
      doc.rect(bx, cur, bw, 4, "F");
      if (f.kg > 0) {
        doc.setFillColor(...P.acento);
        doc.rect(bx, cur, bw * (f.kg / max), 4, "F");
      }
      fuente("bold", 8);
      if (f.kg > 0) tinta();
      else gris();
      const t = f.kg > 0 ? nf.format(f.kg) : "\u2014";
      doc.text(t, x + an, cur + 3.4, { align: "right" });
      cur += 7.6;
    }
    return cur;
  };
  if (d.meses.length || d.colores.length) {
    const alto = 9 + 7.6 * Math.max(d.meses.length, d.colores.length);
    cabe(alto + 6);
    const mitad = (ANCHO - 10) / 2;
    const yTit = y;
    titulo("Por mes");
    const yBar = y;
    const y1 = d.meses.length ? barras(M, mitad, d.meses, yBar) : yBar;
    y = yTit;
    doc.setFillColor(...P.acento);
    doc.rect(M + mitad + 10, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11);
    tinta();
    doc.text("Por color del vidrio", M + mitad + 14.5, y + 4);
    const y2 = d.colores.length ? barras(M + mitad + 10, mitad, d.colores, yBar) : yBar;
    y = Math.max(y1, y2) + 3;
    fuente("normal", 7);
    gris();
    doc.text(
      "Kilos netos. El mes es aquel en que la salida qued\xF3 despachada, no en el que se abri\xF3.",
      M,
      y
    );
    y += 9;
  }
  const COL = [22, 22, 22, 20, 22, 22, 24, ANCHO - 154];
  const CAB = ["SALIDA", "FECHA", "PLACA", "TOLVAS", "BRUTO", "TARA", "NETO KG", "ESTADO"];
  const FILA = 6.2;
  const encabezado = (sigue) => {
    fuente("bold", 11);
    tinta();
    doc.setFillColor(...P.acento);
    doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    doc.text(`Las salidas${sigue ? " (contin\xFAa)" : ""}`, M + 4.5, y + 4);
    fuente("normal", 8.5);
    gris();
    doc.text(`${nf.format(d.salidas.length)} en el per\xEDodo`, W - M, y + 4, { align: "right" });
    y += 7;
    doc.setFillColor(...TINTA);
    doc.rect(M, y, ANCHO, FILA, "F");
    doc.setTextColor(255, 255, 255);
    fuente("bold", 8);
    let x = M;
    CAB.forEach((t, i) => {
      if (i >= 4 && i <= 6) doc.text(t, x + COL[i] - 2, y + FILA - 2, { align: "right" });
      else doc.text(t, x + 2, y + FILA - 2);
      x += COL[i];
    });
    y += FILA;
  };
  cabe(10 + FILA * 4);
  encabezado(false);
  if (d.salidas.length === 0) {
    fuente("normal", 9.5);
    gris();
    doc.text("No hay salidas en este per\xEDodo con estos filtros.", M + 2, y + 4.5);
    y += 10;
  }
  d.salidas.forEach((f, i) => {
    if (y + FILA > TOPE) {
      hojaNueva();
      encabezado(true);
    }
    if (i % 2 === 1) {
      doc.setFillColor(247, 249, 251);
      doc.rect(M, y, ANCHO, FILA, "F");
    }
    const celdas = [
      f.codigo,
      f.fecha,
      f.placa,
      f.tolvas > 0 ? String(f.tolvas) : "\u2014",
      nf.format(f.bruto),
      nf.format(f.tara),
      nf.format(f.neto),
      f.estado
    ];
    let x = M;
    fuente("normal", 8.5);
    tinta();
    celdas.forEach((c, j) => {
      if (j === 6) fuente("bold", 8.5);
      if (j === 7) {
        fuente("normal", 7.5);
        gris();
      }
      if (j >= 4 && j <= 6) doc.text(c, x + COL[j] - 2, y + FILA - 2, { align: "right" });
      else doc.text(doc.splitTextToSize(c, COL[j] - 2)[0] ?? "", x + 2, y + FILA - 2);
      if (j === 6 || j === 7) {
        fuente("normal", 8.5);
        tinta();
      }
      x += COL[j];
    });
    y += FILA;
  });
  const pie = d.filtros ? `Filtrado \xB7 ${d.filtros}` : "Sin filtros";
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5);
    gris();
    const anchoIzq = W / 2 - M - doc.getTextWidth("Bavaria") / 2 - 4;
    const trozos = [`Salida de vidrio \xB7 ${d.periodo}`, pie];
    let izq = trozos.join(" \xB7 ");
    while (trozos.length > 1 && doc.getTextWidth(izq) > anchoIzq) {
      trozos.pop();
      izq = trozos.join(" \xB7 ");
    }
    doc.text(doc.splitTextToSize(izq, anchoIzq)[0] ?? "", M, PIE);
    doc.text("Bavaria", W / 2, PIE, { align: "center" });
    doc.text(`P\xE1gina ${i} de ${n}`, W - M, PIE, { align: "right" });
  }
  return doc;
}
const nombreInforme = (hoy) => `salida-vidrio-${hoy}.pdf`;
export {
  dibujarInforme,
  nombreInforme
};
