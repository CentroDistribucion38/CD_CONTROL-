/* ADMINISTRACIÓN · INICIO — la página de verdad, con una base de mentiras
   (.arnes/ad-inicio-stub): cifras, lo último que se cambió de las tres partes, el
   SQL que falta y la llave; 1300 · 390 · 360 sin arrastrar la página.
     node .arnes/ad-inicio.mjs [carpeta-para-fotos] */
import { createRequire } from "node:module"; import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild"; import { resolve } from "node:path";
const R = (p) => resolve(p);
writeFileSync(".arnes/_ain.tsx", `import { renderToStaticMarkup } from "react-dom/server";
import Page from "../src/app/(app)/admin/inicio/page";
export const html = async () => renderToStaticMarkup(await Page());`);
buildSync({ entryPoints: [".arnes/_ain.tsx"], bundle: true, platform: "node", format: "cjs", outfile: ".arnes/_ain.cjs", jsx: "automatic",
  alias: { "@/lib/supabase/server": R(".arnes/ad-inicio-stub/server.ts"), "@/lib/permisos": R(".arnes/ad-inicio-stub/permisos.ts"),
    "@/lib/supabase/servicio": R(".arnes/ad-inicio-stub/servicio.ts"), "next/link": R(".arnes/ad-inicio-stub/link.tsx"), "@": R("src") },
  loader: { ".css": "empty" }, logLevel: "error" });
const require = createRequire(import.meta.url);
const { html } = require("./_ain.cjs");
const cuerpo = await html();
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/admin/roles/roles.css", "src/app/(app)/admin/inicio/inicio.css"].map((f) => readFileSync(f, "utf8")).join("\n");
const { chromium } = await import("playwright");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await b.newPage();
const f = [];
for (const w of [1300, 390, 360]) {
  await p.setViewportSize({ width: w, height: 900 });
  await p.setContent(`<style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">${cuerpo}</main></div></div>`);
  const lado = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (lado > 0) f.push(`${w}: se arrastra ${lado}`);
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] + `/ain-${w}.png`, fullPage: true });
}
const t = await p.textContent("body");
for (const s of ["NUNCA HAN ENTRADO", "cambió el rol de ARENOSA: Genérico → Operador", "cambió 3 permisos del rol Operador", "borró 1.240 filas", "Falta correr", "2026-09-acciones-programadas.sql", "Llave del servidor"])
  if (!t.includes(s)) f.push("no dice: " + s);
await b.close();
if (f.length) { f.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Administración · Inicio: cifras, lo último que se cambió, SQL que falta y llave; 3 anchos.");
