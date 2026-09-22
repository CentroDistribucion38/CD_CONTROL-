/* =====================================================================
   LA BASE · CONSOLIDADO DEL DÍA: escoger el día y QUÉ FEFO entran.
   Con el componente de verdad en Chromium: salen los FEFO del día
   marcados, se desmarca uno, y la exportación pide solo los marcados.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_co-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Base } from "../src/app/(app)/inventario/base/Base";
const w = window as any;
createRoot(document.getElementById("r")!).render(<div className="fe"><Base enviadas={[]} abiertas={[]} conteos={w.C} tope={false} /></div>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_co-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/base/base.css"].map((f) => readFileSync(R(f), "utf8")).join("\n");
const K = (i, dia, h) => ({ id: `0000000${i}-0000-0000-0000-000000000000`, codigo: `FEFO-${dia.slice(5).replace("-", "")}-0${i}`, estado: "cerrado", bodega: "AG01",
  responsable: ["Génesis Visbal", "Santiago Leal", "Ana Pérez"][i % 3], fecha_analisis: dia, enviado_en: `${dia}T${h}:00:00Z`, envio_nombre: null, renglones: 40 + i, ubicaciones: 30, total_cajas: 1000 * i });
const C = [K(1, "2026-09-22", "12"), K(2, "2026-09-22", "15"), K(3, "2026-09-22", "18"), K(4, "2026-09-21", "20")];
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
let pedido = null;
await pg.route("https://control.prueba/**", (r) => {
  if (r.request().url().includes("/api/inventario/exportar")) { pedido = r.request().url(); return r.fulfill({ status: 200, contentType: "application/octet-stream", body: "x" }) }
  return r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" });
});
for (const [ancho, tema] of [[1200, null], [390, null], [360, "ambar"]]) {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/inventario/base");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div id="r"></div></main></div></div>
    <script>window.C=${JSON.stringify(C)};</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".ba-conso");
  const lado = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(lado <= 0, `${ancho}: la página se arrastra ${lado}`);
  if (ancho === 1200) {
    ok((await pg.$$(".ba-conso-fefo input:checked")).length === 3, "no salen los 3 FEFO del día marcados");
    await pg.click(".ba-conso-fefo >> nth=1");
    ok(/Exportar 2 de 3 FEFO/.test(await pg.textContent(".ba-conso-acc .btn")), "el botón no dice cuántos FEFO van");
    await pg.click(".ba-conso-acc .btn");
    await pg.waitForTimeout(300);
    ok(pedido && /fecha=2026-09-22/.test(pedido) && /ids=00000001-[^,]+,00000003-/.test(pedido) && !/00000002-/.test(pedido), `la exportación no pide solo los marcados: ${pedido}`);
    ok(/tinta=[0-9a-f]{6}&banda=[0-9a-f]{6}/.test(pedido ?? ""), `la exportación no lleva los colores del tema: ${pedido}`);
    await pg.selectOption(".ba-conso-acc select", "2026-09-21");
    ok((await pg.$$(".ba-conso-fefo input:checked")).length === 1 && /Exportar consolidado/.test(await pg.textContent(".ba-conso-acc .btn")), "al cambiar de día no arranca con todos los FEFO de ese día");
    await pg.selectOption(".ba-conso-acc select", "2026-09-22");
    await pg.click(".ba-conso-todos");
    ok(await pg.isDisabled(".ba-conso-acc .btn"), "sin ningún FEFO marcado se puede exportar");
    await pg.screenshot({ path: (process.env.FOTO ?? "/tmp") + "/conso.png" });
  }
}
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Consolidado: salen los FEFO del día marcados, se desmarcan, el botón dice cuántos, la exportación pide solo esos; 1200/390/360.");
