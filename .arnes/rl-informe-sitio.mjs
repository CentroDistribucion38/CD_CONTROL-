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
   4. QUE LOS PARETOS NO QUEPAN EN SU HOJA. Tres Paretos de ocho barras
      con nombres largos son mucha más tinta de la que parece, y en un
      PDF no hay barra para desplazarse: lo que se sale, no está.
   5. QUE EL PAPEL Y LA PANTALLA CUENTEN DISTINTO EL 80 %. Es LA cifra
      del Pareto. Aquí se mide contra la misma función pura que usa la
      pantalla, no contra un número escrito a mano en el arnés.
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
const PA = await compila("../src/modulos/roturas/pareto.ts", "./_rls-pareto.mjs");
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
/* LOS TRES PARETOS DEL PAPEL, SACADOS DE LA MISMA FUNCIÓN QUE LA
   PANTALLA. Escribir aquí las barras a mano sería medir el papel contra
   un número inventado: si `pareto()` cambiara de criterio, el arnés
   seguiría verde y el papel diría otra cosa que la pantalla.

   EL CASO PEOR Y EL DE VERDAD: más categorías que el tope, para que haya
   «otros»; una sin nombre, para que haya «sin dato»; y nombres tan
   largos como los de verdad —«Estibas en mal estado», «Bahías de cargue
   T1»—, que es lo que se sale de la columna. */
const fp = (nombre, valor, plata) => ({ nombre, valor, plata });
const P_CAUSA = PA.pareto([
  fp("Mal apilado", 400, 21340), fp("Falla de la máquina", 170, 45020),
  fp("Estibas en mal estado", 120, 3200), fp("Montacargas", 90, 2100),
  fp("Piso en mal estado", 60, 1400), fp("Bandas transportadoras", 40, 900),
  fp("Manipulación en el cargue", 30, 700), fp("Estibas con clavos salidos", 20, 500),
  fp("Otras menores", 12, 300), fp("Golpe contra columna", 8, 200),
  fp(null, 25, 600),
]);
const P_AREA = PA.pareto([
  fp("Bahías de cargue T1", 300, 30000), fp("Plazoleta de producto terminado", 230, 18000),
  fp("Traspasos entre bodegas", 150, 9000), fp("Picking", 100, 5000),
  fp("Líneas de producción", 30, 1200),
]);
/* UN PARETO CON UNA PLATA QUE FALTA: tiene que salir raya y no «$ 0». */
const P_OPM = PA.pareto([
  fp("Juan Pérez", 260, 14000), fp("Encontrada sin dueño", 180, null),
  fp("Carlos Ramírez", 120, 6000), fp("Luis Gómez", 90, 4200),
]);
const PARETOS = [
  { titulo: "Por causa", d: P_CAUSA },
  { titulo: "Por área", d: P_AREA },
  { titulo: "Por OPM", d: P_OPM },
];
/* QUE EL FIXTURE EJERCITE LO QUE DICE EJERCITAR. Un arnés cuyo caso no
   tiene «otros» ni «sin dato» ni una plata que falte está comprobando el
   papel fácil y va a seguir verde el día que se rompa el difícil. */
ok(P_CAUSA.barras.some((b) => b.clase === "otros"), "el fixture de causa se quedó sin «otros»");
ok(P_CAUSA.barras.some((b) => b.clase === "sinDato"), "el fixture de causa se quedó sin «sin dato»");
ok(P_OPM.barras.some((b) => b.plata === null), "el fixture de OPM se quedó sin una plata que falte");

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
  excepcion: { n: 3, plata: 12500 },
  paretos: PARETOS,
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

  const iPar = paginas.findIndex((p) => /Qué poco explica lo mucho/.test(p));
  ok(iPar >= 0, "no salió la hoja de los Paretos");
  /* LOS PARETOS OCUPAN LO QUE OCUPEN: con la gráfica ya no caben los
     tres en una hoja, así que se lee el texto de todas las hojas que
     traigan Paretos y se comprueba aparte que ninguno se parta. */
  const hoja = paginas.filter((p) => /explican?\b|Qué poco explica/.test(p)).join("\n");

  ok(/Por causa/.test(hoja) && /Por área/.test(hoja) && /Por OPM/.test(hoja),
     "falta alguno de los tres Paretos en el papel");

  /* LA RESPUESTA ESCRITA, Y LA MISMA QUE LA DE LA PANTALLA. Un Pareto
     sin esta línea es un ranking con una curva encima: la cifra que se
     viene a buscar es CUÁNTAS hay que atacar. */
  for (const { titulo: t, d: q } of PARETOS) {
    const frase = new RegExp(`${q.hasta80} de ${q.barras.length} explican? el 80 % de ` +
                             q.total.toLocaleString("es-CO").replace(/\./g, "\\.") + " unidades");
    ok(frase.test(hoja),
       `el Pareto «${t}» salió sin decir que ${q.hasta80} de ${q.barras.length} explican el 80 % ` +
       `de ${q.total} unidades: sin esa línea es un ranking con una curva encima, y contarlo a ` +
       "ojo en la gráfica es justo lo que nadie hace");
  }

  /* TODAS LAS BARRAS, CON SU NOMBRE Y SU ACUMULADO. */
  for (const { titulo: t, d: q } of PARETOS) {
    for (const b of q.barras) {
      ok(hoja.includes(b.nombre.slice(0, 20)), `en «${t}» no salió la barra «${b.nombre}»`);
    }
    ok(hoja.includes(`${q.barras.at(-1).acumulado} %`),
       `en «${t}» falta la columna del acumulado: sin ella no hay Pareto, hay un ranking`);
  }
  ok(/Sin dato/.test(hoja),
     "«sin dato» no salió en el papel: son roturas a las que les falta el campo, y calladas se " +
     "leen como si no existieran");
  ok(/Otros/.test(hoja), "«otros» no salió: la cola se junta, no se corta");
  /* Y EL PAPEL EXPLICA LOS DOS, IGUAL QUE LA PANTALLA. Quien discute el
     cobro tiene delante el papel: si allí «Sin dato» sale como un
     renglón más y sin decir qué es, se reparte como si fuera una causa,
     y la pantalla y el papel acaban diciendo cosas distintas. */
  ok(/no es una categoría/.test(hoja),
     "el papel enseña «Sin dato» sin explicar que no es una categoría sino un campo que falta en " +
     "el registro —la pantalla sí lo explica, y los dos tienen que decir lo mismo");
  ok(/están sumadas en «Otros»/.test(hoja),
     "el papel no dice cuántas se juntaron en «Otros»: un «otros» mudo hace creer que hay una " +
     "causa que se llama así");
  /* UNA VEZ, NO TRES. La frase del acumulado repetida debajo de cada
     Pareto deja de leerse, y arrastra consigo la nota que sí es de ese
     Pareto. */
  ok((hoja.match(/hasta dónde hay que atacar/g) ?? []).length === 1,
     `la explicación del acumulado sale ${(hoja.match(/hasta dónde hay que atacar/g) ?? []).length} ` +
     "veces en la misma hoja: repetida deja de leerse");
  ok(/rotas más contaminadas/.test(hoja),
     "el papel no dice en qué está medido: unidades movidas, no plata —ordenado por plata, un " +
     "material sin precio mandaría su causa al último puesto");

  /* NINGÚN PARETO PARTIDO POR LA MITAD. Es la promesa de la sección
     desde que entró la gráfica: los tres ya no caben en una hoja, pero
     cada uno tiene que caber entero. Partido, la mitad de abajo queda
     sin su gráfica y sin su línea del 80 %, y vuelve a ser un ranking.
     Se comprueba que el título de cada Pareto y su última barra estén en
     la MISMA hoja. */
  for (const { titulo: t, d: q } of PARETOS) {
    const iTit = paginas.findIndex((p) => p.includes(t));
    const iUlt = paginas.findIndex((p) => p.includes(q.barras.at(-1).nombre.slice(0, 18)));
    ok(iTit >= 0 && iTit === iUlt,
       `el Pareto «${t}» empieza en la hoja ${iTit + 1} y su última barra ` +
       `(«${q.barras.at(-1).nombre}») cae en la ${iUlt + 1}: partido por la mitad, lo de abajo se ` +
       "queda sin gráfica y sin la línea del 80 %, y vuelve a ser un ranking");
  }
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
/* NINGÚN NOMBRE SE METE EN LA COLUMNA DE LAS CIFRAS.
   El nombre vive en su columna; uno largo sin recortar se mete debajo de
   las unidades y de la plata, y los tres se pintan encima. Eso NO lo caza
   mirar si el texto se sale del papel —se queda dentro de sobra— ni
   comparar palabras entre ellas —van en renglones distintos por poco—:
   hay que medir contra dónde empieza la columna de al lado.

   LA FRONTERA SE MUEVE CON EL DIBUJO, y por eso va escrita aquí con su
   cuenta: 14 mm de margen + 7 de número + 101 de nombre = 122 mm. Antes
   eran 70, cuando la tabla llevaba un riel que la gráfica hacía
   redundante. Un límite copiado sin su cuenta es el que se queda
   señalando un borde que ya no existe. 1 mm son 2,8346 puntos. */
const CIFRAS_PT = (14 + 7 + 101) * 2.8346, DER_PT = 196 * 2.8346;
const nombresEnElRiel = (pdf, dice) => {
  const bb = execFileSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" });
  for (const [i, pg] of bb.split("<page ").slice(1).entries()) {
    if (!/explican?\b/.test(pg)) continue;
    const pal = [...pg.matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)]
      .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], t: m[5] }));
    /* QUÉ RENGLÓN ES UNA BARRA DE LA TABLA: el que termina en el
       acumulado —«37 %» pegado al margen derecho—. El título de la
       sección, la frase del 80 % y el pie cruzan ese ancho a propósito y
       no son renglones de tabla, así que ir por «todo lo que cruce los
       122 mm» los señalaría a ellos y no al error. */
    const reng = new Map();
    for (const w of pal) {
      const k = Math.round(w.y0);
      reng.set(k, [...(reng.get(k) ?? []), w]);
    }
    for (const g of reng.values()) {
      if (!g.some((w) => w.t === "%" && w.x1 > DER_PT - 6)) continue;
      for (const w of g) {
        ok(!(w.x0 < CIFRAS_PT - 1.5 && w.x1 > CIFRAS_PT + 1.5),
           `${dice}, hoja ${i + 1}: el nombre «${w.t}» llega a ${Math.round(w.x1)} y la columna ` +
           `de las cifras empieza en ${Math.round(CIFRAS_PT)}: se pintan una encima de otra`);
      }
    }
  }
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
  const pal = palabrasDe(ruta, /explica/);
  ok(pal.length > 40, `la hoja de los Paretos trae ${pal.length} palabras y son muchas más`);
  sinEncimarse(pal, "en los Paretos");
  nombresEnElRiel(ruta, "en los Paretos");
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
                  hallazgos: [], excepcion: { n: 0, plata: 0 },
                  paretos: [{ titulo: "Por causa", d: PA.pareto([]) },
                            { titulo: "Por área", d: PA.pareto([]) },
                            { titulo: "Por OPM", d: PA.pareto([]) }],
                  roturas: [] };
  const g = IN.dibujarInformeSitio(jsPDF, vacio, { generado: new Date(), marca: MARCA });
  const r3 = new URL("./_rls-informe-v.pdf", import.meta.url).pathname;
  writeFileSync(r3, Buffer.from(g.output("arraybuffer")));
  const t3 = execFileSync("pdftotext", ["-layout", r3, "-"], { encoding: "utf8" });
  ok(/No hay roturas en este período/.test(t3), "con cero roturas el papel no dice que no hay");
  ok(/No hay suficientes roturas/.test(t3), "sin hallazgos el papel tiene que decir por qué");
  ok(!/acostada|undefined|NaN/.test(t3), `salió basura en el papel vacío: ${t3.slice(0, 200)}`);
}

/* =====================================================================
   2j · LA LISTA QUE NO CABE, Y EL DÍA REAL DE CRISTIAN
   ---------------------------------------------------------------------
   AQUÍ SE MEDÍA EL RECORRIDO en tres lienzos imposibles, porque el Sankey
   se pintaba a escala y se salía de la hoja. El Pareto no tiene lienzo:
   son renglones, y lo que se sale ya no es un dibujo pasado de alto sino
   una LISTA MÁS LARGA QUE EL PAPEL.

   Así que el caso peor cambia de forma: tres Paretos llenos —ocho barras
   cada uno, más «otros», más «sin dato»— con nombres largos de verdad.
   Eso no cabe en una hoja y tiene que partirse por Paretos ENTEROS: uno
   cortado por la mitad se lee como dos listas distintas, y la de abajo,
   sin su línea del 80 %, vuelve a ser un ranking.

   Y EL DÍA REAL DE CRISTIAN: su primer informe tenía una causa con CERO
   rotas y 200 contaminadas. En un Pareto eso es una sola barra que se lo
   lleva todo —el 100 % con una—, y ahí es donde se ven un «0 de 1» o una
   división entre cero.
   ===================================================================== */
const largo = (n, i) => `${n} en bahía de cargue T${i} sector norte`;
const CASOS = {
  "tres llenos de nombres largos": [
    { titulo: "Por causa", d: PA.pareto([
      ...Array.from({ length: 14 }, (_, i) => fp(largo("Causa muy larga", i), 200 - i * 12, 500)),
      fp(null, 40, 100)]) },
    { titulo: "Por área", d: PA.pareto(Array.from({ length: 14 },
      (_, i) => fp(largo("Área con nombre larguísimo", i), 200 - i * 12, 500))) },
    { titulo: "Por OPM", d: PA.pareto(Array.from({ length: 14 },
      (_, i) => fp(largo("Operario de nombre largo", i), 200 - i * 12, null))) },
  ],
  "una sola que se lo lleva todo": [
    { titulo: "Por causa", d: PA.pareto([fp("Estibas en mal estado", 200, 46700)]) },
    { titulo: "Por área", d: PA.pareto([fp("T1", 200, 46700)]) },
    { titulo: "Por OPM", d: PA.pareto([fp(null, 200, 46700)]) },
  ],
  "dos con datos y uno sin nada": [
    { titulo: "Por causa", d: P_CAUSA },
    { titulo: "Por área", d: PA.pareto([]) },
    { titulo: "Por OPM", d: P_OPM },
  ],
};

for (const [cual, paretos] of Object.entries(CASOS)) {
  const g = IN.dibujarInformeSitio(jsPDF, { ...D, paretos },
    { generado: new Date("2026-09-28T16:20:00"), marca: MARCA });
  const r4 = new URL(`./_rls-inf-${cual.replace(/ /g, "-")}.pdf`, import.meta.url).pathname;
  writeFileSync(r4, Buffer.from(g.output("arraybuffer")));

  const txt4 = execFileSync("pdftotext", ["-layout", r4, "-"], { encoding: "utf8" });
  ok(!/NaN|undefined|Infinity/.test(txt4), `${cual}: salió basura en el papel`);
  /* NI UN «$ 0» DONDE FALTA EL PRECIO, tampoco aquí. */
  ok(!/\$\s*0(?![\d.,])/.test(txt4),
     `${cual}: salió un «$ 0» donde falta el precio, y eso se lee como «no se le cobra nada»`);
  /* LA LÍNEA DEL 80 % EN LOS TRES, aun con una sola barra. */
  for (const { titulo: t, d: q } of paretos) {
    if (q.barras.length === 0) continue;
    ok(new RegExp(`${q.hasta80} de ${q.barras.length} explican? el 80 %`).test(txt4),
       `${cual}: el Pareto «${t}» salió sin su línea del 80 %`);
    ok(q.hasta80 >= 1, `${cual}: «${t}» dice que hacen falta 0 barras, y con datos siempre es 1`);
  }

  /* NI UNA LETRA FUERA DE SU HOJA, EN NINGUNA HOJA, Y TODAS VERTICALES. */
  const bb = execFileSync("pdftotext", ["-bbox", r4, "-"], { encoding: "utf8" });
  const hj = bb.split("<page ").slice(1);
  hj.forEach((pg, i) => {
    const m = pg.match(/^width="([\d.]+)" height="([\d.]+)"/);
    const PW = +m[1], PH = +m[2];
    ok(PW < PH, `${cual}: la hoja ${i + 1} quedó acostada`);
    for (const w of pg.matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)) {
      const x0 = +w[1], y0 = +w[2], x1 = +w[3], y1 = +w[4];
      ok(x0 >= -1 && x1 <= PW + 1 && y0 >= -1 && y1 <= PH + 1,
         `${cual}: «${w[5]}» queda en ${Math.round(x0)},${Math.round(y0)} y la hoja ${i + 1} ` +
         `mide ${Math.round(PW)}×${Math.round(PH)}: se sale del papel`);
    }
  });

  /* NI UN RENGLÓN ENCIMA DE OTRO, EN TODAS las hojas de Paretos —no solo
     en la primera: si la lista se parte, la de abajo es la que se monta
     con el pie. */
  const conPareto = hj.map((_, i) => i).filter((i) => /explican?\b/.test(hj[i]));
  ok(conPareto.length > 0, `${cual}: no salió ninguna hoja de Paretos`);
  for (const i of conPareto) {
    const pal = [...hj[i].matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)]
      .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] }));
    sinEncimarse(pal, `${cual}, hoja ${i + 1}`);
  }
  /* Y AQUÍ ES DONDE IMPORTA: estos son los nombres largos de verdad. */
  nombresEnElRiel(r4, cual);

  /* Y SE MIRA EL PAPEL, NO SOLO EL TEXTO. `pdftotext` no ve los rieles ni
     las barras: con la lista larga las letras pueden quedar dentro y lo
     que se sale por abajo son los rectángulos —que es justo lo que pasó
     con el recorrido—. Se pinta cada hoja y se mira si hay tinta debajo
     del pie. */
  for (const i of conPareto) {
    const ppm = execFileSync("pdftoppm",
      ["-r", "50", "-f", String(i + 1), "-l", String(i + 1), "-singlefile", r4],
      { maxBuffer: 1 << 28 });
    const cab = ppm.subarray(0, 64).toString("latin1").match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
    const AN = +cab[1], AL = +cab[2], base = cab[0].length;
    /* Desde 290 mm para abajo —debajo del renglón del pie— no puede
       quedar nada pintado. 50 puntos por pulgada son 1,9685 por mm. */
    const desde = Math.round(290 * 50 / 25.4);
    let sucio = 0, dx = -1, dy = -1;
    for (let py = desde; py < AL; py++) {
      for (let px = 0; px < AN; px++) {
        const o = base + (py * AN + px) * 3;
        if (ppm[o] < 245 || ppm[o + 1] < 245 || ppm[o + 2] < 245) {
          sucio++; if (dx < 0) { dx = px; dy = py }
        }
      }
    }
    ok(sucio === 0,
       `${cual}: en la hoja ${i + 1} quedan ${sucio} puntos pintados por debajo del pie (el ` +
       `primero en ${dx},${dy} de ${AN}×${AL}). La lista se sale de la hoja.`);
  }
}

if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ El informe de en sitio: las conclusiones salen de una función pura y no del papel " +
            "—la causa más CARA no es la que más rompe, y eso lo dice—, no se concluye nada por " +
            "debajo de 30 unidades, lo que falta en el maestro va primero porque deja la cifra " +
            "corta, un precio que falta se imprime como raya y nunca como $ 0, los tres Paretos " +
            "van en la misma hoja para poder compararlos y cada uno dice con todas sus letras " +
            "CUÁNTAS hacen falta para el 80 % —la cifra que se viene a buscar, sacada de la " +
            "misma función que usa la pantalla—, todo en hojas A4 VERTICALES, sin un renglón " +
            "encima de otro ni una raya de tinta por debajo del pie por larga que sea la lista, " +
            "y el filtro va en el pie de todas.");
