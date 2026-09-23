/* =====================================================================
   INVENTARIO · LA BASE — que nada quede ahogado, y sobre todo EN LA
   TABLET.

   «¿Por qué la base del inventario se ve así desde la tablet?»: el
   titular del consolidado salía UNA PALABRA POR RENGLÓN, en una columna
   del ancho de la palabra «bodega».

   La culpa: `grid-template-columns: minmax(0, 1fr) auto`. `auto` toma
   el MAX-CONTENT de la botonera —desplegable + botón + cifras, sumados
   en una línea— y no cede; a la columna del texto le tocaba lo que
   sobrara, que era nada. Y el corte a una columna estaba en 760 px,
   así que la tablet en vertical —820— caía fuera.

   POR QUÉ ESTE ARNÉS Y NO UNA MIRADA: un bloque ahogado no rompe nada
   —no desborda, no tapa, no se sale— así que ningún arnés de los que
   ya hay lo veía. Se mide lo que de verdad falla: CUÁNTO MIDE DE ANCHO
   cada bloque de texto, y cuántas palabras le caben por renglón.

   Y SE MIDE A 820, que es el ancho que se me pasó. 1440 y 390 estaban
   bien desde el principio; el daño vivía justo en medio.

     node .arnes/iv-base-anchos.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-iv.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });
   export const useSearchParams = () => new URLSearchParams();
   export const usePathname = () => "/inventario/base";`);
writeFileSync(R(".arnes/_supa-iv.ts"),
  `export const createClient = () => ({
     rpc: async () => ({ data: null, error: null }),
     from: () => ({ select: () => ({ data: [], error: null }) }),
   });`);

/* Se monta EL COMPONENTE DE VERDAD con datos de mentira. Una copia del
   marcado escrita a mano pasaría siempre: mediría mi copia, no la
   pantalla. */
writeFileSync(R(".arnes/_iv-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Base } from "../src/app/(app)/inventario/base/Base";

/* Dos FEFO del mismo día: es el caso normal y el que hace más ancha la
   botonera —el botón pasa a decir «Exportar 1 de 2 FEFO»—. */
const conteos = [1, 2].map((i) => ({
  id: "c" + i, codigo: "FEFO-20260919-0" + i, estado: "cerrado",
  fecha_analisis: "2026-09-19", bodega: "CD38",
  responsable: "Santiago Leal", enviado_en: "2026-09-19T15:49:00Z",
  renglones: 11, ubicaciones: 11, total_cajas: 107673,
})) as any;

createRoot(document.getElementById("r")!).render(
  <Base enviadas={[] as any} abiertas={[] as any} conteos={conteos} tope={false} />);
`);

let js;
try {
  js = buildSync({
    entryPoints: [R(".arnes/_iv-entrada.tsx")], bundle: true, write: false,
    format: "iife", jsx: "automatic",
    alias: {
      "next/navigation": R(".arnes/_nav-iv.ts"),
      "@/lib/supabase/client": R(".arnes/_supa-iv.ts"),
      "@": R("src"),
    },
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
  }).outputFiles[0].text;
} catch (e) {
  console.error("No compiló la entrada del arnés:\n" + (e.message ?? e));
  process.exit(1);
}

const css   = readFileSync(R("src/app/(app)/inventario/base/base.css"), "utf8");
const fefo  = readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8");
const glob  = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (ancho, alto = 1000) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${fefo}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="fe" id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".ba-conso");
};

/* Los cuatro anchos, y 820 es el que importa: es la tablet en vertical,
   el que se me pasó. */
for (const [ancho, nombre] of [[1440, "pc"], [1024, "tablet apaisada"],
                               [820, "tablet"], [390, "celular"]]) {
  await monta(ancho);

  const r = await pg.evaluate(() => {
    const med = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      /* CUÁNTOS RENGLONES OCUPA de verdad, contando los saltos que hace
         el navegador y no los que hay en el texto. Un titular de siete
         palabras en siete renglones es el síntoma exacto. */
      const r = document.createRange();
      r.selectNodeContents(e);
      const renglones = r.getClientRects().length;
      const palabras = (e.textContent || "").trim().split(/\s+/).length;
      return { ancho: Math.round(b.width), renglones, palabras };
    };
    return {
      titulo: med(".ba-conso h2"),
      parrafo: med(".ba-conso-tx p:last-child"),
      columnas: getComputedStyle(document.querySelector(".ba-conso")).gridTemplateColumns,
      scroll: document.documentElement.scrollWidth,
      ventana: document.documentElement.clientWidth,
    };
  });

  const t = r.titulo, p = r.parrafo;
  const porRenglon = (x) => x.renglones ? (x.palabras / x.renglones) : 0;

  /* UNA COLUMNA DE TEXTO MIDE AL MENOS 240 px. Por debajo de eso ya no
     es una columna: es una tira, y el titular se parte por palabras. */
  ok(t.ancho >= 240, `${nombre}: el titular vive en ${t.ancho} px de ancho`);
  ok(p.ancho >= 240, `${nombre}: el párrafo vive en ${p.ancho} px de ancho`);

  /* Y SOBRE TODO: que no salga palabra por palabra. Con 1,5 palabras
     por renglón ya está roto; un titular normal lleva cuatro o más. */
  ok(porRenglon(t) >= 2,
     `${nombre}: el titular sale a ${porRenglon(t).toFixed(1)} palabras por renglón ` +
     `(${t.palabras} palabras en ${t.renglones} renglones)`);
  ok(porRenglon(p) >= 3,
     `${nombre}: el párrafo sale a ${porRenglon(p).toFixed(1)} palabras por renglón`);

  ok(r.scroll <= r.ventana + .5, `${nombre}: la página se desplaza a lo ancho`);

  await pg.screenshot({ path: `.arnes/iv-base-${ancho}.png` });
  console.log(`${nombre.padEnd(16)} ${String(ancho).padStart(5)}px · titular ${String(t.ancho).padStart(4)}px ` +
    `${porRenglon(t).toFixed(1)} pal/renglón · párrafo ${String(p.ancho).padStart(4)}px ` +
    `${porRenglon(p).toFixed(1)} pal/renglón`);
}

/* Y LO QUE DE VERDAD FALLABA, dicho por su nombre: la segunda columna
   no puede ser `auto` a secas. Se comprueba la regla, no solo su
   efecto: el efecto se puede arreglar por casualidad al mover otra
   cosa, y entonces el arnés deja de proteger nada. */
await monta(1440);
const cols = await pg.evaluate(() =>
  getComputedStyle(document.querySelector(".ba-conso")).gridTemplateColumns
    .split(" ").map((x) => parseFloat(x)));
ok(cols.length === 2 && cols[0] > cols[1],
   `en el computador la columna del texto (${cols[0]}px) no es la ancha (acciones: ${cols[1]}px)`);

await nav.close();

if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\n✓ La base: el consolidado se lee en los cuatro anchos, y en la tablet también.");
