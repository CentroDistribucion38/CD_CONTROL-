/* REGISTRAR · MOVIMIENTO: desplegables que vienen del Maestro, material trae descripción, registrar, historial con filtros, deshacer, editar desplegables. */
import { buildSync } from "esbuild";
import { writeFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const alias = { "@/lib/supabase/client": R(".arnes/_reg-supa.ts"), "next/link": R(".arnes/_reg-link.tsx"), "@": R("src") };
const salida = buildSync({
  entryPoints: [R(".arnes/_reg-entrada.tsx")], bundle: true, write: false, format: "iife", outdir: R(".arnes/tmp/reg"),
  loader: { ".css": "css" }, alias, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, logLevel: "error",
});
const js = salida.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = (salida.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "") + readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8");
writeFileSync(R(".arnes/tmp/reg/m.html"), `<!doctype html><meta charset=utf-8><style>:root{--fe-tinta:#111;--fe-gris:#666;--fe-papel:#fff;--fe-linea:#ddd;--fe-acento:#f2b705;--fe-mal:#b3261e;--fe-bien:#1b7a3a;--fe-fondo:#f6f5f1;--fe-titulo:system-ui;--fe-texto:system-ui}body{margin:0;background:#f6f5f1;font-family:system-ui}</style><style>${css}</style><div id=raiz class="fe cas reg"></div><script>${js}</script>`);
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pag = await b.newPage({ viewport: { width: 1400, height: 1100 } });
const errs = []; pag.on("pageerror", (e) => errs.push(String(e))); pag.on("console", (m) => { if (m.type() === "error") errs.push(m.text()) });
await pag.addInitScript(() => {
  window.maestro = [
    { id: "o1", tipo: "origen", codigo: "AG22", nombre: "AG22 EER Barranquilla", ubicacion: "BODEGA 38", orden: 1, descuenta: true },
    { id: "o2", tipo: "origen", codigo: "AG18", nombre: "AG18 EER Fábrica", ubicacion: "FABRICA", orden: 2, descuenta: true },
    { id: "o3", tipo: "origen", codigo: "AG07", nombre: "AG07 Alm. Bodega Carnaval", ubicacion: "CARNAVAL", orden: 3, descuenta: true },
    { id: "o4", tipo: "origen", codigo: "CA22", nombre: "CA22 ERR Atlántico", ubicacion: "CARNAVAL PALMAR", orden: 4, descuenta: false },
    { id: "r1", tipo: "receptor", codigo: "AG07", nombre: "AG07 Alm. Bodega Carnaval", ubicacion: "CARNAVAL", orden: 1, descuenta: true },
    { id: "c1", tipo: "cliente", codigo: "0005201060", nombre: "CRISTALERIA PELDAR S A", ubicacion: null, orden: 1, descuenta: true },
  ];
});
await pag.goto("file://" + R(".arnes/tmp/reg/m.html"));
await pag.click("button.reg-tipo:has-text('Movimiento')");
await pag.waitForSelector("table.reg-lineas tbody tr");
ok(await pag.$("text=Siguiente paso") === null, "ya no dice «Siguiente paso»");
const fecha0 = await pag.inputValue('.reg-dia input[type=date]');
ok(fecha0 === "2026-10-08", "fecha automática = hoy: " + fecha0);
const selects = await pag.$$eval("table.reg-lineas tbody tr:first-child select", (s) => s.map((x) => [...x.querySelectorAll("option")].map((o) => o.textContent.trim())));
ok(selects.length === 2, "dos desplegables por línea: " + selects.length);
ok(selects[0].some((t) => /AG22/.test(t)) && selects[0].some((t) => /CA22/.test(t)), "origen trae AG22 y CA22: " + selects[0]);
ok(selects[1].some((t) => /AG07/.test(t)) && selects[1].some((t) => /PELDAR/.test(t)), "receptor/cliente trae AG07 y el cliente: " + selects[1]);

/* Línea 1: AG22 → AG07, 3500005, 10, entrega, placa */
const llenar = async (i, o, d, sku, est, ent, pl) => {
  const fila = pag.locator("table.reg-lineas tbody tr").nth(i);
  await fila.locator("select").nth(0).selectOption({ label: o });
  await fila.locator("select").nth(1).selectOption({ label: d });
  await fila.locator("input.reg-sku").fill(sku);
  await fila.locator("input.reg-num").fill(est);
  await fila.locator("input.reg-ent").fill(ent);
  await fila.locator("input.reg-placa").fill(pl);
};
await llenar(0, "AG22 EER Barranquilla", "AG07 Alm. Bodega Carnaval", "3500005", "10", "7690228620", "snr719");
const desc = await pag.locator("table.reg-lineas tbody tr").nth(0).locator("td.tex").textContent();
ok(/Costeñita 175R/.test(desc), "el código trae la descripción: " + desc);
const ef1 = await pag.locator("table.reg-lineas tbody tr").nth(0).locator("small").textContent();
ok(/AG22 −10/.test(ef1) && /AG07 \+10/.test(ef1), "efecto AG22→AG07: " + ef1);
ok(await pag.locator("table.reg-lineas tbody tr").nth(0).locator("input.reg-placa").inputValue() === "SNR719", "placa en mayúsculas");
await pag.screenshot({ path: R(".arnes/tmp/reg/mov-linea.png"), fullPage: true });

/* Agregar más líneas */
await pag.click("button:has-text('Agregar línea')");
await llenar(1, "AG07 Alm. Bodega Carnaval", "CRISTALERIA PELDAR S A", "3500162", "10", "33000", "snr719");
const ef2 = await pag.locator("table.reg-lineas tbody tr").nth(1).locator("small").textContent();
ok(/AG07 −10/.test(ef2) && !/\+/.test(ef2), "AG07→cliente solo resta de AG07: " + ef2);
await pag.click("button:has-text('Agregar línea')");
await llenar(2, "CA22 ERR Atlántico", "AG07 Alm. Bodega Carnaval", "3500213", "20", "7689057353", "LQO821");
const ef3 = await pag.locator("table.reg-lineas tbody tr").nth(2).locator("small").textContent();
ok(/no mueve Control/i.test(ef3), "CA22→AG07 se registra sin descontar: " + ef3);
const chk = await pag.locator("table.reg-lineas tbody tr").nth(2).locator("input[type=checkbox]").isChecked();
ok(chk === false, "CA22 viene con «Descuenta» apagado");

/* validación: línea con material inexistente bloquea */
await pag.click("button:has-text('Agregar línea')");
await llenar(3, "AG22 EER Barranquilla", "AG07 Alm. Bodega Carnaval", "9999999", "5", "", "");
ok(await pag.locator("button.btn.grande").isDisabled(), "con un material que no existe, no deja registrar");
await pag.locator("table.reg-lineas tbody tr").nth(3).locator("button").last().click();

await pag.click("button.btn.grande");
await pag.waitForSelector("[role=dialog], [role=alertdialog], .cf-botones", { timeout: 3000 });
await pag.click(".cf-botones .cf-btn:not(.plano)");
await pag.waitForSelector("text=Listo: 3 movimientos", { timeout: 3000 }).catch(() => fallas.push("no salió «Listo: 3 movimientos»"));
const rpc = (await pag.evaluate(() => window.llamadas)).find((l) => l.f === "casco_movimiento_registrar");
ok(rpc && rpc.a.p_fecha === "2026-10-08" && rpc.a.p_filas.length === 3, "mandó 3 filas con la fecha");
ok(rpc && rpc.a.p_filas[0].placa === "SNR719" && rpc.a.p_filas[0].entrega === "7690228620" && rpc.a.p_filas[2].afecta === false, "entrega, placa y afecta viajan: " + JSON.stringify(rpc?.a.p_filas[2]));

/* historial */
await pag.waitForSelector("text=7689057353");
const filasH = async () => pag.evaluate(() => { const t = [...document.querySelectorAll("table.cas-tabla")].find((x) => /N° entrega/.test(x.tHead?.textContent ?? "") && !x.classList.contains("reg-lineas")); return t ? [...t.tBodies[0].rows].map((r) => [...r.cells].map((c) => c.textContent.trim())) : [] });
let h = await filasH();
ok(h.length === 3, "el historial muestra 3: " + h.length);
await pag.screenshot({ path: R(".arnes/tmp/reg/mov-hist.png"), fullPage: true });

/* filtros */
const campo = (rot) => pag.locator(`.reg-filtros label:has(> span:text-is("${rot}"))`);
const rots = await pag.$$eval(".reg-filtros label > span", (s) => s.map((x) => x.textContent.trim()));
console.log("filtros:", rots.join(" | "));
await pag.locator('.reg-filtros label:has-text("Material, entrega") input').fill("33000");
h = await filasH(); ok(h.length === 1 && h[0].join(" ").includes("33000"), "filtro por entrega 33000: " + h.length);
await pag.locator('.reg-filtros label:has-text("Material, entrega") input').fill("");
const ef = pag.locator('.reg-filtros label:has-text("Descuenta inventario") select');
console.log("opciones efecto:", await ef.locator("option").allTextContents());
await ef.selectOption({ index: 2 });
h = await filasH(); ok(h.length === 1 && h[0].join(" ").includes("7689057353"), "filtro «no descuenta» deja solo el de CA22: " + h.length);
await ef.selectOption({ index: 1 });
h = await filasH(); ok(h.length === 2, "filtro «descuenta» deja 2: " + h.length);
await ef.selectOption({ index: 0 });
await pag.locator('.reg-filtros label:has-text("Alm origen") select').selectOption({ label: "AG07 Alm. Bodega Carnaval" });
h = await filasH(); ok(h.length === 1, "filtro por origen AG07: " + h.length);
await pag.locator('.reg-filtros label:has-text("Alm origen") select').selectOption({ index: 0 });
await pag.locator('.reg-filtros label:has-text("Desde") input').fill("2026-10-09");
await pag.waitForTimeout(100); h = await filasH(); ok(h.length === 1 && /Ningún movimiento/.test(h[0][0]), "desde 9 de oct no hay nada");
await pag.locator('.reg-filtros label:has-text("Desde") input').fill("");

/* LOS DESPLEGABLES YA NO SE EDITAN AQUÍ: viven en Inventario · Maestro. Registrar solo registra y muestra el historial. */
ok(await pag.locator("h2:text-is('Desplegables')").count() === 0, "Registrar ya no trae la sección «Desplegables»");
ok(await pag.locator("button:has-text('Agregar a')").count() === 0 && await pag.locator("button:text-is('Borrar')").count() === 0, "Registrar no trae botones de agregar/borrar del maestro");
ok(await pag.locator("a[href='/inventario/maestro']").count() === 1, "avisa que se agregan en el Maestro, con su enlace");
await pag.screenshot({ path: R(".arnes/tmp/reg/mov-maestro.png"), fullPage: true });

/* deshacer */
await pag.locator("table.cas-tabla tbody tr button[aria-label*='eshacer'], table.cas-tabla tbody tr button:has-text('×')").first().click().catch(() => fallas.push("no encontré el × de deshacer"));
await pag.waitForSelector(".cf-botones", { timeout: 3000 }).catch(() => {});
await pag.click(".cf-botones .cf-btn:not(.plano)").catch(() => {});
await pag.waitForSelector("text=Se deshizo", { timeout: 3000 }).catch(() => fallas.push("no salió «Se deshizo»"));
h = await filasH(); ok(h.length === 2, "tras deshacer quedan 2: " + h.length);
ok(errs.length === 0, "errores en consola: " + errs.join(" | "));
await b.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Registrar · Movimiento: desplegables, material → descripción, efecto en Control, validación, registrar, historial, filtro y deshacer; sin edición de maestro.");
