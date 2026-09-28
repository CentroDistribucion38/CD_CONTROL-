/* =====================================================================
   EL INFORME EN PDF DE ROTURAS EN SITIO — medido, no mirado.

   Este papel se manda por correo y se lee en una reunión tres semanas
   después, sin la pantalla al lado. Lo que puede salir mal:

   1. QUE LAS CONCLUSIONES ESTÉN AL REVÉS. «La causa que más cuesta» y
      «quién la asume» son las dos que más fácil se sacan volteadas, y
      una conclusión volteada se lee perfectamente normal en un papel
      bonito. Se miden SIN generar PDF: son una función pura.
   2. QUE SE CONCLUYA SOBRE NADA. Un 60 % sobre cinco unidades no es una
      concentración, es el azar.
   3. QUE UN PRECIO QUE FALTA SE IMPRIMA COMO «$ 0». Un cero en la
      columna de plata se lee como «no se le cobra nada», que es lo
      contrario de lo que pasa.
   4. QUE EL RECORRIDO NO QUEPA EN SU HOJA. Un Sankey cortado por el
      borde no dice nada, y en el PDF no hay barra para desplazarse.
   5. QUE EL PIE SE PINTE FUERA DE LA HOJA ACOSTADA. La hoja del
      recorrido mide 87 mm menos de alto que las demás: un pie calculado
      con el alto de la vertical se dibuja donde no hay papel.
   6. QUE EL PAPEL Y LA PANTALLA DIGAN CIFRAS DISTINTAS.

     node .arnes/rl-informe-sitio.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { transformSync } from "esbuild";
import { jsPDF } from "jspdf";

const U = (p) => new URL(p, import.meta.url);
const compila = (ruta, salida, repl = []) => {
  let js = transformSync(readFileSync(U(ruta), "utf8"), { loader: "ts", format: "esm" }).code;
  for (const [a, b] of repl) js = js.replaceAll(a, b);
  writeFileSync(U(salida), js);
  return import(U(salida).href + "?v=" + Date.now());
};

const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

const HA = await compila("../src/modulos/roturas/hallazgos-sitio.ts", "./_rls-hallazgos.mjs");
const CO = await compila("../src/modulos/roturas/cobro.ts", "./_rls-cobro.mjs");
const SK = await compila("../src/modulos/roturas/sankey.ts", "./_rls-sankey.mjs");
await compila("../src/modulos/rotlinea/hoja.ts", "./_rls-hoja.mjs");
const IN = await compila("../src/app/(app)/roturas/en-sitio/analisis/informe.ts", "./_rls-informe.mjs",
  [['"@/modulos/rotlinea/hoja"', '"./_rls-hoja.mjs"']]);

const png = (r) => "data:image/png;base64," + readFileSync(U(r)).toString("base64");
const MARCA = { palabra: png("../public/marca/logo-bavaria.png"), sello: png("../public/marca/logo-b.png") };

/* Los precios del MM60, los de verdad: el ejemplo que dio Cristian. */
const ENV = 100.00, PROD = 233.50;
let n = 0;
const rot = (o = {}) => {
  const rotas = o.unidades ?? 0, cont = o.contaminadas ?? 0;
  const sinPrecio = o.sinPrecio === true;
  const base = {
    id: "r" + ++n, codigo: "RB-" + String(n).padStart(4, "0"),
    material: "2182", material_nombre: "Pony Malta R 330cc X 30",
    tipo: "producto_terminado", color: null,
    causa: "estibas_malas", causa_nombre: "Estibas en mal estado", grupo: "asumida",
    proceso: "t1", proceso_nombre: "T1", area: null, area_nombre: null,
    estado: "cuenta", etapa: "cobro", cuenta: true, esperando: false,
    le_falta_foto: false, exige_foto: false, fotos: 1,
    reportada_en: "2026-09-20T13:00:00Z",
    unidades: rotas, contaminadas: cont, botellas: rotas,
    unidades_vidrio: rotas, unidades_liquido: rotas + cont,
    precio_envase: ENV, precio_producto: PROD,
    cobro_rotas: rotas * ENV,
    cobro_contaminadas: cont * (ENV + PROD),
    cobro_total: rotas * ENV + cont * (ENV + PROD),
    ...o,
  };
  if (sinPrecio) {
    base.cobro_rotas = null; base.cobro_contaminadas = null; base.cobro_total = null;
    base.precio_envase = null;
  }
  return base;
};

/* =====================================================================
   1 · LAS CONCLUSIONES, SIN PDF DE POR MEDIO
   ===================================================================== */

/* 1a · LA CAUSA QUE MÁS CUESTA NO ES LA QUE MÁS ROMPE.
   «Mal apilado» rompe 400 unidades sin contaminar → 400 × 100 = 40.000.
   «Montacargas» rompe 50 y contamina 120 → 5.000 + 120 × 333,50 = 45.020.
   La conclusión correcta es que la CARA es «Montacargas», que rompe
   ocho veces menos. Es justo la que un ranking de unidades esconde. */
{
  const lista = [
    rot({ unidades: 200, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 200, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 50, contaminadas: 120, causa: "montacargas",
          causa_nombre: "Montacargas", proceso_nombre: "Cargue" }),
  ];
  const cobro = CO.medirCobro(lista);
  const h = HA.hallazgosSitio(lista, lista, cobro);
  const cara = h.find((x) => x.clave === "causa-cara");
  ok(cara, `no salió el hallazgo de la causa cara: ${JSON.stringify(h.map((x) => x.clave))}`);
  ok(/Montacargas/.test(cara?.dice ?? ""),
     `la causa más cara sale como «${cara?.dice}» y son las 45.020 de Montacargas: ` +
     "un ranking de unidades diría «Mal apilado» y mandaría a arreglar lo que no es");
  ok(/Mal apilado/.test(cara?.porque ?? ""),
     `el «por qué» tiene que nombrar la que más rompe para que se vea el contraste: «${cara?.porque}»`);
  ok(cara?.cifra === "$ 45.020", `la cifra dice ${cara?.cifra} y son $ 45.020`);
  ok(cara?.peso === "alto", "que la cara no sea la que más rompe pesa alto");
}

/* 1b · CUANDO SÍ SON LA MISMA, lo que vale es cuánto concentra —y NO se
   puede decir que la cara es otra, porque no lo es. */
{
  const lista = [
    rot({ unidades: 300, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 300, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 40, causa: "montacargas", causa_nombre: "Montacargas" }),
  ];
  const h = HA.hallazgosSitio(lista, lista, CO.medirCobro(lista));
  ok(!h.some((x) => x.clave === "causa-cara"),
     "con la misma causa arriba en las dos listas no puede decir que la cara es otra");
  const c = h.find((x) => x.clave === "causa-concentra");
  ok(c?.cifra === "94 %", `la concentración dice ${c?.cifra} y son 600 de 640 = 94 %`);
}

/* 1c · NO SE CONCLUYE SOBRE NADA. Dos roturas de diez unidades no son
   una tendencia; el informe de un día flojo que afirma seis cosas es un
   informe que nadie va a creer cuando afirme la que importa. */
{
  const lista = [
    rot({ unidades: 10, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 2, contaminadas: 6, causa: "montacargas", causa_nombre: "Montacargas" }),
  ];
  const h = HA.hallazgosSitio(lista, lista, CO.medirCobro(lista));
  ok(!h.some((x) => ["causa-cara", "causa-concentra", "no-asumidas", "proceso"].includes(x.clave)),
     `con 18 unidades en 2 roturas no se concluye nada de causas: salió ${JSON.stringify(h.map((x) => x.clave))}`);
}

/* 1d · LO QUE FALTA EN EL MAESTRO VA PRIMERO, aunque no sea lo más
   grande: es el único hallazgo que dice que el resto del informe está
   CORTO. Y no tiene piso: una sola ya rompe la cuenta. */
{
  const lista = [
    rot({ unidades: 500, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 12, sinPrecio: true, material: "412375",
          material_nombre: "Envase Flint 210NR Coronita" }),
  ];
  const cobro = CO.medirCobro(lista);
  const h = HA.hallazgosSitio(lista, lista, cobro);
  ok(h[0]?.clave === "sin-precio",
     `lo que falta en el maestro tiene que ir primero y fue ${h[0]?.clave}: sin eso, alguien ` +
     "lee el total de abajo creyendo que está completo");
  ok(h[0]?.peso === "alto", "una cifra corta pesa alto");
  ok(/1 de 2/.test(h[0]?.cuenta ?? ""), `la cuenta dice «${h[0]?.cuenta}» y son 1 de 2 con precio`);
  /* Y CON DOS ROTURAS NO SE CONCLUYE NADA MÁS: el hallazgo del maestro
     no tiene piso porque no es una tendencia, es un dato que falta. */
  ok(h.length === 1, `con 2 roturas solo puede salir el del maestro y salió ${JSON.stringify(h.map((x) => x.clave))}`);
}

/* 1e · LAS CONTAMINADAS CUESTAN DISTINTO. 100 rotas (10.000) y 40
   contaminadas (13.340): son el 29 % de las unidades y el 57 % de la
   plata. Esa desproporción es la que hay que enseñarle al OL. */
{
  const lista = [rot({ unidades: 60, contaminadas: 25 }), rot({ unidades: 25, contaminadas: 10 }),
                 rot({ unidades: 15, contaminadas: 5 })];
  const cobro = CO.medirCobro(lista);
  const h = HA.hallazgosSitio(lista, lista, cobro);
  const c = h.find((x) => x.clave === "contaminadas-caras");
  ok(c, `no salió el hallazgo de las contaminadas: ${JSON.stringify(h.map((x) => x.clave))}`);
  ok(c?.cifra === "57 %", `dice ${c?.cifra} y son 13.340 de 23.340 = 57 %`);
  ok(/3\.3 veces/.test(c?.porque ?? ""),
     `cada contaminada cuesta 333,50 contra 100 de la rota = 3,3 veces: «${c?.porque}»`);
}

/* 1f · LAS NO ASUMIDAS SIN FOTO PESAN ALTO, y el hallazgo tiene que
   DECIR cuántas: una no asumida sin foto es plata que se cae sola en la
   reunión, y en el papel no hay dónde pinchar para averiguarlo. */
{
  const lista = [
    rot({ unidades: 300, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 200, grupo: "no_asumida", exige_foto: true, le_falta_foto: true,
          causa: "falla_maquina", causa_nombre: "Falla de la máquina" }),
    rot({ unidades: 100, grupo: "no_asumida", exige_foto: true,
          causa: "falla_maquina", causa_nombre: "Falla de la máquina" }),
  ];
  const h = HA.hallazgosSitio(lista, lista, CO.medirCobro(lista));
  const na = h.find((x) => x.clave === "no-asumidas");
  ok(na?.cifra === "50 %", `las no asumidas dan ${na?.cifra} y son 300 de 600 = 50 %`);
  ok(/1 no la tiene/.test(na?.porque ?? ""), `tiene que decir cuántas no tienen foto: «${na?.porque}»`);
  ok(na?.peso === "alto", "una no asumida sin foto pesa alto");
}

/* 1f-bis · EL PISO ES DE UNIDADES Y TAMBIÉN DE ROTURAS, y hacen falta
   los dos. Aquí hay CINCO roturas —de sobra— pero solo 25 unidades: no
   es una tendencia, es una mañana floja. Con un solo piso, el de
   roturas, esta tanda concluiría «Mal apilado es el 80 %». */
{
  const lista = [
    rot({ unidades: 5, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 5, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 5, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 5, causa: "mal_apilado", causa_nombre: "Mal apilado" }),
    rot({ unidades: 5, grupo: "no_asumida", causa: "montacargas", causa_nombre: "Montacargas" }),
  ];
  const h = HA.hallazgosSitio(lista, lista, CO.medirCobro(lista));
  ok(!h.some((x) => ["causa-cara", "causa-concentra", "no-asumidas", "proceso"].includes(x.clave)),
     `con 25 unidades no se concluye nada de causas por muchas roturas que sean: salió ` +
     JSON.stringify(h.map((x) => x.clave)));
}

/* 1g · LO QUE TODAVÍA NO SE PUEDE COBRAR. Es lo único que explica por
   qué el total es menor de lo que la gente recuerda haber reportado. */
{
  const vivas = [
    rot({ unidades: 100 }),
    rot({ unidades: 50, etapa: "espera_ol", estado: "esperando", cuenta: false }),
    rot({ unidades: 30, etapa: "desacuerdo", estado: "esperando", cuenta: false }),
    rot({ unidades: 20, etapa: "espera_ol", estado: "esperando", cuenta: false }),
  ];
  const cuentan = vivas.filter((r) => r.cuenta);
  const h = HA.hallazgosSitio(vivas, cuentan, CO.medirCobro(vivas));
  const s = h.find((x) => x.clave === "sin-decidir");
  ok(s, `no salió el hallazgo de lo que espera: ${JSON.stringify(h.map((x) => x.clave))}`);
  ok(/3 roturas todavía sin decidir/.test(s?.dice ?? ""), `dice «${s?.dice}»`);
  ok(/ABI/.test(s?.porque ?? ""), `con una objetada tiene que nombrar a ABI: «${s?.porque}»`);
}

/* 1h · EL ORDEN ES EL PESO Y NO EL ORDEN EN QUE SE ESCRIBIERON.
   Quien lee tres renglones y cierra el PDF tiene que haberse llevado lo
   que importa. Aquí «lo que espera» se calcula ANTES que «lo que ABI
   devolvió» y pesa menos: si el orden fuera el del código, lo bajo
   saldría primero. */
{
  const vivas = [
    ...Array.from({ length: 7 }, () => rot({ unidades: 20 })),
    rot({ unidades: 10, etapa: "espera_ol", estado: "esperando", cuenta: false }),
    ...Array.from({ length: 4 }, () => rot({ unidades: 10, etapa: "no_cuenta",
                                             estado: "no_cuenta", cuenta: false })),
  ];
  const h = HA.hallazgosSitio(vivas, vivas.filter((r) => r.cuenta), CO.medirCobro(vivas));
  const iDev = h.findIndex((x) => x.clave === "devueltas");
  const iEsp = h.findIndex((x) => x.clave === "sin-decidir");
  ok(iDev >= 0 && iEsp >= 0, `faltan hallazgos: ${JSON.stringify(h.map((x) => x.clave))}`);
  ok(h[iDev]?.peso === "alto" && h[iEsp]?.peso === "bajo",
     `pesos: devueltas ${h[iDev]?.peso}, sin decidir ${h[iEsp]?.peso}`);
  ok(iDev < iEsp,
     "«ABI devolvió el 33 %» pesa alto y salió DESPUÉS de una nota que pesa bajo: el orden del " +
     "informe tiene que ser el del peso, no el del código");
}

/* =====================================================================
   2 · EL PAPEL
   ===================================================================== */
/* EL CASO PEOR Y EL DE VERDAD: seis causas y seis procesos, que es el
   tope que deja `masGrandes`, en el lienzo de 980 px de alto que usa el
   papel. Con menos nodos el dibujo solo queda más holgado; si algo se
   sale de la hoja, se sale aquí. */
const CAUSAS = [
  ["c:apilado", "Mal apilado", "la asume el OL", 400, SK.COLOR_ASUMIDA],
  ["c:maquina", "Falla de la máquina", "no asumida · exige foto", 170, SK.COLOR_NO_ASUMIDA],
  ["c:estibas", "Estibas en mal estado", "la asume el OL", 120, SK.COLOR_ASUMIDA],
  ["c:montacargas", "Montacargas", "la asume el OL", 90, SK.COLOR_ASUMIDA],
  ["c:piso", "Piso en mal estado", "no asumida · exige foto", 60, SK.COLOR_NO_ASUMIDA],
  ["c:otros", "Otros", "la asume el OL", 30, SK.COLOR_ASUMIDA],
];
const PROCS = [
  ["p:t1", "T1", 300, SK.COLOR_PROCESO],
  ["p:cargue", "Cargue", 230, SK.COLOR_PROCESO_2],
  ["p:traspasos", "Traspasos", 150, SK.COLOR_PROCESO_2],
  ["p:picking", "Picking", 100, SK.COLOR_PROCESO_2],
  ["p:plazoleta", "Plazoleta", 60, SK.COLOR_PROCESO_2],
  ["p:lineas", "Líneas", 30, SK.COLOR_PROCESO_2],
];
const SANKEY = SK.armarSankey({
  columnas: [
    CAUSAS.map(([id, rotulo, pie, valor, color]) => ({ id, rotulo, pie, valor, color })),
    PROCS.map(([id, rotulo, valor, color]) => ({ id, rotulo, valor, color })),
    [{ id: "fin:vidrio", rotulo: "Baja de vidrio", pie: "rota: pierde líquido y botella",
       valor: 750, color: SK.COLOR_VIDRIO },
     { id: "fin:liquido", rotulo: "Solo baja de líquido", pie: "contaminada: vuelve el envase",
       valor: 120, color: SK.COLOR_LIQUIDO }],
  ],
  tramos: [
    ...CAUSAS.map(([id], i) => ({ de: id, a: PROCS[i][0], valor: CAUSAS[i][3] })),
    ...PROCS.map(([id], i) => ({ de: id, a: "fin:vidrio", valor: PROCS[i][2] - [50, 30, 20, 10, 5, 5][i] })),
    ...PROCS.map(([id], i) => ({ de: id, a: "fin:liquido", valor: [50, 30, 20, 10, 5, 5][i] })),
  ],
}, 1160, 980);

/* LA GEOMETRÍA EN NÚMEROS TIENE QUE SER LA MISMA QUE LA DEL `d`. El SVG
   pinta una y el PDF la otra: si se separan, la pantalla y el papel
   enseñan dos dibujos distintos y los dos se ven bien. */
for (const c of SANKEY.cintas) {
  const m = c.d.match(/^M([\d.-]+),([\d.-]+) C/);
  ok(m && Math.abs(+m[1] - c.x0) < 0.001 && Math.abs(+m[2] - c.y0) < 0.001,
     `la cinta ${c.de}→${c.a} arranca en el «d» en ${m?.[1]},${m?.[2]} y en números en ${c.x0},${c.y0}`);
}

const D = {
  hoy: "2026-09-28",
  periodo: "del 01/09/2026 al 28/09/2026",
  filtros: "",
  plata: 74216, plataRotas: 10000, plataCont: 64216,
  aCobro: 6, sinPrecio: 2,
  porCausa: [
    { nombre: "Falla de la máquina", grupo: "no_asumida", valor: 45020 },
    { nombre: "Mal apilado", grupo: "asumida", valor: 29196 },
  ],
  unidades: 450, liquido: 570, contaminadas: 120,
  noAsumidas: 170, pctNoAsumida: 30, devueltas: 1, pctDevueltas: 8,
  roturasEnFiltro: 12,
  hallazgos: [
    { clave: "sin-precio", cifra: "2", dice: "2 roturas a cobro no se pueden valorar",
      porque: "No entran en el total de este informe.", cuenta: "4 de 6 con precio", peso: "alto" },
    { clave: "causa-cara", cifra: "$ 45.020",
      dice: "La causa que más plata cuesta es «Falla de la máquina»",
      porque: "«Mal apilado» mueve más unidades pero cuesta menos.",
      cuenta: "170 unidades y $ 45.020", peso: "alto" },
  ],
  recorrido: { s: SANKEY, total: 870, juntados: 3 },
  roturas: [
    { codigo: "RB-0001", fecha: "2026-09-27", material: "2182",
      material_nombre: "Pony Malta R 330cc X 30", causa: "Mal apilado", grupo: "asumida",
      proceso: "T1", rotas: 200, contaminadas: 100, etapa: "a cobro", cobro: 53350 },
    { codigo: "RB-0002", fecha: "2026-09-26", material: "412375",
      material_nombre: "Envase Flint 210NR Coronita", causa: "Falla de la máquina",
      grupo: "no_asumida", proceso: "Cargue", rotas: 12, contaminadas: 0,
      etapa: "espera al OL", cobro: null },
  ],
};

const ruta = new URL("./_rls-informe.pdf", import.meta.url).pathname;
const doc = IN.dibujarInformeSitio(jsPDF, D, { generado: new Date("2026-09-28T16:20:00"), marca: MARCA });
writeFileSync(ruta, Buffer.from(doc.output("arraybuffer")));
const paginas = execFileSync("pdftotext", ["-layout", ruta, "-"], { encoding: "utf8" }).split("\f");
const todo = paginas.join("\n");

/* 2a · LA CIFRA QUE SOSTIENE EL PAPEL */
ok(/\$ 74\.216/.test(todo), "el total que se le cobra al OL no salió en el papel");
ok(/se le cobra al OL/.test(todo), "la cifra grande salió sin decir de qué es");
ok(/\$ 10\.000/.test(todo) && /\$ 64\.216/.test(todo),
   "las dos formas de cobrar tienen que ir partidas: sin eso la cifra no se puede discutir");

/* 2a-bis · EL PAPEL DICE LO MISMO QUE LA PANTALLA, PIEZA POR PIEZA.
   Quien discute el cobro tiene delante el papel, no la pantalla: si el
   papel enseña menos, la diferencia hay que ir a buscarla a otro sitio
   —y en una reunión eso es no tenerla—. */
ok(/Rotas 13 %/.test(todo) && /Contaminadas 87 %/.test(todo),
   "el papel no lleva el reparto en porcentaje: 10.000 de 74.216 es 13 % y 64.216 es 87 %");
ok(/unidades x precio del envase/.test(todo)
   && /unidades x \(precio del envase \+ precio del producto\)/.test(todo),
   "el papel no lleva las dos fórmulas escritas: una cifra de plata que no dice cómo se sacó se " +
   "cree o no se cree, pero no se discute");
ok(/SOLO ENVASE/.test(todo) && /ENVASE \+ PRODUCTO/.test(todo),
   "faltan las etiquetas de qué se cobra en cada forma");
/* EL TOTAL REPETIDO al pie del reparto: es lo que deja comprobar que las
   dos cifras de la hoja cuadran entre ellas. */
ok(/Total a cobrar/.test(todo), "el reparto por causa salió sin su total: no hay con qué cuadrarlo");
{
  const filas = [...todo.matchAll(/^\s*(.+?)\s{2,}(?:El OL|No asumida)\s+\$ ([\d.]+)\s*$/gm)]
    .map((m) => Number(m[2].replace(/\./g, "")));
  ok(filas.length === 2, `el reparto por causa salió con ${filas.length} renglones y son 2`);
  ok(filas.reduce((a, b) => a + b, 0) === 74216,
     `las causas del papel suman ${filas.reduce((a, b) => a + b, 0)} y el total dice 74.216: dos ` +
     "cifras de la misma hoja que no cuadran entre ellas");
}

/* 2b · QUE LA CIFRA ESTÁ CORTA, PEGADO A LA CIFRA.
   Si hay roturas sin precio, el total está corto — y eso tiene que
   leerse en el mismo golpe de vista, no en una nota al pie que nadie
   busca. */
{
  const i = todo.indexOf("$ 74.216"), j = todo.indexOf("ESTÁ CORTA");
  ok(j > 0, "el papel no dice que la cifra está corta habiendo 2 roturas sin precio");
  ok(j > i && j - i < 400,
     "el aviso de que la cifra está corta quedó lejos del total: el que lee la cifra grande y " +
     "cierra el PDF se lleva un número equivocado con cara de exacto");
}

/* 2c · UN PRECIO QUE FALTA SE IMPRIME COMO RAYA, NUNCA COMO CERO */
/* EL ESPACIO NO SE PUEDE DAR POR SEGURO: en la columna alineada a la
   derecha, `pdftotext -layout` devuelve «$0» pegado. Buscando «$ 0» con
   el espacio, esta comprobación pasaba con el cero impreso delante — el
   error que venía a cazar. */
ok(!/\$\s*0(?![\d.,])/.test(todo),
   "salió un «$ 0» en el papel: un cero en la columna de plata se lee como «no se le cobra " +
   "nada», que es lo contrario de que falte el precio");
ok(/Envase Flint 210NR Coronita/.test(todo), "la rotura sin precio no salió en la tabla");

/* 2d · LOS HALLAZGOS, ANTES DE LAS TABLAS */
{
  const h = todo.indexOf("no se pueden valorar");
  const t = todo.indexOf("Las roturas");
  ok(h > 0 && t > 0 && h < t, "los hallazgos tienen que ir antes de la tabla, no después");
}

/* 2e · UNA SOLA ORIENTACIÓN, Y EL RECORRIDO TIENE SU HOJA
   ---------------------------------------------------------------------
   El recorrido tuvo media tarde una hoja acostada y no se puede leer: en
   el visor se va pasando de página y en la mitad aparece una girada.
   TODAS VERTICALES, sin excepción. */
{
  const bbox = execFileSync("pdftotext", ["-bbox", ruta, "-"], { encoding: "utf8" });
  const hojas = [...bbox.matchAll(/<page width="([\d.]+)" height="([\d.]+)"/g)]
    .map((m) => ({ w: +m[1], h: +m[2] }));
  const acostadas = hojas.filter((p) => p.w > p.h);
  ok(acostadas.length === 0,
     `hay ${acostadas.length} hoja(s) acostada(s): el PDF tiene que ir todo en una sola ` +
     "orientación o no se puede leer de corrido");
  /* A4 vertical son 210 × 297 mm = 595,3 × 841,9 puntos. */
  for (const [i, p] of hojas.entries()) {
    ok(Math.abs(p.w - 595.3) < 2 && Math.abs(p.h - 841.9) < 2,
       `la hoja ${i + 1} mide ${JSON.stringify(p)} y todas tienen que ser A4 vertical`);
  }

  const iReco = paginas.findIndex((p) => /El recorrido de las/.test(p));
  ok(iReco >= 0, "no salió la hoja del recorrido");
  const hoja = paginas[iReco] ?? "";
  ok(/DE QUÉ CAUSA SALIÓ/.test(hoja) && /POR DÓNDE PASÓ/.test(hoja) && /EN QUÉ TERMINA/.test(hoja),
     "el diagrama salió sin los tres rótulos de columna: así es un dibujo bonito del que nadie " +
     "sabe qué está mirando");
  for (const n of SANKEY.nodos) {
    ok(hoja.includes(n.rotulo), `el nodo «${n.rotulo}» no salió en la hoja del recorrido`);
  }
  ok(/Baja de vidrio/.test(hoja) && /Solo baja de líquido/.test(hoja),
     "las dos salidas tienen que verse por separado: sumarlas da de baja un envase que sigue " +
     "en la línea");
  ok(/3 más chicas están sumadas/.test(hoja),
     "un «otros» mudo hace creer que hay una causa que se llama así");
}

/* 2e-bis · Y NADA SE ESCRIBE ENCIMA DE OTRA COSA EN EL DIAGRAMA.
   Es el error que no se ve en el texto extraído —«…de dos milímetros
   30n llenas» sale ordenado en una línea— y sí en el papel: la nota de
   abajo escrita encima de la cifra del último nodo. Se mide con las
   cajas de cada palabra. */
const palabrasDe = (pdf, marca) => {
  const bb = execFileSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" });
  const hj = bb.split("<page ").slice(1);
  const i = hj.findIndex((p) => marca.test(p));
  return [...(hj[i] ?? "").matchAll(
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)]
    .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] }));
};
const sinEncimarse = (pal, dice) => {
  for (let i = 0; i < pal.length; i++) {
    for (let j = i + 1; j < pal.length; j++) {
      const a = pal[i], b = pal[j];
      /* 1,5 puntos de tolerancia: dos palabras seguidas de la misma
         línea se tocan por el espacio y eso no es encimarse. */
      const cruza = a.x0 < b.x1 - 1.5 && b.x0 < a.x1 - 1.5
                 && a.y0 < b.y1 - 1.5 && b.y0 < a.y1 - 1.5;
      ok(!cruza, `${dice}: «${a.t}» y «${b.t}» se escriben una encima de otra`);
    }
  }
};
{
  const pal = palabrasDe(ruta, /recorrido/);
  ok(pal.length > 10, `la hoja del recorrido trae ${pal.length} palabras y son muchas más`);
  sinEncimarse(pal, "en el recorrido");
}

/* 2f · NADA SE SALE DE SU HOJA — ni el diagrama ni el pie.
   En un PDF no hay barra para desplazarse: lo que queda fuera del papel
   no está. */
{
  const bbox = execFileSync("pdftotext", ["-bbox", ruta, "-"], { encoding: "utf8" });
  const hojas = bbox.split("<page ").slice(1);
  hojas.forEach((p, i) => {
    const m = p.match(/^width="([\d.]+)" height="([\d.]+)"/);
    const W = +m[1], H = +m[2];
    for (const w of p.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)) {
      const [, x0, y0, x1, y1] = w.map(Number);
      ok(x0 >= -1 && x1 <= W + 1 && y0 >= -1 && y1 <= H + 1,
         `en la hoja ${i + 1} (${Math.round(W)}×${Math.round(H)}) hay texto en ` +
         `${Math.round(x0)},${Math.round(y0)}–${Math.round(x1)},${Math.round(y1)}: se sale del papel`);
    }
  });
}

/* 2g · EL PIE, EN TODAS Y CON LA CUENTA BIEN */
{
  const nPag = paginas.filter((p) => p.trim()).length;
  for (let i = 1; i <= nPag; i++) {
    ok(new RegExp(`Página ${i} de ${nPag}`).test(paginas[i - 1] ?? ""),
       `la hoja ${i} no dice «Página ${i} de ${nPag}»: un papel suelto de la página 3 no se sabe ` +
       "de dónde salió");
  }
}

/* 2h · CON FILTRO, EL PAPEL LO DICE — y en todas las hojas.
   Un informe filtrado por una causa que no diga que está filtrado es un
   informe que alguien va a leer como el mes entero. */
{
  const g = IN.dibujarInformeSitio(jsPDF, { ...D, filtros: "causa Mal apilado" },
                                   { generado: new Date("2026-09-28T16:20:00"), marca: MARCA });
  const r2 = new URL("./_rls-informe-f.pdf", import.meta.url).pathname;
  writeFileSync(r2, Buffer.from(g.output("arraybuffer")));
  const pp = execFileSync("pdftotext", ["-layout", r2, "-"], { encoding: "utf8" })
    .split("\f").filter((p) => p.trim());
  ok(/FILTRADO/.test(pp[0]) && /Mal apilado/.test(pp[0]), "la franja de filtrado no salió arriba");
  pp.forEach((p, i) => {
    ok(/Filtrado/.test(p),
       `la hoja ${i + 1} no dice en el pie que está filtrada: suelta se lee como el mes entero`);
  });
}

/* 2i · SIN NADA QUE CONTAR, EL PAPEL SALE IGUAL Y LO DICE.
   Un informe que revienta con cero roturas se reporta como «la app no
   sirve» justo el día que no hubo roturas, que es el día bueno. */
{
  const vacio = { ...D, plata: 0, plataRotas: 0, plataCont: 0, aCobro: 0, sinPrecio: 0,
                  porCausa: [], unidades: 0, liquido: 0, contaminadas: 0, noAsumidas: 0,
                  pctNoAsumida: 0, devueltas: 0, pctDevueltas: 0, roturasEnFiltro: 0,
                  hallazgos: [], recorrido: null, roturas: [] };
  const g = IN.dibujarInformeSitio(jsPDF, vacio, { generado: new Date(), marca: MARCA });
  const r3 = new URL("./_rls-informe-v.pdf", import.meta.url).pathname;
  writeFileSync(r3, Buffer.from(g.output("arraybuffer")));
  const t3 = execFileSync("pdftotext", ["-layout", r3, "-"], { encoding: "utf8" });
  ok(/No hay roturas en este período/.test(t3), "con cero roturas el papel no dice que no hay");
  ok(/No hay suficientes roturas/.test(t3), "sin hallazgos el papel tiene que decir por qué");
  ok(!/acostada|undefined|NaN/.test(t3), `salió basura en el papel vacío: ${t3.slice(0, 200)}`);
}

/* =====================================================================
   2j · EL DÍA REAL DE CRISTIAN, Y UN LIENZO QUE NO CABE
   ---------------------------------------------------------------------
   Su primer informe de verdad tenía UNA causa con CERO rotas y 200
   contaminadas: la columna de la causa suma cero y una barra termina más
   abajo del borde del lienzo. Con eso, y con el lienzo pedido más alto
   de la cuenta —que fue lo que pasó cuando el servidor y el navegador no
   coincidieron—, el diagrama salía pasado del pie y cortado por el borde
   de la hoja.

   EL DIBUJO TIENE QUE CABER SIEMPRE, LE DEN EL LIENZO QUE LE DEN: en un
   PDF no hay barra para desplazarse y lo que no cabe, no está. Así que
   se prueban las dos formas —la suya y la de seis por seis, donde el
   rótulo del último nodo SÍ pasa del borde del lienzo— en tres lienzos,
   uno bueno y dos imposibles.
   ===================================================================== */
const FORMAS = {
  "un solo camino": (alto) => SK.armarSankey({
    columnas: [
      [{ id: "c:estibas", rotulo: "Estibas en mal estado", pie: "la asume el OL",
         valor: 0, color: SK.COLOR_ASUMIDA }],
      [{ id: "p:t1", rotulo: "T1", valor: 200, color: SK.COLOR_PROCESO }],
      [{ id: "fin:vidrio", rotulo: "Baja de vidrio", pie: "rota: pierde líquido y botella",
         valor: 0, color: SK.COLOR_VIDRIO },
       { id: "fin:liquido", rotulo: "Solo baja de líquido", pie: "contaminada: vuelve el envase",
         valor: 200, color: SK.COLOR_LIQUIDO }],
    ],
    tramos: [{ de: "c:estibas", a: "p:t1", valor: 200 },
             { de: "p:t1", a: "fin:liquido", valor: 200 }],
  }, 1160, alto),
  "seis y seis": (alto) => SK.armarSankey({
    columnas: [
      CAUSAS.map(([id, rotulo, pie, valor, color]) => ({ id, rotulo, pie, valor, color })),
      PROCS.map(([id, rotulo, valor, color]) => ({ id, rotulo, valor, color })),
      [{ id: "fin:vidrio", rotulo: "Baja de vidrio", pie: "rota: pierde líquido y botella",
         valor: 750, color: SK.COLOR_VIDRIO },
       { id: "fin:liquido", rotulo: "Solo baja de líquido", pie: "contaminada: vuelve el envase",
         valor: 120, color: SK.COLOR_LIQUIDO }],
    ],
    tramos: [
      ...CAUSAS.map(([id], i) => ({ de: id, a: PROCS[i][0], valor: CAUSAS[i][3] })),
      ...PROCS.map(([id], i) => ({ de: id, a: "fin:vidrio", valor: PROCS[i][2] - [50, 30, 20, 10, 5, 5][i] })),
      ...PROCS.map(([id], i) => ({ de: id, a: "fin:liquido", valor: [50, 30, 20, 10, 5, 5][i] })),
    ],
  }, 1160, alto),
};

for (const [forma, hacer] of Object.entries(FORMAS)) {
  for (const alto of [980, 1600, 2600]) {
    const uno = hacer(alto);
    const cual = `«${forma}» en un lienzo de ${alto}`;
    const g = IN.dibujarInformeSitio(jsPDF,
      { ...D, recorrido: { s: uno, total: 200, juntados: 0 } },
      { generado: new Date("2026-09-28T16:20:00"), marca: MARCA });
    const r4 = new URL(`./_rls-inf-${forma.replace(/ /g, "-")}-${alto}.pdf`, import.meta.url).pathname;
    writeFileSync(r4, Buffer.from(g.output("arraybuffer")));

    /* NI UNA LETRA FUERA DE SU HOJA, EN NINGUNA HOJA. */
    const bb = execFileSync("pdftotext", ["-bbox", r4, "-"], { encoding: "utf8" });
    const hj = bb.split("<page ").slice(1);
    hj.forEach((p, i) => {
      const m = p.match(/^width="([\d.]+)" height="([\d.]+)"/);
      const PW = +m[1], PH = +m[2];
      for (const w of p.matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)) {
        const x0 = +w[1], y0 = +w[2], x1 = +w[3], y1 = +w[4];
        ok(x0 >= -1 && x1 <= PW + 1 && y0 >= -1 && y1 <= PH + 1,
           `${cual}: «${w[5]}» queda en ${Math.round(x0)},${Math.round(y0)} y la hoja ${i + 1} ` +
           `mide ${Math.round(PW)}×${Math.round(PH)}: se sale del papel`);
      }
    });

    /* NI UN RÓTULO ENCIMA DE OTRO. Encoger el dibujo sin encoger las
       letras hace que los tres renglones de cada barra se monten: el
       diagrama cabe y no se puede leer, que es el mismo problema con
       otra cara. */
    sinEncimarse(palabrasDe(r4, /recorrido/), cual);

    /* Y SE MIRA EL PAPEL, NO SOLO EL TEXTO. `pdftotext` no ve las barras
       ni las cintas: con la escala fija, las letras seguían todas dentro
       de la hoja y lo que se salía por abajo eran los rectángulos —que
       es exactamente lo que se vio en la pantalla—. Se pinta la hoja y
       se mira si queda tinta por debajo del pie. */
    const iR = hj.findIndex((p) => /recorrido/.test(p));
    const ppm = execFileSync("pdftoppm",
      ["-r", "50", "-f", String(iR + 1), "-l", String(iR + 1), "-singlefile", r4],
      { maxBuffer: 1 << 28 });
    /* P6 <ancho> <alto> 255, y detrás los píxeles en crudo. */
    const cab = ppm.subarray(0, 64).toString("latin1").match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
    const AN = +cab[1], AL = +cab[2], ini = cab[0].length;
    /* Desde 290 mm para abajo —debajo del renglón del pie— no puede
       quedar nada pintado. 50 puntos por pulgada son 1,9685 por mm. */
    const desde = Math.round(290 * 50 / 25.4);
    let sucio = 0, dx = -1, dy = -1;
    for (let py = desde; py < AL; py++) {
      for (let px = 0; px < AN; px++) {
        const o = ini + (py * AN + px) * 3;
        if (ppm[o] < 245 || ppm[o + 1] < 245 || ppm[o + 2] < 245) {
          sucio++; if (dx < 0) { dx = px; dy = py }
        }
      }
    }
    ok(sucio === 0,
       `${cual}: quedan ${sucio} puntos pintados por debajo del pie (el primero en ${dx},${dy} ` +
       `de ${AN}×${AL}). El dibujo se sale de la hoja.`);
  }
}

if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ El informe de en sitio: las conclusiones salen de una función pura y no del papel " +
            "—la causa más CARA no es la que más rompe, y eso lo dice—, no se concluye nada por " +
            "debajo de 30 unidades, lo que falta en el maestro va primero porque deja la cifra " +
            "corta, un precio que falta se imprime como raya y nunca como $ 0, el recorrido cabe " +
            "entero en una hoja A4 VERTICAL —todas lo son: un PDF con una hoja girada en la " +
            "mitad no se lee— con sus tres rótulos y sus dos salidas, nada se escribe encima de " +
            "otra cosa ni se sale del papel en ninguna hoja, el dibujo se ajusta al sitio que le " +
            "queda —le den el lienzo que le den— y el filtro va en el pie de todas.");
