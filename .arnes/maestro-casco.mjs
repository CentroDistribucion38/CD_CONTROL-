/* MAESTRO · pestaña «Casco · movimientos»: los desplegables de Registrar viven aquí, con el diseño del Maestro. */
import { buildSync } from "esbuild";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
mkdirSync(R(".arnes/tmp/mc"), { recursive: true });
const alias = { "@/lib/supabase/client": R(".arnes/_reg-supa.ts"), "next/navigation": R(".arnes/_mc-router.ts"), "@": R("src") };
const salida = buildSync({
  entryPoints: [R(".arnes/_mc-entrada.tsx")], bundle: true, write: false, format: "iife", outdir: R(".arnes/tmp/mc"),
  loader: { ".css": "css" }, alias, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error",
});
const js = salida.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = (salida.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "") +
  readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8") + readFileSync(R("src/app/globals.css"), "utf8");
writeFileSync(R(".arnes/tmp/mc/p.html"), `<!doctype html><meta charset=utf-8><style>${css}</style><div id=raiz class="fe"></div><script>${js}</script>`);
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pag = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; pag.on("pageerror", (e) => errs.push(String(e))); pag.on("console", (m) => { if (m.type() === "error") errs.push(m.text()) });
await pag.addInitScript(() => {
  window.ubic = [{ clave: "BODEGA 38", nombre: "AG22 EER Barranquilla" }, { clave: "FABRICA", nombre: "AG18 EER Fábrica" }, { clave: "CARNAVAL", nombre: "AG07 Alm. Bodega Carnaval" }, { clave: "CARNAVAL PALMAR", nombre: "CA22 ERR Atlántico" }];
  window.maestro = [
    { id: "o1", tipo: "origen", codigo: "AG22", nombre: "AG22 EER Barranquilla", ubicacion: "BODEGA 38", orden: 1, descuenta: true },
    { id: "o4", tipo: "origen", codigo: "CA22", nombre: "CA22 ERR Atlántico", ubicacion: "CARNAVAL PALMAR", orden: 4, descuenta: false },
    { id: "r1", tipo: "receptor", codigo: "AG07", nombre: "AG07 Alm. Bodega Carnaval", ubicacion: "CARNAVAL", orden: 1, descuenta: true },
    { id: "c1", tipo: "cliente", codigo: "0005201060", nombre: "0005201060 CRISTALERIA PELDAR S A", ubicacion: null, orden: 1, descuenta: true },
  ];
});
await pag.goto("file://" + R(".arnes/tmp/mc/p.html"));
const pestanas = await pag.$$eval(".fe-pes[role=tablist] button", (x) => x.map((e) => e.textContent.trim()));
ok(pestanas.length === 4 && /Casco · movimientos/.test(pestanas[3]), "cuarta pestaña «Casco · movimientos»: " + pestanas);
await pag.click(".fe-pes[role=tablist] button:has-text('Casco')");
await pag.waitForSelector("article.fe-fila");
let tarjetas = await pag.$$eval("article.fe-fila", (x) => x.map((e) => e.innerText.replace(/\s+/g, " ")));
ok(tarjetas.length === 4, "4 tarjetas: " + tarjetas.length);
ok(tarjetas.some((t) => /CA22/.test(t) && /No, solo registro/.test(t)), "CA22 dice «No, solo registro»");
ok(tarjetas.some((t) => /PELDAR/.test(t) && /Cliente/.test(t) && /No tiene tabla/.test(t)), "el cliente no tiene tabla");
ok(tarjetas.some((t) => /AG07/.test(t) && /Almacén receptor/.test(t)), "AG07 receptor");
await pag.screenshot({ path: R(".arnes/tmp/mc/lista.png"), fullPage: true });

/* filtro por lista y búsqueda */
await pag.click("button[aria-pressed]:has-text('Cliente')");
ok((await pag.$$("article.fe-fila")).length === 1, "lista Cliente: 1");
await pag.click("button[aria-pressed]:has-text('Todas')");
await pag.fill(".fe-busca input", "peldar");
ok((await pag.$$("article.fe-fila")).length === 1, "búsqueda «peldar»: 1");
await pag.fill(".fe-busca input", "");

/* agregar un cliente */
await pag.click("button.btn:text-is('Agregar')");
await pag.waitForSelector("section.fe-editor.nuevo");
await pag.selectOption("section.fe-editor.nuevo select >> nth=0", "cliente");
const hayTabla = await pag.locator("section.fe-editor.nuevo >> text=Tabla de Control que mueve").count();
ok(hayTabla === 0, "un cliente no pide tabla de Control");
await pag.fill("section.fe-editor.nuevo input >> nth=0", "0009999");
await pag.fill("section.fe-editor.nuevo input >> nth=1", "DISTRIBUIDORA PRUEBA");
await pag.click("section.fe-editor.nuevo button:text-is('Agregar')");
await pag.waitForSelector("article.fe-fila:has-text('DISTRIBUIDORA PRUEBA')", { timeout: 3000 }).catch(() => fallas.push("no apareció el cliente nuevo"));
const g = (await pag.evaluate(() => window.llamadas)).filter((l) => l.f === "casco_mov_maestro_guardar");
ok(g.length === 1 && g[0].a.p_id === null && g[0].a.p_tipo === "cliente" && g[0].a.p_codigo === "0009999" && g[0].a.p_ubicacion === "", "guardó el nuevo: " + JSON.stringify(g[0]?.a));

/* agregar un origen con tabla */
await pag.click("button.btn:text-is('Agregar')");
await pag.fill("section.fe-editor.nuevo input >> nth=0", "XX01");
await pag.fill("section.fe-editor.nuevo input >> nth=1", "XX01 Otro almacén");
await pag.selectOption("section.fe-editor.nuevo select >> nth=1", "FABRICA");
await pag.click("section.fe-editor.nuevo button:text-is('Agregar')");
await pag.waitForSelector("article.fe-fila:has-text('XX01 Otro almacén')", { timeout: 3000 }).catch(() => fallas.push("no apareció el origen nuevo"));
const g2 = (await pag.evaluate(() => window.llamadas)).filter((l) => l.f === "casco_mov_maestro_guardar")[1];
ok(g2 && g2.a.p_tipo === "origen" && g2.a.p_ubicacion === "FABRICA" && g2.a.p_descuenta === true, "origen con tabla AG18: " + JSON.stringify(g2?.a));

/* editar */
await pag.click("article.fe-fila:has-text('DISTRIBUIDORA PRUEBA') button.fe-mini");
await pag.locator("article.fe-fila:has-text('DISTRIBUIDORA PRUEBA') .fe-editor input").nth(1).fill("DISTRIBUIDORA PRUEBA 2");
await pag.click("article.fe-fila:has-text('DISTRIBUIDORA PRUEBA') .fe-pie button:text-is('Guardar')");
await pag.waitForSelector("article.fe-fila:has-text('PRUEBA 2')", { timeout: 3000 }).catch(() => fallas.push("el cambio de nombre no se vio"));

/* borrar */
await pag.click("article.fe-fila:has-text('PRUEBA 2') button.fe-mini");
await pag.click("article.fe-fila:has-text('PRUEBA 2') button.fe-quitar");
await pag.waitForSelector(".cf-botones", { timeout: 3000 });
await pag.click(".cf-botones .cf-btn:not(.plano)");
await pag.waitForSelector("article.fe-fila:has-text('PRUEBA 2')", { state: "detached", timeout: 3000 }).catch(() => fallas.push("no se borró"));
await pag.screenshot({ path: R(".arnes/tmp/mc/final.png"), fullPage: true });

/* las otras pestañas siguen vivas */
await pag.click(".fe-pes[role=tablist] button:has-text('Materiales')");
ok((await pag.$$("article.fe-fila")).length === 1 && await pag.locator("text=Pony Malta").count() > 0, "Materiales sigue funcionando");
ok(errs.length === 0, "errores en consola: " + errs.join(" | "));
await b.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Maestro · Casco: cuarta pestaña con las tres listas, tarjetas del diseño del Maestro, filtro, buscador, agregar, editar y borrar.");
