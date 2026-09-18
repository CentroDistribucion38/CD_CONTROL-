/* =====================================================================
   IMPORTAR EL CORTE DE SAP — medido con Excel de verdad, no mirado.

   LA QUEJA QUE ORIGINA ESTO fue exacta: «la fecha se ve clarito, así que
   no me puedes decir que no encuentras la fecha». Y tenía razón — el
   lector tomaba la PRIMERA FILA como encabezado, y el corte de SAP trae
   encima el título del reporte y el centro. El encabezado de verdad
   quedaba como si fuera un dato y la pantalla pedía una columna que
   cualquiera estaba viendo.

   QUÉ SE COMPRUEBA, Y POR QUÉ CADA COSA:

   1. QUE EL ENCABEZADO SE ENCUENTRE AUNQUE NO SEA LA PRIMERA FILA. Es la
      queja, y es lo único que hace inservible la pantalla: el archivo
      correcto rechazado.

   2. QUE NO SE INVENTE UN ENCABEZADO CUANDO DE VERDAD FALTA. El arreglo
      de (1) es «busca en varias filas», y ese arreglo mal hecho encuentra
      cualquier cosa: una hoja sin fecha tiene que seguir diciendo que no
      tiene fecha, o se importarían números tomados de la columna de al
      lado sin que nada chille.

   3. QUE UNA COLUMNA NO SE ROBE LA DE OTRA. «Fecha de entrada» y «Hora
      de entrada» empiezan igual de parecido; si el alias corto «fecha»
      se queda con la hora, todo el corte cambia de día.

   4. QUE LA CANTIDAD NO SE ROMPA. «1.234,50» limpiado a manotazos daba
      «1.234.50», que no es un número. Y SAP escribe el menos DETRÁS:
      «36-». Una anulación leída como salida deja el documento sin dar
      cero, y ese documento aparece como que falta para siempre.

   5. QUE EL NÚMERO DE FILA QUE SE MUESTRA SEA EL DEL EXCEL. «Fila 8» que
      señala la 11 es peor que no decir nada: manda a alguien a mirar
      otra cosa y a concluir que la pantalla miente.

   6. QUE LA FILA EN BLANCO NO CUENTE COMO DESCARTE. Si contara, el
      «se descartaron 23» se llenaría de filas que nadie escribió y
      nadie volvería a mirar ese número.

   7. QUE LA PORTADA NO LE GANE A LA HOJA CON LOS DATOS.

   8. QUE LA REGLA DE AGRUPAR NO SE HAYA COLADO EN LA PANTALLA. Vive en
      la base a propósito: escrita dos veces, da dos respuestas.

   9. QUE LA RUTA SIGA SIENDO /traspasos/cruce. Los permisos están
      guardados como el texto de la ruta; renombrarla los borra en
      silencio.

   Las funciones NO se copian aquí: se sacan del componente. Copiarlas
   haría un arnés que aprueba una versión que ya no existe.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as XLSX from "xlsx";

const U = (p) => new URL(p, import.meta.url);
const tsx = readFileSync(U("../src/app/(app)/traspasos/cruce/Importar.tsx"), "utf8");
const reg = readFileSync(U("../src/modulos/registro.ts"), "utf8");
const ctl = readFileSync(U("../src/app/(app)/traspasos/control/page.tsx"), "utf8");
const dif = readFileSync(U("../src/app/(app)/traspasos/control/Diferencias.tsx"), "utf8");
const pag = readFileSync(U("../src/app/(app)/traspasos/cruce/page.tsx"), "utf8");
const dat = readFileSync(U("../src/modulos/traspasos/datos.ts"), "utf8");

/* ── EL LECTOR, SACADO DEL COMPONENTE ─────────────────────────────── */
const desde = tsx.indexOf("const pelar =");
const hasta = tsx.indexOf("export function Importar(");
if (desde < 0 || hasta < 0 || hasta < desde) {
  console.error("No se encontró el lector dentro de Importar.tsx.");
  process.exit(1);
}
/* Lo que ya viene con `export` se queda como está; lo demás —las piezas
   internas del lector— se saca con una lista al final. Exportarlo dos
   veces no compila, y exportar solo la lista dejaría fuera lo que el
   componente ya publica. */
const YA = new Set([...tsx.matchAll(/export function (\w+)/g)].map((m) => m[1]));
const PIDO = ["pelar", "COLUMNAS", "cabeceraDe", "aFecha", "aHora", "aNumero", "leerHoja", "puntaje", "escogerHoja"];
const sueltos = PIDO.filter((n) => !YA.has(n));
const trozo = tsx.slice(desde, hasta) + `\nexport { ${sueltos.join(", ")} };\n`;
const js = transformSync(trozo, { loader: "ts", format: "esm" }).code;
writeFileSync(U("./_lector-importar.mjs"), js);
const L = await import("./_lector-importar.mjs");

/* Se lee EXACTAMENTE con las mismas opciones que el componente: si el
   arnés leyera de otra forma, mediría un archivo que la pantalla nunca
   ve. Las opciones también se sacan del código, no se escriben aquí. */
const OPC = (() => {
  const m = tsx.match(/sheet_to_json<unknown\[\]>\(wb\.Sheets\[n\], \{([\s\S]*?)\}\)/);
  if (!m) { console.error("No se encontraron las opciones de lectura."); process.exit(1) }
  return Function(`return {${m[1].replace(/\/\*[\s\S]*?\*\//g, "")}}`)();
})();

const hoja = (aoa) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Hoja1");
  const ida = XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
                        { cellDates: true });
  return XLSX.utils.sheet_to_json(ida.Sheets["Hoja1"], { header: 1, ...OPC });
};

const fallas = [];
const mal = (t) => fallas.push(t);
const igual = (a, b, t) => { if (a !== b) mal(`${t} (dio ${JSON.stringify(a)}, se esperaba ${JSON.stringify(b)})`) };

/* =====================================================================
   1 · EL CORTE DE VERDAD, CON EL ADORNO QUE SAP LE PONE ENCIMA
   ===================================================================== */
const TITULOS = ["Fecha de entrada", "Material", "Texto breve de material", "Cantidad",
                 "Unidad medida base", "Referencia", "Centro", "Almacén",
                 "Clase de movimiento", "Hora de entrada"];
const fila = (f, ref, ctd, h) =>
  [f, "100123", "POKER 330 RET", ctd, "CJ", ref, "CD38", "AG01", "641", h];

const conAdorno = [
  ["Listado de movimientos de mercancías"],
  ["Centro: CD38     Almacén: AG01     Generado: 17.09.2026"],
  [],
  TITULOS,
  fila("17/09/2026", "7687019429", -36, "1:17:22 p. m."),
  fila("17/09/2026", "7687019429", 36, "2:05:00 p. m."),
  fila("17/09/2026", "7687019430", -28, "9:40:00 a. m."),
  [],
  [null, null, "Total general", -28],
];

{
  const r = L.leerHoja(hoja(conAdorno), "Hoja1");
  if (r.faltan.length) {
    mal(`1(dijo que faltan columnas —${r.faltan.map((c) => c.rotulo).join(", ")}— `
      + `con el encabezado completo en la hoja; tomó como encabezado la fila ${r.filaCab + 1}: `
      + JSON.stringify(r.titulos.filter(Boolean)) + ")");
  } else {
    igual(r.filaCab, 3, "1b(no encontró el encabezado en la fila 4)");
    igual(r.titulos[0], "Fecha de entrada", "1c(el encabezado que tomó no es el bueno)");
    igual(r.donde.fecha, 0, "1d(la fecha no quedó en su columna)");
    igual(r.donde.referencia, 5, "1e(la referencia no quedó en su columna)");
    igual(r.filas.length, 3, "1f(no leyó los tres movimientos)");
    igual(r.filas[0].fecha, "2026-09-17", "1g(la fecha no quedó como la entiende la base)");
    /* 1:17 DE LA TARDE SON LAS 13:17. Sin el sufijo en español, la tarde
       se guarda como la madrugada y el documento cambia de turno. */
    igual(r.filas[0].hora, "13:17:22", "1h(la tarde se guardó como madrugada)");
    igual(r.filas[0].referencia, "7687019429", "1i(la referencia no llegó entera)");
    igual(r.filas[0].cantidad, "-36", "1j(la cantidad negativa no sobrevivió)");
  }

  /* 5 y 6 · LOS NÚMEROS DE FILA SON LOS DEL EXCEL, y la fila en blanco
     no es un descarte. La única fila que se descarta es la de totales,
     que en el Excel es la 9. */
  igual(r.descartadas, 1, "5a(descartó otra cosa además de la fila de totales)");
  igual(r.descartes[0]?.fila, 9, "5b(el número de fila no es el que se ve en el Excel)");
}

/* =====================================================================
   2 · CUANDO DE VERDAD FALTA LA FECHA, SE DICE
   Es el contrapeso de (1): buscar el encabezado en varias filas, mal
   hecho, encuentra encabezado en cualquier parte.
   ===================================================================== */
{
  const sinFecha = [
    ["Listado de movimientos"],
    [],
    ["Material", "Texto breve de material", "Cantidad", "Referencia", "Centro"],
    ["100123", "POKER 330 RET", -36, "7687019429", "CD38"],
  ];
  const r = L.leerHoja(hoja(sinFecha), "Hoja1");
  if (!r.faltan.some((c) => c.clave === "fecha")) {
    mal("2(se inventó una columna de fecha en una hoja que no la trae)");
  }
  igual(r.filas.length, 0, "2b(importó filas de una hoja sin fecha)");
  /* Y SE MUESTRA EL ENCABEZADO QUE SÍ ENCONTRÓ. «Faltan columnas» a
     secas obliga a adivinar cuál hoja leyó. */
  if (!r.titulos.filter(Boolean).length) mal("2c(no dice qué encabezado encontró)");
}

/* =====================================================================
   3 · UNA COLUMNA NO SE ROBA LA DE OTRA
   ===================================================================== */
{
  const r = L.leerHoja(hoja(conAdorno), "Hoja1");
  igual(r.donde.hora, 9, "3(la hora no quedó en su columna)");
  if (r.donde.fecha === r.donde.hora) mal("3b(fecha y hora quedaron en la misma columna)");
  igual(r.donde.cantidad, 3, "3c(la cantidad no quedó en su columna)");
  igual(r.donde.almacen, 7, "3d(el almacén no quedó en su columna)");

  /* EL OTRO LAYOUT. El mismo dato se llama distinto según quién exporte,
     y el corte de contabilidad dice «Fecha contabilización». */
  const otro = [
    ["Fecha contabilización", "Referencia", "Cantidad"],
    ["17.09.2026", "7687019431", -12],
  ];
  const s = L.leerHoja(hoja(otro), "Hoja1");
  if (s.faltan.length) mal("3e(no reconoció «Fecha contabilización»)");
  else igual(s.filas[0]?.fecha, "2026-09-17", "3f(no entendió la fecha con puntos)");

  /* LAS TILDES SE PELAN, Y ESO NO ES ADORNO. SAP escribe «Descripción»,
     «DESCRIPCION» y «Descripcion» según quién exporte y con qué layout.
     Si dejaran de pelarse, el título con tilde no calzaría con ningún
     nombre conocido —tampoco por el principio, porque «descripción» no
     empieza por «descripcion»— y la columna se perdería en silencio: el
     corte entraría sin descripción de material y nadie lo notaría hasta
     mirar la tabla de diferencias con una columna vacía. */
  const tildes = [
    ["Fecha de entrada", "Referencia", "Cantidad", "Descripción", "Almacén"],
    ["17/09/2026", "7687019432", -12, "POKER 330 RET", "AG01"],
  ];
  const t = L.leerHoja(hoja(tildes), "Hoja1");
  igual(t.donde.descripcion, 3, "3g(se perdió la columna con tilde «Descripción»)");
  igual(t.filas[0]?.descripcion, "POKER 330 RET", "3h(la descripción no llegó)");
}

/* =====================================================================
   4 · LA CANTIDAD
   ===================================================================== */
{
  const casos = [
    [-36, "-36", "el número crudo"],
    ["-36", "-36", "el menos delante"],
    ["36-", "-36", "el menos detrás, como lo escribe SAP"],
    ["1.234,50", "1234.50", "mil doscientos treinta y cuatro con cincuenta, a la colombiana"],
    ["1,234.50", "1234.50", "el mismo número a la gringa"],
    ["1.234", "1234", "punto de miles sin decimales"],
    ["36,5", "36.5", "coma decimal"],
    ["", "0", "celda vacía"],
    ["CJ", "0", "texto sin número"],
  ];
  for (const [entra, sale, que] of casos) {
    igual(L.aNumero(entra), sale, `4(${que}: ${JSON.stringify(entra)})`);
  }

  /* Y AHORA POR EL CAMINO DE VERDAD, no llamando a la función suelta.
     Probar `aNumero` aparte deja pasar el error que de verdad pasó:
     que la hoja siguiera limpiando la cantidad a manotazos y nunca
     llamara a `aNumero`. Es un corte guardado como .csv y vuelto a
     abrir —así llegan las cantidades como texto, a la colombiana. */
  const enTexto = [
    ["Fecha de entrada", "Referencia", "Cantidad"],
    ["17/09/2026", "7687019433", "1.234,50"],
    ["17/09/2026", "7687019434", "36-"],
  ];
  const r = L.leerHoja(hoja(enTexto), "Hoja1");
  igual(r.filas[0]?.cantidad, "1234.50", "4z(«1.234,50» no llegó como número: la hoja no usa aNumero)");
  igual(r.filas[1]?.cantidad, "-36", "4y(«36-» entró como salida en vez de anulación)");
}

/* =====================================================================
   7 · LA PORTADA NO LE GANA A LA HOJA CON LOS DATOS
   ===================================================================== */
{
  /* Se escoge con la MISMA función que usa la pantalla, no comparando
     puntajes a mano aquí: lo que puede salir mal es la escogida. */
  const r = L.escogerHoja([
    { nombre: "Portada", crudo: hoja([["Reporte de movimientos"], ["CD38 · AG01"], ["Generado por JOSUE"]]) },
    { nombre: "Datos", crudo: hoja(conAdorno) },
  ]);
  igual(r?.hoja, "Datos", "7(se quedó con la portada: leería la portada y diría que el archivo no trae movimientos)");
  igual(r?.filas.length, 3, "7b(escogió la hoja buena pero no leyó sus movimientos)");
}

/* =====================================================================
   8 · LA REGLA DE AGRUPAR NO VIVE EN LA PANTALLA
   Agrupar por referencia, sumar y contar el que no dé cero es lo que
   decide qué falta. Escrita también aquí, mañana da distinto que la
   base y nadie sabe cuál de las dos creer.
   ===================================================================== */
{
  const cuerpo = tsx.slice(tsx.indexOf("export function Importar("));
  const limpio = cuerpo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  if (/reduce\s*\(\s*\(.*\)\s*=>.*cantidad/.test(limpio) || /sum[ao]\s*\+=/.test(limpio)) {
    mal("8(la pantalla está sumando cantidades: la regla de agrupar se coló aquí)");
  }
  if (!/traspaso_sap_importar/.test(limpio)) {
    mal("8b(la pantalla ya no manda el archivo a la base)");
  }
}

/* =====================================================================
   9 · LA RUTA NO SE TOCÓ, Y EL CRUCE SE MUDÓ A CONTROL
   ===================================================================== */
{
  if (!/\{ nombre: "Importar", ruta: "\/traspasos\/cruce" \}/.test(reg)) {
    mal("9(el menú no dice «Importar» apuntando a /traspasos/cruce)");
  }
  if (/ruta: "\/traspasos\/importar"/.test(reg)) {
    mal("9b(le cambiaron la ruta: los permisos guardados apuntan a /traspasos/cruce y se pierden en silencio)");
  }
  if (!/puedeVer\("\/traspasos\/cruce"\)/.test(pag) || !/puedeEditar\("\/traspasos\/cruce"\)/.test(pag)) {
    mal("9c(la pantalla ya no pide el permiso de /traspasos/cruce)");
  }
  /* LAS DIFERENCIAS ESTÁN AL PIE DE CONTROL Y NO EN OTRA PANTALLA. */
  if (!/<Diferencias\b/.test(ctl)) mal("9d(Control no muestra las diferencias)");
  const cuerpoCtl = ctl.slice(ctl.indexOf("return ("));
  const iTabla = cuerpoCtl.indexOf("Por tipo de viaje");
  const iDif = cuerpoCtl.indexOf("<Diferencias");
  if (iTabla < 0 || iDif < 0 || iDif < iTabla) {
    mal("9e(las diferencias no quedaron ABAJO: van después de la tabla por tipo, que es lo que se pidió)");
  }
  /* Y SIN CORTE NO SE AFIRMA QUE NO FALTE NADA. */
  if (!/hayCorte/.test(dif) || !/hayCorte/.test(ctl)) {
    mal("9f(ya no se comprueba que haya corte: un «0 faltaron» sin comparar se lee como que todo cuadra)");
  }
  /* LOS TRES MONTONES, cada uno con su acción distinta. */
  for (const q of ["falta", "sobra", "cuadra"]) {
    if (!new RegExp(`"${q}"`).test(dif)) mal(`9g(falta el montón «${q}» en las diferencias)`);
  }
}

/* =====================================================================
   10 · EL SEGUNDO CONTROL: LOS VIAJES REGISTRADOS SIN DOCUMENTO

   NO SALEN EN NINGUNO DE LOS TRES MONTONES, y ese es justamente el
   motivo de que haga falta un control aparte: el cruce empareja por
   número, y un viaje al que nadie le apuntó el número no tiene con qué
   emparejarse. No está en «faltan», no está en «sobran», no está en
   «cuadran». Sin este bloque desaparece del tablero entero.

   Y TIENE QUE PINTARSE AUNQUE NO HAYA CORTE. Al documento de SAP que
   nadie registró se llega importando; a este no se llega por ningún
   lado. Atarlo al corte lo escondería los días que nadie importó, que
   son justo los días en que más falta hace.
   ===================================================================== */
{
  /* SE MIDE QUE EL BLOQUE SE PINTE, no que la palabra aparezca. Buscar
     «sinDocumento» a secas lo daba por bueno con que existiera el
     nombre del parámetro: quitando el bloque de los dos `return` la
     pantalla se quedaba sin el control y el arnés seguía en verde. Van
     DOS porque hay dos salidas —con corte y sin corte— y el control
     tiene que estar en las dos. */
  const pintado = (dif.match(/\{sinDoc\}/g) ?? []).length;
  if (pintado < 2)
    mal(`10(el bloque de viajes sin documento se pinta ${pintado} vez/veces y son 2 —con corte y sin corte—: `
      + "no salen en ningún montón del cruce, así que si no se pinta no se ven en ninguna parte)");

  /* SE LEE LA MARCA DE LA VISTA, no un «documento is null» escrito a
     mano: `sin_documento` ya quiere decir «con carga, registrado y sin
     documento», y un vacío NO lleva documento porque no hay papel que
     llevar. Pedírselo obligaría a inventarlo, y la lista se llenaría de
     viajes que no tienen nada malo. */
  if (!/\.eq\("sin_documento", true\)/.test(dat))
    mal("10b(los viajes sin documento no se piden por la marca de la vista: un «documento is null» a mano se llevaría también los vacíos, que no llevan papel)");

  /* Y NO CUELGA DEL CORTE. Se comprueba que el bloque esté también en la
     rama de «no hay corte importado», que es la que se pinta los días
     que nadie subió el Excel. */
  const ramaSinCorte = (dif.match(/if \(!hayCorte\) \{[\s\S]*?\n  \}/) ?? [""])[0];
  if (!/sinDoc/.test(ramaSinCorte))
    mal("10c(sin corte importado el control de «sin documento» desaparece, y es justo cuando más falta hace)");

  /* QUIEN LO REGISTRÓ, CON NOMBRE. Un identificador no sirve para ir a
     preguntarle a nadie. */
  if (!/quien\(nombres/.test(dif))
    mal("10d(no dice quién registró el viaje sin documento, y sin nombre no hay a quién preguntarle)");
}

if (fallas.length) {
  console.error("IMPORTAR:\n  · " + fallas.join("\n  · "));
  process.exit(1);
}
console.log("IMPORTAR ok — encabezado con adorno encima, columnas sin robarse, cantidad entera,");
console.log("               filas del Excel bien numeradas, ruta intacta, y al pie de Control los");
console.log("               DOS controles: lo que SAP tiene sin registrar y lo registrado sin documento.");
