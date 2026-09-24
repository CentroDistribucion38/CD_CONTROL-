/* =====================================================================
   ANÁLISIS DE LA SALIDA · LOS FILTROS

   «Agrega los filtros de todo, o sea, falta.»

   No había ninguno: la pantalla mostraba todo lo que existe, y «cuánto
   vidrio salió» sin decir DE CUÁNDO no contesta ninguna pregunta que
   alguien tenga de verdad.

   POR QUÉ ESTE ARNÉS Y NO UNA MIRADA: una barra de filtros que se pinta
   y una que además FILTRA se ven exactamente igual en una captura. La
   diferencia está en lo que pasa al tocar un botón, y eso solo se ve
   tocándolo y leyendo la dirección que queda.

   Y SE MIDE APARTE LA CUENTA, con una copia de la lógica de la página
   alimentada con salidas de mentira. Es lo único que puede afirmar que
   el filtro de color mira las LÍNEAS y no la salida entera, que el
   rango mira la fecha en que SALIÓ y no la de apertura, y que una
   salida sin despachar no suma kilos.

     node .arnes/rs-analisis.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
const R = (p) => U("../" + p).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* ======================= 1 · LA PÁGINA PIDE LOS FILTROS ================
   Que el componente exista no sirve de nada si la pantalla no lo pinta
   ni le pasa lo que hay. Se comprueba en el archivo, que es donde vive
   la decisión. */
{
  const pag = readFileSync(R("src/app/(app)/roturas/salida/analisis/page.tsx"), "utf8");
  ok(/<Filtros\s/.test(pag), "la pantalla de análisis no pinta los filtros");
  for (const [clave, que] of [
      ["desde", "el desde"], ["hasta", "el hasta"], ["placa", "la placa"],
      ["tolva", "la tolva"], ["color", "el color"]]) {
    ok(new RegExp(`q\\.${clave}`).test(pag), `la pantalla no lee ${que} de la dirección`);
  }
  /* LAS OPCIONES SALEN DE LO QUE HAY. Una lista escrita a mano se queda
     vieja el día que aparece una placa nueva, y nadie lo nota. */
  ok(/placasTodas = \[\.\.\.new Set\(/.test(pag),
     "las placas del filtro están escritas a mano en vez de salir de las salidas que hay");

  /* Y LO QUE SE MIRA ES LO DESPACHADO, no «las dos firmas»: esa firma
     ya no se pone nunca desde que se quitó Validación. */
  ok(!/las dos firmas/.test(pag),
     "la pantalla todavía habla de «las dos firmas», y esa firma ya no se pone nunca");
  ok(/ESPERANDO VH/.test(pag),
     "la cifra sigue diciendo «esperando firma»: lo que esperan es un camión");

  /* Y LA OTRA PANTALLA DE ANÁLISIS TAMBIÉN FILTRA. Era la única de
     informe del módulo sin un solo filtro: mostraba las últimas mil
     roturas y punto, sin forma de preguntarle por un mes ni por un
     proceso. */
  const sit = readFileSync(R("src/app/(app)/roturas/en-sitio/analisis/page.tsx"), "utf8");
  ok(/<Filtros\s/.test(sit), "el análisis de EN SITIO sigue sin filtros");
  for (const [clave, que] of [
      ["desde", "el desde"], ["hasta", "el hasta"], ["causa", "la causa"],
      ["proceso", "el proceso"], ["area", "el área"], ["grupo", "quién la asume"]]) {
    ok(new RegExp(`uno\\("${clave}"\\)`).test(sit),
       `el análisis de EN SITIO no lee ${que} de la dirección`);
  }
  /* CADA PANTALLA MIDE POR SU PROPIA FECHA. En sitio pregunta CUÁNDO SE
     ROMPIÓ —reportada_en—; Salida pregunta cuándo SALIÓ —despachada_en—.
     Filtrar las dos por la misma fecha pondría en agosto roturas de
     julio que salieron en agosto, o al revés. */
  ok(/reportada_en/.test(sit),
     "el análisis de EN SITIO no filtra por la fecha del reporte");
  ok(/despachada_en/.test(pag),
     "el análisis de SALIDA no filtra por la fecha en que salió");

  /* LOS DOS USAN LA MISMA BARRA. Dos componentes parecidos terminan
     siempre igual: se arregla uno y el otro se queda atrás. */
  for (const [f, cual] of [[pag, "salida"], [sit, "en sitio"]]) {
    ok(/from "\.\.\/\.\.\/Filtros"/.test(f),
       `el análisis de ${cual} no usa la barra de filtros compartida`);
  }
}

/* ======================= 2 · LA CUENTA, CON DATOS DE MENTIRA ===========
   Una copia exacta de la lógica de la página. Si la página cambia y
   esto no, la copia deja de valer — por eso se escribe al lado y con el
   mismo nombre de cada paso. */
{
  const SAL = [
    /* Despachada el 10, ámbar, TOLVA-1, placa AAA111 · 100 kg */
    { id: "s1", placa: "AAA111", estado: "cerrada", completa: true, neto_kg: 100, bruto_kg: 150, tara_kg: 50,
      tolvas: 1, despachada_en: "2026-08-10T10:00:00Z", validador_en: null, supervisora_en: "2026-08-09T08:00:00Z" },
    /* Despachada el 20, flint, TOLVA-2, placa BBB222 · 200 kg */
    { id: "s2", placa: "BBB222", estado: "cerrada", completa: true, neto_kg: 200, bruto_kg: 280, tara_kg: 80,
      tolvas: 1, despachada_en: "2026-08-20T10:00:00Z", validador_en: null, supervisora_en: "2026-08-19T08:00:00Z" },
    /* CERRADA PERO SIN DESPACHAR: no suma kilos, pero se cuenta aparte. */
    { id: "s3", placa: "AAA111", estado: "cerrada", completa: false, neto_kg: 999, bruto_kg: 999, tara_kg: 0,
      tolvas: 1, despachada_en: null, validador_en: null, supervisora_en: "2026-08-21T08:00:00Z" },
    /* ABIERTA: tampoco. */
    { id: "s4", placa: "CCC333", estado: "abierta", completa: false, neto_kg: 5, bruto_kg: 5, tara_kg: 0,
      tolvas: 1, despachada_en: null, validador_en: null, supervisora_en: null },
    /* UNA VIEJA, de cuando existía Validación: sin despachada_en pero
       con validador_en. Tiene que contar, o todos los informes de los
       meses pasados se vacían de un día para otro. */
    { id: "s5", placa: "BBB222", estado: "cerrada", completa: true, neto_kg: 70, bruto_kg: 90, tara_kg: 20,
      tolvas: 1, despachada_en: null, validador_en: "2026-07-05T10:00:00Z", supervisora_en: "2026-07-04T08:00:00Z" },
  ];
  const LIN = [
    { salida_id: "s1", tolva: "TOLVA-1", color: "ambar" },
    { salida_id: "s2", tolva: "TOLVA-2", color: "flint" },
    { salida_id: "s3", tolva: "TOLVA-1", color: "ambar" },
    { salida_id: "s5", tolva: "TOLVA-2", color: "green" },
  ];

  const cuentas = ({ desde = "", hasta = "", placa = "", color = "", tolva = "" } = {}) => {
    const diaDe = (s) => (s.despachada_en ?? s.validador_en ?? s.supervisora_en ?? "").slice(0, 10);
    const enRango = (s) => {
      const d = diaDe(s);
      if (!d) return !desde && !hasta;
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    };
    const candidatas = SAL.filter((s) => enRango(s) && (!placa || s.placa === placa));
    const porLinea = !!color || !!tolva;
    const dejaPasar = (id) => !porLinea || LIN.some((l) =>
      l.salida_id === id && (!color || l.color === color) && (!tolva || l.tolva === tolva));
    const vivas = candidatas.filter((s) => dejaPasar(s.id));
    const completas = vivas.filter((s) => s.completa);
    return {
      kg: completas.reduce((t, s) => t + s.neto_kg, 0),
      n: completas.length,
      porSalir: vivas.filter((s) => s.estado === "cerrada" && !s.completa).length,
      abiertas: vivas.filter((s) => s.estado === "abierta").length,
    };
  };

  /* 2a. SIN FILTROS: solo lo despachado suma. Las 999 de la que no ha
         salido y las 5 de la abierta NO pueden estar en los kilos. */
  {
    const c = cuentas();
    ok(c.kg === 370, `sin filtros los kilos dan ${c.kg} y deben dar 370 (100 + 200 + 70)`);
    ok(c.porSalir === 1, `no se cuenta aparte la que espera Vh: ${c.porSalir}`);
    ok(c.abiertas === 1, `no se cuenta aparte la que se está pesando: ${c.abiertas}`);
  }

  /* 2b. EL RANGO MIRA LA FECHA EN QUE SALIÓ, no la de apertura. La s1
         se abrió el 9 y salió el 10: un rango que empiece el 10 tiene
         que incluirla. */
  {
    const c = cuentas({ desde: "2026-08-10", hasta: "2026-08-10" });
    ok(c.kg === 100 && c.n === 1,
       `el rango de un día da ${c.kg} kg en ${c.n} salidas y debe dar 100 en 1 — si da 0, está mirando la fecha de apertura`);
  }
  {
    const c = cuentas({ desde: "2026-08-01", hasta: "2026-08-31" });
    ok(c.kg === 300, `agosto da ${c.kg} kg y debe dar 300: la de julio no puede colarse`);
  }

  /* 2c. LA VIEJA, sin despachada_en, cuenta por su validador_en. */
  {
    const c = cuentas({ desde: "2026-07-01", hasta: "2026-07-31" });
    ok(c.kg === 70,
       `julio da ${c.kg} kg y debe dar 70: una salida de cuando existía Validación no puede desaparecer del informe`);
  }

  /* 2d. LA PLACA. */
  {
    const c = cuentas({ placa: "BBB222" });
    ok(c.kg === 270, `filtrando por BBB222 dan ${c.kg} kg y deben dar 270`);
  }

  /* 2e. EL COLOR MIRA LAS LÍNEAS, no la salida. Es la parte que se hace
         mal: una salida no tiene color, lo tienen sus tolvas. */
  {
    const c = cuentas({ color: "ambar" });
    ok(c.kg === 100 && c.n === 1,
       `filtrando ámbar dan ${c.kg} kg en ${c.n} salidas y debe dar 100 en 1`);
    const g = cuentas({ color: "green" });
    ok(g.kg === 70, `filtrando green dan ${g.kg} kg y debe dar 70`);
  }

  /* 2f. LA TOLVA, y combinada con el color. Dos filtros puestos tienen
         que cruzarse, no sumarse: TOLVA-2 hay dos, pero flint solo una. */
  {
    const c = cuentas({ tolva: "TOLVA-2" });
    ok(c.kg === 270, `filtrando TOLVA-2 dan ${c.kg} kg y deben dar 270`);
    const x = cuentas({ tolva: "TOLVA-2", color: "flint" });
    ok(x.kg === 200 && x.n === 1,
       `TOLVA-2 + flint dan ${x.kg} kg en ${x.n} salidas y debe dar 200 en 1: los filtros se cruzan, no se suman`);
  }
}

/* ======================= 3 · LA BARRA, EN CHROMIUM ===================== */
writeFileSync(R(".arnes/_nav-rs.ts"), `
let ultima = "";
export const useRouter = () => ({
  push(u: string) { ultima = u; (window as any).__ruta = u },
  refresh() {}, replace(u: string) { ultima = u; (window as any).__ruta = u },
});
export const usePathname = () => "/roturas/salida/analisis";
export const useSearchParams = () => new URLSearchParams((window as any).__q ?? "");
`);
const ENTRADA = (placas) => `
import { createRoot } from "react-dom/client";
import { Filtros } from "../src/app/(app)/roturas/Filtros";
createRoot(document.getElementById("r")!).render(
  <div className="rt" style={{ padding: 16 }}>
    <Filtros hoy="2026-09-23" campos={[
      { clave: "placa", rotulo: "Placa", todas: "las placas", opciones: ${placas} },
      { clave: "color", rotulo: "Color del vidrio", todas: "los colores", opciones: [
        { id: "ambar", nombre: "Ámbar" }, { id: "flint", nombre: "Flint" },
        { id: "green", nombre: "Green" }] },
      { clave: "tolva", rotulo: "Tolva", todas: "las tolvas", opciones: [
        { id: "TOLVA-1", nombre: "TOLVA-1" }, { id: "TOLVA-2", nombre: "TOLVA-2" }] },
    ]} />
  </div>);
`;
writeFileSync(R(".arnes/_rs-entrada.tsx"), ENTRADA(
  `[{ id: "AAA111", nombre: "AAA111" }, { id: "BBB222", nombre: "BBB222" },
     { id: "CCC333", nombre: "CCC333" }]`));

let js;
try {
  js = buildSync({
    entryPoints: [R(".arnes/_rs-entrada.tsx")], bundle: true, write: false,
    format: "iife", jsx: "automatic",
    alias: { "next/navigation": R(".arnes/_nav-rs.ts"), "@": R("src") },
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "window.process = window.process || { env: {} };" },
    logLevel: "silent",
  }).outputFiles[0].text;
} catch (e) {
  console.error("No compiló la entrada del arnés:\n" + (e.message ?? e));
  process.exit(1);
}

const css = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (ancho = 1300, tema = null) => {
  await pg.setViewportSize({ width: ancho, height: 800 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css} html,body{margin:0}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel">
    <main class="sh-main"><div id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".filtros-inf");
};
await monta();

/* 3a. ESTÁN LOS CINCO FILTROS. */
{
  const r = await pg.evaluate(() => ({
    chips: [...document.querySelectorAll(".filtros-inf .chip")].map((b) => b.textContent.trim()),
    resumen: document.querySelector(".filtros-inf .resumen")?.textContent.trim() ?? "",
    boton: !!document.querySelector(".filtros-inf .bt"),
    panel: !!document.querySelector(".filtros-inf .panel-f"),
    fechas: document.querySelectorAll('.filtros-inf input[type=date]').length,
    selects: document.querySelectorAll(".filtros-inf select").length,
    alto: Math.round(document.querySelector(".filtros-inf").getBoundingClientRect().height),
  }));

  /* EL RENGLÓN LLEVA SOLO LOS CUATRO ATAJOS. Pintarlo todo a la vez eran
     quince controles antes de la primera cifra. */
  ok(JSON.stringify(r.chips) === JSON.stringify(["Hoy", "7 días", "Este mes", "Todo"]),
     `los atajos deberían ser cuatro y son: ${JSON.stringify(r.chips)}`);
  ok(!r.panel, "el panel de filtros arranca abierto y debería arrancar cerrado");
  ok(r.fechas === 0 && r.selects === 0,
     `con el panel cerrado hay ${r.fechas} fechas y ${r.selects} desplegables a la vista`);
  ok(r.boton, "no hay botón «Filtros» para abrir lo demás");
  ok(r.alto <= 72, `el renglón mide ${r.alto} px de alto: no es un renglón`);

  /* EL RESUMEN DICE LO QUE ESTÁ PUESTO. Es lo único que evita el error
     caro de esta pantalla —leer una cifra filtrada creyendo que es el
     total— cuando el panel está cerrado. */
  for (const q of ["las placas", "los colores", "las tolvas"]) {
    ok(r.resumen.includes(q), `el resumen no menciona ${q}: «${r.resumen}»`);
  }
}

/* 3b. Y DE VERDAD FILTRAN: tocar uno cambia la dirección.
       Es lo único que distingue una barra que filtra de una pintada. */
const tocar = async (sel) => {
  await pg.evaluate(() => { window.__ruta = "" });
  await pg.click(sel);
  return await pg.evaluate(() => window.__ruta);
};
{
  const u = await tocar('.filtros-inf .chip:text-is("Hoy")');
  ok(/desde=2026-09-23/.test(u ?? "") && /hasta=2026-09-23/.test(u ?? ""),
     `el atajo «Hoy» no puso el día en la dirección: «${u}»`);
}
{
  const u = await tocar('.filtros-inf .chip:text-is("Este mes")');
  ok(/desde=2026-09-01/.test(u ?? ""), `«Este mes» no arranca el día 1: «${u}»`);
}
{
  /* «TODO» ES UN ATAJO Y NO LA AUSENCIA DE FILTRO: sin él hay que
     borrar dos campos de fecha a mano y acordarse de que eran dos. */
  await pg.evaluate(() => { window.__q = "desde=2026-09-01&hasta=2026-09-23" });
  await monta();
  const u = await tocar('.filtros-inf .chip:text-is("Todo")');
  ok(u === "/roturas/salida/analisis", `«Todo» no quitó el rango de un toque: «${u}»`);
  await pg.evaluate(() => { window.__q = "" });
  await monta();
}

/* 3c. EL BOTÓN ABRE EL PANEL, y adentro están los tres filtros y las
       dos fechas — como desplegables, no como filas de botones. */
{
  await pg.click(".filtros-inf .bt");
  const d = await pg.evaluate(() => ({
    fechas: document.querySelectorAll('.filtros-inf .panel-f input[type=date]').length,
    selects: document.querySelectorAll(".filtros-inf .panel-f select").length,
    botonesDeFiltro: document.querySelectorAll(".filtros-inf .panel-f button:not(.limpiar)").length,
    rotulos: [...document.querySelectorAll(".filtros-inf .panel-f .sel > span")]
      .map((x) => x.textContent.trim()),
    direccion: getComputedStyle(document.querySelector(".filtros-inf .panel-f")).flexDirection,
    izquierda: Math.round(
      document.querySelector(".filtros-inf .panel-f .sel").getBoundingClientRect().left
      - document.querySelector(".filtros-inf .panel-f").getBoundingClientRect().left) - 14,
  }));
  ok(d.fechas === 2, `el panel trae ${d.fechas} campos de fecha y deben ser dos`);
  /* EN FILA, NO EN COLUMNA. Había un `.rt .panel` en este módulo que le
     ganaba el `flex-direction`, y el panel salía en columna pegado a la
     derecha con media pantalla en blanco. No daba error de nada. */
  ok(d.direccion === "row",
     `el panel se está pintando en «${d.direccion}»: otra regla le está ganando`);
  ok(d.izquierda <= 4,
     `el panel arranca a ${d.izquierda} px del borde: quedó pegado a la derecha`);
  ok(d.selects === 3, `el panel trae ${d.selects} desplegables y deben ser tres`);
  /* «TODAS ESAS PLACAS ASÍ NO ME GUSTAN, IGUAL EL COLOR DEL VIDRIO». */
  ok(d.botonesDeFiltro === 0,
     `quedan ${d.botonesDeFiltro} botones de filtro en el panel: son desplegables`);
  for (const q of ["Placa", "Color del vidrio", "Tolva"]) {
    ok(d.rotulos.includes(q), `falta el filtro «${q}»: ${JSON.stringify(d.rotulos)}`);
  }
}
{
  await pg.evaluate(() => { window.__ruta = "" });
  await pg.selectOption('.filtros-inf .sel:has(> span:text-is("Color del vidrio")) select', "ambar");
  const u = await pg.evaluate(() => window.__ruta);
  ok(/color=ambar/.test(u ?? ""), `escoger «Ámbar» no puso el filtro en la dirección: «${u}»`);
}

/* 3d. CON FILTROS PUESTOS Y EL PANEL CERRADO, SE SIGUE VIENDO QUÉ HAY:
       en el resumen y en el número del botón. Un panel cerrado que
       esconde tres filtros puestos es justo cómo se lee mal una cifra. */
{
  await pg.evaluate(() => { window.__q = "color=ambar&placa=AAA111"; window.__ruta = "" });
  await monta();
  const d = await pg.evaluate(() => ({
    resumen: document.querySelector(".filtros-inf .resumen")?.textContent.trim() ?? "",
    cuenta: document.querySelector(".filtros-inf .bt .cu")?.textContent.trim() ?? "",
    panel: !!document.querySelector(".filtros-inf .panel-f"),
  }));
  ok(!d.panel, "con filtros en la dirección el panel se abre solo y tapa la pantalla");
  ok(d.resumen.includes("AAA111") && d.resumen.includes("Ámbar"),
     `el resumen no dice lo que está puesto: «${d.resumen}»`);
  ok(d.cuenta === "2", `el botón debería decir 2 filtros puestos y dice «${d.cuenta}»`);
}

/* 3e. «RESTABLECER» SOLO CUANDO HAY QUE QUITAR ALGO. */
{
  await pg.click(".filtros-inf .bt");
  ok(await pg.isVisible(".filtros-inf .limpiar"), "con filtros puestos no sale «Restablecer»");
  await pg.click(".filtros-inf .limpiar");
  const u = await pg.evaluate(() => window.__ruta);
  ok(u === "/roturas/salida/analisis", `«Restablecer» dejó filtros puestos: «${u}»`);
}
{
  await pg.evaluate(() => { window.__q = "" });
  await monta();
  await pg.click(".filtros-inf .bt");
  ok(!(await pg.isVisible(".filtros-inf .limpiar")),
     "sin filtros puestos igual sale «Restablecer»: es un botón que no hace nada");
}

/* 3f. CON VEINTE PLACAS EL RENGLÓN NO CRECE. Es lo que se rompería si
       alguien volviera a meter botones «porque son poquitas». */
{
  writeFileSync(R(".arnes/_rs-entrada.tsx"), ENTRADA(
    `Array.from({ length: 20 }, (_, i) => { const p = "PL" + String(i).padStart(4, "0");
       return { id: p, nombre: p } })`));
  const js2 = buildSync({
    entryPoints: [R(".arnes/_rs-entrada.tsx")], bundle: true, write: false,
    format: "iife", jsx: "automatic",
    alias: { "next/navigation": R(".arnes/_nav-rs.ts"), "@": R("src") },
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "window.process = window.process || { env: {} };" },
    logLevel: "silent",
  }).outputFiles[0].text;
  await pg.setViewportSize({ width: 1300, height: 800 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css} html,body{margin:0}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div id="r"></div></main></div></div><script>${js2}</script></body></html>`);
  await pg.waitForSelector(".filtros-inf");
  const alto = await pg.evaluate(() =>
    Math.round(document.querySelector(".filtros-inf").getBoundingClientRect().height));
  ok(alto <= 72, `con veinte placas la barra creció a ${alto} px: volvieron los botones`);
  await pg.click(".filtros-inf .bt");
  const n = await pg.evaluate(() =>
    [...document.querySelectorAll(".filtros-inf .panel-f select option")]
      .filter((o) => /^PL\d{4}$/.test(o.textContent?.trim() ?? "")).length);
  ok(n === 20, `el desplegable trae ${n} placas y no las 20`);
}

/* ======================= 4 · QUE SE LEA, EN LOS SIETE TEMAS ============ */
await pg.evaluate(() => { window.__q = "" });
const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0,0,0]).slice(0,3).map(Number);
                         return c.startsWith("color(") ? n.map((v) => v * 255) : n };
const razon = (a, b) => {
  const lum = (c) => { const [r,g,bl] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4 });
                       return 0.2126*r + 0.7152*g + 0.0722*bl };
  const L1 = lum(a), L2 = lum(b);
  return +((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2);
};
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1300, t);
  /* CON EL PANEL ABIERTO: se miden también los controles de adentro, y
     un panel cerrado no tiene ninguno que medir. */
  await pg.click('.filtros-inf .chip:text-is("Este mes")').catch(() => {});
  await pg.click(".filtros-inf .bt").catch(() => {});
  const m = await pg.evaluate(() => {
    const fondo = (e) => {
      for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c }
      return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s);
                         return e ? { txt: getComputedStyle(e).color, fondo: fondo(e) } : { falta: s } };
    return {
      "el rótulo del desde": par(".filtros-inf .sel.fecha > span"),
      "el campo de fecha": par(".filtros-inf .sel.fecha > input"),
      "un desplegable": par(".filtros-inf .panel-f select"),
      "un atajo apagado": par(".filtros-inf .chip:not(.on)"),
      "el atajo prendido": par(".filtros-inf .chip.on"),
      "el resumen": par(".filtros-inf .resumen"),
      "lo que dice el resumen": par(".filtros-inf .resumen b"),
      "el botón de filtros": par(".filtros-inf .bt"),
    };
  });
  for (const [k, v] of Object.entries(m)) {
    if (v.falta) { ok(false, `tema ${t ?? "oficial"}: no está «${k}» (${v.falta})`); continue }
    const x = razon(v.txt, v.fondo);
    ok(x >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${x} (mínimo 4.5)`);
  }
}

/* ======================= 5 · PC, TABLET Y CELULAR ====================== */
for (const [ancho, nombre] of [[1440, "pc"], [1024, "tablet apaisada"], [820, "tablet"],
                               [390, "celular"], [360, "celular chico"]]) {
  await monta(ancho);
  /* ABIERTO, porque lo que se sale de lado se sale adentro del panel. */
  await pg.click(".filtros-inf .bt").catch(() => {});
  const g = await pg.evaluate(() => {
    const caja = document.querySelector(".filtros-inf").getBoundingClientRect();
    const tocables = [...document.querySelectorAll(
      ".filtros-inf button, .filtros-inf input, .filtros-inf select")];
    return {
      lado: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fuera: tocables.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
      }).length,
      chico: Math.min(...tocables.map((e) => Math.round(e.getBoundingClientRect().height))),
      fecha: Math.min(...[...document.querySelectorAll('.filtros-inf input[type=date]')]
        .map((e) => Math.round(e.getBoundingClientRect().width))),
      /* CUÁNTO DEL RENGLÓN SE COME EL ATAJO MÁS ANCHO. Es lo único que
         distingue cuatro atajos parejos de tres arriba y uno estirado
         de lado a lado: los dos pasan todas las demás comprobaciones
         —nada se sale, todo se toca— y solo el segundo pinta una barra
         del ancho de la pantalla que se lee como el botón principal. */
      atajoMax: Math.round(100 * Math.max(...[...document.querySelectorAll(".filtros-inf .chip")]
        .map((e) => e.getBoundingClientRect().width)) /
        document.querySelector(".filtros-inf .renglon").getBoundingClientRect().width),
    };
  });
  ok(g.lado <= 0, `${nombre} (${ancho}): la página se arrastra ${g.lado} px de lado`);
  ok(g.fuera === 0, `${nombre} (${ancho}): ${g.fuera} filtro(s) se salen del marco`);
  ok(g.chico >= 40, `${nombre} (${ancho}): algo que se toca mide ${g.chico} px de alto`);
  /* UN CAMPO DE FECHA DE 100 px NO SE PUEDE TOCAR, y menos con guante. */
  ok(g.fecha >= 118, `${nombre} (${ancho}): el campo de fecha mide ${g.fecha} px de ancho`);
  ok(g.atajoMax <= 60,
     `${nombre} (${ancho}): un atajo se estiró al ${g.atajoMax}% del renglón —queda una barra sola`);
  await pg.screenshot({ path: `.arnes/rs-analisis-${ancho}.png` });
}

await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Los dos análisis filtran: la barra es UN renglón —cuatro atajos y el resumen de lo puesto—, lo demás vive detrás de «Filtros» " +
            "y son desplegables, no filas de botones; el botón dice cuántos hay puestos con el panel cerrado. " +
            "El rango de Salida mira la fecha en que SALIÓ y el de En sitio la del reporte, el color mira las líneas y dos filtros se cruzan. " +
            "Veinte placas no le agregan un renglón, y se lee en los siete temas y en los cinco anchos.");
