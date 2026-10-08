/* CONTROL · filtros: un material en las cuatro bodegas, una bodega, una ubicación, solo con estibas. */
import { buildSync } from "esbuild";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
mkdirSync(R(".arnes/tmp/ct"), { recursive: true });
const alias = { "@/lib/supabase/client": R(".arnes/_ct-supa.ts"), "next/link": R(".arnes/_reg-link.tsx"), "@": R("src") };
const salida = buildSync({ entryPoints: [R(".arnes/_ct-entrada.tsx")], bundle: true, write: false, format: "iife", outdir: R(".arnes/tmp/ct"), loader: { ".css": "css" }, alias, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error" });
const js = salida.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = ["src/app/globals.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/casco/casco.css"].map((f) => readFileSync(R(f), "utf8")).join("\n");
writeFileSync(R(".arnes/tmp/ct/p.html"), `<!doctype html><meta charset=utf-8><style>${css}</style><div id=raiz class="fe cas"></div><script>${js}</script>`);
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pag = await b.newPage({ viewport: { width: 1400, height: 1100 } });
const errs = []; pag.on("pageerror", (e) => errs.push(String(e))); pag.on("console", (m) => { if (m.type() === "error" && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push(m.text()) });
await pag.addInitScript(() => {
  const r = (u, sku, inv, baja, puesto) => ({ fecha: "2026-10-08", ubicacion: u, sku, inventario: inv, inv_expr: String(inv), baja, baja_expr: baja ? String(baja) : null, hl: 0, puesto, calidad: "" });
  window.registros = [
    r("BODEGA 38", "3500005", 166, 0, "P13"), r("BODEGA 38", "3500162", 198, 0, "P16/20"), r("BODEGA 38", "3500446", 0, 0, ""),
    r("FABRICA", "3500005", 50, 0, "P19"), r("FABRICA", "3500162", 20, -5, "P19"), r("FABRICA", "3501430", 10, 0, ""),
    r("CARNAVAL", "3500162", 30, 0, "P20"), r("CARNAVAL PALMAR", "3500005", 6, 0, "P01"),
  ];
});
await pag.goto("file://" + R(".arnes/tmp/ct/p.html"));
await pag.waitForSelector("table.cas-tabla tbody tr td.cod");
const filas = async () => pag.$$eval("section.cas-bloque", (s) => Object.fromEntries(s.map((x) => [x.id, [...x.querySelectorAll("tbody tr td.cod")].map((c) => c.textContent.trim())])));
let f = await filas();
ok(Object.keys(f).length === 4 && f["cas-b-BODEGA 38"].length === 3, "sin filtro: 4 tablas, la primera con 3: " + JSON.stringify(f));
ok(await pag.locator(".cas-resumen").count() === 0, "sin filtro no hay resumen");

/* un material en todas las bodegas */
await pag.fill(".cas-f-mat input", "3500005");
f = await filas();
ok(f["cas-b-BODEGA 38"].join() === "3500005" && f["cas-b-FABRICA"].join() === "3500005" && f["cas-b-CARNAVAL"].length === 0 && f["cas-b-CARNAVAL PALMAR"].join() === "3500005", "3500005 en tres bodegas: " + JSON.stringify(f));
const res = await pag.$$eval(".cas-resumen tbody tr", (r) => r.map((x) => [...x.cells].map((c) => c.textContent.trim())));
ok(res.length === 4 && res[0][2] === "166" && res[1][2] === "50" && res[2][1] === "0" && res[3][2] === "6", "resumen por bodega: " + JSON.stringify(res));
const tot = await pag.$$eval(".cas-resumen tfoot td", (r) => r.map((c) => c.textContent.trim()));
ok(tot[1] === "3" && tot[2] === "222", "total del resumen: " + tot);
const pie = await pag.textContent("#cas-b-FABRICA tfoot");
ok(/LO QUE SE VE \(1 de 3\)/.test(pie), "el pie dice «lo que se ve»: " + pie);
await pag.screenshot({ path: R(".arnes/tmp/ct/filtro.png"), fullPage: false });
/* por nombre y varias palabras */
await pag.fill(".cas-f-mat input", "marron 330");
f = await filas();
ok(f["cas-b-BODEGA 38"].join() === "3500162,3500446" && f["cas-b-FABRICA"].join() === "3500162", "nombre «marron 330»: " + JSON.stringify(f));
/* varios códigos */
await pag.fill(".cas-f-mat input", "3500005, 3501430");
f = await filas(); ok(f["cas-b-FABRICA"].join() === "3500005,3501430", "dos códigos: " + JSON.stringify(f["cas-b-FABRICA"]));
await pag.fill(".cas-f-mat input", "");
/* una bodega */
await pag.selectOption(".cas-filtros select", "FABRICA");
f = await filas(); ok(Object.keys(f).join() === "cas-b-FABRICA", "una sola bodega: " + Object.keys(f));
await pag.selectOption(".cas-filtros select", "");
/* ubicación */
await pag.fill(".cas-filtros input[placeholder='Ej. P19']", "p19");
f = await filas(); ok(f["cas-b-FABRICA"].join() === "3500005,3500162" && f["cas-b-BODEGA 38"].length === 0, "ubicación P19: " + JSON.stringify(f));
await pag.fill(".cas-filtros input[placeholder='Ej. P19']", "");
/* solo con estibas */
await pag.check(".cas-check input");
f = await filas(); ok(f["cas-b-BODEGA 38"].join() === "3500005,3500162", "solo con estibas esconde el 0: " + JSON.stringify(f["cas-b-BODEGA 38"]));
/* limpiar */
await pag.click("button:has-text('Limpiar filtros')");
f = await filas(); ok(f["cas-b-BODEGA 38"].length === 3 && await pag.locator(".cas-resumen").count() === 0, "limpiar vuelve a todo");
/* que filtrar no deje la tabla «sucia» ni cambie lo que se guarda */
const est = await pag.$$eval(".cas-bloque-cab .cas-nota", (x) => x.map((e) => e.textContent));
ok(est.every((e) => e === "Guardado"), "filtrar no marca cambios sin guardar: " + est);
ok(errs.length === 0, "errores en consola: " + errs.join(" | "));
await b.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Control · filtros: un material en todas las bodegas con su resumen, nombre o varios códigos, una bodega, ubicación, solo con estibas y limpiar.");
