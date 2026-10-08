/* REGISTRAR · BAJA contra el Excel de verdad: lectura, estibas, a qué columna va cada fila, aplicar y deshacer. */
import { buildSync } from "esbuild";
import { writeFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const XLSX_PATH = process.argv[2] ?? "/root/.claude/uploads/82d6003a-2476-5226-8137-e8673628bd9c/9f4c2976-RELACION_TRASPASO_DE_CASCO_DE_VIDRIO_DIARIA.xlsx";
const alias = { "@/lib/supabase/client": R(".arnes/_reg-supa.ts"), "next/link": R(".arnes/_reg-link.tsx"), "@": R("src") };
const salida = buildSync({
  entryPoints: [R(".arnes/_reg-entrada.tsx")], bundle: true, write: false, format: "iife", outdir: R(".arnes/tmp/reg"),
  loader: { ".css": "css" }, alias, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error",
});
const js = salida.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = (salida.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "") + readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8");
writeFileSync(R(".arnes/tmp/reg/p.html"), `<!doctype html><meta charset=utf-8><style>:root{--fe-tinta:#111;--fe-gris:#666;--fe-papel:#fff;--fe-linea:#ddd;--fe-acento:#f2b705;--fe-mal:#b3261e;--fe-bien:#1b7a3a;--fe-fondo:#f6f5f1;--fe-titulo:system-ui;--fe-texto:system-ui}body{margin:0;background:#f6f5f1;font-family:system-ui}</style><style>${css}</style><div id=raiz class="fe cas reg"></div><script>${js}</script>`);
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pag = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; pag.on("pageerror", (e) => errs.push(String(e))); pag.on("console", (m) => { if (m.type() === "error") errs.push(m.text()) });
await pag.goto("file://" + R(".arnes/tmp/reg/p.html"));
await pag.setInputFiles('input[type=file]', XLSX_PATH);
await pag.waitForSelector("table.cas-tabla tbody tr td.cod");
const filas = await pag.$$eval("table.cas-tabla:first-of-type tbody tr", (t) => t.map((r) => [...r.cells].map((c) => c.textContent.trim())));
const primera = (await pag.$$eval(".reg-bloque, .cas-bloque", (x) => x.length));
const tab1 = await pag.evaluate(() => [...document.querySelectorAll("section.cas-bloque")[0].querySelectorAll("table tbody tr")].map((r) => [...r.cells].map((c) => c.textContent.trim())));
console.log("filas leídas en la vista previa:", tab1.length);
ok(tab1.length === 42, "42 filas en la vista previa, salieron " + tab1.length);
const fila = (sku, texto) => tab1.find((r) => r[2] === sku && r[4] === texto);
const f1 = fila("3500005", "BAJA SORTING JG");
ok(f1 && f1[1] === "AG18 EER Fábrica" && f1[5] === "Inventario" && f1[6] === "116.280" && f1[7] === "56,67", "116.280 UN de 3500005 = 56,67 est. en AG18: " + JSON.stringify(f1));
const lav = fila("3501430", "BAJA LAVADO");
ok(lav && lav[1] === "AG18 EER Fábrica" && lav[5] === "Lavado con baja" && lav[7] === "−14,47", "LAVADO → Lavado con baja: " + JSON.stringify(lav));
const ext = fila("3501430", "BAJA EXTRASUCIO");
ok(ext && ext[1] === "AG22 EER Barranquilla" && ext[5] === "Extrasucio con baja", "EXTRASUCIO → Extrasucio con baja en AG22: " + JSON.stringify(ext));
const sinF = tab1.filter((r) => r[2] === "3501225");
ok(sinF.length === 5 && sinF.every((r) => /falta botellas/i.test(r[8])), "250 sin factor sale en rojo: " + JSON.stringify(sinF.map((r) => r[8])));
ok(tab1.filter((r) => r[8] === "Lista").length === 37, "37 listas (42 - 5 sin factor), salieron " + tab1.filter((r) => r[8] === "Lista").length);
const btn = await pag.textContent("button.btn.grande");
ok(/Aplicar a Control \(37 filas\)/.test(btn), "botón: " + btn);
await pag.screenshot({ path: R(".arnes/tmp/reg/previa.png"), fullPage: true });
/* APLICAR */
await pag.fill('.reg-dia input[type=date]', "2026-10-07");
await pag.click("button.btn.grande");
await pag.waitForSelector(".cf-caja, [role=dialog], [role=alertdialog]", { timeout: 3000 }).catch(() => {});
const dlg = await pag.evaluate(() => document.body.innerText.match(/¿Aplicar[^\n]*/)?.[0]);
ok(dlg && /37 filas/.test(dlg), "pide confirmación: " + dlg);
await pag.click(".cf-botones .cf-btn:not(.plano)");
await pag.waitForSelector("text=Listo: 37 filas", { timeout: 3000 }).catch(() => fallas.push("no salió el aviso de aplicado"));
const llamadas = await pag.evaluate(() => window.llamadas);
const ap = llamadas.find((l) => l.f === "casco_registrar_bajas");
ok(ap && ap.a.p_filas.length === 37, "mandó 37 filas a la base");
ok(ap && ap.a.p_fecha === "2026-10-07", "suma al día de Control escogido (hoy por defecto), no al del Excel: " + ap?.a.p_fecha);
ok(ap && ap.a.p_filas.every((f) => f.centro && f.sku && f.llave && f.unidades > 0 && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha)), "cada fila lleva centro, sku, llave, unidades positivas y fecha ISO");
ok(ap && new Set(ap.a.p_filas.map((f) => f.llave)).size === 37, "las llaves son únicas (el documento repetido no se pisa)");
await pag.screenshot({ path: R(".arnes/tmp/reg/aplicado.png"), fullPage: true });
/* HISTORIAL DE ARCHIVOS Y FILTROS — cada vista es una hoja aparte */
ok(ap && ap.a.p_archivo && /\.xlsx$/i.test(ap.a.p_archivo) && ap.a.p_hoja && ap.a.p_leidas === 42, "manda nombre de archivo, hoja y filas leídas: " + JSON.stringify([ap?.a.p_archivo, ap?.a.p_hoja, ap?.a.p_leidas]));
const hojasTop = await pag.$$eval(".reg-hojas button, .reg-sub button", (x) => x.map((e) => e.textContent.trim()));
console.log("hojas:", hojasTop.join(" | "));
ok(await pag.locator(".reg-sub button:has-text('Archivos subidos')").count() === 1 && await pag.locator(".reg-sub button:has-text('Bajas registradas')").count() === 1, "Baja tiene tres hojas: subir, archivos, bajas");
ok(await pag.locator("text=Archivos subidos").count() > 0 && await pag.locator("table:has(th:text-is('Archivo'))").count() === 0, "al estar en «Subir» no se ve la tabla de archivos (compacto)");
await pag.click(".reg-sub button:has-text('Archivos subidos')");
await pag.waitForFunction(() => document.body.innerText.includes("ana@x.co"), null, { timeout: 3000 }).catch(() => fallas.push("el archivo no aparece en «Archivos subidos»"));
const filasDe = async () => pag.evaluate(() => [...document.querySelectorAll("section.cas-bloque table tbody tr")].map((r) => [...r.cells].map((c) => c.textContent.trim())));
let ft = await filasDe();
ok(ft.length === 1 && ft[0][3].includes("2026") && ft[0][4] === "37", "1 archivo con 37 filas y su día de Control: " + JSON.stringify(ft));
await pag.fill('input[placeholder="Buscar por nombre…"]', "zzz");
ft = await filasDe(); ok(ft[0][0].includes("Ningún archivo"), "filtro por nombre sin coincidencias");
await pag.fill('input[placeholder="Buscar por nombre…"]', "");
/* «Ver filas» salta a la hoja de bajas filtrada por ese archivo */
await pag.click("button:has-text('Ver filas')");
await pag.waitForSelector("#reg-bajas");
ft = await filasDe(); ok(ft.length === 37, "«Ver filas» abre las 37 bajas de ese archivo: " + ft.length);
const etqs = await pag.$$eval("#reg-bajas .reg-filtros label > span", (x) => x.map((e) => e.textContent.trim()));
console.log("filtros de bajas:", etqs.join(" | "));
await pag.selectOption('#reg-bajas .reg-filtros label:has-text("Archivo") select', { index: 0 });
await pag.fill('#reg-bajas .reg-filtros input[type=search]', "LAVADO");
ft = await filasDe(); ok(ft.length > 0 && ft.length < 37, "filtro de texto LAVADO deja solo esas: " + ft.length);
await pag.fill('#reg-bajas .reg-filtros input[type=search]', "");
await pag.click(".reg-sub button:has-text('Archivos subidos')");
/* deshacer el archivo entero */
await pag.click("button:has-text('Deshacer archivo')");
await pag.waitForSelector(".cf-botones", { timeout: 3000 });
await pag.click(".cf-botones .cf-btn:not(.plano)");
await pag.waitForFunction(() => document.body.innerText.includes("Todavía no has subido archivos"), null, { timeout: 3000 }).catch(() => fallas.push("deshacer archivo no vació el historial"));
ok((await pag.evaluate(() => window.llamadas)).some((l) => l.f === "casco_quitar_archivo"), "llamó casco_quitar_archivo");

ok(errs.length === 0, "errores en consola: " + errs.join(" | "));
await b.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Registrar · Baja: 42 filas leídas, unidades → estibas con el factor del maestro, LAVADO/EXTRASUCIO a su columna, lo demás al inventario, sin factor en rojo y aplicar manda 37 llaves únicas.");
