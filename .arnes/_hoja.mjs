function armarHoja(entrada) {
  const maq = new Map(entrada.maquinas.map((m) => [m.item, m]));
  const destino = (item) => maq.get(maq.get(item)?.suma_en ?? item) ?? maq.get(item);
  const porLinea = /* @__PURE__ */ new Map();
  const tot = /* @__PURE__ */ new Map();
  const env = /* @__PURE__ */ new Map();
  for (const f of entrada.filas) {
    const t = f.turno - 1;
    if (t < 0 || t > 2) continue;
    const d = destino(f.maquina);
    const item = d?.item ?? f.maquina;
    const und = Number(f.und), kg = Number(f.kg);
    const filas = porLinea.get(f.linea) ?? /* @__PURE__ */ new Map();
    const fila = filas.get(item) ?? { item, nombre: d?.nombre ?? `M\xE1quina ${f.maquina}`, turnos: [0, 0, 0], total: 0 };
    fila.turnos[t] += und;
    fila.total += und;
    filas.set(item, fila);
    porLinea.set(f.linea, filas);
    const x = tot.get(f.linea) ?? { und: [0, 0, 0], kg: [0, 0, 0] };
    x.und[t] += und;
    x.kg[t] += kg;
    tot.set(f.linea, x);
    const e = env.get(f.envase) ?? { envase: f.envase, nombre: f.envase_nombre, und: 0, kg: 0 };
    e.und += und;
    e.kg += kg;
    env.set(f.envase, e);
  }
  const ordenMaq = (item) => maq.get(item)?.orden ?? 999;
  const ordenLin = (n) => entrada.lineas.find((l) => l.linea === n)?.orden ?? n;
  const lineas = [...porLinea.keys()].sort((a, b) => ordenLin(a) - ordenLin(b)).map((n) => {
    const l = entrada.lineas.find((x) => x.linea === n);
    const t = tot.get(n);
    const suma = (v) => v[0] + v[1] + v[2];
    return {
      linea: n,
      tren: l?.tren ?? `L\xEDnea ${n}`,
      centro_coste: l?.centro_coste ?? "",
      filas: [...porLinea.get(n).values()].sort((a, b) => ordenMaq(a.item) - ordenMaq(b.item)),
      und: [t.und[0], t.und[1], t.und[2], suma(t.und)],
      kg: [t.kg[0], t.kg[1], t.kg[2], suma(t.kg)],
      firmas: (entrada.firmas ?? []).filter((f) => f.linea === n).sort((a, b) => a.turno - b.turno).map((f) => ({ turno: f.turno, nombre: f.firmado_nombre ?? "\u2014", en: f.firmado_en }))
    };
  });
  const envases = [...env.values()].sort((a, b) => b.und - a.und);
  return {
    fecha: entrada.fecha,
    lineas,
    envases,
    und: lineas.reduce((a, l) => a + l.und[3], 0),
    kg: lineas.reduce((a, l) => a + l.kg[3], 0)
  };
}
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const LETRA = ["A", "B", "C"];
const fechaLarga = (f) => (/* @__PURE__ */ new Date(f + "T00:00:00")).toLocaleDateString(
  "es-CO",
  { weekday: "long", day: "numeric", month: "long", year: "numeric" }
);
const horaCorta = (s) => new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
const nombreArchivo = (fecha) => `rotura-linea-${fecha}.pdf`;
const ROJO = [255, 0, 15];
const ORO = [236, 198, 68];
const ORO_HONDO = [181, 135, 53];
const PALETA_MARCA = {
  tinta: [18, 38, 58],
  acento: ROJO,
  cinta: [[0, ORO_HONDO], [0.35, ORO], [1, ROJO]]
};
function aRGB(c) {
  let m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]].map(Math.round);
  m = c.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]].map((v) => Math.round(v * 255));
  return null;
}
const paletaDeTema = (tinta, acento, acentoHondo) => ({ tinta, acento, cinta: [[0, acentoHondo], [1, acento]] });
function dibujarHoja(JsPDFCtor, hoja, datos) {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, ANCHO = W - 2 * M;
  const PIE = H - 10;
  const TOPE = PIE - 6;
  let y = M;
  const P = datos.paleta ?? PALETA_MARCA;
  const TINTA = P.tinta;
  const TENUE = TINTA.map((c) => Math.round(255 - (255 - c) * 0.16));
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso, tam) => {
    doc.setFont("helvetica", peso);
    doc.setFontSize(tam);
  };
  const marca = datos.marca ?? {};
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
    fuente("bold", 10);
    tinta();
    doc.text("Rotura en l\xEDnea", M + (marca.sello ? 12 : 0), 12.2);
    fuente("normal", 8.5);
    gris();
    doc.text(`Hoja del d\xEDa \xB7 ${hoja.fecha}`, M + (marca.sello ? 12 : 0), 15.8);
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
    doc.setTextColor(...ROJO);
    doc.text("Bavaria", M, 21);
  }
  fuente("bold", 7.5);
  gris();
  doc.text("CENTRO DE DISTRIBUCI\xD3N CD38 \xB7 CONTROL", W - M, 13.5, { align: "right" });
  fuente("bold", 20);
  tinta();
  doc.text("Rotura en l\xEDnea", W - M, 21.5, { align: "right" });
  fuente("normal", 10);
  gris();
  const larga = fechaLarga(hoja.fecha);
  doc.text(`Hoja del d\xEDa \xB7 ${larga.charAt(0).toUpperCase() + larga.slice(1)}`, W - M, 27.5, { align: "right" });
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.5);
  doc.line(M, 32, W - M, 32);
  y = 37;
  const ALTO_KPI = 21;
  doc.setFillColor(...TINTA);
  doc.rect(M, y, ANCHO, ALTO_KPI, "F");
  doc.setFillColor(...P.acento);
  doc.rect(M, y, 3, ALTO_KPI, "F");
  doc.setTextColor(255, 255, 255);
  fuente("bold", 26);
  const cifra = nf.format(hoja.und);
  doc.text(cifra, M + 9, y + 14);
  const anchoCifra = doc.getTextWidth(cifra);
  fuente("normal", 10.5);
  doc.setTextColor(...TENUE);
  doc.text("unidades rotas", M + 11 + anchoCifra, y + 14);
  fuente("bold", 11);
  doc.setTextColor(255, 255, 255);
  doc.text(`${nf1.format(hoja.kg)} kg`, W - M - 6, y + 9.5, { align: "right" });
  fuente("normal", 8.5);
  doc.setTextColor(...TENUE);
  doc.text(
    `${hoja.lineas.length} l\xEDnea${hoja.lineas.length === 1 ? "" : "s"} \xB7 generado el ${datos.generado.toLocaleDateString("es-CO")} a las ${datos.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`,
    W - M - 6,
    y + 15.5,
    { align: "right" }
  );
  y += ALTO_KPI + 8;
  const COL = [ANCHO - 4 * 25, 25, 25, 25, 25];
  const FILA = 6.2;
  const celdas = (vals, alto, peso) => {
    let x = M;
    fuente(peso, 9);
    tinta();
    vals.forEach((v, i) => {
      if (i === 0) doc.text(v, x + 2, y + alto - 2);
      else doc.text(v, x + COL[i] - 2, y + alto - 2, { align: "right" });
      x += COL[i];
    });
  };
  if (hoja.lineas.length === 0) {
    fuente("normal", 10);
    gris();
    doc.text("No hay rotura registrada este d\xEDa.", M, y + 4);
    y += 12;
  }
  const encabezado = (l, sigue) => {
    doc.setFillColor(...P.acento);
    doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11);
    tinta();
    doc.text(`L\xEDnea ${l.linea} \xB7 ${l.tren}${sigue ? " (contin\xFAa)" : ""}`, M + 4.5, y + 4);
    fuente("normal", 8.5);
    gris();
    if (l.centro_coste) doc.text(`Centro de coste ${l.centro_coste}`, W - M, y + 4, { align: "right" });
    y += 7;
    doc.setFillColor(...TINTA);
    doc.rect(M, y, ANCHO, FILA, "F");
    doc.setTextColor(255, 255, 255);
    fuente("bold", 8.5);
    const tit = ["M\xC1QUINA", "TURNO A", "TURNO B", "TURNO C", "TOTAL"];
    let x = M;
    tit.forEach((t, i) => {
      if (i === 0) doc.text(t, x + 2, y + FILA - 2);
      else doc.text(t, x + COL[i] - 2, y + FILA - 2, { align: "right" });
      x += COL[i];
    });
    y += FILA;
    doc.setDrawColor(213, 220, 229);
    doc.setLineWidth(0.2);
  };
  const cabeEnTabla = (alto, l) => {
    if (y + alto > TOPE) {
      hojaNueva();
      encabezado(l, true);
    }
  };
  for (const l of hoja.lineas) {
    cabe(10 + FILA * Math.min(4, l.filas.length + 3));
    encabezado(l, false);
    l.filas.forEach((f, i) => {
      cabeEnTabla(FILA, l);
      if (i % 2 === 1) {
        doc.setFillColor(247, 249, 251);
        doc.rect(M, y, ANCHO, FILA, "F");
      }
      celdas(
        [f.nombre, ...f.turnos.map((v) => v ? nf.format(v) : "\u2014"), nf.format(f.total)],
        FILA,
        "normal"
      );
      doc.line(M, y + FILA, M + ANCHO, y + FILA);
      y += FILA;
    });
    cabeEnTabla(FILA * 2, l);
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.4);
    doc.line(M, y, M + ANCHO, y);
    celdas(["Total unidades", ...l.und.map((v) => nf.format(v))], FILA, "bold");
    y += FILA;
    celdas(["Total kg", ...l.kg.map((v) => nf1.format(v))], FILA, "normal");
    y += FILA + 1;
    if (l.firmas.length > 0) {
      cabe(5);
      fuente("normal", 8);
      gris();
      doc.text("Cerrado en CONTROL: " + l.firmas.map((f) => `turno ${LETRA[f.turno - 1] ?? f.turno} por ${f.nombre} (${horaCorta(f.en)})`).join(" \xB7 "), M, y + 3);
      y += 5;
    }
    y += 5;
  }
  if (hoja.envases.length > 0) {
    cabe(12 + FILA * Math.min(3, hoja.envases.length));
    fuente("bold", 11);
    tinta();
    doc.text("Por envase", M, y + 4);
    y += 7;
    const CE = [ANCHO - 60, 30, 30];
    doc.setDrawColor(213, 220, 229);
    doc.setLineWidth(0.2);
    for (const e of hoja.envases) {
      cabe(FILA);
      fuente("normal", 9);
      tinta();
      doc.text(`${e.envase} \xB7 ${e.nombre}`.slice(0, 70), M + 2, y + FILA - 2);
      doc.text(`${nf.format(e.und)} und`, M + CE[0] + CE[1] - 2, y + FILA - 2, { align: "right" });
      gris();
      doc.text(`${nf1.format(e.kg)} kg`, M + ANCHO - 2, y + FILA - 2, { align: "right" });
      doc.line(M, y + FILA, M + ANCHO, y + FILA);
      y += FILA;
    }
    y += 6;
  }
  const obs = datos.observaciones.trim();
  fuente("normal", 9.5);
  const lineasObs = obs ? doc.splitTextToSize(obs, ANCHO - 8) : [];
  const altoObs = 10 + Math.max(3, lineasObs.length) * 5;
  const ALTO_FIRMAS = 40;
  cabe(altoObs + ALTO_FIRMAS + 6);
  fuente("bold", 9);
  tinta();
  doc.text("OBSERVACIONES", M, y + 4);
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.3);
  doc.rect(M, y + 6, ANCHO, altoObs - 6);
  if (lineasObs.length > 0) {
    fuente("normal", 9.5);
    tinta();
    doc.text(lineasObs, M + 4, y + 12);
  } else {
    doc.setDrawColor(213, 220, 229);
    for (let i = 1; i <= 3; i++) doc.line(M + 4, y + 6 + i * 5 + 1, M + ANCHO - 4, y + 6 + i * 5 + 1);
  }
  y += altoObs + 6;
  const media = (ANCHO - 8) / 2;
  const firma = (x, rotulo, nombre, dibujada) => {
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.3);
    doc.rect(x, y, media, ALTO_FIRMAS);
    cinta(x, y, media, 1.4);
    fuente("bold", 8);
    gris();
    doc.text(rotulo, x + 4, y + 6);
    fuente("normal", 9);
    tinta();
    doc.text("Nombre:", x + 4, y + 12);
    if (nombre) {
      fuente("bold", 9.5);
      doc.text(nombre.slice(0, 40), x + 19, y + 12);
    } else {
      doc.setDrawColor(150, 160, 172);
      doc.line(x + 19, y + 12.5, x + media - 4, y + 12.5);
    }
    doc.setDrawColor(150, 160, 172);
    doc.setLineWidth(0.25);
    doc.line(x + 4, y + 29, x + media - 4, y + 29);
    let firmada = false;
    if (dibujada) {
      try {
        const pr = doc.getImageProperties(dibujada);
        const altoMax = 14, anchoMax = media - 8;
        const k = Math.min(anchoMax / pr.width, altoMax / pr.height);
        const w = pr.width * k, h = pr.height * k;
        doc.addImage(dibujada, "PNG", x + 4, y + 28.6 - h, w, h, void 0, "FAST");
        firmada = true;
      } catch {
      }
    }
    fuente("normal", 8);
    gris();
    doc.text(firmada ? "Firma (digital, en CONTROL)" : "Firma", x + 4, y + 33);
    doc.text(firmada ? `Fecha y hora: ${datos.generado.toLocaleDateString("es-CO")} ` + datos.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "Fecha y hora: ____ / ____ / ______   ____:____", x + 4, y + 37.5);
  };
  firma(M, "ELABOR\xD3", datos.elaboro.trim(), datos.firmaElaboro);
  firma(M + media + 8, "REVIS\xD3 Y APRUEBA \u2014 SUPERVISOR", datos.supervisor.trim());
  y += ALTO_FIRMAS;
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5);
    gris();
    doc.text(`Rotura en l\xEDnea \xB7 ${hoja.fecha}`, M, PIE);
    doc.text("Bavaria", W / 2, PIE, { align: "center" });
    doc.text(`P\xE1gina ${i} de ${n}`, W - M, PIE, { align: "right" });
  }
  return doc;
}
export {
  PALETA_MARCA,
  aRGB,
  armarHoja,
  dibujarHoja,
  fechaLarga,
  nombreArchivo,
  paletaDeTema
};
