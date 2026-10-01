/* =====================================================================
   CONTAR · «TU HOJA» DEL INVENTARIO FISCAL
   «Cuando le dé a un botón se visualice en Contar y a cada quien le aparezca su
   hoja asignada, desde su rol.»
   Parte 1: la PÁGINA de verdad (servidor) con dobles de permisos, maestro y supabase: qué pide a la
            base, que si la base no tiene la función Contar sigue sirviendo, y que quien no tiene
            permiso de contar igual ve su hoja.
   Parte 2: la tarjeta en Chromium en 4 anchos.
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync, build } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

/* ---------------- Parte 1: la página ---------------- */
writeFileSync(R(".arnes/_cf-permisos.ts"), `export async function misPermisos() { const g = globalThis as any; return { puedeEditar: () => g.__PUEDE !== false } }`);
writeFileSync(R(".arnes/_cf-fefo.ts"), `
export async function maestroInventario() { return { falta: false, bodegas: [{ id: "b1", codigo: "CD38", activo: true }], ubicaciones: [{ bodega_id: "b1", id: "u1" }], materiales: [], estados: [] } }
export async function miConteoFefo() { return { conteo: null, renglones: [] } }`);
writeFileSync(R(".arnes/_cf-server.ts"), `
export async function createClient() { const g = globalThis as any; return { rpc: async (fn: string) => { g.__RPC.push(fn); return g.__RESP } } }`);
writeFileSync(R(".arnes/_cf-cliente.ts"), `export function createClient() { return { rpc: async () => ({ data: [], error: null }) } }`);
writeFileSync(R(".arnes/_cf-contar.tsx"), `export function Contar() { return <div id="contar-de-verdad">CONTAR</div> }`);
writeFileSync(R(".arnes/_cf-page.tsx"), `export { default } from "../src/app/(app)/inventario/conteo/page";`);
const pagina = (await build({ entryPoints: [R(".arnes/_cf-page.tsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic",
  alias: { "@/lib/permisos": R(".arnes/_cf-permisos.ts"), "@/modulos/inventario/fefo": R(".arnes/_cf-fefo.ts"), "@/lib/supabase/server": R(".arnes/_cf-server.ts"), "@/lib/supabase/client": R(".arnes/_cf-cliente.ts"), "@": R("src") },
  plugins: [{ name: "contar", setup(b) {
    b.onResolve({ filter: /^\.\/Contar$/ }, () => ({ path: R(".arnes/_cf-contar.tsx") }));
    b.onResolve({ filter: /\.css$/ }, () => ({ path: "x", namespace: "css" }));
    b.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "", loader: "js" }));
  } }],
  external: ["react", "react-dom", "react/jsx-runtime", "next/*"], logLevel: "silent" })).outputFiles[0].text;
writeFileSync(R(".arnes/_cf-page.bundle.mjs"), pagina);
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const Pagina = (await import(R(".arnes/_cf-page.bundle.mjs") + "?" + Date.now())).default;
const dibuja = async (resp, puede = true) => {
  globalThis.__RPC = []; globalThis.__RESP = resp; globalThis.__PUEDE = puede;
  return renderToStaticMarkup(await Pagina());
};
const FILAS = [
  { fiscal_id: "f1", nombre: "FISCAL OCTUBRE 2026 · viernes 02/10", fecha: "2026-10-02", hoja: 3, equipo: "OL", pareja: "Ana Bavaria", pareja_equipo: "BAVARIA" },
  { fiscal_id: "f1", nombre: "FISCAL OCTUBRE 2026 · viernes 02/10", fecha: "2026-10-02", hoja: 1, equipo: "OL", pareja: null, pareja_equipo: null },
];
let h = await dibuja({ data: FILAS, error: null });
ok(globalThis.__RPC.length === 1 && globalThis.__RPC[0] === "inv_fiscal_mis_hojas", "la página no le pide a la base «mis hojas»: " + globalThis.__RPC);
ok(/FISCAL OCTUBRE 2026 · viernes 02\/10/.test(h) && /TUS HOJAS/.test(h), "no muestra el inventario con «tus hojas»");
ok(h.indexOf("Hoja 1") > -1 && h.indexOf("Hoja 1") < h.indexOf("Hoja 3"), "las hojas no salen en orden de número");
ok(/cuentas por el <b>Operador logístico<\/b>/.test(h) && !/cuentas por el <b>Bavaria/.test(h), "no dice de qué equipo es");
ok(/Tu pareja: <b>Ana Bavaria<\/b> \(Bavaria\)/.test(h) && /Todavía sin pareja/.test(h), "no dice quién es la pareja (o que falta)");
ok(h.indexOf("fa-caja") > -1 && h.indexOf("fa-caja") < h.indexOf("contar-de-verdad"), "la hoja debe ir arriba de contar");
/* Quien no tiene permiso de contar igual ve su hoja. */
h = await dibuja({ data: FILAS, error: null }, false);
ok(/fa-caja/.test(h) && /Solo de lectura/.test(h), "sin permiso de contar no ve su hoja (o desapareció el aviso de lectura)");
/* Un equipo Bavaria. */
h = await dibuja({ data: [{ fiscal_id: "f2", nombre: "Otro", fecha: "2026-10-09", hoja: 2, equipo: "BAVARIA", pareja: "Luis OL", pareja_equipo: "OL" }], error: null });
ok(/cuentas por <b>Bavaria<\/b>/.test(h) && /Tu pareja: <b>Luis OL<\/b> \(Operador logístico\)/.test(h) && /TU HOJA/.test(h) && !/TUS HOJAS/.test(h), "el caso de Bavaria: " + h.slice(h.indexOf("fa-caja"), h.indexOf("fa-caja") + 500));
/* ---- «Qué vas a contar»: el selector FEFO | Fiscal ---- */
const CON_ID = (o = {}) => [{ ...FILAS[1], hoja_id: "h1", puede_contar: true, mis_renglones: 0, ...o }];
const sel = (h) => h.slice(h.indexOf('class="fc-modo"'), h.indexOf('class="fc-modo"') + 900);
h = await dibuja({ data: CON_ID(), error: null });
ok(/class="fc-modo"/.test(h) && /FEFO diario/.test(h) && /Fiscal · Hoja 1/.test(h), "con hoja asignada no sale el selector «FEFO diario | Fiscal · Hoja N»: " + h.slice(0, 200));
ok(/aria-selected="true"[^>]*><b>Fiscal/.test(sel(h)) && /aria-selected="false"[^>]*><b>FEFO diario/.test(sel(h)), "el día de la hoja debe abrir en Fiscal");
ok(h.indexOf("fa-caja") < h.indexOf("fc-modo") && h.indexOf("fc-modo") < h.indexOf("contar-de-verdad"), "el orden debe ser tarjeta, selector, conteo");
ok(/<div hidden="">(?:(?!<\/div>).)*contar-de-verdad/.test(h), "el conteo FEFO debe seguir montado pero escondido (si no, pierde su borrador al cambiar)");
ok(/fe-anotar fc-anotar/.test(h) && /Hoja 1 · anotar lo que hay/.test(h) && /Anotar renglón/.test(h), "en Fiscal no sale el formulario para contar");
ok(/Cuentas a ciegas/.test(h), "no dice que se cuenta a ciegas");
/* Todavía no es el día: abre en FEFO y la hoja explica cuándo se cuenta. */
h = await dibuja({ data: CON_ID({ puede_contar: false, fecha: "2026-10-09" }), error: null });
ok(/aria-selected="true"[^>]*><b>FEFO diario/.test(sel(h)), "antes del día debe abrir en el FEFO");
ok(/Todavía no es el día/.test(h) && !/fe-anotar fc-anotar/.test(h), "antes del día no debe dejar anotar y debe decir cuándo");
/* Sin permiso de contar el FEFO, igual cuenta su hoja. */
h = await dibuja({ data: CON_ID(), error: null }, false);
ok(/class="fc-modo"/.test(h) && /fe-anotar fc-anotar/.test(h) && /Solo de lectura/.test(h), "sin permiso del FEFO igual debe poder contar su hoja");
/* La base todavía sin lo de contar (viejas 7 columnas): se ve la tarjeta, no hay selector, Contar sigue. */
h = await dibuja({ data: FILAS, error: null });
ok(!/fc-modo/.test(h) && /fa-caja/.test(h) && /contar-de-verdad/.test(h), "con la función vieja no debe salir el selector");
/* Quien no tiene hoja no ve ningún selector. */
h = await dibuja({ data: [], error: null });
ok(!/fc-modo/.test(h), "sin hoja no debe haber selector");
/* El menú sigue el flujo. */
const reg = (await build({ entryPoints: [R("src/modulos/registro.ts")], bundle: true, write: false, format: "esm", platform: "node", alias: { "@": R("src") }, logLevel: "silent" })).outputFiles[0].text;
writeFileSync(R(".arnes/_cf-registro.bundle.mjs"), reg);
const { MODULOS } = await import(R(".arnes/_cf-registro.bundle.mjs") + "?" + Date.now());
const orden = MODULOS.find((m) => m.id === "inventario").secciones.filter((x) => x.rama === "conteos").map((x) => x.nombre);
ok(JSON.stringify(orden) === JSON.stringify(["Inventario fiscal", "Corte de líneas", "Contar", "La base", "Tablero", "Maestro", "Recepción"]), "el menú de Conteos no sigue el flujo: " + orden.join(" → "));

/* Sin nada que mostrar, no sale la tarjeta; si la base no tiene la función, Contar sigue. */
h = await dibuja({ data: [], error: null });
ok(!/class="fa/.test(h) && /contar-de-verdad/.test(h), "sin hojas debe salir solo Contar");
h = await dibuja({ data: null, error: { message: "function public.inv_fiscal_mis_hojas() does not exist" } });
ok(!/class="fa/.test(h) && /contar-de-verdad/.test(h), "si falta el SQL, Contar debe seguir sirviendo");
h = await dibuja({ data: null, error: null });
ok(!/class="fa/.test(h) && /contar-de-verdad/.test(h), "sin datos Contar no sigue");

/* ---------------- Parte 2: la tarjeta, en Chromium ---------------- */
writeFileSync(R(".arnes/_cf-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { FiscalAsignado } from "../src/app/(app)/inventario/conteo/FiscalAsignado";
const w = window as any;
createRoot(document.getElementById("r")!).render(<FiscalAsignado filas={w.FILAS} hoy={w.HOY} />);`);
const js = buildSync({ entryPoints: [R(".arnes/_cf-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic", alias: { "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/conteo/asignado.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = []; pg.on("pageerror", (e) => roto.push(e.message));
const monta = async (filas, hoy, ancho) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div>
    <script>window.FILAS=${JSON.stringify(filas)};window.HOY=${JSON.stringify(hoy)};</script><script>${js}<\/script></body></html>`);
};
const MUCHAS = [...FILAS, { fiscal_id: "f1", nombre: "FISCAL OCTUBRE 2026 · viernes 02/10", fecha: "2026-10-02", hoja: 12, equipo: "OL", pareja: "Una persona con un nombre larguísimo de apellidos compuestos", pareja_equipo: "BAVARIA" },
  { fiscal_id: "f2", nombre: "FISCAL NOVIEMBRE 2026 · viernes 06/11", fecha: "2026-11-06", hoja: 2, equipo: "OL", pareja: null, pareja_equipo: null }];
for (const w of [360, 390, 820, 1440]) {
  await monta(MUCHAS, "2026-10-01", w);
  await pg.waitForSelector(".fa-caja");
  const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth, cajas: document.querySelectorAll(".fa-caja").length,
    fuera: [...document.querySelectorAll(".fa-caja *")].filter((e) => e.getBoundingClientRect().right > document.querySelector(".fa-caja").getBoundingClientRect().right + 1).length }));
  ok(d.cajas === 2, `a ${w} px no salen 2 inventarios`);
  ok(JSON.stringify(await pg.locator(".fa-nombre").allTextContents()) === JSON.stringify(["FISCAL OCTUBRE 2026 · viernes 02/10", "FISCAL NOVIEMBRE 2026 · viernes 06/11"]), `a ${w} px los inventarios no salen del más cercano al más lejano`);
  ok(d.ancho <= d.vista, `a ${w} px se sale: ${d.ancho}>${d.vista}`);
  ok(d.fuera === 0, `a ${w} px hay ${d.fuera} elementos fuera de su caja`);
}
await monta(MUCHAS, "2026-10-01", 390);
const t = await pg.$eval("#r", (e) => e.textContent.replace(/\s+/g, " "));
ok(/viernes 02\/10\/2026 · mañana/.test(t) && /viernes 06\/11\/2026 · en 36 días/.test(t), "no dice cuánto falta: " + t.slice(0, 300));
await monta(MUCHAS, "2026-10-02", 390);
ok(await pg.locator(".fa-caja.hoy").count() === 1 && /HOY/.test(await pg.locator(".fa-caja.hoy").textContent()), "el inventario de hoy no se marca");
if (process.env.FOTO) { await monta(MUCHAS, "2026-10-02", 390); await pg.screenshot({ path: process.env.FOTO + "/contar-fiscal-m.png", fullPage: true }) }
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 2).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Contar → «tu hoja»: la página pide mis hojas, las pone arriba aun sin permiso de contar, dice equipo y pareja, no sale si no hay nada, no tumba Contar si falta el SQL, marca el de hoy y nada se sale en 4 anchos.");
