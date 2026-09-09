/**
 * EL LIBRO DE EXCEL — se RELLENA TU PLANTILLA, no se dibuja de cero.
 * ------------------------------------------------------------------
 * public/plantillas/sider.xlsx es el archivo que armaste tú en Excel.
 * Esta ruta lo abre, le mete los datos del mes y lo devuelve. El diseño
 * —colores, anchos, fórmulas del Panel, el logo, la portada— vive en ESE
 * archivo, no aquí. Si quieres cambiar cómo se ve el export, abres la
 * plantilla en Excel, la cambias y la vuelves a guardar en su sitio: no
 * hay que tocar código ni volver a desplegar.
 *
 * Mismo principio que el logo: lo que es diseño se edita donde se edita
 * el diseño.
 *
 * LO ÚNICO QUE ESTE ARCHIVO DA POR SENTADO de la plantilla:
 *   · las seis hojas y sus nombres  (ver HOJAS)
 *   · que cada tabla tiene su encabezado en la fila 6 y los datos abajo
 *   · el orden de las columnas de cada tabla
 * Si mueves un encabezado de fila en Excel, cambia el número en TABLA.
 *
 * POR QUÉ SE REPARA EL ZIP AL FINAL (remendarNombres)
 * exceljs reescribe todo el paquete, y al hacerlo pierde el ámbito de los
 * nombres definidos: los tres _FilterDatabase (uno por hoja con filtro)
 * se le funden en uno solo sin hoja, que es justo lo que hace que Excel
 * diga "encontramos un problema con parte del contenido". Se comprobó
 * descomprimiendo el archivo de ida y el de vuelta y comparándolos. Se
 * arregla reescribiendo ese pedazo del XML, que es de lo único que
 * exceljs no se puede fiar.
 *
 * Cómo bajar una foto entra POR PARÁMETRO (bajarFoto). La ruta le pasa
 * el storage de Supabase; la prueba le pasa archivos del disco. El libro
 * no sabe de dónde vienen y no tiene por qué saberlo.
 */

import path from "node:path";
import ExcelJS from "exceljs";
import { unzipSync, zipSync } from "fflate";
import { MESES_LARGO, type Viaje, type FilaSeguimiento } from "./comun";

const PLANTILLA = () =>
  path.join(process.cwd(), "public", "plantillas", "sider.xlsx");

const HOJAS = {
  portada: "Portada",
  base: "Base de datos",
  panel: "Panel",
  evidencia: "Evidencia",
  datos: "_datos",
  fotos: "Fotos",
} as const;

/** Dónde arranca cada tabla en la plantilla y cuántas filas de muestra trae. */
const TABLA = {
  base: { hdr: 6, muestra: 2, cols: 22 },
  evidencia: { hdr: 6, muestra: 4, cols: 10 },
  fotos: { hdr: 6, muestra: 4, cols: 11 },
} as const;

/* El Panel y _datos vienen con 400 filas de fórmula que se rellenan
   solas o se quedan en blanco: así los armaste, y así se quedan. Solo
   crecen si un mes trae más puntas que eso. Bajarlas no serviría de
   nada y sí costaría: son las mismas 400 fórmulas de tu archivo. */
const CAPACIDAD = 400;
/** Filas de ejemplo con datos que trae _datos (las otras 396 van vacías). */
const MUESTRA_DATOS = 4;
/** La primera fila de resultados del Panel. */
const PANEL_HDR = 13;

/* Un techo a las fotos que se incrustan. Sin esto, exportar un año
   entero arma un archivo de cientos de megas que no abre en ninguna
   parte — y el que lo pidió no se enteraría hasta que falle. */
export const MAX_FOTOS = 180;
const MAX_BYTES_FOTO = 4 * 1024 * 1024;

const ORDEN_RANURA = ["costado_izq", "costado_der", "placa"] as const;
/** Columna de la hoja Fotos donde va cada ranura: E, F, G. */
const COL_RANURA: Record<string, number> = {
  costado_izq: 5,
  costado_der: 6,
  placa: 7,
};

/* La foto ocupa la celda entera, con el mismo margen que pusiste tú en
   la plantilla. En EMU, que es como Excel guarda las medidas. */
const FOTO = { margen: 19080, ancho: 2114280, alto: 1533240 };

/* exceljs trae su propia declaración de Buffer, más vieja que la de
   @types/node 22 —le faltan resizable, detached y compañía—, así que los
   dos tipos no se reconocen entre sí aunque en tiempo de ejecución sean
   el mismo objeto. Se convierte en UN solo sitio, con el motivo escrito,
   en vez de repartir "any" por el archivo. */
type BufferDeExcel = Parameters<ExcelJS.Workbook["addImage"]>[0]["buffer"];
const paraExcel = (b: Buffer) => b as unknown as BufferDeExcel;

export type FilaFoto = {
  certificacion_id: string;
  ranura: (typeof ORDEN_RANURA)[number];
  ruta: string;
};
export type FilaCert = {
  id: string; viaje_id: string; punta: "salida" | "llegada";
  lat: number; lng: number; precision_m: number | null;
  direccion: string | null; nota: string | null;
  hecha_por: string | null; hecha_en: string;
};

export type Insumos = {
  titulo: string;
  quien: string;
  viajes: Viaje[];
  seg: FilaSeguimiento[];
  certs: FilaCert[];
  fotos: FilaFoto[];
  nombres: Record<string, string>;
  /** null si no se pudo: el libro sigue, esa foto queda contada aparte. */
  bajarFoto: ((ruta: string) => Promise<Buffer | null>) | null;
};

/* ==================== Utilidades de hoja ==================== */

/**
 * Deja la tabla con exactamente `n` filas de datos, clonando o quitando
 * a partir de la primera. Clonar copia el estilo de la fila modelo, que
 * es de donde salen los bordes, los formatos de número y el rayado.
 * Devuelve la última fila de datos.
 */
function ajustar(h: ExcelJS.Worksheet, primera: number, muestra: number, n: number): number {
  const quiero = Math.max(n, 1); // nunca cero: los rangos con filtro y
                                 // formato condicional dejan de ser válidos
  if (quiero > muestra) h.duplicateRow(primera, quiero - muestra, true);
  else if (quiero < muestra) quitarFilas(h, primera + quiero, muestra - quiero);
  return primera + quiero - 1;
}

/**
 * Borrar filas, de una en una.
 *
 * spliceRows de exceljs se equivoca cuando se le piden más filas de las
 * que quedan por debajo: solo limpia desde start+count en adelante, así
 * que al quitar 3 de 4 no quita ninguna. Se vio exportando un mes sin
 * viajes: la hoja Evidencia salía con las cuatro filas de ejemplo de la
 * plantilla. De una en una siempre entra por el camino bueno, y son tres
 * o cuatro vueltas, no cuatrocientas.
 */
function quitarFilas(h: ExcelJS.Worksheet, desde: number, cuantas: number) {
  for (let i = 0; i < cuantas; i++) h.spliceRows(desde, 1);
}

/** Vacía una fila sin tocarle el estilo (para cuando no hay datos). */
function vaciar(h: ExcelJS.Worksheet, fila: number, cols: number) {
  for (let c = 1; c <= cols; c++) h.getRow(fila).getCell(c).value = null;
}

/** Mueve el rango de un formato condicional al alto real de la tabla. */
function estirarCondicional(h: ExcelJS.Worksheet, hasta: number) {
  type ConRef = { ref: string };
  const cfs = (h as unknown as { conditionalFormattings?: ConRef[] }).conditionalFormattings;
  for (const cf of cfs ?? []) {
    cf.ref = cf.ref.replace(/([A-Z]+)(\d+):([A-Z]+)\d+/, `$1$2:$3${hasta}`);
  }
}

/** Filtro, área de impresión y formato condicional, todos al mismo alto. */
function cerrarTabla(h: ExcelJS.Worksheet, hdr: number, ultimaCol: string, fin: number) {
  h.autoFilter = `A${hdr}:${ultimaCol}${fin}`;
  h.pageSetup = { ...h.pageSetup, printArea: `A1:${ultimaCol}${fin}`, printTitlesRow: `${hdr}:${hdr}` };
  estirarCondicional(h, fin);
}

/**
 * Cambiar el formato de número de UNA celda.
 *
 * No se usa cel.numFmt = "..." a propósito: exceljs comparte un mismo
 * objeto de estilo entre todas las celdas que en la plantilla tienen el
 * mismo formato, y asignar la propiedad lo MUTA para todas. Se vio con
 * el resumen de la portada: poner "#,##0.0" en HL EER Recibido y "0.0%"
 * en % Certificación dejaba las dos en porcentaje, y 246.267,9 HL salía
 * impreso como 24626785,4 %. Con un objeto nuevo cada celda va por su
 * cuenta.
 */
function formato(cel: ExcelJS.Cell, numFmt: string) {
  cel.style = { ...cel.style, numFmt };
}

const ROJO = "FFE4002B";
/** Marca en rojo lo que alguien tiene que ir a mirar. */
function alerta(cel: ExcelJS.Cell) {
  cel.style = { ...cel.style, font: { ...cel.style.font, bold: true, color: { argb: ROJO } } };
}

/** Una precisión de cientos de metros no es evidencia de nada. */
const GPS_DUDOSO = 200;

const enlaceMapa = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

/* ==================== El libro ==================== */

export async function armarLibro(d: Insumos): Promise<{ archivo: Buffer; recortadas: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PLANTILLA());
  wb.creator = "CONTROL · Sider Certificado";
  wb.modified = new Date();

  /* Las fotos de muestra que trae la plantilla se van: son 1,6 MB de
     camiones de agosto que no pintan nada en el archivo de nadie. El
     logo (imagen 0) se queda: es el que usan las seis hojas. */
  const media = (wb as unknown as { media: unknown[] }).media;
  const logo = media[0];
  media.length = 0;
  if (logo) media.push(logo);
  for (const h of wb.worksheets) {
    const suyas = (h as unknown as { _media: { type: string; imageId: number }[] })._media;
    if (suyas) {
      const soloLogo = suyas.filter((m) => m.type !== "image" || m.imageId === 0);
      suyas.length = 0;
      suyas.push(...soloLogo);
    }
  }

  const porViaje = new Map(d.viajes.map((v) => [v.id, v]));
  const orden = { salida: 0, llegada: 1 };
  /* Un renglón por PUNTA certificada, ordenado por placa y con la salida
     antes que la llegada: así se lee la historia de cada vehículo
     seguida, que es como la busca el que revisa. */
  const puntas = d.certs
    .filter((c) => porViaje.has(c.viaje_id))
    .sort((a, b) => {
      const pa = porViaje.get(a.viaje_id)!.placa;
      const pb = porViaje.get(b.viaje_id)!.placa;
      return pa === pb ? orden[a.punta] - orden[b.punta] : pa.localeCompare(pb);
    });

  const finBase = hojaBase(wb, d.viajes, d.nombres, d.titulo);
  hojaEvidencia(wb, porViaje, puntas, d.nombres, d.titulo);
  const altoDatos = hojaDatos(wb, porViaje, puntas, d.nombres);
  const placas = new Set(puntas.map((c) => porViaje.get(c.viaje_id)!.placa)).size;
  hojaPanel(wb, puntas.length, altoDatos, placas, d.titulo);
  const recortadas = await hojaFotos(wb, porViaje, puntas, d.fotos, d.nombres, d.bajarFoto);
  portada(wb, d, finBase);

  const crudo = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return { archivo: remendarNombres(crudo, wb), recortadas };
}

/* ==================== Portada ==================== */
function portada(wb: ExcelJS.Workbook, d: Insumos, finBase: number) {
  const h = wb.getWorksheet(HOJAS.portada);
  if (!h) return;

  h.getCell("D4").value = `${d.titulo}   ·   CD38 · Ag01 Barranquilla`;

  /* Fórmulas y no números: quien abra esto puede corregir una fila de la
     base y ver moverse el resumen. Un número pegado no se mueve, y es
     justo lo que hace que una hoja deje de cuadrar con su propia base. */
  const base = `'${HOJAS.base}'`;
  h.getCell("B9").value = { formula: `COUNTA(${base}!$A$7:$A$${finBase})` };
  h.getCell("D9").value = { formula: `SUM(${base}!$K$7:$K$${finBase})` };
  h.getCell("F9").value = { formula: `SUM(${base}!$H$7:$H$${finBase})` };

  /* El seguimiento no tiene hoja propia en tu plantilla: sus tres cifras
     viven aquí. Sin ZLDE cargado quedan en el guion que ya trae. */
  const dentro = d.seg.filter((f) => f.aplica_sider && !f.fuera_del_maestro);
  const recibido = dentro.reduce((a, f) => a + Number(f.hl_recibido), 0);
  const real = dentro.reduce((a, f) => a + Number(f.real_mtd), 0);
  const meta = d.seg[0]?.meta ?? 0.1;
  if (recibido > 0) {
    h.getCell("B13").value = recibido;
    formato(h.getCell("B13"), "#,##0.0");
    h.getCell("D13").value = real / recibido;
    formato(h.getCell("D13"), "0.0%");
  }
  h.getCell("F13").value = meta;

  /* Los enlaces del índice: en la plantilla apuntaban al propio archivo
     por su nombre viejo, que es un enlace roto en cuanto el archivo se
     llama distinto. HYPERLINK("#Hoja!A1") salta dentro del libro y
     sigue funcionando se llame como se llame. */
  const salto = (cel: string, hoja: string) => {
    const c = h.getCell(cel);
    c.value = { formula: `HYPERLINK("#'${hoja}'!A1","${hoja}")` };
  };
  salto("B17", HOJAS.panel);
  salto("B18", HOJAS.base);
  salto("B19", HOJAS.evidencia);
  salto("B20", HOJAS.fotos);

  h.getCell("B22").value =
    `Generado el ${new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}` +
    ` por ${d.quien} · CONTROL · CD38 Ag01 Barranquilla`;
}

/* ==================== La base de datos ==================== */
function hojaBase(
  wb: ExcelJS.Workbook, viajes: Viaje[], nombres: Record<string, string>, titulo: string
): number {
  const h = wb.getWorksheet(HOJAS.base);
  if (!h) return 7;
  const { hdr, muestra, cols } = TABLA.base;

  h.getCell("B3").value =
    `Un renglón por viaje  ·  ${titulo}  ·  encabezado gris = columna calculada`;

  /* La fila de Total viaja pegada al final de los datos, así que se
     apunta ANTES de mover nada y se vuelve a escribir después. */
  const fin = ajustar(h, hdr + 1, muestra, viajes.length);
  const total = fin + 1;

  viajes.forEach((v, i) => {
    const f = h.getRow(hdr + 1 + i);
    const val = [
      v.placa, v.cd_origen, v.cd_destino, v.descripcion, v.sku, v.tipo_envase ?? "",
      Number(v.estibas), Number(v.sider),
      v.cajas == null ? null : Number(v.cajas),
      v.unidades == null ? null : Number(v.unidades),
      v.hl == null ? null : Number(v.hl),
      new Date(v.fecha), MESES_LARGO[v.num_mes - 1], v.semana, v.anio,
      v.estado === "en_transito" ? "en tránsito" : v.estado,
      v.salida_en ? new Date(v.salida_en) : null, `${v.fotos_salida}/3`,
      v.llegada_en ? new Date(v.llegada_en) : null, `${v.fotos_llegada}/3`,
      v.creado_por ? nombres[v.creado_por] ?? "—" : "—",
      v.observacion ?? "",
    ];
    val.forEach((x, c) => { f.getCell(c + 1).value = x as ExcelJS.CellValue; });
    /* Una punta sin sus tres fotos se marca: es lo primero que alguien
       busca cuando revisa un mes. */
    if (v.fotos_salida < 3) alerta(f.getCell(18));
    if (v.estado === "recibido" && v.fotos_llegada < 3) alerta(f.getCell(20));
  });
  if (!viajes.length) vaciar(h, hdr + 1, cols);

  const t = h.getRow(total);
  t.getCell(1).value = "Total";
  for (const c of [7, 8, 9, 10, 11]) {
    const L = String.fromCharCode(64 + c);
    t.getCell(c).value = { formula: `SUM(${L}${hdr + 1}:${L}${fin})` };
  }

  cerrarTabla(h, hdr, "V", fin);
  /* El área de impresión sí llega hasta el total: es la fila que la
     gente busca cuando imprime. El filtro no, porque un total dentro de
     un autofiltro se ordena con los datos y se pierde. */
  h.pageSetup = { ...h.pageSetup, printArea: `A1:V${total}` };
  return fin;
}

/* ==================== La evidencia en texto ==================== */
function hojaEvidencia(
  wb: ExcelJS.Workbook, porViaje: Map<string, Viaje>, puntas: FilaCert[],
  nombres: Record<string, string>, titulo: string
) {
  const h = wb.getWorksheet(HOJAS.evidencia);
  if (!h) return;
  const { hdr, muestra, cols } = TABLA.evidencia;

  h.getCell("B3").value = `Salida y llegada de cada punta con GPS  ·  ${titulo}`;
  const fin = ajustar(h, hdr + 1, muestra, puntas.length);

  puntas.forEach((c, i) => {
    const f = h.getRow(hdr + 1 + i);
    const val = [
      porViaje.get(c.viaje_id)!.placa,
      c.punta === "salida" ? "Salida" : "Llegada",
      new Date(c.hecha_en),
      c.direccion ?? "",
      Number(c.lat), Number(c.lng),
      c.precision_m == null ? null : Number(c.precision_m),
      c.hecha_por ? nombres[c.hecha_por] ?? "—" : "—",
      c.nota ?? "",
      { text: "abrir mapa", hyperlink: enlaceMapa(Number(c.lat), Number(c.lng)) },
    ];
    val.forEach((x, k) => { f.getCell(k + 1).value = x as ExcelJS.CellValue; });
    if (c.precision_m != null && Number(c.precision_m) > GPS_DUDOSO) alerta(f.getCell(7));
  });
  if (!puntas.length) vaciar(h, hdr + 1, cols);

  cerrarTabla(h, hdr, "J", fin);
}

/* ==================== La hoja escondida que alimenta el Panel ==================== */
/** Devuelve cuántas filas quedó midiendo la tabla (sin contar el encabezado). */
function hojaDatos(
  wb: ExcelJS.Workbook, porViaje: Map<string, Viaje>, puntas: FilaCert[],
  nombres: Record<string, string>
): number {
  const h = wb.getWorksheet(HOJAS.datos);
  if (!h) return CAPACIDAD;
  const alto = Math.max(CAPACIDAD, puntas.length);
  if (alto > CAPACIDAD) h.duplicateRow(2, alto - CAPACIDAD, true);
  const fin = 1 + alto;

  /* Se limpia lo que traía de ejemplo antes de escribir. Si no, un mes
     con dos puntas sale con las cuatro placas de agosto debajo. */
  for (let r = 2; r <= Math.max(1 + MUESTRA_DATOS, fin); r++) {
    for (const c of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14]) {
      h.getRow(r).getCell(c).value = null;
    }
  }

  puntas.forEach((c, i) => {
    const v = porViaje.get(c.viaje_id)!;
    const f = h.getRow(2 + i);
    const val = [
      v.placa,
      c.punta === "salida" ? "Salida" : "Llegada",
      new Date(c.hecha_en),
      v.cd_origen, v.descripcion,
      v.hl == null ? null : Number(v.hl),
      c.direccion ?? "",
      c.precision_m == null ? null : Number(c.precision_m),
      c.hecha_por ? nombres[c.hecha_por] ?? "—" : "—",
      enlaceMapa(Number(c.lat), Number(c.lng)),
    ];
    val.forEach((x, k) => { f.getCell(k + 1).value = x as ExcelJS.CellValue; });
  });

  /* La columna K numera SOLO las filas que pasan los cuatro filtros del
     Panel. El Panel después busca el 1, el 2, el 3... y por eso su tabla
     sale seguida en vez de con huecos. Es tu fórmula, con el rango
     ajustado al alto real. */
  for (let r = 2; r <= fin; r++) {
    h.getCell(r, 11).value = {
      formula:
        `IF($A${r}="","",IF((IF(Panel!$B$8="TODAS",1,--($A${r}=Panel!$B$8)))` +
        `*(IF(Panel!$C$8="TODAS",1,--($B${r}=Panel!$C$8)))` +
        `*(IF(Panel!$D$8="",1,--($C${r}>=Panel!$D$8)))` +
        `*(IF(Panel!$E$8="",1,--($C${r}<Panel!$E$8+1)))=1,MAX($K$1:K${r - 1})+1,""))`,
    };
  }

  /* Las listas de los menús desplegables del Panel. */
  const placas = [...new Set(puntas.map((c) => porViaje.get(c.viaje_id)!.placa))].sort();
  const listaM = ["TODAS", ...placas];
  const listaN = ["TODAS", "Salida", "Llegada"];
  listaM.forEach((x, i) => { h.getCell(2 + i, 13).value = x; });
  listaN.forEach((x, i) => { h.getCell(2 + i, 14).value = x; });
  return alto;
}

/* ==================== El panel de consulta ==================== */
function hojaPanel(
  wb: ExcelJS.Workbook, n: number, altoDatos: number, placas: number, titulo: string
) {
  const h = wb.getWorksheet(HOJAS.panel);
  if (!h) return;
  const hdr = PANEL_HDR;

  h.getCell("B3").value = `Elige placa, punta y fechas · la tabla se arma sola · ${titulo}`;
  h.getCell("B8").value = "TODAS";
  h.getCell("C8").value = "TODAS";
  h.getCell("D8").value = null;
  h.getCell("E8").value = null;

  if (altoDatos > CAPACIDAD) h.duplicateRow(hdr + 1, altoDatos - CAPACIDAD, true);
  const fin = hdr + altoDatos;      // última fila de resultados
  const fdat = 1 + altoDatos;       // última fila de _datos

  /* Cada fila del resultado busca su propio número de orden en _datos!K.
     Es tu fórmula; lo único que cambia es hasta dónde llega el rango. */
  const cols = "ABCDEFGHIJ"; // _datos: A placa … J mapa
  for (let r = hdr + 1; r <= fin; r++) {
    for (let c = 2; c <= 11; c++) {
      const L = cols[c - 2];
      const busca = `MATCH(ROW()-${hdr},_datos!$K$2:$K$${fdat},0)`;
      h.getCell(r, c).value = {
        formula:
          c === 11
            ? `IFERROR(HYPERLINK(INDEX(_datos!$J$2:$J$${fdat},${busca}),"abrir mapa"),"")`
            : `IFERROR(INDEX(_datos!$${L}$2:$${L}$${fdat},${busca}),"")`,
      };
    }
  }

  h.getCell("B11").value = { formula: `COUNT(_datos!$K$2:$K$${fdat})` };
  h.getCell("D11").value = {
    formula: `COUNTIFS(_datos!$K$2:$K$${fdat},">0",_datos!$B$2:$B$${fdat},"Salida")`,
  };
  h.getCell("F11").value = {
    formula: `COUNTIFS(_datos!$K$2:$K$${fdat},">0",_datos!$B$2:$B$${fdat},"Llegada")`,
  };
  h.getCell("H11").value = {
    formula:
      `SUMPRODUCT(($B$${hdr + 1}:$B$${fin}<>"")/COUNTIF($B$${hdr + 1}:$B$${fin},$B$${hdr + 1}:$B$${fin}&""))`,
  };
  h.getCell("J11").value = {
    formula: `IF(COUNT($D$${hdr + 1}:$D$${fin})=0,"—",MAX($D$${hdr + 1}:$D$${fin}))`,
  };

  estirarCondicional(h, fin);
  /* Se imprime hasta donde PUEDE haber algo, no hasta donde llega la
     fórmula: el bloque son 400 filas y el filtro nunca devuelve más de
     las que hay. Con el área en 413 el Panel salían dieciséis páginas,
     quince de ellas en blanco. */
  h.pageSetup = { ...h.pageSetup, printArea: `A1:K${hdr + Math.max(n, 1)}` };

  /* Los desplegables. Van reescritos enteros porque exceljs no sabe leer
     la validación de fecha que traía la plantilla —DATE(2020,1,1) le
     sale NaN— y un NaN ahí es lo que hace que Excel pida reparar el
     archivo. Se comprobó comparando el XML de ida con el de vuelta. */
  const dv = (h as unknown as { dataValidations: { model: Record<string, unknown> } }).dataValidations as {
    model: Record<string, unknown>;
    add: (rango: string, v: Record<string, unknown>) => void;
  };
  /* Se borran las que traía y se vuelven a poner: si solo se añade, la
     de fecha rota se queda al lado de la buena y Excel se encuentra dos
     reglas para la misma celda. */
  for (const k of Object.keys(dv.model)) delete dv.model[k];
  dv.add("B8", {
    type: "list", allowBlank: false, formulae: [`_datos!$M$2:$M$${2 + placas}`],
    showErrorMessage: true, errorStyle: "warning",
    errorTitle: "Placa", error: "Elige una de la lista o escribe TODAS.",
  });
  dv.add("C8", {
    type: "list", allowBlank: false, formulae: ["_datos!$N$2:$N$4"],
    showErrorMessage: true, errorStyle: "warning",
    errorTitle: "Punta", error: "Salida, Llegada o TODAS.",
  });
  for (const cel of ["D8", "E8"]) {
    dv.add(cel, {
      type: "date", allowBlank: true, operator: "between",
      formulae: [new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2035, 11, 31))],
      showInputMessage: true, prompt: "Escribe una fecha dd/mm/aaaa o deja vacío",
    });
  }
}

/* ==================== Las fotos, incrustadas ==================== */
async function hojaFotos(
  wb: ExcelJS.Workbook, porViaje: Map<string, Viaje>, puntas: FilaCert[],
  fotos: FilaFoto[], nombres: Record<string, string>,
  bajarFoto: ((ruta: string) => Promise<Buffer | null>) | null
): Promise<number> {
  const h = wb.getWorksheet(HOJAS.fotos);
  if (!h) return 0;
  const { hdr, muestra, cols } = TABLA.fotos;

  const fin = ajustar(h, hdr + 1, muestra, puntas.length);

  puntas.forEach((c, i) => {
    const v = porViaje.get(c.viaje_id)!;
    const f = h.getRow(hdr + 1 + i);
    f.getCell(1).value = v.placa;
    f.getCell(2).value = c.punta === "salida" ? "Salida" : "Llegada";
    f.getCell(3).value = new Date(c.hecha_en);
    f.getCell(4).value = v.cd_origen;
    for (const k of [5, 6, 7]) f.getCell(k).value = null; // ahí van las fotos
    f.getCell(8).value = c.direccion ?? "";
    f.getCell(9).value = c.precision_m == null ? null : Number(c.precision_m);
    if (c.precision_m != null && Number(c.precision_m) > GPS_DUDOSO) alerta(f.getCell(9));
    f.getCell(10).value = c.hecha_por ? nombres[c.hecha_por] ?? "—" : "—";
    f.getCell(11).value = {
      text: "abrir mapa", hyperlink: enlaceMapa(Number(c.lat), Number(c.lng)),
    };
  });
  if (!puntas.length) vaciar(h, hdr + 1, cols);

  let puestas = 0;
  let recortadas = 0;
  if (bajarFoto) {
    const porCert = new Map<string, FilaFoto[]>();
    for (const f of fotos) {
      const l = porCert.get(f.certificacion_id) ?? [];
      l.push(f);
      porCert.set(f.certificacion_id, l);
    }
    for (let i = 0; i < puntas.length; i++) {
      const fila = hdr + 1 + i;
      for (const f of porCert.get(puntas[i].id) ?? []) {
        const col = COL_RANURA[f.ranura];
        if (!col) continue;
        if (puestas >= MAX_FOTOS) { recortadas++; continue; }
        try {
          const buf = await bajarFoto(f.ruta);
          if (!buf || buf.byteLength > MAX_BYTES_FOTO) { recortadas++; continue; }
          const id = wb.addImage({ buffer: paraExcel(buf), extension: "jpeg" });
          /* Anclada a la celda por las cuatro esquinas, con el mismo
             margen de tu plantilla: así la foto se mueve, se ordena y se
             filtra CON su fila en vez de quedarse flotando encima. */
          h.addImage(id, {
            tl: {
              nativeCol: col - 1, nativeColOff: FOTO.margen,
              nativeRow: fila - 1, nativeRowOff: FOTO.margen,
            },
            br: {
              nativeCol: col - 1, nativeColOff: FOTO.ancho,
              nativeRow: fila - 1, nativeRowOff: FOTO.alto,
            },
            editAs: "oneCell",
          } as unknown as ExcelJS.ImageRange & { editAs?: string });
          puestas++;
        } catch {
          recortadas++;
        }
      }
    }
  }

  h.getCell("B3").value =
    puestas === 0
      ? "Ninguna de estas puntas tiene fotos guardadas todavía."
      : recortadas > 0
        ? `Se incrustaron ${puestas} fotos y quedaron ${recortadas} por fuera: el techo es ` +
          `${MAX_FOTOS} por archivo, para que el .xlsx siga abriéndose. Exporta por mes para verlas todas.`
        : "Tres fotos por punta, selladas con placa, fecha, hora y GPS  ·  " +
          "usa las flechas del encabezado para filtrar.";

  cerrarTabla(h, hdr, "K", fin);
  return recortadas;
}

/* ==================== El remiendo del zip ==================== */
/**
 * Devuelve los nombres definidos correctos y se los pone al archivo.
 *
 * Un .xlsx es un zip. Los nombres definidos viven en xl/workbook.xml, y
 * son los que le dicen a Excel qué rango tiene filtro en cada hoja
 * (_FilterDatabase, uno POR HOJA) y qué se imprime. exceljs los escribe
 * sin el ámbito de hoja, y un _FilterDatabase suelto es un archivo que
 * Excel abre pidiendo repararlo.
 *
 * Se toca ese pedazo y nada más: el resto del paquete —estilos, imágenes,
 * fórmulas, formato condicional— sale de exceljs tal cual, que sí lo
 * conserva; se comprobó descomprimiendo los dos archivos y comparándolos
 * parte por parte.
 */
function remendarNombres(zip: Buffer, wb: ExcelJS.Workbook): Buffer {
  try {
    const partes = unzipSync(new Uint8Array(zip));
    const dec = new TextDecoder();
    const enc = new TextEncoder();
    let xml = dec.decode(partes["xl/workbook.xml"]);

    const idx = (nombre: string) => wb.worksheets.findIndex((h) => h.name === nombre);
    const ref = (hoja: string, r: string) =>
      hoja.includes(" ") ? `'${hoja}'!${r}` : `${hoja}!${r}`;

    const trozos: string[] = [];
    for (const [hoja, col] of [
      [HOJAS.base, "V"], [HOJAS.evidencia, "J"], [HOJAS.fotos, "K"],
    ] as const) {
      const h = wb.getWorksheet(hoja);
      const i = idx(hoja);
      if (!h || i < 0 || typeof h.autoFilter !== "string") continue;
      const fin = h.autoFilter.split(":")[1]?.replace(/[A-Z]/g, "");
      trozos.push(
        `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">` +
        `${ref(hoja, `$A$6:$${col}$${fin}`)}</definedName>`
      );
      trozos.push(
        `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${ref(hoja, "$6:$6")}</definedName>`
      );
    }
    for (const h of wb.worksheets) {
      const area = h.pageSetup?.printArea;
      const i = idx(h.name);
      if (!area || i < 0) continue;
      const [a, b] = area.split(":");
      const fijo = `$${a.replace(/([A-Z]+)(\d+)/, "$1$$$2")}:$${b.replace(/([A-Z]+)(\d+)/, "$1$$$2")}`;
      trozos.push(
        `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${ref(h.name, fijo)}</definedName>`
      );
    }

    const bloque = `<definedNames>${trozos.join("")}</definedNames>`;
    xml = xml.includes("<definedNames>")
      ? xml.replace(/<definedNames>[\s\S]*?<\/definedNames>/, bloque)
      : xml.replace("<calcPr", `${bloque}<calcPr`);

    partes["xl/workbook.xml"] = enc.encode(xml);
    return Buffer.from(zipSync(partes, { level: 6 }));
  } catch {
    /* Si el remiendo falla, sale el archivo de exceljs sin tocar: peor
       es no exportar nada. */
    return zip;
  }
}
