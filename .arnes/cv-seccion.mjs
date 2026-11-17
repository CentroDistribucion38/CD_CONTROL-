/* CARNAVAL · INVENTARIO: «+ Agregar sección» y «Quitar sección». */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_nav-cvs.ts"), `export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });`);
writeFileSync(R(".arnes/_act-cvs.ts"), `export async function guardarHoja(fecha: string, j: string) { (window as any).guardado = JSON.parse(j); return { ok: true } }
export async function eliminarInventario() { return { ok: true } }`);
writeFileSync(R(".arnes/_cvs-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Inventario } from "../src/app/(app)/inventario/balance/cuadre/carnaval/Inventario";
const secs = [
  { titulo: "ENVASE", colA: "ESTIBA", colB: "CAJA", filas: [{ concepto: "Envase Marron 330R", codigo: "412644", a: 53, b: 33 }] },
  { titulo: "CAJA MALA", colA: "ESTIBA", colB: "CAJA", filas: [{ concepto: "Caja 330", codigo: "3500159", a: 33, b: 31 }] },
  { titulo: "CASCO VIDRIO CERVECERIA ATLANTICO", colA: "ESTIBA", colB: "", filas: [] },
];
const maestro = [{ codigo: "412644", descripcion: "ENVASE MARRON 330NR NUEVO" }, { codigo: "3501225", descripcion: "BOTELLA FLINT 250 CC" }, { codigo: "3500159", descripcion: "Caja Plástica Café 330cc X 30" }];
createRoot(document.getElementById("r")!).render(
  <Inventario fecha="2026-11-17" hoy="2026-11-17" guardado={{ fecha: "2026-11-17", secciones: secs, validacion: [], actualizado_en: "2026-11-17T19:30:00Z" }}
    base={null} dias={["2026-11-17"]} puedeEditar maestro={maestro as any}
    ctx={{ fecha: "2026-11-17", pallets: {}, carnaval: [], casco: { CA22: { nombre: "CA22 ERR Atlántico", fecha: "2026-11-17", filas: [{ sku: "3500162", descripcion: "Envase Marron 330R", estibas: 45 }] } } } as any} />);
`);
const stub = { name: "stub", setup(b) { b.onResolve({ filter: /^\.\/actions$/ }, () => ({ path: R(".arnes/_act-cvs.ts") })) } };
const out = (await import("esbuild")).buildSync ? null : null;
const r = await (await import("esbuild")).build({ entryPoints: [R(".arnes/_cvs-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  plugins: [stub], alias: { "next/navigation": R(".arnes/_nav-cvs.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error" });
const js = r.outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/inventario/balance/cuadre/cuadre.css"), "utf8") + readFileSync(R("src/app/(app)/inventario/balance/cuadre/carnaval/carnaval.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8");
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
pg.on("pageerror", (e) => fallas.push("error: " + e.message));
await pg.setViewportSize({ width: 1400, height: 1000 });
await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${css}</style></head>
  <body><div class="cs" id="r" style="padding:16px"></div><script>${js}</script></body></html>`);
await pg.waitForSelector(".cv-mas-sec");
const titulos = () => pg.$$eval(".cv-tabla thead th:nth-child(2)", (t) => t.map((x) => x.textContent));
await pg.click(".cv-mas-sec");
ok(await pg.isVisible('dialog[aria-label="Agregar sección"]'), "no abre la ventana");
await pg.fill(".cv-campo-sec input", "caja mala");
ok(/Ya hay una sección/.test(await pg.textContent("dialog[open]")), "deja repetir el nombre");
ok(await pg.$eval('dialog[open] button[type=submit]', (b) => b.disabled), "con nombre repetido deja agregar");
await pg.fill(".cv-campo-sec input", "Pallet");
ok(/se llena sola/.test(await pg.textContent("dialog[open]")), "deja crear PALLET a mano");
await pg.fill(".cv-campo-sec input", "  envase retorno  cerveceria atlantico ");
await pg.selectOption(".cv-campo-sec select", { label: "CAJA MALA" });
await pg.screenshot({ path: "/tmp/cvs-dlg.png" });
await pg.click('dialog[open] button[type=submit]');
const t1 = await titulos();
ok(JSON.stringify(t1) === JSON.stringify(["ENVASE", "CAJA MALA", "ENVASE RETORNO CERVECERIA ATLANTICO", "CASCO VIDRIO CERVECERIA ATLANTICO"]), "orden: " + t1.join(" | "));
const cab = await pg.$$eval(".cv-tabla", (ts) => [...ts[2].querySelectorAll("thead th")].map((x) => x.textContent));
ok(cab.includes("ESTIBA") && cab.includes("CAJA"), "la sección nueva no lleva estiba y caja: " + cab);
ok(await pg.isVisible(".cv-quitar-sec"), "la sección vacía no se puede quitar");
/* agregarle un SKU */
const add = pg.locator(".cv-tabla").nth(2).locator(".cv-add input");
await add.click(); await add.fill("3501225"); await pg.keyboard.press("Enter");
await pg.waitForTimeout(150);
const filas = await pg.locator(".cv-tabla").nth(2).locator("tbody tr").count();
ok(filas === 1, "no se agrega el SKU a la sección nueva (" + filas + ")");
ok(!(await pg.locator(".cv-tabla").nth(2).locator(".cv-quitar-sec").count()), "con renglones ofrece quitar la sección");
await pg.locator(".cv-tabla").nth(2).locator("input.cv-cel").first().fill("5");
await pg.screenshot({ path: "/tmp/cvs-nueva.png", fullPage: true });
await pg.click('button:has-text("Guardar inventario")');
await pg.waitForFunction(() => window.guardado);
const g = await pg.evaluate(() => window.guardado.secciones.map((s) => [s.titulo, s.colA, s.colB, s.filas.length]));
ok(JSON.stringify(g[2]) === JSON.stringify(["ENVASE RETORNO CERVECERIA ATLANTICO", "ESTIBA", "CAJA", 1]), "lo guardado: " + JSON.stringify(g));
/* crear otra y quitarla */
await pg.click(".cv-mas-sec"); await pg.fill(".cv-campo-sec input", "PRUEBA"); await pg.click('dialog[open] [type=radio] >> nth=2', { force: true });
await pg.click('dialog[open] button[type=submit]');
const t2 = await titulos(); ok(t2.at(-1) === "PRUEBA", "por defecto no va al final: " + t2.join("|"));
const cab2 = await pg.$$eval(".cv-tabla", (ts) => [...ts.at(-1).querySelectorAll("thead th")].map((x) => x.textContent));
ok(cab2.includes("CANTIDAD") && !cab2.includes("CAJA"), "solo cantidad: " + cab2);
await pg.locator(".cv-tabla").last().locator(".cv-quitar-sec").click();
ok(!(await titulos()).includes("PRUEBA"), "no quita la sección");
await pg.setViewportSize({ width: 390, height: 900 });
await pg.click(".cv-mas-sec");
await pg.screenshot({ path: "/tmp/cvs-cel.png" });
await nav.close();
console.log(fallas.length ? "FALLAS:\n- " + fallas.join("\n- ") : "TODO OK");
