/**
 * EL RECORRIDO DE LAS UNIDADES — la geometría del diagrama de flujo.
 *
 * «De qué causa salió · por dónde pasó · en qué termina.»
 *
 * ES UNA FUNCIÓN PURA Y NO DIBUJO SUELTO EN LA PANTALLA, por una razón
 * concreta: un Sankey mal armado NO SE VE MAL. Se ve perfecto y miente
 * —una cinta más gorda de lo que le toca, un nodo que no suma lo que
 * dice— y nadie lo nota, porque la única forma de comprobarlo es
 * rehacer la cuenta a mano. Aquí la cuenta se hace una vez, se prueba
 * sin navegador, y la pantalla solo pinta lo que salga.
 *
 * ---------------------------------------------------------------------
 * LAS TRES REGLAS QUE NO SE PUEDEN ROMPER
 * ---------------------------------------------------------------------
 *  1. El alto de un nodo es proporcional a su total. Siempre, en las
 *     tres columnas.
 *  2. Las cintas que salen de un nodo suman EXACTAMENTE su alto, y las
 *     que entran también. Si no, el dibujo dice que se perdieron
 *     unidades en el camino.
 *  3. Nada se sale del lienzo.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ NO SE USA UNA LIBRERÍA
 * ---------------------------------------------------------------------
 * `d3-sankey` hace esto y más —reordena nodos para cruzar menos
 * cintas—. Son 60 KB y un algoritmo que reordena: el día que una causa
 * cambie de sitio entre dos visitas sin que los datos hayan cambiado,
 * nadie va a saber si es el algoritmo o si de verdad cambió algo.
 * AQUÍ EL ORDEN ES EL DE LOS DATOS —de mayor a menor— y no se mueve.
 */

/**
 * LA PALETA DEL DIAGRAMA — los tonos de la maqueta, tal cual.
 *
 * SON FIJOS Y NO TOKENS DEL TEMA, y eso es lo que hace que funcionen:
 * `--rt-oro` es el acento de la app, y en el tema OFICIAL de Bavaria
 * ese acento ES EL ROJO. Con tokens, «asumida» y «no asumida» salían
 * exactamente del mismo color y el dibujo perdía lo único que venía a
 * decir. Se vio mirando la captura, no en el arnés.
 *
 * El oro y el rojo están a 203 de distancia en RGB: se distinguen de
 * lejos, con el monitor malo del muelle y en blanco y negro impreso.
 */
export const COLOR_ASUMIDA = "#FFC400";
export const COLOR_NO_ASUMIDA = "#E4002B";
/** El proceso que más pesa va en ocre; los demás, en gris. El proceso
 *  no es culpa de nadie —dice DÓNDE pasó, no de quién fue—, así que no
 *  puede competir de color con la causa, que sí lo dice. */
export const COLOR_PROCESO = "#B87F00";
export const COLOR_PROCESO_2 = "#8A8E8A";
/** Las dos bajas. Son cosas distintas y por eso son dos tonos. */
export const COLOR_VIDRIO = "#FFC400";
export const COLOR_LIQUIDO = "#B87F00";

export type Tramo = { de: string; a: string; valor: number };

export type NodoSankey = {
  id: string;
  /** La columna: 0 causa, 1 proceso, 2 destino. */
  col: number;
  rotulo: string;
  /** La línea chica de abajo. Puede faltar. */
  pie?: string;
  valor: number;
  color: string;
  x: number; y: number; alto: number;
};

export type CintaSankey = {
  de: string; a: string; valor: number;
  color: string;
  /** El `d` del `<path>`, ya listo. */
  d: string;
};

export type Sankey = {
  ancho: number; alto: number;
  nodos: NodoSankey[];
  cintas: CintaSankey[];
  /** Lo que no cupo: nodos que se agruparon en «otros». */
  agrupados: number;
};

export type Entrada = {
  /** Los nodos de cada columna, YA ORDENADOS como se quieren ver. */
  columnas: { id: string; rotulo: string; pie?: string; valor: number; color: string }[][];
  /** Los tramos entre columna 0→1 y 1→2. */
  tramos: Tramo[];
};

/* El grosor mínimo de cualquier cosa dibujada, nodo o cinta. */
const PISO = 1.5;
const ANCHO_NODO = 20;
/* EL ALTO DE UN RÓTULO: nombre (y+18), cifra (y+40) y pie (y+58), más
   unos píxeles de respiro. Es la medida que manda en el diagrama —el
   hueco entre nodos Y el margen de abajo— porque un rótulo montado
   sobre otro, o colgando fuera del lienzo, es lo que hace que el
   dibujo no se pueda leer aunque las cintas estén perfectas. */
const ALTO_ROTULO = 64;

/* EL HUECO ENTRE NODOS ES FIJO EN PÍXELES Y NO PROPORCIONAL. Con hueco
   proporcional, dos nodos chicos quedan pegados y se leen como uno.

   Y SON 62 px PORQUE ESE ES EL ALTO DEL RÓTULO: nombre, cifra y pie
   ocupan hasta la línea de base de y+58. Con el hueco de 14 que tenía,
   dos nodos chicos seguidos escribían uno encima del otro — se vio con
   «Líneas 30» montado sobre el borde de la caja. El hueco no es aire:
   es el sitio del texto. */
const HUECO = ALTO_ROTULO;

/**
 * Arma el diagrama.
 *
 * `alto` es el del lienzo. Los nodos se reparten el alto MENOS los
 * huecos, así que una columna con muchos nodos tiene barras más cortas
 * — que es correcto: el mismo total repartido en más pedazos.
 */
export function armarSankey(e: Entrada, ancho = 1160, alto = 500): Sankey {
  const cols = e.columnas.length;
  /* EL MARGEN DE ARRIBA deja sitio para el rótulo del primer nodo, que
     se dibuja A LA ALTURA de su borde superior. Sin él, el texto del
     nodo más alto sale cortado por el borde del SVG. */
  const ARRIBA = 30;
  /* Y ABAJO SE RESERVA EL ALTO DEL RÓTULO. El texto del último nodo de
     una columna se escribe hasta su y+58: si el lienzo termina en el
     borde de la barra, ese rótulo sale por fuera. Se vio con «Líneas
     30» colgando debajo de la caja. */
  const ABAJO = ALTO_ROTULO;
  const util = alto - ARRIBA - ABAJO;

  /* LA ESCALA SALE DE LA COLUMNA MÁS CARGADA, no de la primera: si una
     columna suma más que otra —pasa cuando un tramo se pierde— usar la
     primera dejaría la otra saliéndose por abajo. */
  let escala = Infinity;
  for (const col of e.columnas) {
    if (!col.length) continue;
    const suma = col.reduce((s, n) => s + n.valor, 0);
    if (suma <= 0) continue;
    const libre = util - HUECO * (col.length - 1);
    escala = Math.min(escala, libre / suma);
  }
  if (!isFinite(escala) || escala <= 0) escala = 0;

  const paso = cols > 1 ? (ancho - ANCHO_NODO) / (cols - 1) : 0;

  /* CUÁNTO MIDEN LAS CINTAS DE CADA NODO, ya con su piso puesto. Hace
     falta ANTES de repartir los altos, por la razón de abajo. */
  const grosor = (v: number) => Math.max(PISO, v * escala);
  const salen = new Map<string, number>();
  const entran = new Map<string, number>();
  for (const t of e.tramos) {
    if (t.valor <= 0) continue;
    salen.set(t.de, (salen.get(t.de) ?? 0) + grosor(t.valor));
    entran.set(t.a, (entran.get(t.a) ?? 0) + grosor(t.valor));
  }

  const nodos: NodoSankey[] = [];
  const porId = new Map<string, NodoSankey>();
  e.columnas.forEach((col, ci) => {
    let y = ARRIBA;
    for (const n of col) {
      /* UN MÍNIMO DE 1,5 px: un nodo de tres unidades al lado de uno de
         tres mil desaparece, y «no se ve» y «no existe» son dos cosas
         distintas que en un dibujo se ven igual.

         Y EL MÍNIMO DEL NODO ES LO QUE SUMAN SUS CINTAS, ya con el
         piso de ellas puesto. No basta con contarlas: una cinta de 11
         unidades que se agranda hasta el piso le roba medio píxel al
         nodo, y con dos así las cintas no caben dentro de él — el
         dibujo diría que de un nodo sale más de lo que entró. Lo
         destapó el arnés dos veces seguidas: primero «de líneas salen
         3,0 px y el nodo mide 2,4», y después «a líquido entran 52,4 y
         el nodo mide 51,8». */
      const cintasDe = Math.max(salen.get(n.id) ?? 0, entran.get(n.id) ?? 0, PISO);
      const h = Math.max(cintasDe, n.valor * escala);
      const nodo: NodoSankey = {
        id: n.id, col: ci, rotulo: n.rotulo, pie: n.pie, valor: n.valor,
        color: n.color, x: ci * paso, y, alto: h,
      };
      nodos.push(nodo);
      porId.set(n.id, nodo);
      y += h + HUECO;
    }
  });

  /* LAS CINTAS SE APILAN DENTRO DE SU NODO, en el mismo orden de los
     tramos. Dos contadores —cuánto se lleva usado de cada lado— es lo
     que garantiza la regla 2: lo que sale de un nodo suma su alto. */
  const usadoSale = new Map<string, number>();
  const usadoEntra = new Map<string, number>();
  const cintas: CintaSankey[] = [];

  for (const t of e.tramos) {
    const a = porId.get(t.de), b = porId.get(t.a);
    if (!a || !b || t.valor <= 0) continue;

    const h = grosor(t.valor);
    const y0 = a.y + (usadoSale.get(a.id) ?? 0);
    const y1 = b.y + (usadoEntra.get(b.id) ?? 0);
    usadoSale.set(a.id, (usadoSale.get(a.id) ?? 0) + h);
    usadoEntra.set(b.id, (usadoEntra.get(b.id) ?? 0) + h);

    const x0 = a.x + ANCHO_NODO;
    const x1 = b.x;
    const cx = (x0 + x1) / 2;

    cintas.push({
      de: t.de, a: t.a, valor: t.valor,
      /* LA CINTA SE PINTA DEL COLOR DE DONDE SALE, no de a dónde llega:
         la pregunta de esta pantalla es «de qué causa salió», y seguir
         un color desde la izquierda es como se lee. */
      color: a.color,
      d: `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1} ` +
         `L${x1},${y1 + h} C${cx},${y1 + h} ${cx},${y0 + h} ${x0},${y0 + h} Z`,
    });
  }

  return { ancho, alto, nodos, cintas, agrupados: 0 };
}

/**
 * DEJA LOS N MÁS GRANDES Y JUNTA EL RESTO EN «Otros».
 *
 * Un Sankey con catorce causas es catorce cintas de dos píxeles: se ve
 * lleno y no dice nada. Seis es lo que se lee de un vistazo.
 *
 * SE JUNTA, NO SE CORTA. Cortar la cola cambiaría el total del
 * diagrama y entonces el dibujo diría una cifra y el KPI otra.
 */
export function masGrandes<T extends { valor: number }>(
  filas: (T & { id: string })[], n: number,
): { filas: (T & { id: string })[]; juntados: number } {
  const orden = [...filas].sort((a, b) => b.valor - a.valor);
  if (orden.length <= n) return { filas: orden, juntados: 0 };
  const cabeza = orden.slice(0, n - 1);
  const cola = orden.slice(n - 1);
  const suma = cola.reduce((s, x) => s + x.valor, 0);
  return {
    filas: [...cabeza, { ...cola[0], id: "__otros", valor: suma }],
    juntados: cola.length,
  };
}
