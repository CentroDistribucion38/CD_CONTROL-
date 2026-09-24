/* Render del recorrido para MIRARLO. No reemplaza al arnés; sirve para
   ver que el dibujo se lee, que es lo único que un arnés no comprueba. */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
buildSync({ entryPoints: [R("src/modulos/roturas/sankey.ts")],
  outfile: R(".arnes/_rq-geo.mjs"), bundle: true, format: "esm", logLevel: "silent" });
const { armarSankey } = await import(R(".arnes/_rq-geo.mjs"));
const { Recorrido } = await import(R(".arnes/_rq-dibujo.mjs"));
const { renderToStaticMarkup } = await import("react-dom/server");
const React = (await import("react")).default;

const C = (id, rotulo, valor, color, pie) => ({ id, rotulo, valor, color, pie });
const s = armarSankey({
  columnas: [
    [C("a", "Estibas en mal estado", 3000, "#FFC400", "la asume el OL"),
     C("b", "Falla de máquina", 1230, "#E4002B", "no asumida · exige foto")],
    [C("t1", "T1", 4200, "#B87F00"), C("ln", "Líneas", 30, "#8A8E8A")],
    [C("v", "Baja de vidrio", 3589, "#FFC400", "rota: pierde líquido y botella"),
     C("q", "Solo baja de líquido", 641, "#B87F00", "contaminada: vuelve el envase")],
  ],
  tramos: [
    { de: "a", a: "t1", valor: 2985 }, { de: "a", a: "ln", valor: 15 },
    { de: "b", a: "t1", valor: 1215 }, { de: "b", a: "ln", valor: 15 },
    { de: "t1", a: "v", valor: 3565 }, { de: "t1", a: "q", valor: 635 },
    { de: "ln", a: "v", valor: 24 }, { de: "ln", a: "q", valor: 6 },
  ],
}, 1160, 90 + 2 * 104);

const css = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const svg = renderToStaticMarkup(React.createElement(Recorrido, { s, total: 4230 }));

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.setViewportSize({ width: 1440, height: 700 });
await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}
${glob}${shell}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel">
<main class="sh-main"><div class="rt"><section class="caja rq-flujo">
<div class="rq-h"><b>El recorrido de las 4230 unidades</b><span>el grosor de cada cinta son unidades</span></div>
<div class="rq-cols"><div>DE QUÉ CAUSA SALIÓ</div><div>POR DÓNDE PASÓ</div><div>EN QUÉ TERMINA</div></div>
${svg}
<div class="rq-lectura"><div class="n">29%</div><div><b>Casi un tercio de lo roto se dice que no fue del OL</b>
<span>1230 unidades. Todas esas exigen foto, y todas van a discutirse con alguien.</span></div></div>
</section></div></main></div></div></body></html>`);
await pg.screenshot({ path: ".arnes/rq-recorrido.png" });
await pg.setViewportSize({ width: 390, height: 700 });
await pg.screenshot({ path: ".arnes/rq-recorrido-cel.png", fullPage: true });
await nav.close();
console.log("listo");
