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

/* QUE EL ARNÉS HABLE AUNQUE SE CAIGA.
   Al romper el código a propósito para comprobar que este arnés muerde,
   pasó esto: la comprobación SÍ registró la falla, y dos pasos después
   el guion se murió esperando un botón que ya no existía. Lo único que
   se veía era un «Timeout» de Playwright — cierto, inútil, y que no
   distingue «lo rompí yo» de «se rompió el arnés». Ahora, pase lo que
   pase, primero se imprime lo que ya se sabía que estaba mal. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

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
    <Filtros hoy="2026-09-23" cuenta="1 salida en el filtro" campos={[
      { clave: "placa", rotulo: "Placa", todas: "todas", opciones: ${placas} },
      { clave: "color", rotulo: "Color", todas: "todos", opciones: [
        { id: "ambar", nombre: "Ámbar" }, { id: "flint", nombre: "Flint" },
        { id: "green", nombre: "Green" }] },
      { clave: "tolva", rotulo: "Tolva", todas: "todas", opciones: [
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
    chips: [...document.querySelectorAll(".filtros-inf .chip")].map((c) => c.textContent.trim()),
    cal: !!document.querySelector(".filtros-inf .cal"),
    selects: document.querySelectorAll(".filtros-inf .chip > select").length,
    cuantas: document.querySelector(".filtros-inf .cuantas")?.textContent.trim() ?? "",
    alto: Math.round(document.querySelector(".filtros-inf").getBoundingClientRect().height),
  }));

  /* UNA SOLA LÍNEA: el chip de fecha y uno por dimension, cada uno con
     su rotulo Y SU VALOR. No hay que abrir nada para saber que hay
     puesto — que es justo lo que evita leer una cifra filtrada
     creyendo que es el total. */
  ok(r.chips.length === 4, `deberian ser cuatro chips y son ${r.chips.length}`);
  ok(/Todo el hist/.test(r.chips[0]), `el chip de fecha dice «${r.chips[0]}»`);
  for (const [i, q] of [[1, "Placa"], [2, "Color"], [3, "Tolva"]]) {
    ok(r.chips[i].startsWith(q), `el chip ${i} deberia empezar con «${q}» y dice «${r.chips[i]}»`);
    ok(/todas|todos/.test(r.chips[i]), `el chip «${q}» no dice su valor: «${r.chips[i]}»`);
  }
  ok(!r.cal, "el calendario arranca abierto y deberia abrirse solo al tocarlo");
  ok(r.alto <= 76, `la barra mide ${r.alto} px: no es una sola linea`);
  ok(r.cuantas.includes("1 salida"), `la barra no dice cuantas quedaron: «${r.cuantas}»`);

  /* LOS TRES LLEVAN UN `select` DE VERDAD ENCIMA. Es lo que hace que en
     el celular salga el selector del sistema y no una lista dibujada. */
  ok(r.selects === 3, `hay ${r.selects} select de verdad y deben ser tres`);
}

/* 3b. Y DE VERDAD FILTRAN. */
{
  await pg.evaluate(() => { window.__ruta = "" });
  await pg.selectOption(".filtros-inf .chip:has(> b:text-is('Color')) select", "ambar");
  const u = await pg.evaluate(() => window.__ruta);
  ok(/color=ambar/.test(u ?? ""), `escoger «Ámbar» no puso el filtro en la direccion: «${u}»`);
}
{
  /* EL QUE TIENE ALGO PUESTO SE PINTA DISTINTO. Sin eso hay que leer
     los cuatro chips para saber si la cifra de al lado es el total. */
  await pg.evaluate(() => { window.__q = "color=ambar" });
  await monta();
  const d = await pg.evaluate(() => ({
    encendidos: [...document.querySelectorAll(".filtros-inf .chip.on")].map((c) => c.textContent.trim()),
    limpiar: !!document.querySelector(".filtros-inf .limpiar"),
  }));
  ok(d.encendidos.length === 1 && /Color/.test(d.encendidos[0]),
     `deberia estar encendido solo el de color: ${JSON.stringify(d.encendidos)}`);
  ok(d.limpiar, "con un filtro puesto no sale «Limpiar»");
}
{
  await pg.evaluate(() => { window.__q = "" });
  await monta();
  ok(!(await pg.isVisible(".filtros-inf .limpiar")),
     "sin filtros puestos igual sale «Limpiar»: es un boton que no hace nada");
}

/* 3c. EL CALENDARIO: atajos a un lado, dos meses al otro, y no se
       aplica hasta que se toca «Aplicar». */
{
  await pg.click(".filtros-inf .chip.fecha");
  const c = await pg.evaluate(() => ({
    atajos: [...document.querySelectorAll(".filtros-inf .cal-atajos button")]
      .map((b) => b.textContent.trim()),
    meses: [...document.querySelectorAll(".filtros-inf .cal-mes-t")].map((m) => m.textContent.trim()),
    /* LUNES PRIMERO: `getUTCDay()` cuenta desde el domingo y un
       calendario corrido un dia se lee mal sin que nadie sepa por que. */
    primerRotulo: document.querySelector(".filtros-inf .cal-dia-r")?.textContent.trim(),
    aplicar: !!document.querySelector(".filtros-inf .cal-si"),
    ...(() => {
      const ds = [...document.querySelectorAll(".filtros-inf .cal-mes")][0]
        .querySelectorAll(".cal-d");
      const ys = [...ds].map((e) => Math.round(e.getBoundingClientRect().y));
      const filas = [...new Set(ys)].sort((a, b) => a - b);
      /* Un día está «fuera de su fila» si su y no coincide con la de
         ninguno de sus vecinos de la misma semana. Se mide contando
         cuántas y distintas hay: un mes cabe en 6 semanas como mucho. */
      return { renglones: filas.length,
               desalineados: filas.filter((f) => ys.filter((y) => y === f).length === 1).length };
    })(),
  }));
  for (const a of ["Hoy", "Ayer", "Últimos 7 días", "Este mes", "Mes pasado", "Este año", "Todo"]) {
    ok(c.atajos.includes(a), `falta el atajo «${a}»: ${JSON.stringify(c.atajos)}`);
  }
  ok(c.meses.length === 2, `el calendario muestra ${c.meses.length} mes(es) y deben ser dos`);
  ok(c.meses[0] === "Septiembre" && c.meses[1] === "Octubre",
     `deberia abrir en septiembre y octubre: ${JSON.stringify(c.meses)}`);
  ok(c.primerRotulo === "L", `la semana empieza en «${c.primerRotulo}» y debe empezar en lunes`);
  /* QUE LA REJILLA SIGA SIENDO UNA REJILLA. Un día con un margen que no
     le toca se baja un renglón él solo y le abre un hueco al mes: pasó
     con `.rt .hoy`, que ya existía en el módulo. No da error de nada y
     en una captura parece un día perdido. */
  ok(c.renglones <= 6 && c.desalineados === 0,
     `el mes quedó en ${c.renglones} renglones con ${c.desalineados} día(s) fuera de su fila`);
  ok(c.aplicar, "el calendario no tiene «Aplicar»");
}
{
  /* TOCAR UN ATAJO NO RECARGA NADA: se aplica con «Aplicar». Escoger un
     rango son dos toques y el primero deja un rango que nadie pidio. */
  await pg.evaluate(() => { window.__ruta = "" });
  await pg.click('.filtros-inf .cal-atajos button:text-is("Este mes")');
  ok((await pg.evaluate(() => window.__ruta)) === "",
     "tocar un atajo ya recargo la pantalla: deberia esperar a «Aplicar»");
  const frase = await pg.textContent(".filtros-inf .cal-frase");
  ok(/septiembre/.test(frase ?? ""), `el pie no dice lo escogido: «${frase}»`);
  await pg.click(".filtros-inf .cal-si");
  const u = await pg.evaluate(() => window.__ruta);
  ok(/desde=2026-09-01/.test(u ?? "") && /hasta=2026-09-23/.test(u ?? ""),
     `«Este mes» + Aplicar no puso el rango: «${u}»`);
  ok(!(await pg.evaluate(() => !!document.querySelector(".filtros-inf .cal"))),
     "aplicar dejo el calendario abierto");
}
{
  /* DOS TOQUES EN EL CALENDARIO HACEN UN RANGO, Y AL REVES TAMBIEN:
     quien toca 23 y despues 7 quiere del 7 al 23, no un error. */
  await pg.evaluate(() => { window.__q = ""; window.__ruta = "" });
  await monta();
  await pg.click(".filtros-inf .chip.fecha");
  await pg.click('.filtros-inf .cal-mes:first-child .cal-d:text-is("23")');
  await pg.click('.filtros-inf .cal-mes:first-child .cal-d:text-is("7")');
  const frase = await pg.textContent(".filtros-inf .cal-frase");
  ok(/lunes 7/.test(frase ?? "") && /23/.test(frase ?? "") && /17 días/.test(frase ?? ""),
     `tocar 23 y luego 7 deberia dar del 7 al 23 y 17 dias: «${frase}»`);
  const medio = await pg.evaluate(() =>
    document.querySelectorAll(".filtros-inf .cal-d.medio").length);
  ok(medio === 15, `el tramo pintado tiene ${medio} dias y deberian ser 15 (sin las puntas)`);
  await pg.click(".filtros-inf .cal-si");
  const u = await pg.evaluate(() => window.__ruta);
  ok(/desde=2026-09-07/.test(u ?? "") && /hasta=2026-09-23/.test(u ?? ""),
     `el rango tocado a mano no quedo en la direccion: «${u}»`);
}
{
  /* CANCELAR NO DEJA NADA. */
  await pg.evaluate(() => { window.__q = ""; window.__ruta = "" });
  await monta();
  await pg.click(".filtros-inf .chip.fecha");
  await pg.click('.filtros-inf .cal-atajos button:text-is("Hoy")');
  await pg.click(".filtros-inf .cal-no");
  ok((await pg.evaluate(() => window.__ruta)) === "", "«Cancelar» aplico el rango igual");
  ok(!(await pg.evaluate(() => !!document.querySelector(".filtros-inf .cal"))),
     "«Cancelar» dejo el calendario abierto");
}

/* 3d. CON VEINTE PLACAS LA BARRA NO CRECE. */
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
  const d = await pg.evaluate(() => ({
    alto: Math.round(document.querySelector(".filtros-inf").getBoundingClientRect().height),
    placas: [...document.querySelectorAll(".filtros-inf .chip > select option")]
      .filter((o) => /^PL\d{4}$/.test(o.textContent?.trim() ?? "")).length,
  }));
  ok(d.alto <= 76, `con veinte placas la barra crecio a ${d.alto} px`);
  ok(d.placas === 20, `la lista trae ${d.placas} placas y no las 20`);
}

/* ======================= 4 · QUE SE LEA, EN LOS SIETE TEMAS ============ */
/* CON UN FILTRO PUESTO, a propósito: el chip encendido y «Limpiar» solo
   existen cuando hay algo puesto, y son justo los dos que cambian de
   color. Medirlos con la barra vacía es no medirlos. */
await pg.evaluate(() => { window.__q = "color=ambar" });
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
  /* CON EL CALENDARIO ABIERTO: ahí viven la mitad de los colores, y
     cerrado no hay ninguno que medir. */
  await pg.click(".filtros-inf .chip.fecha").catch(() => {});
  await pg.click('.filtros-inf .cal-atajos button:text-is("Este mes")').catch(() => {});
  const m = await pg.evaluate(() => {
    const fondo = (e) => {
      for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c }
      return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s);
                         return e ? { txt: getComputedStyle(e).color, fondo: fondo(e) } : { falta: s } };
    return {
      "el rótulo de un chip apagado": par(".filtros-inf .chip:not(.on) > b"),
      "el valor de un chip apagado": par(".filtros-inf .chip:not(.on) .flojo"),
      "el rótulo del chip prendido": par(".filtros-inf .chip.on > b"),
      "el valor del chip prendido": par(".filtros-inf .chip.on .flojo"),
      "cuántas quedaron": par(".filtros-inf .cuantas"),
      "«Limpiar»": par(".filtros-inf .limpiar"),
      "un atajo del calendario": par(".filtros-inf .cal-atajos button:not(.on)"),
      "el atajo escogido": par(".filtros-inf .cal-atajos button.on"),
      "el rótulo del día": par(".filtros-inf .cal-dia-r"),
      "un día suelto": par(".filtros-inf .cal-d:not(.punta):not(.medio)"),
      "un día del tramo": par(".filtros-inf .cal-d.medio"),
      "la punta del rango": par(".filtros-inf .cal-d.punta"),
      "el pie del calendario": par(".filtros-inf .cal-frase"),
      "«Aplicar»": par(".filtros-inf .cal-si"),
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
  /* ABIERTO, porque lo que se sale de lado se sale adentro del flotante. */
  await pg.click(".filtros-inf .chip.fecha").catch(() => {});
  const g = await pg.evaluate(() => {
    const caja = document.querySelector(".filtros-inf").getBoundingClientRect();
    /* LOS DÍAS DEL CALENDARIO NO ENTRAN EN EL MÍNIMO DE 40 px: son 34 y
       van pegados en rejilla, como en cualquier calendario del sistema.
       Medirlos con la misma vara que un botón haría fallar por algo que
       está bien; lo que sí se mide es que no se salgan del marco. */
    const tocables = [...document.querySelectorAll(
      ".filtros-inf button, .filtros-inf input, .filtros-inf select")]
      .filter((e) => !e.classList.contains("cal-d"))
      /* Y LOS ATAJOS DEL CELULAR TAMPOCO, para «salirse del marco»: ahí
         son una fila que SE DESLIZA a propósito, y una fila que se
         desliza tiene que sobresalir de su caja o no habría qué
         deslizar. Que la fila misma quepa se mide abajo, con el resto. */
      .filter((e) => !e.closest(".cal-atajos"));
    return {
      lado: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fuera: tocables.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5);
      }).length,
      chico: Math.min(...tocables.map((e) => Math.round(e.getBoundingClientRect().height))),
      /* EL DÍA MÁS ANGOSTO DEL CALENDARIO. Al esconder el segundo mes en
         el celular, el primero se quedaba del tamaño de su contenido y
         los días salían pegados —«10111213»—: cabe en el marco, mide
         42 px de alto y aun así no se puede tocar ni leer. */
      diaAncho: Math.min(...[...document.querySelectorAll(".filtros-inf .cal-d")]
        /* Solo los que se ven: el segundo mes está escondido en el
           celular y mediría cero. */
        .filter((e) => e.offsetParent !== null)
        .map((e) => Math.round(e.getBoundingClientRect().width))),
      /* EL CHIP DE FECHA ES EL MÁS LARGO: si no cabe, lo que se parte es
         justo el filtro que más se usa. */
      fecha: Math.round(
        document.querySelector(".filtros-inf .chip.fecha").getBoundingClientRect().width),
      /* CUÁNTO DEL RENGLÓN SE COME EL ATAJO MÁS ANCHO. Es lo único que
         distingue cuatro atajos parejos de tres arriba y uno estirado
         de lado a lado: los dos pasan todas las demás comprobaciones
         —nada se sale, todo se toca— y solo el segundo pinta una barra
         del ancho de la pantalla que se lee como el botón principal. */
      /* QUE EL FLOTANTE NO SE SALGA DE LA PANTALLA POR LA DERECHA. Es lo
         único que no atrapa «nada se sale del marco»: el calendario está
         posicionado y puede desbordar la ventana sin desbordar su caja. */
      calFuera: (() => {
        const c = document.querySelector(".filtros-inf .cal");
        if (!c) return 0;
        const r = c.getBoundingClientRect();
        return Math.max(0, Math.round(r.right - document.documentElement.clientWidth));
      })(),
    };
  });
  ok(g.lado <= 0, `${nombre} (${ancho}): la página se arrastra ${g.lado} px de lado`);
  ok(g.fuera === 0, `${nombre} (${ancho}): ${g.fuera} filtro(s) se salen del marco`);
  ok(g.chico >= 40, `${nombre} (${ancho}): algo que se toca mide ${g.chico} px de alto`);
  /* UN CAMPO DE FECHA DE 100 px NO SE PUEDE TOCAR, y menos con guante. */
  ok(g.fecha >= 180, `${nombre} (${ancho}): el chip de fecha mide ${g.fecha} px y no cabe lo que dice`);
  ok(g.diaAncho >= 30,
     `${nombre} (${ancho}): un día del calendario mide ${g.diaAncho} px de ancho y los números se pegan`);
  ok(g.calFuera === 0,
     `${nombre} (${ancho}): el calendario se sale ${g.calFuera} px por la derecha de la pantalla`);
  await pg.screenshot({ path: `.arnes/rs-analisis-${ancho}.png` });
}

await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Los dos análisis filtran: la barra es UNA línea de chips que dicen su valor y se pintan cuando tienen algo puesto; " +
            "el de fecha abre un calendario flotante con atajos y dos meses, que empieza en lunes, arma el rango en dos toques " +
            "—al derecho y al revés— y no aplica nada hasta «Aplicar». " +
            "El rango de Salida mira la fecha en que SALIÓ y el de En sitio la del reporte, el color mira las líneas y dos filtros se cruzan. " +
            "Veinte placas no le agregan un renglón, y se lee en los siete temas y en los cinco anchos.");
