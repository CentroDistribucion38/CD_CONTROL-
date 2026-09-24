/**
 * EL INFORME EN PDF DE LA SALIDA DE VIDRIO.
 *
 * «Que tenga el mismo diseño que los demás: mira el de la rotura de
 *  línea.»
 *
 * ---------------------------------------------------------------------
 * LAS PIEZAS SON LAS DE LA HOJA DE ROTURA DE LÍNEA, NO UNAS PARECIDAS
 * ---------------------------------------------------------------------
 * La paleta, la cinta del degradado, la marca de agua y la forma de la
 * cabecera SE IMPORTAN de `@/modulos/rotlinea/hoja`. No se copian: dos
 * copias del mismo diseño se separan a la tercera vez que alguien
 * cambia una —y aquí «parecido» no sirve, porque los dos papeles salen
 * del mismo centro y se mandan a las mismas personas.
 *
 * De ahí vienen, y por eso son iguales al milímetro:
 *   · A4 vertical, márgenes de 14 mm, el pie a 10 del borde;
 *   · la cinta de 4,5 mm del dorado hondo al dorado y de ahí al rojo,
 *     armada con franjas porque jsPDF no pinta degradados;
 *   · el sello al 4 % detrás de todo, puesto ANTES de escribir nada
 *     —jsPDF pinta en el orden en que se le pide, y al final taparía
 *     las cifras—;
 *   · la cabecera: la palabra «Bavaria» a la izquierda, y a la derecha
 *     «CENTRO DE DISTRIBUCIÓN CD38 · CONTROL», el título y la fecha;
 *   · la banda oscura del total con su raya de acento, que es la única
 *     pieza oscura del papel y por eso el ojo cae ahí primero;
 *   · las tablas de cabecera oscura y filas alternadas;
 *   · el pie con la cinta fina, qué es, «Bavaria» y «página i de n».
 *
 * LOS COLORES SALEN DEL TEMA de quien lo genera y los logos NO: es la
 * misma regla de la hoja de línea —«los colores del informe dependen de
 * la preferencia; el logo debe permanecer normal»—.
 *
 * ---------------------------------------------------------------------
 * NO CALCULA NADA. RECIBE LO YA CALCULADO.
 * ---------------------------------------------------------------------
 * Lo natural sería pasarle las salidas y que el PDF sacara sus totales;
 * y el día que alguien cambie una regla en la pantalla —qué entra, qué
 * es «completa», qué fecha manda— el informe seguiría con la regla
 * vieja y diría OTRA CIFRA. Nadie se daría cuenta: las dos son
 * creíbles, y la que se manda por correo es la del PDF.
 *
 * Así que la pantalla calcula UNA VEZ y aquí solo se dibuja. Si una
 * cifra está mal, está mal en los dos lados — que es la única forma de
 * que se note.
 *
 * ---------------------------------------------------------------------
 * LLEVA ESCRITOS LOS FILTROS, Y ESO NO ES ADORNO
 * ---------------------------------------------------------------------
 * Un PDF se manda por correo y se lee tres semanas después, sin la
 * pantalla al lado. Un informe filtrado por una placa que no diga que
 * está filtrado es un informe que alguien va a leer como el total del
 * mes. Va en una franja bajo la cabecera y en el pie de TODAS las
 * páginas.
 */
import type { jsPDF as JsPDF } from "jspdf";
import { PALETA_MARCA, type Marca, type Paleta } from "@/modulos/rotlinea/hoja";

export type FilaInforme = {
  codigo: string;
  fecha: string;
  placa: string;
  tolvas: number;
  bruto: number;
  tara: number;
  neto: number;
  estado: string;
};

export type DatosInforme = {
  /** El día en que se genera, para la cabecera y el nombre del archivo. */
  hoy: string;
  /** Cómo se lee el período: «del 01/09 al 23/09», «todo el histórico». */
  periodo: string;
  /** Los filtros puestos, ya en palabras. Vacío = ninguno. */
  filtros: string;
  mirando: { de: number; total: number } | null;

  kg: number; bruto: number; tara: number;
  completas: number; tolvas: number; promedio: number;
  porSalir: number; abiertas: number;

  meses: { etiqueta: string; kg: number }[];
  colores: { etiqueta: string; kg: number }[];
  salidas: FilaInforme[];
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
type RGB = [number, number, number];

/**
 * PINTA EL INFORME.
 *
 * Recibe el constructor de jsPDF en vez de importarlo, igual que
 * `dibujarHoja`: en el navegador se carga solo cuando alguien toca el
 * botón —son 350 KB que el resto de la pantalla no necesita— y en un
 * arnés se le pasa el de Node, que es lo que permite generar el PDF de
 * verdad y leerlo de vuelta con `pdftotext` en vez de mirarlo.
 */
export function dibujarInforme(
  JsPDFCtor: typeof JsPDF,
  d: DatosInforme,
  extra: { generado: Date; marca?: Marca; paleta?: Paleta },
): JsPDF {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, ANCHO = W - 2 * M;
  const PIE = H - 10;
  const TOPE = PIE - 6;
  let y = M;

  const P = extra.paleta ?? PALETA_MARCA;
  const TINTA = P.tinta;
  const TENUE: RGB = TINTA.map((c) => Math.round(255 - (255 - c) * 0.16)) as RGB;
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso: "normal" | "bold", tam: number) => {
    doc.setFont("helvetica", peso); doc.setFontSize(tam);
  };
  const marca = extra.marca ?? {};

  /* LA CINTA. Misma construcción que la hoja de línea: franjas angostas
     una al lado de otra, cada una pisando un pelo la siguiente para que
     al ampliar no se vean hilos blancos entre ellas. */
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

  const opacidad = (o: number) =>
    doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown })
      .GState({ opacity: o }));
  const aguaDeFondo = () => {
    if (!marca.sello) return;
    try {
      opacidad(0.04);
      const lado = 120;
      doc.addImage(marca.sello, "PNG", (W - lado) / 2, 118, lado, lado, "sello", "FAST");
    } catch { /* una marca de agua que no carga no frena el informe */ }
    finally { opacidad(1) }
  };

  /** Hoja nueva con su cabecera chica: un papel suelto de la página 3,
   *  sin eso, no se sabe de dónde salió ni de qué período es. */
  const hojaNueva = () => {
    doc.addPage();
    aguaDeFondo();
    cinta(0, 0, W, 2.2);
    if (marca.sello) {
      try { doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ }
    }
    const x = M + (marca.sello ? 12 : 0);
    fuente("bold", 10); tinta();
    doc.text("Salida de vidrio", x, 12.2);
    fuente("normal", 8.5); gris();
    doc.text(d.periodo, x, 15.8);
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.3);
    doc.line(M, 19.5, W - M, 19.5);
    y = 24;
  };
  const cabe = (alto: number) => { if (y + alto > TOPE) hojaNueva() };

  /* ---------------- CABECERA ---------------- */
  aguaDeFondo();
  cinta(0, 0, W, 4.5);

  const ALTO_LOGO = 15;
  let conLogo = false;
  if (marca.palabra) {
    try {
      /* 540 × 160 es la proporción del archivo: se respeta, no se estira. */
      doc.addImage(marca.palabra, "PNG", M, 11, ALTO_LOGO * 540 / 160, ALTO_LOGO, "palabra", "FAST");
      conLogo = true;
    } catch { /* sin logo, el informe sale igual */ }
  }
  if (!conLogo) {
    fuente("bold", 16); doc.setTextColor(255, 0, 15);
    doc.text("Bavaria", M, 21);
  }

  fuente("bold", 7.5); gris();
  doc.text("CENTRO DE DISTRIBUCIÓN CD38 · CONTROL", W - M, 13.5, { align: "right" });
  fuente("bold", 20); tinta();
  doc.text("Cuánto vidrio salió", W - M, 21.5, { align: "right" });
  fuente("normal", 10); gris();
  doc.text(d.periodo.charAt(0).toUpperCase() + d.periodo.slice(1), W - M, 27.5, { align: "right" });

  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.5);
  doc.line(M, 32, W - M, 32);
  y = 37;

  /* LOS FILTROS, SI HAY. Debajo de la raya y antes de la cifra: es lo
     que decide si lo de abajo es el total o un pedazo. */
  if (d.filtros) {
    const ALTO_F = 9;
    doc.setFillColor(...TINTA);
    doc.rect(M, y, 2.2, ALTO_F, "F");
    doc.setDrawColor(213, 220, 229);
    doc.setLineWidth(0.2);
    doc.rect(M + 2.2, y, ANCHO - 2.2, ALTO_F);
    fuente("bold", 7.5); gris();
    doc.text("FILTRADO", M + 6, y + 5.8);
    fuente("normal", 8.5); tinta();
    let t = d.filtros;
    if (d.mirando) t += ` · mirando ${nf.format(d.mirando.de)} de ${nf.format(d.mirando.total)} salidas`;
    doc.text(doc.splitTextToSize(t, ANCHO - 34)[0] ?? "", M + 26, y + 5.8);
    y += ALTO_F + 6;
  }

  /* LA RESPUESTA ARRIBA Y EN GRANDE, en la banda oscura con la raya de
     acento: es lo primero que busca quien lo abre, y muchas veces lo
     único que lee. */
  const ALTO_KPI = 21;
  doc.setFillColor(...TINTA);
  doc.rect(M, y, ANCHO, ALTO_KPI, "F");
  doc.setFillColor(...P.acento);
  doc.rect(M, y, 3, ALTO_KPI, "F");
  doc.setTextColor(255, 255, 255);
  fuente("bold", 26);
  const cifra = nf.format(d.kg);
  doc.text(cifra, M + 9, y + 14);
  fuente("normal", 10.5); doc.setTextColor(...TENUE);
  doc.text("kg netos despachados", M + 11 + doc.getTextWidth(cifra) * 26 / 10.5, y + 14);
  fuente("bold", 11); doc.setTextColor(255, 255, 255);
  doc.text(`${nf.format(d.completas)} salida${d.completas === 1 ? "" : "s"}`,
           W - M - 6, y + 9.5, { align: "right" });
  fuente("normal", 8.5); doc.setTextColor(...TENUE);
  doc.text(`${nf.format(d.tolvas)} tolva${d.tolvas === 1 ? "" : "s"} · generado el ` +
           `${extra.generado.toLocaleDateString("es-CO")} a las ` +
           `${extra.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`,
           W - M - 6, y + 15.5, { align: "right" });
  y += ALTO_KPI + 8;

  const titulo = (t: string, nota?: string) => {
    doc.setFillColor(...P.acento);
    doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11); tinta();
    doc.text(t, M + 4.5, y + 4);
    if (nota) { fuente("normal", 8.5); gris(); doc.text(nota, W - M, y + 4, { align: "right" }) }
    y += 7;
  };

  /* ---------------- DE DÓNDE SALE ----------------
     Un neto suelto no se puede comprobar contra la báscula; bruto menos
     tara sí. Por eso van juntos y no en dos sitios distintos. */
  cabe(30);
  titulo("De dónde sale", "no hay ningún total guardado: se suman las tolvas");
  const ALTO_C = 16, hueco = 8;
  const anchoC = (ANCHO - hueco * 2 - 14) / 3;
  const cajita = (x: number, rot: string, val: string, fuerte: boolean) => {
    if (fuerte) { doc.setFillColor(...TINTA); doc.rect(x, y, anchoC, ALTO_C, "F") }
    else { doc.setDrawColor(213, 220, 229); doc.setLineWidth(0.3); doc.rect(x, y, anchoC, ALTO_C) }
    fuente("bold", 6.5);
    if (fuerte) doc.setTextColor(...TENUE); else gris();
    doc.text(rot, x + 3, y + 5.5);
    fuente("bold", 14);
    if (fuerte) doc.setTextColor(255, 255, 255); else tinta();
    doc.text(val, x + 3, y + 12.5);
  };
  /* EL MENOS ES UN GUION ASCII Y NO «−» (U+2212). La helvetica de jsPDF
     va en WinAnsi, que no tiene ese carácter: salía pintado como una
     comilla doble, «7.150 " 2.330 = 4.820», que es exactamente lo que
     no se puede permitir en la cuenta que sostiene el informe. */
  const signo = (x: number, s: string) => {
    fuente("bold", 13); gris();
    doc.text(s, x, y + 10, { align: "center" });
  };
  cajita(M, "BRUTO", nf.format(d.bruto), false);
  signo(M + anchoC + hueco / 2, "-");
  cajita(M + anchoC + hueco, "TARA", nf.format(d.tara), false);
  signo(M + (anchoC + hueco) * 2 + hueco / 2 - 4, "=");
  cajita(M + (anchoC + hueco) * 2 + 7, "NETO KG", nf.format(d.kg), true);
  y += ALTO_C + 8;

  /* ---------------- LAS CUATRO CIFRAS ---------------- */
  cabe(24);
  const cif: [string, string, string][] = [
    ["Tolvas despachadas", nf.format(d.tolvas), "en esas mismas salidas"],
    ["Promedio por tolva", nf.format(d.promedio), "kg netos"],
    ["Esperando Vh", nf.format(d.porSalir), "cerradas sin salir · no cuentan"],
    ["Abiertas", nf.format(d.abiertas), "todavía pesándose"],
  ];
  const kw = (ANCHO - 9) / 4;
  cif.forEach(([r, n, p], i) => {
    const x = M + i * (kw + 3);
    doc.setFillColor(243, 246, 249); doc.rect(x, y, kw, 22, "F");
    fuente("bold", 6.3); gris(); doc.text(r.toUpperCase(), x + 3, y + 5);
    fuente("bold", 16); tinta(); doc.text(n, x + 3, y + 13.5);
    fuente("normal", 6.2); gris();
    doc.text(doc.splitTextToSize(p, kw - 6), x + 3, y + 18);
  });
  y += 30;

  /* ---------------- LAS DOS GRÁFICAS ----------------
     Contestan preguntas distintas —cuándo y de qué— y juntas dejan ver
     que un mes malo fue de un solo color. */
  const barras = (x: number, an: number, filas: { etiqueta: string; kg: number }[], yy: number) => {
    const max = Math.max(1, ...filas.map((f) => f.kg));
    let cur = yy;
    for (const f of filas) {
      fuente("normal", 8); tinta();
      doc.text(doc.splitTextToSize(f.etiqueta, 20)[0] ?? "", x, cur + 3);
      const bx = x + 22, bw = an - 22 - 18;
      doc.setFillColor(233, 236, 240); doc.rect(bx, cur, bw, 4, "F");
      if (f.kg > 0) { doc.setFillColor(...P.acento); doc.rect(bx, cur, bw * (f.kg / max), 4, "F") }
      fuente("bold", 8);
      if (f.kg > 0) tinta(); else gris();
      const t = f.kg > 0 ? nf.format(f.kg) : "—";
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
    fuente("bold", 11); tinta();
    doc.text("Por color del vidrio", M + mitad + 14.5, y + 4);
    const y2 = d.colores.length ? barras(M + mitad + 10, mitad, d.colores, yBar) : yBar;

    y = Math.max(y1, y2) + 3;
    fuente("normal", 7); gris();
    doc.text("Kilos netos. El mes es aquel en que la salida quedó despachada, no en el que se abrió.",
             M, y);
    y += 9;
  }

  /* ---------------- LA TABLA ----------------
     Es la que convierte el informe en algo que se puede revisar contra
     la báscula: cada renglón es una salida con su placa y sus kilos. */
  /* TOLVAS baja de 30 a 20 y lo que sobra va a ESTADO: con 18 mm,
     «Esperando Vh» se cortaba en «Esperando» y se perdía de qué estaba
     esperando, que es el dato. */
  const COL = [22, 22, 22, 20, 22, 22, 24, ANCHO - 154];
  const CAB = ["SALIDA", "FECHA", "PLACA", "TOLVAS", "BRUTO", "TARA", "NETO KG", "ESTADO"];
  const FILA = 6.2;
  const encabezado = (sigue: boolean) => {
    fuente("bold", 11); tinta();
    doc.setFillColor(...P.acento);
    doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    doc.text(`Las salidas${sigue ? " (continúa)" : ""}`, M + 4.5, y + 4);
    fuente("normal", 8.5); gris();
    doc.text(`${nf.format(d.salidas.length)} en el período`, W - M, y + 4, { align: "right" });
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
    fuente("normal", 9.5); gris();
    doc.text("No hay salidas en este período con estos filtros.", M + 2, y + 4.5);
    y += 10;
  }
  d.salidas.forEach((f, i) => {
    if (y + FILA > TOPE) { hojaNueva(); encabezado(true) }
    if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, FILA, "F") }
    const celdas = [f.codigo, f.fecha, f.placa, f.tolvas > 0 ? String(f.tolvas) : "—",
                    nf.format(f.bruto), nf.format(f.tara), nf.format(f.neto), f.estado];
    let x = M;
    fuente("normal", 8.5); tinta();
    celdas.forEach((c, j) => {
      if (j === 6) fuente("bold", 8.5);
      if (j === 7) { fuente("normal", 7.5); gris() }
      if (j >= 4 && j <= 6) doc.text(c, x + COL[j] - 2, y + FILA - 2, { align: "right" });
      else doc.text(doc.splitTextToSize(c, COL[j] - 2)[0] ?? "", x + 2, y + FILA - 2);
      if (j === 6 || j === 7) { fuente("normal", 8.5); tinta() }
      x += COL[j];
    });
    y += FILA;
  });

  /* ---------------- PIE DE CADA PÁGINA ---------------- */
  /* CORTO A PROPÓSITO. «Sin filtros · todas las salidas del período» no
     cabe al lado del período y se caía entero; y que el pie no diga nada
     deja a quien lo lee sin saber si está viendo el total. */
  const pie = d.filtros ? `Filtrado · ${d.filtros}` : "Sin filtros";
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5); gris();
    /* HASTA DONDE EMPIEZA «BAVARIA», que va centrado y es de la marca.
       Con `ANCHO - 60` el renglón de la izquierda se le montaba encima y
       quedaba «…color ÁmbarBavaria»: ilegible, y no lo ve ninguna
       comprobación que solo mire el margen derecho. */
    const anchoIzq = W / 2 - M - doc.getTextWidth("Bavaria") / 2 - 4;
    /* SE CORTA POR PARTES, NO A LA MITAD DE UNA PALABRA. Con el texto
       entero, `splitTextToSize` devolvía «…todas las averías del» y ahí
       quedaba: un pie cortado en seco se lee como un error de la app.
       Se va quitando de atrás hacia adelante hasta que quepa. */
    const trozos = [`Salida de vidrio · ${d.periodo}`, pie];
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

/** Dice qué es y de qué día, para que en el chat no llegue «documento (3).pdf». */
export const nombreInforme = (hoy: string) => `salida-vidrio-${hoy}.pdf`;
