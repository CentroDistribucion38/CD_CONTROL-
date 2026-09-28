/**
 * EL INFORME EN PDF DE LAS ROTURAS EN SITIO.
 *
 * «Que ese análisis me genere un informe, hasta con la imagen esa
 *  incorporada, guiándote de los informes de rotura de línea.»
 *
 * ---------------------------------------------------------------------
 * LAS PIEZAS SON LAS DE LA HOJA DE ROTURA DE LÍNEA, NO UNAS PARECIDAS
 * ---------------------------------------------------------------------
 * La paleta, la cinta del degradado, la marca de agua y la forma de la
 * cabecera SE IMPORTAN de `@/modulos/rotlinea/hoja`. No se copian: dos
 * copias del mismo diseño se separan a la tercera vez que alguien
 * cambia una —y aquí «parecido» no sirve, porque los tres papeles (la
 * hoja de línea, el de salida, el de averías y este) salen del mismo
 * centro y se mandan a las mismas personas.
 *
 * ---------------------------------------------------------------------
 * EL RECORRIDO VA EN SU PROPIA HOJA Y ACOSTADA, Y ESO NO ES CAPRICHO
 * ---------------------------------------------------------------------
 * El diagrama tiene TRES COLUMNAS de texto —causa, proceso, destino— y
 * mide 1160 de ancho. Metido en el ancho de una hoja vertical, cada
 * rótulo queda en letra de 5 puntos: el dibujo se ve, y no se lee. En
 * horizontal el mismo dibujo entra a 269 mm y los nombres se leen
 * impresos, que es donde este papel termina.
 *
 * Y SE PINTA CON LÍNEAS, NO COMO FOTO. La tentación es sacarle una
 * captura al SVG de la pantalla y pegarla: se vería borrosa al imprimir
 * y en la pantalla del celular saldría del tamaño de una estampilla.
 * Aquí se dibuja con las curvas de jsPDF sobre LA MISMA GEOMETRÍA que
 * usa el SVG —`armarSankey`, que es una función pura y probada—, así que
 * el papel y la pantalla no pueden decir cosas distintas y el dibujo se
 * puede ampliar sin que se despedace.
 *
 * ---------------------------------------------------------------------
 * NO CALCULA NADA. RECIBE LO YA CALCULADO.
 * ---------------------------------------------------------------------
 * Lo natural sería pasarle las roturas y que el PDF sacara sus totales;
 * y el día que alguien cambie una regla en la pantalla —qué cuenta, qué
 * está a cobro, qué fecha manda— el informe seguiría con la regla vieja
 * y diría OTRA CIFRA. Nadie se daría cuenta: las dos son creíbles, y la
 * que se manda por correo es la del PDF.
 *
 * ---------------------------------------------------------------------
 * LLEVA ESCRITOS LOS FILTROS, Y ESO NO ES ADORNO
 * ---------------------------------------------------------------------
 * Un PDF se manda por correo y se lee tres semanas después, sin la
 * pantalla al lado. Un informe filtrado por una causa que no diga que
 * está filtrado es un informe que alguien va a leer como el mes entero.
 * Va en una franja bajo la cabecera y en el pie de TODAS las páginas.
 */
import type { jsPDF as JsPDF } from "jspdf";
import { PALETA_MARCA, type Marca, type Paleta } from "@/modulos/rotlinea/hoja";
import type { Sankey } from "@/modulos/roturas/sankey";
import type { Hallazgo } from "@/modulos/roturas/hallazgos-sitio";

export type FilaSitio = {
  codigo: string;
  fecha: string;
  material: string;
  material_nombre: string;
  causa: string;
  grupo: "asumida" | "no_asumida";
  proceso: string;
  rotas: number;
  contaminadas: number;
  etapa: string;
  /** Nulo cuando al material le falta el precio: NO es cero. */
  cobro: number | null;
};

export type DatosSitio = {
  /** El día en que se genera, para la cabecera y el nombre del archivo. */
  hoy: string;
  /** Cómo se lee el período: «del 01/09 al 23/09», «todo el histórico». */
  periodo: string;
  /** Los filtros puestos, ya en palabras. Vacío = ninguno. */
  filtros: string;

  /* LA PLATA */
  plata: number;
  plataRotas: number;
  plataCont: number;
  aCobro: number;
  sinPrecio: number;
  porCausa: { nombre: string; grupo: "asumida" | "no_asumida"; valor: number }[];

  /* LAS UNIDADES */
  unidades: number;
  liquido: number;
  contaminadas: number;
  noAsumidas: number;
  pctNoAsumida: number;
  devueltas: number;
  pctDevueltas: number;
  roturasEnFiltro: number;

  hallazgos: Hallazgo[];

  /** La geometría del recorrido, ya armada para el tamaño del papel. */
  recorrido: { s: Sankey; total: number; juntados: number } | null;

  roturas: FilaSitio[];
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? "—" : "$ " + nf.format(Math.round(Number(n)));
const fecha6 = (f: string) => (f ? f.slice(8, 10) + "/" + f.slice(5, 7) + "/" + f.slice(2, 4) : "—");

type RGB = [number, number, number];

/** «#FFC400» → [255, 196, 0]. El diagrama trae sus colores en hexadecimal
 *  porque los comparte con el CSS de la pantalla; jsPDF los quiere en
 *  tres números. */
function hexRGB(hex: string): RGB {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export function dibujarInformeSitio(
  JsPDFCtor: typeof JsPDF,
  d: DatosSitio,
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
  const MAL: RGB = [200, 16, 46];
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso: "normal" | "bold", tam: number) => {
    doc.setFont("helvetica", peso); doc.setFontSize(tam);
  };
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
    /* SIEMPRE VERTICAL. El recorrido tuvo una hoja acostada durante
       media tarde y no se puede leer: en el visor se va pasando de
       página y en la mitad aparece una girada, con el texto de lado. El
       diagrama cabe en vertical —ver la nota de arriba sobre las dos
       escalas—, así que el papel entero va en una sola orientación. */
    doc.addPage([W, H], "portrait");
    aguaDeFondo();
    cinta(0, 0, W, 2.2);
    if (marca.sello) {
      try { doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ }
    }
    const x = M + (marca.sello ? 12 : 0);
    fuente("bold", 10); tinta();
    doc.text("Roturas en sitio · por qué se rompe", x, 12.2);
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
  doc.text("Por qué se rompe", W - M, 21.5, { align: "right" });
  fuente("normal", 10); gris();
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
    fuente("bold", 7.5); gris();
    doc.text("FILTRADO", M + 6, y + 5.8);
    fuente("normal", 8.5); tinta();
    const t = `${d.filtros} · ${nf.format(d.roturasEnFiltro)} roturas en el filtro`;
    doc.text(doc.splitTextToSize(t, ANCHO - 34)[0] ?? "", M + 26, y + 5.8);
    y += ALTO_F + 6;
  }

  /* ---------------- LA BANDA DEL TOTAL ----------------
     LA PLATA Y NO LAS UNIDADES, igual que en la pantalla: la pregunta
     con la que alguien abre este papel es cuánto se le está cobrando al
     OL, no cuántas botellas son. Las unidades van al lado. */
  const ALTO_KPI = 21;
  doc.setFillColor(...TINTA);
  doc.rect(M, y, ANCHO, ALTO_KPI, "F");
  doc.setFillColor(...P.acento);
  doc.rect(M, y, 3, ALTO_KPI, "F");
  doc.setTextColor(255, 255, 255);
  fuente("bold", 26);
  const cifra = money(d.plata);
  doc.text(cifra, M + 9, y + 14);
  fuente("normal", 10.5); doc.setTextColor(...TENUE);
  doc.text("se le cobra al OL", M + 11 + doc.getTextWidth(cifra) * 26 / 10.5, y + 14);
  fuente("bold", 11); doc.setTextColor(255, 255, 255);
  doc.text(`${nf.format(d.aCobro)} rotura${d.aCobro === 1 ? "" : "s"} a cobro`,
           W - M - 6, y + 9.5, { align: "right" });
  fuente("normal", 8.5); doc.setTextColor(...TENUE);
  doc.text(`${nf.format(d.unidades)} und de vidrio · generado el ` +
           `${extra.generado.toLocaleDateString("es-CO")} a las ` +
           `${extra.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`,
           W - M - 6, y + 15.5, { align: "right" });
  y += ALTO_KPI;

  /* LO QUE FALTA, PEGADO A LA CIFRA Y NO EN UNA NOTA AL PIE. Si hay
     roturas sin precio el total de arriba está CORTO, y eso tiene que
     leerse en el mismo golpe de vista que el total. */
  if (d.sinPrecio > 0) {
    doc.setFillColor(...MAL);
    doc.rect(M, y, ANCHO, 7, "F");
    doc.setTextColor(255, 255, 255);
    fuente("bold", 8);
    doc.text(`ESTA CIFRA ESTÁ CORTA: ${nf.format(d.sinPrecio)} rotura` +
             `${d.sinPrecio === 1 ? "" : "s"} a cobro sin precio en el maestro`, M + 4, y + 4.8);
    y += 7;
  }
  y += 8;

  const titulo = (t: string, nota?: string, ancho = ANCHO) => {
    doc.setFillColor(...P.acento);
    doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11); tinta();
    doc.text(t, M + 4.5, y + 4);
    if (nota) {
      fuente("normal", 8.5); gris();
      doc.text(nota, M + ancho, y + 4, { align: "right" });
    }
    y += 7;
  };

  /* ---------------- LOS HALLAZGOS ----------------
     Antes que cualquier tabla: un informe que empieza por veinte
     renglones obliga a cada quien a sacar su propia conclusión. */
  titulo("Hallazgos", d.hallazgos.length ? `${d.hallazgos.length} · lo alto primero` : "");
  if (d.hallazgos.length === 0) {
    fuente("normal", 9.5); gris();
    doc.text("No hay suficientes roturas en el período para sacar conclusiones.", M + 2, y + 4);
    y += 12;
  }
  for (const h of d.hallazgos) {
    /* EL ALTO DEL RECUADRO SALE DEL TEXTO, no al revés: un hallazgo
       recortado a la mitad deja de ser un hallazgo. */
    const anchoTexto = ANCHO - 42;
    const l1 = doc.splitTextToSize(h.dice, anchoTexto);
    const l2 = doc.splitTextToSize(h.porque, anchoTexto);
    const l3 = doc.splitTextToSize(h.cuenta, anchoTexto);
    const alto = 7 + l1.length * 4.6 + l2.length * 4 + l3.length * 3.6 + 3;
    cabe(alto + 4);
    const color: RGB = h.peso === "alto" ? MAL : h.peso === "medio" ? P.acento : [150, 160, 172];
    doc.setFillColor(...color); doc.rect(M, y, 2.4, alto, "F");
    doc.setFillColor(249, 250, 252); doc.rect(M + 2.4, y, ANCHO - 2.4, alto, "F");
    /* LA CIFRA SE ENCOGE SI ES LARGA. «$ 1.284.350» a 13 puntos se monta
       encima del texto y las dos cosas quedan ilegibles. */
    fuente("bold", h.cifra.length > 7 ? 10 : 13);
    doc.setTextColor(...(h.peso === "alto" ? MAL : TINTA));
    doc.text(h.cifra, M + 7, y + 9);
    let yy = y + 6.5;
    fuente("bold", 9.5); tinta();
    doc.text(l1, M + 38, yy); yy += l1.length * 4.6;
    fuente("normal", 8.5); gris();
    doc.text(l2, M + 38, yy); yy += l2.length * 4;
    fuente("normal", 7); doc.setTextColor(140, 150, 162);
    doc.text(l3, M + 38, yy);
    y += alto + 4;
  }
  y += 3;

  /* ---------------- DE DÓNDE SALE LA PLATA ----------------
     ES LA MISMA PIEZA QUE LA PANTALLA, y no una versión resumida: quien
     discute el cobro tiene delante el papel, no la pantalla, y si el
     papel enseña menos hay que ir a buscar la diferencia a otro sitio.

     La barra, las dos formas con SU FÓRMULA ESCRITA y el reparto por
     causa con su total repetido abajo — que es lo que deja comprobar
     que las dos cifras de la hoja cuadran entre ellas. */
  const pct = (v: number) => (d.plata > 0 ? Math.round((v / d.plata) * 100) : 0);
  const formas = [
    { nom: "Rotas", valor: d.plataRotas, oro: true,
      que: "El producto se pierde en sitio: se le cobra reponer la botella.",
      formula: "unidades x precio del envase", chip: "SOLO ENVASE" },
    { nom: "Contaminadas", valor: d.plataCont, oro: false,
      que: "El envase contaminado no vuelve a la línea: se cobra envase y producto.",
      formula: "unidades x (precio del envase + precio del producto)",
      chip: "ENVASE + PRODUCTO" },
  ].sort((x, z) => z.valor - x.valor);
  /* EL DORADO ES FIJO Y NO EL ACENTO DEL TEMA: en el tema OFICIAL el
     acento ES EL ROJO, y en esta hoja el rojo ya quiere decir «esto no
     lo asume el OL». Misma razón que en la pantalla y en el diagrama. */
  const ORO: RGB = [255, 196, 0];
  const GRIS_PUNTO: RGB = [150, 160, 172];

  cabe(34 + 30 + Math.min(d.porCausa.length, 4) * 6);
  titulo(`De dónde salen ${money(d.plata)}`, "precios del maestro, por botella");

  /* LA BARRA: cuál de las dos formas es el problema, sin restar de
     cabeza. Con cero a cobro no se pinta nada y no se divide. */
  {
    const ALTO_B = 3.4;
    doc.setFillColor(233, 236, 240);
    doc.rect(M, y, ANCHO, ALTO_B, "F");
    const wR = ANCHO * pct(d.plataRotas) / 100;
    if (wR > 0) { doc.setFillColor(...ORO); doc.rect(M, y, wR, ALTO_B, "F") }
    const wC = ANCHO * pct(d.plataCont) / 100;
    if (wC > 0) { doc.setFillColor(...TINTA); doc.rect(M + wR, y, wC, ALTO_B, "F") }
    y += ALTO_B + 4;
    fuente("normal", 7); gris();
    doc.text(`Rotas ${pct(d.plataRotas)} %`, M, y);
    doc.text(`Contaminadas ${pct(d.plataCont)} %`, W - M, y, { align: "right" });
    y += 5;
  }

  /* LAS DOS FORMAS, DE MAYOR A MENOR. */
  for (const f of formas) {
    const ALTO_F = 15;
    cabe(ALTO_F + 2);
    doc.setDrawColor(213, 220, 229);
    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
    doc.setFillColor(...(f.oro ? ORO : TINTA));
    doc.rect(M, y + 4.2, 3, 3, "F");
    fuente("bold", 10.5); tinta();
    doc.text(f.nom, M + 6, y + 6.6);
    fuente("normal", 7.6); gris();
    doc.text(doc.splitTextToSize(f.que, ANCHO - 60)[0] ?? "", M + 6, y + 10.4);
    fuente("normal", 6.6); doc.setTextColor(140, 150, 162);
    doc.text(f.formula, M + 6, y + 13.6);
    /* LA ETIQUETA DE QUÉ SE COBRA, en su recuadro. */
    fuente("bold", 6); gris();
    const anchoChip = doc.getTextWidth(f.chip) + 5;
    doc.setDrawColor(213, 220, 229);
    doc.rect(W - M - 34 - anchoChip, y + 3.6, anchoChip, 5);
    doc.text(f.chip, W - M - 34 - anchoChip + 2.5, y + 7.1);
    fuente("bold", 14); tinta();
    doc.text(money(f.valor), W - M, y + 8, { align: "right" });
    fuente("normal", 7); gris();
    doc.text(`${pct(f.valor)} %`, W - M, y + 12.4, { align: "right" });
    y += ALTO_F;
  }
  doc.setDrawColor(213, 220, 229);
  doc.line(M, y, W - M, y);
  y += 9;

  /* LA TABLA POR CAUSA. La columna de quién la asume no es adorno: es la
     que dice cuáles de esas cifras van a discutirse. Y EL TOTAL VA
     REPETIDO ABAJO: es lo que deja comprobar que el reparto suma lo
     mismo que la cifra grande de la cabecera. */
  {
    const FILA = 6;
    const COLC = [ANCHO - 76, 40, 36];
    fuente("bold", 7); gris();
    doc.text("POR CAUSA", M, y);
    y += 3;
    doc.setFillColor(...TINTA);
    doc.rect(M, y, ANCHO, FILA, "F");
    doc.setTextColor(255, 255, 255); fuente("bold", 7.5);
    doc.text("CAUSA", M + 2, y + FILA - 2);
    doc.text("QUIÉN LA ASUME", M + COLC[0] + 2, y + FILA - 2);
    doc.text("SE COBRA", M + ANCHO - 2, y + FILA - 2, { align: "right" });
    y += FILA;
    if (d.porCausa.length === 0) {
      fuente("normal", 8.5); gris();
      doc.text("No hay nada a cobro en este período con estos filtros.", M + 2, y + 4.2);
      y += 8;
    }
    d.porCausa.forEach((c, i) => {
      if (y + FILA > TOPE) hojaNueva();
      if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, FILA, "F") }
      fuente("normal", 8.5); tinta();
      doc.text(doc.splitTextToSize(c.nombre, COLC[0] - 3)[0] ?? "", M + 2, y + FILA - 1.8);
      /* EL PUNTO: neutro cuando la asume el OL —que es lo normal— y rojo
         cuando no. Así el rojo quiere decir una sola cosa en la hoja. */
      doc.setFillColor(...(c.grupo === "no_asumida" ? MAL : GRIS_PUNTO));
      doc.circle(M + COLC[0] + 3.4, y + FILA / 2 - 0.6, 1, "F");
      if (c.grupo === "no_asumida") { fuente("bold", 8); doc.setTextColor(...MAL) }
      else { fuente("normal", 8); gris() }
      doc.text(c.grupo === "no_asumida" ? "No asumida" : "El OL", M + COLC[0] + 6, y + FILA - 1.8);
      fuente("bold", 8.5); tinta();
      doc.text(money(c.valor), M + ANCHO - 2, y + FILA - 1.8, { align: "right" });
      y += FILA;
    });
    if (d.porCausa.length > 0) {
      y += 1.5;
      fuente("bold", 9); tinta();
      doc.text("Total a cobrar", M + ANCHO - 36, y + 3.4, { align: "right" });
      doc.text(money(d.plata), M + ANCHO - 2, y + 3.4, { align: "right" });
      y += 6;
    }
    y += 8;
  }

  /* ---------------- LAS CUATRO CIFRAS DE UNIDADES ----------------
     La plata es la respuesta; estas cuatro son de qué está hecha. */
  cabe(30);
  titulo("Y en unidades", "lo que ya tiene visto bueno");
  {
    const cif: [string, string, string, boolean][] = [
      ["No asumidas", d.pctNoAsumida + " %",
       `${nf.format(d.noAsumidas)} unidades que se dice que no fueron del OL`, d.pctNoAsumida > 25],
      ["Devueltas por ABI", d.pctDevueltas + " %",
       `${nf.format(d.devueltas)} que ABI marcó como que no cuentan`, d.pctDevueltas > 15],
      ["Baja de líquido", nf.format(d.liquido),
       "unidades de producto terminado: las rotas más las contaminadas", false],
      ["De esas, contaminadas", nf.format(d.contaminadas),
       "pierden el líquido pero devuelven la botella: no cuentan como vidrio", false],
    ];
    const kw = (ANCHO - 9) / 4;
    cif.forEach(([r, n, p, mal], i) => {
      const x = M + i * (kw + 3);
      doc.setFillColor(243, 246, 249); doc.rect(x, y, kw, 24, "F");
      doc.setFillColor(...(mal ? MAL : P.acento)); doc.rect(x, y, kw, 0.9, "F");
      fuente("bold", 6.3); gris(); doc.text(r.toUpperCase(), x + 3, y + 6);
      fuente("bold", 16);
      if (mal) doc.setTextColor(...MAL); else tinta();
      doc.text(n, x + 3, y + 14.5);
      fuente("normal", 6.2); gris();
      doc.text(doc.splitTextToSize(p, kw - 6).slice(0, 3), x + 3, y + 18.5);
    });
    y += 32;
  }

  /* =====================================================================
     EL RECORRIDO — SU PROPIA HOJA, VERTICAL COMO TODAS
     ---------------------------------------------------------------------
     DOS ESCALAS, UNA PARA CADA EJE, Y ES LO QUE HACE QUE QUEPA.

     El diagrama nace de un lienzo pensado para una pantalla ancha: 1160
     de ancho, y entre nodo y nodo un hueco fijo de 64 que NO es aire
     —es el sitio donde van el nombre, la cifra y el pie de cada barra—.
     Llevado a la hoja con una sola escala, ese hueco queda en 10 mm y
     las tres líneas de texto se montan una encima de otra; subir la
     escala para que quepan el texto saca el dibujo por los lados.

     Así que el ancho se comprime a los 182 mm de la hoja y el alto se
     estira hasta que el hueco vuelva a medir los 14,8 mm que necesita el
     rótulo. Lo único que cambia es lo empinada que se ve cada cinta: los
     altos de los nodos y los grosores de las cintas se multiplican TODOS
     por la misma `ky`, así que siguen siendo proporcionales a sus
     unidades, que es lo único que el dibujo promete.

     La otra salida era dejar esta hoja acostada, y se probó: en el visor
     se va pasando de página y en la mitad aparece una girada. No se lee.
     ===================================================================== */
  if (d.recorrido && d.recorrido.s.nodos.length > 0) {
    const s = d.recorrido.s;
    hojaNueva();

    fuente("bold", 13); tinta();
    doc.text(`El recorrido de las ${nf.format(d.recorrido.total)} unidades`, M, y + 4);
    fuente("normal", 8); gris();
    doc.text("el grosor de cada cinta son unidades", W - M, y + 4, { align: "right" });
    y += 9;

    /* LOS TRES RÓTULOS DE COLUMNA. Sin ellos el dibujo es bonito y no se
       sabe qué se está mirando. */
    fuente("bold", 6.5); gris();
    doc.text("DE QUÉ CAUSA SALIÓ", M, y);
    doc.text("POR DÓNDE PASÓ", M + ANCHO / 2, y, { align: "center" });
    doc.text("EN QUÉ TERMINA", W - M, y, { align: "right" });
    y += 4;

    /* ---------------------------------------------------------------
       LA ESCALA SALE DEL SITIO QUE QUEDA EN LA HOJA, NO DEL LIENZO

       Antes esto multiplicaba por una escala fija y daba por hecho que
       quien arma el lienzo lo pidiera de un alto compatible. El día que
       las dos partes no coincidieron —el servidor ya pedía un lienzo más
       alto y el navegador todavía tenía el dibujo viejo— el diagrama
       salió pasado de la hoja, por encima del pie y cortado por el
       borde. Un PDF no tiene barra para desplazarse: lo que no cabe, no
       está.

       Así que aquí se mide lo que queda hasta el pie y el dibujo se
       ajusta a eso. Si el lienzo viene del alto bueno, la escala es la
       que hace legible el rótulo y no cambia nada; si viene más alto, el
       dibujo se encoge —y las letras con él, en la misma proporción,
       para que los tres renglones de cada barra sigan sin montarse—.
       Encogido se lee peor; fuera de la hoja no se lee.

       EL FONDO SE MIDE, NO SE SUPONE: una barra puede terminar por
       debajo del borde del lienzo (el piso de 1,5 px de los nodos chicos
       corre unas columnas más que otras), y a cada una hay que sumarle
       los 64 px del bloque de su rótulo.
       --------------------------------------------------------------- */
    const NOTAS = 12;
    const fondoPx = Math.max(s.alto, ...s.nodos.map((n) => Math.max(n.y + n.alto, n.y + 64)));
    const kx = ANCHO / s.ancho;
    const KY_ROTULO = 14.8 / 64;
    const ky = Math.min(KY_ROTULO, (TOPE - y - NOTAS) / fondoPx);
    /* Cuánto se tuvo que encoger, para encoger las letras igual. */
    const r = ky / KY_ROTULO;
    const pt = (n: number) => Math.max(4.5, n * r);
    const X = (px: number) => M + px * kx;
    const Y = (px: number) => y + px * ky;

    /* LAS CINTAS PRIMERO Y LOS NODOS ENCIMA: al revés, una cinta gorda
       tapa la barra de la que sale. */
    const colDe = new Map(s.nodos.map((n) => [n.id, n.col]));
    for (const c of s.cintas) {
      const x0 = X(c.x0), y0 = Y(c.y0), x1 = X(c.x1), y1 = Y(c.y1);
      const h = c.grosor * ky;
      const cx = (x0 + x1) / 2;
      doc.setFillColor(...hexRGB(c.color));
      /* LA OPACIDAD BAJA ES LO QUE DEJA VER LOS CRUCES, igual que en la
         pantalla: con las cintas opacas, la que pasa por encima esconde
         a la otra y el dibujo enseña menos de lo que tiene. */
      opacidad(colDe.get(c.de) === 0 ? 0.45 : 0.4);
      /* CADA TRAMO ES RELATIVO AL PUNTO ANTERIOR — así los quiere
         `lines` de jsPDF—: seis números es una curva, dos es una recta. */
      doc.lines([
        [cx - x0, 0, cx - x0, y1 - y0, x1 - x0, y1 - y0],
        [0, h],
        [cx - x1, 0, cx - x1, y0 - y1, x0 - x1, y0 - y1],
      ], x0, y0, [1, 1], "F", true);
      opacidad(1);
    }

    const ultima = s.nodos.reduce((m, x) => Math.max(m, x.col), 0);
    for (const n of s.nodos) {
      doc.setFillColor(...hexRGB(n.color));
      doc.rect(X(n.x), Y(n.y), 20 * kx, Math.max(0.5, n.alto * ky), "F");
      /* LA ÚLTIMA COLUMNA ROTULA A LA IZQUIERDA de su barra: a la
         derecha el texto se saldría del papel. */
      const fin = n.col === ultima;
      const tx = fin ? X(n.x) - 2.5 : X(n.x) + 20 * kx + 2.5;
      const al = fin ? { align: "right" as const } : {};
      const libre = fin ? tx - M : W - M - tx;
      fuente("bold", pt(9)); tinta();
      doc.text(doc.splitTextToSize(n.rotulo, libre)[0] ?? "", tx, Y(n.y) + 4.2 * r, al);
      fuente("bold", pt(13)); tinta();
      doc.text(nf.format(n.valor), tx, Y(n.y) + 9.3 * r, al);
      if (n.pie) {
        fuente("normal", pt(7)); gris();
        doc.text(doc.splitTextToSize(n.pie, libre)[0] ?? "", tx, Y(n.y) + 13.5 * r, al);
      }
    }
    /* DEBAJO DE LO MÁS BAJO QUE SE HAYA ESCRITO, y no debajo del lienzo.
       El lienzo reserva sitio abajo para el rótulo del último nodo, pero
       cada columna termina donde termina —el piso de 1,5 px de los nodos
       chicos corre unas más que otras—, así que el rótulo más bajo puede
       quedar por debajo del borde del lienzo. Midiéndolo, la nota nunca
       se escribe encima de una cifra; calculándolo desde `s.alto`, se
       escribía encima del «30» de Líneas. */
    y = Math.max(Y(s.alto),
                 ...s.nodos.map((n) => Y(n.y) + (n.pie ? 13.5 : 9.3) * r)) + 4;

    if (d.recorrido.juntados > 0) {
      fuente("normal", 7); gris();
      doc.text(`Las ${d.recorrido.juntados} más chicas están sumadas en «otros»: una docena de ` +
               "cintas de dos milímetros se ven llenas y no dicen nada. El total no cambia.", M, y);
      y += 4;
    }
    fuente("normal", 7); doc.setTextColor(140, 150, 162);
    doc.text(doc.splitTextToSize(
      "La ROTA pierde el líquido y la botella, así que es baja de vidrio. La CONTAMINADA pierde " +
      "el líquido y devuelve el envase a la línea: por eso son dos salidas y no se suman.",
      ANCHO), M, y);

    /* Y LA TABLA ARRANCA EN HOJA LIMPIA: con lo que queda debajo del
       diagrama solo caben dos renglones, y una tabla que empieza con dos
       filas y sigue en la otra hoja se lee peor que una que empieza
       entera. */
    hojaNueva();
  }

  /* ---------------- LA TABLA DE ROTURAS ----------------
     Es la que convierte el informe en algo que se puede revisar una por
     una contra lo que se registró ese día. */
  const COL = [20, 14, 42, 32, 20, 13, 14, ANCHO - 155];
  const CAB = ["ROTURA", "FECHA", "MATERIAL", "CAUSA", "PROCESO", "ROTAS", "CONTAM.", "SE COBRA"];
  const FILA = 8.8;
  const encabezado = (sigue: boolean) => {
    fuente("bold", 11); tinta();
    doc.setFillColor(...P.acento);
    doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    doc.text(`Las roturas${sigue ? " (continúa)" : ""}`, M + 4.5, y + 4);
    fuente("normal", 8.5); gris();
    doc.text(`${nf.format(d.roturas.length)} en el período`, W - M, y + 4, { align: "right" });
    y += 7;
    doc.setFillColor(...TINTA);
    doc.rect(M, y, ANCHO, 6, "F");
    doc.setTextColor(255, 255, 255);
    fuente("bold", 7);
    let x = M;
    CAB.forEach((t, i) => {
      if (i >= 5) doc.text(t, x + COL[i] - 2, y + 4, { align: "right" });
      else doc.text(t, x + 2, y + 4);
      x += COL[i];
    });
    y += 6;
  };
  cabe(10 + FILA * 3);
  encabezado(false);

  if (d.roturas.length === 0) {
    fuente("normal", 9.5); gris();
    doc.text("No hay roturas en este período con estos filtros.", M + 2, y + 4.5);
    y += 10;
  }
  d.roturas.forEach((f, i) => {
    if (y + FILA > TOPE) { hojaNueva(); encabezado(true) }
    if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, FILA, "F") }
    let x = M;
    const celdas = [f.codigo, fecha6(f.fecha), f.material_nombre, f.causa, f.proceso,
                    nf.format(f.rotas), f.contaminadas > 0 ? nf.format(f.contaminadas) : "—",
                    money(f.cobro)];
    fuente("normal", 8); tinta();
    celdas.forEach((c, j) => {
      if (j === 7) fuente("bold", 8);
      if (j === 7 && f.cobro == null) { fuente("bold", 8); doc.setTextColor(...MAL) }
      if (j >= 5) doc.text(c, x + COL[j] - 2, y + 4.4, { align: "right" });
      else doc.text(doc.splitTextToSize(c, COL[j] - 3)[0] ?? "", x + 2, y + 4.4);
      fuente("normal", 8); tinta();
      x += COL[j];
    });
    /* EL RENGLÓN CHICO DE ABAJO. Son los tres datos que se piden cuando
       alguien discute una: el código del material, de quién es la causa
       y en qué parte del camino va. */
    fuente("normal", 6.2); doc.setTextColor(140, 150, 162);
    doc.text(f.material, M + COL[0] + COL[1] + 2, y + 7.6);
    if (f.grupo === "no_asumida") { fuente("bold", 6.2); doc.setTextColor(...MAL) }
    doc.text(f.grupo === "no_asumida" ? "no asumida" : "la asume el OL",
             M + COL[0] + COL[1] + COL[2] + 2, y + 7.6);
    fuente("normal", 6.2); doc.setTextColor(140, 150, 162);
    doc.text(f.etapa, M + ANCHO - 2, y + 7.6, { align: "right" });
    y += FILA;
  });

  /* ---------------- PIE DE CADA PÁGINA ---------------- */
  const pie = d.filtros ? `Filtrado · ${d.filtros}` : "Sin filtros";
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5); gris();
    /* HASTA DONDE EMPIEZA «BAVARIA», que va centrado y es de la marca:
       sin esto el renglón de la izquierda se le monta encima. Y SE CORTA
       POR PARTES, no a la mitad de una palabra — un pie cortado en seco
       se lee como un error de la app. */
    const anchoIzq = W / 2 - M - doc.getTextWidth("Bavaria") / 2 - 4;
    /* EL FILTRO PRIMERO Y EL PERÍODO DESPUÉS, al revés que en los otros
       informes y a propósito: si no cabe todo, lo que NO se puede perder
       es que el papel está filtrado —un informe filtrado que no lo diga
       se lee como el mes entero—. El período ya va en la cabecera de
       todas las hojas. */
    const trozos = [pie, `Roturas en sitio · ${d.periodo}`];
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
export const nombreInformeSitio = (hoy: string) => `roturas-en-sitio-${hoy}.pdf`;
