/**
 * LA HOJA DEL DÍA PARA FIRMAR — rotura en línea.
 *
 * «Que los reportes del día los generes en una hoja con el fin de que el
 * supervisor lo pueda firmar: que llenen la información, la persona
 * pueda generar el PDF, enviárselo por WhatsApp o lo que sea al
 * supervisor, y esté el espacio para que lo firmen.»
 *
 * DOS PIEZAS, Y POR ESO VIVEN AQUÍ Y NO EN EL COMPONENTE:
 *
 *   armarHoja()    junta las filas del día en lo que la hoja enseña.
 *                  Es una función pura: entra una lista, sale otra.
 *   dibujarHoja()  pinta eso en un PDF con jsPDF.
 *
 * Separadas se pueden medir sin navegador: un arnés arma la hoja con
 * cifras conocidas, genera el PDF de verdad y lo lee de vuelta con
 * `pdftotext` para comprobar que lo que dice el papel es lo que dice la
 * base. Dentro de un componente, la única forma de comprobarlo sería
 * abrir el PDF y mirarlo — y un total mal sumado se ve perfectamente
 * normal.
 *
 * PDF DE VERDAD Y NO UNA FOTO DE LA PANTALLA. html2canvas daría una
 * imagen: pesada para mandar por WhatsApp, borrosa al ampliar, y sin
 * texto que se pueda buscar o copiar. Dibujado con jsPDF pesa unos pocos
 * kilobytes, se lee nítido en cualquier teléfono, y las apps de PDF del
 * celular dejan firmar encima.
 *
 * Y SUMA IGUAL QUE EL TABLERO. PALE-DEPA dentro de PASTEURIZADORA y
 * CARGADOR dentro de SALIDA DE LAVADORA, con la misma regla —`suma_en`
 * del maestro—. Un papel firmado que dijera otra cosa que la pantalla
 * sería un papel que nadie podría defender.
 */
import type { jsPDF as JsPDF } from "jspdf";

/* --------------------------------------------------------------------- */
/*  LO QUE ENTRA                                                          */
/* --------------------------------------------------------------------- */

/** Una fila del día, tal como la trae `delDia()`. */
export type FilaDia = {
  linea: number; turno: number; envase: string; envase_nombre: string;
  maquina: number; kg: number; und: number;
};
export type MaqHoja = {
  item: number; nombre: string; orden: number | null;
  /** Si al sumar se cuenta dentro de otra máquina. Lo pone la migración
   *  `2026-09-rotura-linea-sumar-maquinas.sql`; sin ella, no viene. */
  suma_en?: number | null;
};
export type LineaHoja = { linea: number; tren: string; centro_coste: string; orden: number | null };
export type FirmaHoja = { linea: number; turno: number; firmado_nombre: string | null; firmado_en: string };

/* --------------------------------------------------------------------- */
/*  LO QUE SALE                                                           */
/* --------------------------------------------------------------------- */

export type FilaMaquina = { item: number; nombre: string; turnos: [number, number, number]; total: number };
export type LineaDeHoja = {
  linea: number; tren: string; centro_coste: string;
  filas: FilaMaquina[];
  /** Por turno A, B, C y el total, en ese orden. */
  und: [number, number, number, number];
  kg: [number, number, number, number];
  firmas: { turno: number; nombre: string; en: string }[];
};
export type Hoja = {
  fecha: string;
  lineas: LineaDeHoja[];
  envases: { envase: string; nombre: string; und: number; kg: number }[];
  und: number;
  kg: number;
};

/**
 * JUNTA EL DÍA EN LO QUE LA HOJA ENSEÑA.
 *
 * Por línea, una tabla de máquinas por turno. Solo las líneas y las
 * máquinas que tuvieron algo: una hoja para firmar con quince filas en
 * cero es una hoja donde lo que importa hay que buscarlo.
 */
export function armarHoja(entrada: {
  fecha: string;
  filas: FilaDia[];
  maquinas: MaqHoja[];
  lineas: LineaHoja[];
  firmas?: FirmaHoja[];
}): Hoja {
  const maq = new Map(entrada.maquinas.map((m) => [m.item, m]));
  /* LA MISMA REGLA QUE EL TABLERO: un solo salto, y el nombre y el
     orden de la máquina de DESTINO. */
  const destino = (item: number) => maq.get(maq.get(item)?.suma_en ?? item) ?? maq.get(item);

  const porLinea = new Map<number, Map<number, FilaMaquina>>();
  const tot = new Map<number, { und: number[]; kg: number[] }>();
  const env = new Map<string, { envase: string; nombre: string; und: number; kg: number }>();

  for (const f of entrada.filas) {
    const t = f.turno - 1;
    if (t < 0 || t > 2) continue;
    const d = destino(f.maquina);
    const item = d?.item ?? f.maquina;
    const und = Number(f.und), kg = Number(f.kg);

    const filas = porLinea.get(f.linea) ?? new Map<number, FilaMaquina>();
    const fila = filas.get(item) ?? { item, nombre: d?.nombre ?? `Máquina ${f.maquina}`, turnos: [0, 0, 0], total: 0 };
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

  /* EN EL ORDEN DEL TREN, que es como se llena la rejilla y como se lee
     la línea: de la desempacadora a la paletizadora. */
  const ordenMaq = (item: number) => maq.get(item)?.orden ?? 999;
  const ordenLin = (n: number) => entrada.lineas.find((l) => l.linea === n)?.orden ?? n;

  const lineas: LineaDeHoja[] = [...porLinea.keys()]
    .sort((a, b) => ordenLin(a) - ordenLin(b))
    .map((n) => {
      const l = entrada.lineas.find((x) => x.linea === n);
      const t = tot.get(n)!;
      const suma = (v: number[]) => v[0] + v[1] + v[2];
      return {
        linea: n,
        tren: l?.tren ?? `Línea ${n}`,
        centro_coste: l?.centro_coste ?? "",
        filas: [...porLinea.get(n)!.values()].sort((a, b) => ordenMaq(a.item) - ordenMaq(b.item)),
        und: [t.und[0], t.und[1], t.und[2], suma(t.und)],
        kg: [t.kg[0], t.kg[1], t.kg[2], suma(t.kg)],
        firmas: (entrada.firmas ?? [])
          .filter((f) => f.linea === n)
          .sort((a, b) => a.turno - b.turno)
          .map((f) => ({ turno: f.turno, nombre: f.firmado_nombre ?? "—", en: f.firmado_en })),
      };
    });

  const envases = [...env.values()].sort((a, b) => b.und - a.und);
  return {
    fecha: entrada.fecha,
    lineas,
    envases,
    und: lineas.reduce((a, l) => a + l.und[3], 0),
    kg: lineas.reduce((a, l) => a + l.kg[3], 0),
  };
}

/* --------------------------------------------------------------------- */
/*  EL PAPEL                                                              */
/* --------------------------------------------------------------------- */

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const LETRA = ["A", "B", "C"] as const;

/** «lunes 21 de septiembre de 2026». Con la T para que no se corra un
 *  día por la zona horaria: sin ella, «2026-09-21» se lee en UTC y en
 *  Barranquilla sale el 20. */
export const fechaLarga = (f: string) =>
  new Date(f + "T00:00:00").toLocaleDateString("es-CO",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const horaCorta = (s: string) =>
  new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

/** El nombre del archivo: dice qué es y de qué día, para que en el chat
 *  de WhatsApp no llegue «documento (3).pdf». */
export const nombreArchivo = (fecha: string) => `rotura-linea-${fecha}.pdf`;

/**
 * PINTA LA HOJA EN UN PDF A4.
 *
 * Recibe el constructor de jsPDF en vez de importarlo: en el navegador
 * se carga solo cuando alguien toca el botón —son 350 KB que el resto de
 * la pantalla no necesita— y en el arnés se pasa el de Node.
 */
/**
 * LOS LOGOS DE BAVARIA, como los subió Cristian a `public/marca/`.
 *
 * NO SE DIBUJAN CON CÓDIGO NI SE REHACEN: se leen los PNG tal cual y se
 * pegan. Una marca redibujada a mano es una marca con las proporciones
 * de otro, y en un papel que va firmado a otra área eso se nota.
 *
 * Son opcionales: si no cargan —sin señal en el patio, un archivo que
 * falta— la hoja sale igual, sin logo. Una hoja sin marca se firma; una
 * que no sale no.
 */
export type Marca = {
  /** «Bavaria» con el aro: `/marca/logo-bavaria.png`, 540 × 160. */
  palabra?: string;
  /** Solo el aro con la B: `/marca/logo-b.png`, cuadrado. */
  sello?: string;
};

/* LOS COLORES DE LA MARCA, sacados de los píxeles del propio logo y no
   de memoria: el rojo es el de la palabra «Bavaria» y los dos dorados son
   los extremos del aro. */
type RGB = [number, number, number];
const ROJO: RGB = [255, 0, 15];
const ORO: RGB = [236, 198, 68];
const ORO_HONDO: RGB = [181, 135, 53];

/**
 * LOS COLORES DEL PAPEL, LOS DEL TEMA DE QUIEN LA GENERA.
 *
 * «Los colores del informe dependen de la preferencia: si tengo ámbar o
 * gris, todo varía; pero el logo debe permanecer normal.»
 *
 *   tinta        la banda del total, los títulos de columna, las rayas y
 *                el texto. Es oscura en TODOS los temas, así que lo que va
 *                encima —en blanco— se lee siempre.
 *   acento       la raya de la banda y el cuadrito de cada línea. Solo se
 *                usa de RELLENO, nunca de letra: el ámbar #ffc000 sobre
 *                papel blanco como letra no se lee.
 *   cinta        las paradas del degradado del borde, del pie y de las
 *                firmas.
 *
 * LOS LOGOS NO ENTRAN AQUÍ: son los PNG tal cual, en cualquier tema.
 */
export type Paleta = { tinta: RGB; acento: RGB; cinta: Array<[number, RGB]> };

/* EL TEMA OFICIAL ES LA MARCA: la cinta del dorado del aro al rojo de la
   palabra, sacados de los píxeles del logo. */
export const PALETA_MARCA: Paleta = {
  tinta: [18, 38, 58],
  acento: ROJO,
  cinta: [[0, ORO_HONDO], [0.35, ORO], [1, ROJO]],
};

/** Un color que el navegador ya calculó —`rgb(…)` o, si viene de un
 *  `color-mix`, `color(srgb 0-1 …)`— como tres números de 0 a 255. */
export function aRGB(c: string): RGB | null {
  let m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]].map(Math.round) as RGB;
  m = c.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]].map((v) => Math.round(v * 255)) as RGB;
  return null;
}

/* LA MISMA FORMA DE LA CINTA DE LA MARCA —tres paradas, la del medio a
   un tercio— con los colores del tema: del acento hondo al acento y del
   acento a la tinta. «Ese degradado de arriba me gustaba: solo era
   variarlo de acuerdo al tema.» Con dos paradas del hondo al acento, en
   ámbar la cinta salía casi lisa: #dda600 y #ffc000 se confunden. */
export const paletaDeTema = (tinta: RGB, acento: RGB, acentoHondo: RGB): Paleta =>
  ({ tinta, acento, cinta: [[0, acentoHondo], [0.35, acento], [1, tinta]] });

export function dibujarHoja(
  JsPDFCtor: typeof JsPDF,
  hoja: Hoja,
  datos: { elaboro: string; supervisor: string; observaciones: string; generado: Date; marca?: Marca; paleta?: Paleta;
           /** La firma de quien elaboró, dibujada con el dedo: un PNG transparente. */
           firmaElaboro?: string },
): JsPDF {
  const doc = new JsPDFCtor({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, ANCHO = W - 2 * M;
  const PIE = H - 10;                  // donde va el número de página
  const TOPE = PIE - 6;                // lo último que se puede escribir
  let y = M;

  const P = datos.paleta ?? PALETA_MARCA;
  const TINTA = P.tinta;
  /* Lo que va en letra clara sobre la tinta: blanco con un pelo de la
     tinta, para que sea secundario sin dejar de leerse. */
  const TENUE: RGB = TINTA.map((c) => Math.round(255 - (255 - c) * 0.16)) as RGB;
  const tinta = () => doc.setTextColor(...TINTA);
  const gris = () => doc.setTextColor(95, 107, 121);
  const fuente = (peso: "normal" | "bold", tam: number) => { doc.setFont("helvetica", peso); doc.setFontSize(tam) };
  const marca = datos.marca ?? {};

  /* LA CINTA: del dorado hondo al dorado y del dorado al rojo, como el
     aro del logo. jsPDF no pinta degradados, así que se arma con franjas
     angostas una al lado de otra —140 en todo el ancho, menos de 1,5 mm
     cada una—: a esa distancia el ojo no ve el escalón. */
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
      /* Cada franja pisa un pelo la siguiente: sin eso, al ampliar el PDF
         se ven hilos blancos entre franja y franja. */
      doc.rect(x + i * paso, yy, paso + 0.15, alto, "F");
    }
  };

  /* LA MARCA DE AGUA, DETRÁS DE TODO. Va al empezar cada hoja —antes de
     escribir nada— porque jsPDF pinta en el orden en que se le pide: puesta
     al final quedaría ENCIMA de las cifras. Al 4 %: se ve en la pantalla,
     y en una impresora en blanco y negro no tapa un número ni una firma. */
  /* `doc.GState` es un constructor en tiempo de ejecución, pero los
     tipos de jsPDF lo declaran como función: se le da el tipo que tiene. */
  const opacidad = (o: number) =>
    doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown })
      .GState({ opacity: o }));
  const aguaDeFondo = () => {
    if (!marca.sello) return;
    try {
      opacidad(0.04);
      const lado = 120;
      doc.addImage(marca.sello, "PNG", (W - lado) / 2, 118, lado, lado, "sello", "FAST");
    } catch { /* una marca de agua que no carga no frena la hoja */ }
    finally { opacidad(1) }
  };

  /** Una hoja nueva lleva su cabecera chica: el sello, qué es y de qué
   *  día. Un papel suelto de la segunda hoja, sin eso, no se sabe de
   *  dónde salió. */
  const hojaNueva = () => {
    doc.addPage();
    aguaDeFondo();
    cinta(0, 0, W, 2.2);
    if (marca.sello) {
      try { doc.addImage(marca.sello, "PNG", M, 7, 9, 9, "sello", "FAST") } catch { /* sigue */ }
    }
    fuente("bold", 10); tinta();
    doc.text("Rotura en línea", M + (marca.sello ? 12 : 0), 12.2);
    fuente("normal", 8.5); gris();
    doc.text(`Hoja del día · ${hoja.fecha}`, M + (marca.sello ? 12 : 0), 15.8);
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.3);
    doc.line(M, 19.5, W - M, 19.5);
    y = 24;
  };
  /** Si lo que viene no cabe, página nueva. Una tabla partida a la mitad
   *  de una fila es una fila que nadie sabe de qué línea era. */
  const cabe = (alto: number) => { if (y + alto > TOPE) hojaNueva() };

  /* ---------------- CABECERA ----------------
     LA MARCA A LA IZQUIERDA Y LO QUE ES LA HOJA A LA DERECHA, sobre
     blanco. El logo es rojo sobre transparente: puesto sobre la banda
     azul del resto de la app perdería el rojo contra el fondo oscuro, y
     el rojo ES la marca. */
  aguaDeFondo();
  cinta(0, 0, W, 4.5);

  const ALTO_LOGO = 15;
  let conLogo = false;
  if (marca.palabra) {
    try {
      /* 540 × 160 es la proporción del archivo: se respeta, no se estira. */
      doc.addImage(marca.palabra, "PNG", M, 11, ALTO_LOGO * 540 / 160, ALTO_LOGO, "palabra", "FAST");
      conLogo = true;
    } catch { /* sin logo, la hoja sale igual */ }
  }
  if (!conLogo) {
    /* Hace de logo: va en el rojo de la marca en cualquier tema. */
    fuente("bold", 16); doc.setTextColor(...ROJO);
    doc.text("Bavaria", M, 21);
  }

  fuente("bold", 7.5); gris();
  doc.text("CENTRO DE DISTRIBUCIÓN CD38 · CONTROL", W - M, 13.5, { align: "right" });
  fuente("bold", 20); tinta();
  doc.text("Rotura en línea", W - M, 21.5, { align: "right" });
  fuente("normal", 10); gris();
  const larga = fechaLarga(hoja.fecha);
  doc.text(`Hoja del día · ${larga.charAt(0).toUpperCase() + larga.slice(1)}`, W - M, 27.5, { align: "right" });

  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.5);
  doc.line(M, 32, W - M, 32);
  y = 37;

  /* LA RESPUESTA ARRIBA, Y EN GRANDE: el total del día. Es lo primero
     que busca quien firma, y lo único que muchas veces lee. Va en la
     banda azul con una raya roja: es la única pieza oscura de la hoja,
     así que el ojo cae ahí antes que en cualquier tabla. */
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
  fuente("bold", 11); doc.setTextColor(255, 255, 255);
  doc.text(`${nf1.format(hoja.kg)} kg`, W - M - 6, y + 9.5, { align: "right" });
  fuente("normal", 8.5); doc.setTextColor(...TENUE);
  doc.text(`${hoja.lineas.length} línea${hoja.lineas.length === 1 ? "" : "s"} · generado el ` +
           `${datos.generado.toLocaleDateString("es-CO")} a las ` +
           `${datos.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`,
           W - M - 6, y + 15.5, { align: "right" });
  y += ALTO_KPI + 8;

  /* ---------------- UNA TABLA POR LÍNEA ---------------- */
  const COL = [ANCHO - 4 * 25, 25, 25, 25, 25];      // máquina | A | B | C | total
  const FILA = 6.2;

  const celdas = (vals: string[], alto: number, peso: "normal" | "bold") => {
    let x = M;
    fuente(peso, 9); tinta();
    vals.forEach((v, i) => {
      if (i === 0) doc.text(v, x + 2, y + alto - 2);
      else doc.text(v, x + COL[i] - 2, y + alto - 2, { align: "right" });
      x += COL[i];
    });
  };

  if (hoja.lineas.length === 0) {
    fuente("normal", 10); gris();
    doc.text("No hay rotura registrada este día.", M, y + 4);
    y += 12;
  }

  /* EL TÍTULO DE LA LÍNEA Y LOS DE LAS COLUMNAS, como una pieza que se
     REPITE cuando la tabla sigue en la hoja siguiente. La primera versión
     los pintaba una vez: la hoja 2 empezaba con «MÁQUINA DE PRUEBA 9 —
     5 — 5» sin decir de qué línea era ni qué turno era cada columna. En
     un papel que se firma, una fila que no se sabe de dónde es no vale. */
  const encabezado = (l: LineaDeHoja, sigue: boolean) => {
    doc.setFillColor(...P.acento);
    doc.rect(M, y + 1.2, 2.6, 2.6, "F");
    fuente("bold", 11); tinta();
    doc.text(`Línea ${l.linea} · ${l.tren}${sigue ? " (continúa)" : ""}`, M + 4.5, y + 4);
    fuente("normal", 8.5); gris();
    if (l.centro_coste) doc.text(`Centro de coste ${l.centro_coste}`, W - M, y + 4, { align: "right" });
    y += 7;
    doc.setFillColor(...TINTA);
    doc.rect(M, y, ANCHO, FILA, "F");
    doc.setTextColor(255, 255, 255);
    fuente("bold", 8.5);
    const tit = ["MÁQUINA", "TURNO A", "TURNO B", "TURNO C", "TOTAL"];
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
  /** Como `cabe`, pero si parte la hoja vuelve a poner el encabezado. */
  const cabeEnTabla = (alto: number, l: LineaDeHoja) => {
    if (y + alto > TOPE) { hojaNueva(); encabezado(l, true) }
  };

  for (const l of hoja.lineas) {
    /* La cabecera de la línea no puede quedar sola al pie de la página:
       se pide sitio para ella MÁS tres filas. */
    cabe(10 + FILA * Math.min(4, l.filas.length + 3));
    encabezado(l, false);

    l.filas.forEach((f, i) => {
      cabeEnTabla(FILA, l);
      if (i % 2 === 1) { doc.setFillColor(247, 249, 251); doc.rect(M, y, ANCHO, FILA, "F") }
      celdas([f.nombre, ...f.turnos.map((v) => (v ? nf.format(v) : "—")), nf.format(f.total)],
             FILA, "normal");
      doc.line(M, y + FILA, M + ANCHO, y + FILA);
      y += FILA;
    });

    /* LOS TOTALES VAN EN NEGRITA Y CON RAYA ARRIBA. Son las cifras que
       el supervisor firma: tienen que distinguirse de un renglón más. */
    cabeEnTabla(FILA * 2, l);
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.4);
    doc.line(M, y, M + ANCHO, y);
    celdas(["Total unidades", ...l.und.map((v) => nf.format(v))], FILA, "bold");
    y += FILA;
    celdas(["Total kg", ...l.kg.map((v) => nf1.format(v))], FILA, "normal");
    y += FILA + 1;

    /* LA FIRMA QUE YA HAY EN CONTROL, si alguien cerró el turno en la
       app. No reemplaza la del papel: la acompaña, y dice que lo que
       está impreso es lo mismo que se cerró. */
    if (l.firmas.length > 0) {
      cabe(5);
      fuente("normal", 8); gris();
      doc.text("Cerrado en CONTROL: " + l.firmas
        .map((f) => `turno ${LETRA[f.turno - 1] ?? f.turno} por ${f.nombre} (${horaCorta(f.en)})`)
        .join(" · "), M, y + 3);
      y += 5;
    }
    y += 5;
  }

  /* ---------------- POR ENVASE ---------------- */
  if (hoja.envases.length > 0) {
    cabe(12 + FILA * Math.min(3, hoja.envases.length));
    fuente("bold", 11); tinta();
    doc.text("Por envase", M, y + 4);
    y += 7;
    const CE = [ANCHO - 60, 30, 30];
    doc.setDrawColor(213, 220, 229);
    doc.setLineWidth(0.2);
    for (const e of hoja.envases) {
      cabe(FILA);
      fuente("normal", 9); tinta();
      doc.text(`${e.envase} · ${e.nombre}`.slice(0, 70), M + 2, y + FILA - 2);
      doc.text(`${nf.format(e.und)} und`, M + CE[0] + CE[1] - 2, y + FILA - 2, { align: "right" });
      gris();
      doc.text(`${nf1.format(e.kg)} kg`, M + ANCHO - 2, y + FILA - 2, { align: "right" });
      doc.line(M, y + FILA, M + ANCHO, y + FILA);
      y += FILA;
    }
    y += 6;
  }

  /* ---------------- OBSERVACIONES Y FIRMAS ----------------
     VAN JUNTAS Y AL FINAL, y nunca partidas: una firma en una página
     sin la tabla que firma, o una tabla sin su firma, es un papel que no
     sirve. Si no caben las dos juntas, pasan enteras a la hoja nueva. */
  const obs = datos.observaciones.trim();
  /* SE MIDE CON LA LETRA CON LA QUE SE VA A ESCRIBIR. `splitTextToSize`
     parte según la fuente puesta EN ESE MOMENTO, y antes quedaba la de
     la tabla de envases —9 puntos— mientras el texto se escribía a 9,5:
     cada renglón salía más largo de lo que se midió y se salía del
     recuadro por la derecha. Lo delató el PDF mirado, no el arnés; ahora
     el arnés mide que ninguna palabra pase del margen. */
  fuente("normal", 9.5);
  const lineasObs = obs ? doc.splitTextToSize(obs, ANCHO - 8) as string[] : [];
  const altoObs = 10 + Math.max(3, lineasObs.length) * 5;
  const ALTO_FIRMAS = 40;
  cabe(altoObs + ALTO_FIRMAS + 6);

  fuente("bold", 9); tinta();
  doc.text("OBSERVACIONES", M, y + 4);
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.3);
  doc.rect(M, y + 6, ANCHO, altoObs - 6);
  if (lineasObs.length > 0) {
    fuente("normal", 9.5); tinta();
    doc.text(lineasObs, M + 4, y + 12);
  } else {
    /* EN BLANCO, CON RENGLONES. Si nadie escribió nada, el supervisor
       tiene dónde anotar a mano — y un recuadro vacío sin renglones
       parece un error de impresión. */
    doc.setDrawColor(213, 220, 229);
    for (let i = 1; i <= 3; i++) doc.line(M + 4, y + 6 + i * 5 + 1, M + ANCHO - 4, y + 6 + i * 5 + 1);
  }
  y += altoObs + 6;

  /* LAS DOS FIRMAS: quien elaboró y el supervisor que revisa. Con
     nombre, firma y fecha, que es lo que hace que el papel valga. */
  const media = (ANCHO - 8) / 2;
  const firma = (x: number, rotulo: string, nombre: string, dibujada?: string) => {
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.3);
    doc.rect(x, y, media, ALTO_FIRMAS);
    /* La cinta de la marca encima de cada firma: es lo que el ojo busca
       para saber dónde se firma. */
    cinta(x, y, media, 1.4);
    fuente("bold", 8); gris();
    doc.text(rotulo, x + 4, y + 6);
    fuente("normal", 9); tinta();
    doc.text("Nombre:", x + 4, y + 12);
    if (nombre) { fuente("bold", 9.5); doc.text(nombre.slice(0, 40), x + 19, y + 12) }
    else { doc.setDrawColor(150, 160, 172); doc.line(x + 19, y + 12.5, x + media - 4, y + 12.5) }
    /* El espacio de la firma es el más grande del recuadro: se firma a
       mano o con el dedo en el teléfono, y los dos necesitan sitio. */
    doc.setDrawColor(150, 160, 172);
    doc.setLineWidth(0.25);
    doc.line(x + 4, y + 29, x + media - 4, y + 29);
    /* LA FIRMA DIBUJADA, SOBRE LA RAYA. Se ajusta al hueco —14 mm de alto
       y el ancho del recuadro— sin estirarla: una firma deformada no se
       reconoce. Si no carga, queda la raya para firmar a mano. */
    let firmada = false;
    if (dibujada) {
      try {
        const pr = doc.getImageProperties(dibujada);
        const altoMax = 14, anchoMax = media - 8;
        const k = Math.min(anchoMax / pr.width, altoMax / pr.height);
        const w = pr.width * k, h = pr.height * k;
        doc.addImage(dibujada, "PNG", x + 4, y + 28.6 - h, w, h, undefined, "FAST");
        firmada = true;
      } catch { /* sin la imagen, se firma a mano */ }
    }
    fuente("normal", 8); gris();
    doc.text(firmada ? "Firma (digital, en CONTROL)" : "Firma", x + 4, y + 33);
    /* LA FECHA Y HORA DE LA FIRMA DIGITAL es la de generar la hoja: es el
       momento en que se firmó. A mano, se deja el espacio. */
    doc.text(firmada
      ? `Fecha y hora: ${datos.generado.toLocaleDateString("es-CO")} ` +
        datos.generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
      : "Fecha y hora: ____ / ____ / ______   ____:____", x + 4, y + 37.5);
  };
  firma(M, "ELABORÓ", datos.elaboro.trim(), datos.firmaElaboro);
  firma(M + media + 8, "REVISÓ Y APRUEBA — SUPERVISOR", datos.supervisor.trim());
  y += ALTO_FIRMAS;

  /* ---------------- PIE DE CADA PÁGINA ----------------
     «Página 2 de 3» y el día en todas. Un papel suelto de la segunda
     hoja, sin eso, no se sabe de qué día es ni si falta otra. */
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    cinta(M, PIE - 4.2, ANCHO, 0.6);
    fuente("normal", 7.5); gris();
    doc.text(`Rotura en línea · ${hoja.fecha}`, M, PIE);
    /* «Abajo solo deja Bavaria.» El centro de distribución ya lo dice la
       cabecera de la primera hoja. */
    doc.text("Bavaria", W / 2, PIE, { align: "center" });
    doc.text(`Página ${i} de ${n}`, W - M, PIE, { align: "right" });
  }
  return doc;
}
