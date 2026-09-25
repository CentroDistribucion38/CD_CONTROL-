/* =====================================================================
   «LO QUE SE ROMPIÓ» — LA LISTA, MEDIDA EN CHROMIUM

   El mockup que llegó no es un cambio de colores: es otra forma de
   ordenar la información. Cada rotura pasa de ser un párrafo de
   etiquetas a ser un renglón de ocho columnas, y las cuatro cifras de
   arriba pasan de informar a FILTRAR. Ninguna de las dos cosas se puede
   dar por buena leyendo el código:

   1. LAS OCHO COLUMNAS CAEN EN LA MISMA VERTICAL. Es la razón entera de
      haber cambiado a tabla: si «20 rotas» de una fila y «100 rotas» de
      la siguiente no arrancan en la misma x, no se comparan bajando y
      la tabla no sirve para nada que la tarjeta no hiciera.

   2. LAS CIFRAS FILTRAN DE VERDAD. Que se pinten encendidas no prueba
      nada: lo que se mide es cuántas filas quedan después de tocarlas,
      y que tocarlas otra vez las devuelva todas.

   3. EN CELULAR SE APILA Y CADA DATO DICE QUÉ ES. Sin el encabezado de
      columnas, «T1» suelto en una esquina no se sabe si es el proceso,
      el turno o la calle.

   4. NADA SE SALE a 1440 / 820 / 390 / 360, y lo que se toca mide 44 px
      o más. Es la regla de siempre del proyecto.

     node .arnes/rt-lista.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE: si revienta dos pasos
   después de detectar algo y no imprime nada, parece que no se probó. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_nav-lst.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-lst.ts"), `export const createClient = () => ({
  rpc: async () => ({ data: [], error: null }),
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  from: () => ({ insert: async () => ({ error: null }) }),
});`);

/* ---------------------------------------------------------------------
   LAS ROTURAS DE PRUEBA SON LAS DEL MOCKUP, Y NO POR ADORNO: cada una
   trae un caso que la pantalla tiene que saber pintar.

   · RB-0010 espera visto bueno, tiene foto y causa anotada.
   · RB-0009 ya cuenta, y trae CONTAMINADAS — el renglón ámbar de
     abajo, que es el único sitio donde aparece que esas pierden el
     líquido pero no la botella.
   · RB-0008 espera y NO tiene causa: «Sin causa anotada».
   · RB-0007 es NO ASUMIDA y le falta la foto: las dos marcas rojas
     juntas, que es la fila que ABI devuelve.
   · RB-0006 está ANULADA: no debe salir sin pedirla, y ningún filtro
     de las cifras puede traerla.
   --------------------------------------------------------------------- */
writeFileSync(R(".arnes/_lst-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { EnSitio } from "../src/app/(app)/roturas/en-sitio/EnSitio";

const base = {
  material: "PT-1", tipo: "producto_terminado", color: null,
  contaminadas: null, botellas: null, unidades_liquido: 0,
  area: "plazoleta", area_nombre: "Plazoleta",
  exige_foto: false, descripcion: null,
  lat: null, lng: null, precision_m: null,
  decidida_por: null, decidida_en: null, nota_decision: null,
  reportada_en: "2026-09-23T12:00:00Z",
};
const roturas = [
  { ...base, id: "r10", codigo: "RB-0010",
    material_nombre: "Águila Lig R 750cc X16", unidades: 20, unidades_vidrio: 20,
    proceso: "t1", proceso_nombre: "T1",
    causa: "mal_arrumado", causa_nombre: "Mal estibado", grupo: "asumida",
    estado: "esperando", esperando: true, cuenta: false,
    reportada_por: "u1", fotos: 1, le_falta_foto: false, minutos: 0 },
  { ...base, id: "r9", codigo: "RB-0009",
    material_nombre: "Águila RN 330cc X30", unidades: 100, unidades_vidrio: 100,
    contaminadas: 200, botellas: 100, unidades_liquido: 300,
    proceso: "t1", proceso_nombre: "T1",
    causa: "", causa_nombre: "", grupo: "asumida",
    estado: "cuenta", esperando: false, cuenta: true,
    reportada_por: "u2", fotos: 1, le_falta_foto: false, minutos: 1080 },
  { ...base, id: "r8", codigo: "RB-0008",
    material_nombre: "Águila RN 330cc X30", unidades: 1, unidades_vidrio: 1,
    proceso: "lineas", proceso_nombre: "Líneas",
    causa: "", causa_nombre: "", grupo: "asumida",
    estado: "esperando", esperando: true, cuenta: false,
    reportada_por: "u1", fotos: 1, le_falta_foto: false, minutos: 1080 },
  { ...base, id: "r7", codigo: "RB-0007",
    material_nombre: "Poker R 330cc X30", unidades: 7, unidades_vidrio: 7,
    proceso: "sorting", proceso_nombre: "Sorting",
    causa: "falla_depa", causa_nombre: "Falla del pallet DEPA", grupo: "no_asumida",
    estado: "esperando", esperando: true, cuenta: false, exige_foto: true,
    reportada_por: "u2", fotos: 0, le_falta_foto: true, minutos: 200 },
  { ...base, id: "r6", codigo: "RB-0006",
    material_nombre: "Costeña R 330cc X30", unidades: 5, unidades_vidrio: 5,
    proceso: "lineas", proceso_nombre: "Líneas",
    causa: "estibas_malas", causa_nombre: "Estibas en mal estado", grupo: "asumida",
    estado: "anulada", esperando: false, cuenta: false,
    reportada_por: "u1", fotos: 0, le_falta_foto: false, minutos: 4000 },
];
const procesos = [
  { clave: "lineas", nombre: "Líneas", activo: true, orden: 1 },
  { clave: "t1", nombre: "T1", activo: true, orden: 2 },
  { clave: "sorting", nombre: "Sorting", activo: true, orden: 5 },
];
createRoot(document.getElementById("r")!).render(
  <EnSitio esperando={3} roturas={roturas as any}
           nombres={{ u1: "admin", u2: "sleal" }}
           materiales={[] as any} materialesDe="inventario"
           procesos={procesos as any} areas={[] as any} causas={[] as any} puedeEditar />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_lst-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-lst.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-lst.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css   = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob  = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

/* LA PANTALLA ABRE REGISTRANDO —se llama «Registrar»—, así que para
   llegar a la lista hay que cancelar. No es un rodeo del arnés: es el
   camino que hace la persona. */
const monta = async (ancho = 1440, tema = "", alto = 1000) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
    <div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".rt-rep");
  await pg.click(".rt-rep .pie button:has-text('Cancelar')");
  await pg.waitForSelector(".rt .tabla");
};

const codigos = () => pg.$$eval(".rt .tf-cod", (e) => e.map((x) => x.textContent.trim()));
const caja = (sel) => pg.$eval(sel, (e) => { const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, d: r.right, b: r.bottom } });

await monta();

/* =====================================================================
   1 · LAS OCHO COLUMNAS, Y QUE CAIGAN EN LA MISMA VERTICAL

   Es la razón entera de haber pasado de tarjeta a tabla. Si las cifras
   de dos filas no arrancan en la misma x, no se comparan bajando y el
   cambio no compró nada.
   ===================================================================== */
{
  const rot = await pg.$$eval(".rt .tb-cols > div", (e) => e.map((x) => x.textContent.trim()));
  ok(rot.length === 8,
     `el encabezado trae ${rot.length} columnas y el diseño tiene 8: ${JSON.stringify(rot)}`);
  for (const r of ["CÓDIGO", "FOTO", "PRODUCTO · CAUSA", "UNIDADES", "PROCESO", "REGISTRÓ", "ESTADO"]) {
    ok(rot.includes(r), `falta la columna «${r}» en el encabezado: ${JSON.stringify(rot)}`);
  }

  /* LAS ANULADAS NO SALEN SIN PEDIRLAS. RB-0006 existe y está anulada:
     si apareciera, la cuenta de arriba —que se hace sobre las vivas— no
     cuadraría con los renglones de abajo. */
  const cods = await codigos();
  ok(!cods.includes("RB-0006"),
     `salió una rotura anulada sin pedirla: ${cods.join(", ")}`);
  ok(cods.length === 4, `se pintan ${cods.length} filas y deben ser las 4 vivas: ${cods.join(", ")}`);

  /* LA MISMA VERTICAL, medido de verdad y no a ojo. */
  const xs = await pg.$$eval(".rt .tf .tf-und", (e) => e.map((x) => Math.round(x.getBoundingClientRect().x)));
  ok(new Set(xs).size === 1,
     `la columna de unidades arranca en ${JSON.stringify([...new Set(xs)])}: si no cae en la ` +
     "misma vertical no se compara bajando, que es para lo que se hizo tabla");
  const xe = await pg.$$eval(".rt .tf .tf-est", (e) => e.map((x) => Math.round(x.getBoundingClientRect().x)));
  ok(new Set(xe).size === 1,
     `la columna de estado arranca en ${JSON.stringify([...new Set(xe)])}`);

  /* Y QUE EL ENCABEZADO CAIGA ENCIMA DE SU DATO. Es el defecto clásico
     de las tablas hechas con grid: se declaran las columnas dos veces y
     el rótulo se queda con el ancho viejo. */
  const rotU = await caja(".rt .tb-cols > div:nth-child(4)");
  const datU = await caja(".rt .tf .tf-und");
  ok(Math.abs(rotU.x - datU.x) <= 1,
     `el rótulo UNIDADES arranca en ${Math.round(rotU.x)} y su dato en ${Math.round(datU.x)}: ` +
     "el encabezado dejó de caer encima de su columna");
}

/* =====================================================================
   2 · LO QUE DICE CADA FILA
   ===================================================================== */
{
  const t = await pg.textContent(".rt .tabla");
  ok(/4 roturas/.test(t), "el encabezado de la lista no dice cuántas hay");
  ok(/no asumida · la más reciente arriba/.test(t),
     "no se explica el filo rojo ni el orden: un filo de color que nadie explica no significa nada");

  /* LAS CONTAMINADAS, EN SU PROPIO RENGLÓN. Pierden el líquido pero no
     la botella: sumarlas a las rotas obligaría después a adivinar
     cuánto vidrio salió de ahí. */
  ok(/\+200 contaminada/.test(t),
     "las contaminadas no salen: sin ese renglón, 100 rotas y 300 unidades de líquido no cuadran");

  /* Y CABEN EN UN RENGLÓN. Partidas en dos, esa fila crece y la tabla
     deja de leerse bajando a ritmo parejo — que es lo único que la
     tabla compró frente a la tarjeta. */
  /* SE CUENTAN LAS CAJAS DE LÍNEA CON UN Range, y no dividiendo el alto
     entre el `line-height`: sin un `line-height` escrito a mano, el
     navegador contesta «normal» y `parseFloat` devuelve NaN. El arnés
     acusó de angosta una columna que estaba bien — el mismo tipo de
     mentira en rojo que el medidor de contraste, y por eso se arregla
     el medidor en vez de quitar la comprobación. */
  const renglones = await pg.$eval(".rt .tf-n2", (e) => {
    const r = document.createRange(); r.selectNodeContents(e);
    /* SE CUENTAN LAS ALTURAS DISTINTAS, no los rectángulos. React parte
       `+{n} contaminada{s}` en cuatro nodos de texto, y `getClientRects`
       devuelve uno por nodo: en UN renglón ya daba 4, así que contar
       rectángulos acusaba de angosta a una columna que estaba bien.
       Lo que hace renglón es la posición vertical. */
    return new Set([...r.getClientRects()].map((c) => Math.round(c.top))).size;
  });
  ok(renglones === 1,
     `«+200 contaminadas» ocupa ${renglones} renglones: la columna de unidades quedó angosta y ` +
     "esa fila crece más que las demás");

  /* SIN CAUSA SE DICE. Una celda en blanco hace pensar que la pantalla
     se rompió; «Sin causa anotada» dice que el dato falta en el
     registro, que es otra cosa y se arregla en otro sitio. */
  ok(/Sin causa anotada/.test(t), "una rotura sin causa deja la celda en blanco en vez de decirlo");

  /* LA QUE LE FALTA LA FOTO LO GRITA: es la que ABI devuelve. */
  const fila7 = await pg.textContent(".rt .tf:has(.tf-cod:text-is('RB-0007'))");
  ok(/LE FALTA/.test(fila7), `la rotura sin la foto que exige no lo dice: «${fila7}»`);
  ok(/no asumida por el OL/.test(fila7), "no se dice que la rotura no la asume el OL");

  /* EL FILO ROJO SOLO EN LA NO ASUMIDA. */
  const filo = await pg.$$eval(".rt .tf", (e) => e.map((x) => [
    x.querySelector(".tf-cod")?.textContent?.trim(),
    getComputedStyle(x).borderLeftColor,
  ]));
  const rojo = filo.filter(([, c]) => c !== filo.find(([k]) => k === "RB-0010")[1]).map(([k]) => k);
  ok(rojo.length === 1 && rojo[0] === "RB-0007",
     `el filo rojo está en ${JSON.stringify(rojo)} y debe estar solo en la no asumida RB-0007`);

  /* LOS TRES ESTADOS SE PINTAN DISTINTO. Si «CUENTA» y «ESPERANDO VH»
     salieran del mismo color, la columna de estado no diría nada. */
  const cCuenta = await pg.$eval(".rt .tf-pi.cuenta", (e) => getComputedStyle(e).backgroundColor);
  const cEsp = await pg.$eval(".rt .tf-pi.esperando", (e) => getComputedStyle(e).backgroundColor);
  ok(cCuenta !== cEsp,
     `«CUENTA» y «ESPERANDO VH» salen del mismo color (${cCuenta}): la columna de estado no dice nada`);
}

/* =====================================================================
   3 · LAS CUATRO CIFRAS FILTRAN DE VERDAD

   Que se pinten encendidas no prueba nada. Lo que se mide es cuántas
   filas quedan, y que tocarlas otra vez las devuelva todas.
   ===================================================================== */
{
  const n = async () => (await codigos()).length;
  ok(await n() === 4, "de entrada no salen las 4 vivas");

  const cifra = (i) => `.rt .cifras .cifra:nth-child(${i})`;

  /* 1 · ESPERAN VISTO BUENO → las tres que esperan. */
  await pg.click(cifra(1));
  let c = await codigos();
  ok(c.length === 3 && !c.includes("RB-0009"),
     `«esperan visto bueno» dejó ${c.join(", ")} y deben ser las 3 que esperan`);
  ok(await pg.getAttribute(cifra(1), "aria-pressed") === "true",
     "la cifra tocada no queda marcada como puesta: quien vuelve a la pantalla no sabe qué está filtrado");

  /* Y SE APAGA TOCÁNDOLA OTRA VEZ. Un filtro que no se ve dónde se
     quita es un filtro que se queda puesto y hace pensar que se
     perdieron registros. */
  await pg.click(cifra(1));
  ok(await n() === 4, "tocar la misma cifra otra vez no la apaga: el filtro se queda puesto");

  /* 2 · SIN LA FOTO QUE EXIGEN → solo RB-0007. */
  await pg.click(cifra(2));
  c = await codigos();
  ok(c.length === 1 && c[0] === "RB-0007",
     `«sin la foto que exigen» dejó ${c.join(", ")} y debe dejar solo RB-0007`);

  /* 3 · NO ASUMIDAS → solo RB-0007. */
  await pg.click(cifra(3));
  c = await codigos();
  ok(c.length === 1 && c[0] === "RB-0007",
     `«no asumidas» dejó ${c.join(", ")} y debe dejar solo RB-0007`);

  /* 4 · UNIDADES QUE CUENTAN → las roturas que hay DETRÁS de esas
     unidades. Son menos renglones que el número, y por eso el pie de
     la cifra lo dice. */
  await pg.click(cifra(4));
  c = await codigos();
  ok(c.length === 1 && c[0] === "RB-0009",
     `«unidades que cuentan» dejó ${c.join(", ")} y debe dejar solo la que ya cuenta`);
  const pie4 = await pg.textContent(`${cifra(4)} .u`);
  ok(/visto bueno/.test(pie4), `el pie de la cuarta cifra dice «${pie4}» y no aclara qué cuenta`);

  /* NINGUNA CIFRA TRAE LA ANULADA. Las cuatro se cuentan sobre las
     vivas: si el filtro trajera una anulada, la lista no cuadraría con
     el número que se acaba de tocar. */
  for (const i of [1, 2, 3, 4]) {
    await pg.click(cifra(i));
    const cc = await codigos();
    ok(!cc.includes("RB-0006"), `la cifra ${i} trajo la rotura anulada: ${cc.join(", ")}`);
    await pg.click(cifra(i));
  }

  /* «QUITAR FILTROS» APAGA TAMBIÉN LA CIFRA, y esto es lo que evita el
     susto: con la cifra puesta y el botón apagándolo todo menos ella,
     la lista se queda corta y parece que se borraron registros. */
  await pg.click(cifra(3));
  await pg.click(".rt .filtros button:has-text('Quitar filtros')");
  ok(await n() === 4, "«Quitar filtros» no apaga la cifra encendida: la lista se queda corta sin decir por qué");
}

/* =====================================================================
   4 · EL BOTÓN DE REGISTRAR: ARRIBA EN PC, FLOTANTE EN CELULAR

   Nunca los dos a la vez: dos caminos a lo mismo en la misma pantalla
   hacen dudar de si hacen lo mismo.
   ===================================================================== */
{
  ok(await pg.isVisible(".rt .cabeza.lista .btn.oro"),
     "en PC no está el botón «+ Registrar rotura» arriba");
  ok(!(await pg.isVisible(".rt .mas")), "en PC salen los dos botones de registrar a la vez");

  /* Y LLEVA AL FORMULARIO. Un botón que no hace nada es peor que no
     tenerlo: se toca dos veces y se registra dos veces. */
  await pg.click(".rt .cabeza.lista .btn.oro");
  await pg.waitForSelector(".rt-rep", { timeout: 3000 });
  ok(!(await pg.isVisible(".rt .tabla")),
     "con el formulario abierto sigue la lista debajo: registrar es un solo módulo");
  await pg.click(".rt-rep .pie button:has-text('Cancelar')");
  await pg.waitForSelector(".rt .tabla");
}

/* =====================================================================
   5 · CELULAR: SE APILA, Y CADA DATO DICE QUÉ ES

   Ocho columnas no caben en 390 px. Arrastrar de lado deja el estado y
   el botón Ver fuera de la pantalla —justo lo que se viene a mirar—, y
   esconder columnas esconde quién registró, que es la mitad de una
   discusión de si la rotura fue del OL.
   ===================================================================== */
await monta(390, "", 1400);
{
  ok(!(await pg.isVisible(".rt .tb-cols")),
     "en celular sigue el encabezado de columnas, que ahí no encabeza nada");

  /* CADA DATO RECUPERA SU RÓTULO. Sin esto, «T1» suelto no se sabe si
     es el proceso, el turno o la calle. */
  const rotulos = await pg.$$eval(".rt .tf-proc, .rt .tf-und, .rt .tf-quien",
    (e) => e.map((x) => getComputedStyle(x, "::before").content));
  ok(rotulos.every((c) => c && c !== "none"),
     `en celular hay datos sin rótulo: ${JSON.stringify([...new Set(rotulos)])}`);

  ok(await pg.isVisible(".rt .mas"), "en celular no está el «+» flotante");
  ok(!(await pg.isVisible(".rt .cabeza.lista .btn.oro")),
     "en celular salen los dos botones de registrar a la vez");

  /* EL BOTÓN VER, DE ANCHO COMPLETO Y 44 px: es el que se toca con
     guante puesto. */
  const ver = await caja(".rt .tf .tf-ac .btn");
  ok(ver.h >= 44, `el botón Ver mide ${Math.round(ver.h)} px de alto y el mínimo del módulo es 44`);
}

/* =====================================================================
   6 · NADA SE SALE, Y LO QUE SE TOCA SE PUEDE TOCAR
   ===================================================================== */
console.log("");
for (const [nombre, ancho] of [["pc", 1440], ["tab", 820], ["cel", 390], ["360", 360]]) {
  await monta(ancho, "", 1400);
  const fuera = await pg.evaluate((w) => {
    const mal = [];
    document.querySelectorAll(".rt *").forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width && (r.right > w + 1 || r.left < -1)) {
        mal.push((e.className || e.tagName) + " → " + Math.round(r.right));
      }
    });
    return mal.slice(0, 3);
  }, ancho);
  ok(fuera.length === 0, `a ${ancho}px se sale del ancho: ${JSON.stringify(fuera)}`);

  /* LAS CIFRAS SE TOCAN: ahora son botones, así que entran en la regla
     de los 44 px como cualquier otro control del módulo. */
  const bajas = await pg.$$eval(".rt .cifras .cifra",
    (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)).filter((h) => h < 44));
  ok(bajas.length === 0, `a ${ancho}px hay cifras de ${JSON.stringify(bajas)} px: se tocan con guante`);
  console.log(`${nombre.padEnd(5)} ${String(ancho).padStart(4)}px  ${fuera.length ? "SE SALE" : "bien"}`);
}

/* =====================================================================
   7 · EN LOS SIETE TEMAS SE LEE

   El módulo sigue el tema, y esta lista es nueva: una pastilla de
   estado que en un tema quede del color del papel no se ve, y nadie
   avisa porque no hay error.
   ===================================================================== */
/* EL MEDIDOR TIENE QUE SABER LEER LOS DOS FORMATOS, y esto costó una
   tanda entera de rojos falsos.

   Chromium devuelve `rgb(30, 122, 60)` para un color escrito a mano,
   pero `color(srgb 0.518 0 0.097)` para uno que salió de `color-mix()`
   — y este módulo calcula media paleta con `color-mix`. Dividiendo
   entre 255 lo que ya viene entre 0 y 1, TODO da casi negro y el
   contraste sale 1.0: el arnés acusaba de ilegibles siete pastillas que
   se leen perfectamente.

   Un arnés que se pone rojo sobre código correcto se acaba apagando, y
   entonces deja de avisar de lo que sí importa. Por eso el medidor se
   arregla en vez de bajarle la exigencia. */
const CANAL = (c) => {
  const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  /* `color(srgb …)` ya viene de 0 a 1; `rgb(…)` viene de 0 a 255. Se
     distingue por el prefijo y no por el rango: un `rgb(0, 1, 0)`
     legítimo se confundiría con el otro formato. */
  return c.startsWith("color(") ? n : n.map((v) => v / 255);
};
const LUM = (c) => {
  const [r, g, b] = CANAL(c).map((s) =>
    s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const CONTRA = (a, b) => {
  const [x, y] = [LUM(a), LUM(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
console.log("");
for (const tema of ["oficial", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, tema);
  /* EL FONDO DE VERDAD SE BUSCA SUBIENDO. `.tf` no pinta fondo —lo
     pinta `.tabla`—, así que preguntarle su `backgroundColor` devuelve
     transparente. Comparar tinta contra «transparente» es comparar
     contra negro, y ahí el arnés vuelve a mentir: el código de la
     rotura salía 3.8 cuando sobre el papel real está por encima de 5. */
  const m = await pg.evaluate(() => {
    const detras = (e) => {
      for (let n = e; n; n = n.parentElement) {
        const b = getComputedStyle(n).backgroundColor;
        if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") return b;
      }
      return "rgb(255, 255, 255)";
    };
    const t = (s) => { const e = document.querySelector(s); if (!e) return null;
      const g = getComputedStyle(e);
      const b = g.backgroundColor;
      return [g.color, (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") ? b : detras(e.parentElement)] };
    return { esp: t(".rt .tf-pi.esperando"), cue: t(".rt .tf-pi.cuenta"),
             cod: t(".rt .tf-cod"), nom: t(".rt .tf-nom"), sub: t(".rt .tf-sub") };
  });
  const pares = [["esperando", m.esp], ["cuenta", m.cue], ["código", m.cod],
                 ["producto", m.nom], ["causa", m.sub]];
  /* 4.5 PARA EL TEXTO PEQUEÑO, que es lo que es todo esto. El código de
     la rotura es el identificador con el que se reclama: que sea gris
     no lo vuelve decorativo. */
  const c = ([, p]) => CONTRA(p[0], p[1]);
  const malos = pares.filter((x) => x[1] && c(x) < 4.5);
  ok(malos.length === 0,
     `en el tema ${tema} no se lee: ${malos.map((x) => `${x[0]} ${c(x).toFixed(1)}`).join(", ")}`);
  console.log(`${tema.padEnd(8)} ` + pares.map((x) => x[1]
    ? `${x[0]} ${c(x).toFixed(1)}` : `${x[0]} —`).join("  "));
}

await monta();
await pg.screenshot({ path: ".arnes/rt-lista-pc.png" });
await monta(390, "", 1400);
await pg.screenshot({ path: ".arnes/rt-lista-cel.png", fullPage: true });

await nav.close();
console.log("");
if (fallas.length) {
  console.log("FALLAS:");
  fallas.forEach((f) => console.log(" · " + f));
  process.exit(1);
}
console.log("✓ «Lo que se rompió»: las 8 columnas caen en la misma vertical y su rótulo encima, " +
  "las cuatro cifras filtran de verdad y se apagan, la anulada no sale sin pedirla, el filo rojo " +
  "solo en la no asumida, en celular se apila con rótulo por dato, y nada se sale en los cuatro " +
  "anchos ni se pierde en los siete temas.");
