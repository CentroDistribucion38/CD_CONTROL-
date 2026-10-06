/* TABLERO · «Módulos por encima de su capacidad» PLEGADA: cerrada muestra título y cuántos; al tocarla se abre la tabla.
     node .arnes/tablero-plegable.mjs */
import { readFileSync } from "node:fs";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const filas = Array.from({ length: 25 }, (_, i) => `<tr class="mal"><td><b>E${i}_IZQ</b></td><td class="n">32</td><td class="n">90</td><td class="n dias">+58</td><td class="n">281 %</td><td class="n">1</td></tr>`).join("");
const html = `<!doctype html><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe">
<details class="fe-caja fe-plegable"><summary class="fe-caja-cab"><span class="fe-pleg-t"><span class="fe-pleg-h" role="heading" aria-level="2">Módulos por encima de su capacidad</span></span><span class="fe-pleg-n"><b>25</b> módulos<i class="fe-pleg-ver" aria-hidden="true"></i></span></summary><p class="fe-pleg-p">Lo que se contó pesa más de lo que el maestro dice que cabe. No es un error del conteo: se anota lo que hay, no lo que cabe.</p>
<div class="fe-tabla"><table><thead><tr><th>Módulo</th><th class="n">Cabe</th><th class="n">Hay</th><th class="n">Sobran</th><th class="n">Ocupación</th><th class="n">Renglones</th></tr></thead><tbody>${filas}</tbody></table></div><p class="fe-pie-nota">En estibas.</p></details></div></main></div></div>`;
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
for (const w of [360, 1440]) {
  await pg.goto("about:blank"); await pg.setViewportSize({ width: w, height: 900 }); await pg.setContent(html);
  const alto = () => pg.evaluate(() => document.querySelector(".fe-plegable").getBoundingClientRect().height);
  ok(!(await pg.evaluate(() => document.querySelector(".fe-plegable").open)), "debe empezar cerrada");
  const cerrada = await alto();
  ok(cerrada < 100, `a ${w}px cerrada mide ${cerrada} px`);
  ok(await pg.locator(".fe-plegable tbody tr").first().isHidden(), "cerrada no debe verse la tabla");
  await pg.screenshot({ path: R(`.arnes/_plg-${w}-cerrada.png`) });
  await pg.click(".fe-plegable > summary");
  ok(await pg.locator(".fe-plegable tbody tr").first().isVisible(), "al tocar debe verse la tabla");
  ok((await alto()) > cerrada + 300, "abierta debe ser mucho más alta");
  const d = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.querySelector(".fe-plegable > summary").getBoundingClientRect().height }));
  ok(d.sw <= d.cw, `a ${w}px se desborda`); ok(d.h >= 48, "el summary mide menos de 48 px");
  await pg.screenshot({ path: R(`.arnes/_plg-${w}-abierta.png`) });
  await pg.click(".fe-plegable > summary");
  ok(await pg.locator(".fe-plegable tbody tr").first().isHidden(), "al tocar de nuevo debe plegarse");
}
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ plegable: empieza cerrada, se abre y se pliega al tocar, 48 px, sin desborde en 360 y 1440");
