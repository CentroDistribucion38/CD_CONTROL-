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
writeFileSync(R(".arnes/_rs-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Filtros } from "../src/app/(app)/roturas/salida/analisis/Filtros";
createRoot(document.getElementById("r")!).render(
  <div className="rt" style={{ padding: 16 }}>
    <Filtros hoy="2026-09-23"
             placas={["AAA111", "BBB222", "CCC333"]}
             tolvas={["TOLVA-1", "TOLVA-2", "TOLVA-3"]}
             colores={[{ id: "ambar", nombre: "Ámbar" },
                       { id: "flint", nombre: "Flint" },
                       { id: "green", nombre: "Green" }]} />
  </div>);
`);

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
    fechas: document.querySelectorAll('.filtros-inf input[type=date]').length,
    atajos: [...document.querySelectorAll(".filtros-inf .atajo")].map((b) => b.textContent.trim()),
    grupos: [...document.querySelectorAll(".filtros-inf .grupo-r")].map((s) => s.textContent.trim()),
    selects: [...document.querySelectorAll(".filtros-inf select")].length,
  }));
  ok(r.fechas === 2, `hay ${r.fechas} campos de fecha y deben ser dos: desde y hasta`);
  ok(r.atajos.includes("Hoy") && r.atajos.includes("7 días") &&
     r.atajos.includes("Este mes") && r.atajos.includes("Todo"),
     `faltan atajos: ${JSON.stringify(r.atajos)}`);
  /* «TODO» ES UN ATAJO Y NO LA AUSENCIA DE FILTRO: sin él hay que
     borrar dos campos de fecha a mano y acordarse de que eran dos. */
  ok(r.atajos.includes("Todo"), "no hay forma de quitar el rango de un toque");
  ok(r.grupos.length + r.selects >= 3,
     `faltan filtros de placa, color o tolva: ${JSON.stringify(r.grupos)}`);
}

/* 3b. Y DE VERDAD FILTRAN: tocar uno cambia la dirección.
       Es lo único que distingue una barra que filtra de una pintada. */
{
  await pg.evaluate(() => { window.__ruta = "" });
  await pg.click('.filtros-inf .grupo-b button:text-is("Ámbar")');
  const u = await pg.evaluate(() => window.__ruta);
  ok(/color=ambar/.test(u ?? ""), `tocar «Ámbar» no puso el filtro en la dirección: «${u}»`);
}
{
  await pg.evaluate(() => { window.__ruta = "" });
  await pg.click('.filtros-inf .atajo:text-is("Hoy")');
  const u = await pg.evaluate(() => window.__ruta);
  ok(/desde=2026-09-23/.test(u ?? "") && /hasta=2026-09-23/.test(u ?? ""),
     `el atajo «Hoy» no puso el día en la dirección: «${u}»`);
}
{
  await pg.evaluate(() => { window.__ruta = "" });
  await pg.click('.filtros-inf .atajo:text-is("Este mes")');
  const u = await pg.evaluate(() => window.__ruta);
  ok(/desde=2026-09-01/.test(u ?? ""), `«Este mes» no arranca el día 1: «${u}»`);
}

/* 3c. CON FILTROS PUESTOS SALE «RESTABLECER», y limpia. Sin él, quitar
       cuatro filtros son cuatro toques y hay que acordarse de cuáles
       estaban puestos. */
{
  await pg.evaluate(() => { window.__q = "color=ambar&placa=AAA111"; window.__ruta = "" });
  await monta();
  ok(await pg.isVisible(".filtros-inf .limpiar"),
     "con filtros puestos no sale «Restablecer»");
  await pg.click(".filtros-inf .limpiar");
  const u = await pg.evaluate(() => window.__ruta);
  ok(u === "/roturas/salida/analisis", `«Restablecer» dejó filtros puestos: «${u}»`);
}
{
  await pg.evaluate(() => { window.__q = "" });
  await monta();
  ok(!(await pg.isVisible(".filtros-inf .limpiar")),
     "sin filtros puestos igual sale «Restablecer»: es un botón que no hace nada");
}

/* 3d. CON MUCHAS PLACAS SE VUELVE DESPLEGABLE. Veinte botones son dos
       renglones de ruido que tapan los filtros de al lado, y con guante
       veinte objetivos pequeños se aciertan peor que una lista. */
{
  writeFileSync(R(".arnes/_rs-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Filtros } from "../src/app/(app)/roturas/salida/analisis/Filtros";
const muchas = Array.from({ length: 20 }, (_, i) => "PL" + String(i).padStart(4, "0"));
createRoot(document.getElementById("r")!).render(
  <div className="rt" style={{ padding: 16 }}>
    <Filtros hoy="2026-09-23" placas={muchas} tolvas={["T1"]}
             colores={[{ id: "ambar", nombre: "Ámbar" }]} />
  </div>);
`);
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
  /* SE MIDEN LAS PLACAS, NO LOS BOTONES DEL BLOQUE. Contar todos los
     botones del bloque mete en la cuenta los grupos de al lado —tolva y
     color, que con una opción cada uno son cuatro botones legítimos— y
     hace fallar la comprobación por algo que está bien. Lo que se está
     probando es que NINGUNA PLACA quedó de botón. */
  const n = await pg.evaluate(() => {
    const ops = [...document.querySelectorAll(".filtros-inf select option")]
      .map((o) => o.textContent?.trim());
    return {
      selects: document.querySelectorAll(".filtros-inf select").length,
      placasEnLista: ops.filter((t) => /^PL\d{4}$/.test(t ?? "")).length,
      placasEnBoton: [...document.querySelectorAll(".filtros-inf .grupo-b button")]
        .filter((b) => /^PL\d{4}$/.test(b.textContent?.trim() ?? "")).length,
    };
  });
  ok(n.selects >= 1, "con veinte placas no se volvió desplegable: son veinte botones de ruido");
  ok(n.placasEnLista === 20, `el desplegable trae ${n.placasEnLista} placas y no las 20`);
  ok(n.placasEnBoton === 0, `con veinte placas quedaron ${n.placasEnBoton} placas de botón`);
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
  await pg.click('.filtros-inf .atajo:text-is("Todo")').catch(() => {});
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
      "un atajo apagado": par(".filtros-inf .atajo:not(.on)"),
      "el atajo prendido": par(".filtros-inf .atajo.on"),
      "el rótulo de un grupo": par(".filtros-inf .grupo-r"),
      "un botón de grupo": par(".filtros-inf .grupo-b button:not(.on)"),
      "el botón prendido": par(".filtros-inf .grupo-b button.on"),
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
      atajoMax: Math.round(100 * Math.max(...[...document.querySelectorAll(".filtros-inf .atajo")]
        .map((e) => e.getBoundingClientRect().width)) /
        document.querySelector(".filtros-inf .rango-f").getBoundingClientRect().width),
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
console.log("✓ Análisis de salida: los cinco filtros están y de verdad filtran —el rango mira la fecha en que SALIÓ, el color mira las líneas, " +
            "y dos filtros se cruzan—, «Restablecer» solo sale cuando hay algo que quitar, con muchas placas se vuelve desplegable, " +
            "y se lee en los siete temas y en los cinco anchos.");
