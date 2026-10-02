/* =====================================================================
   INVENTARIO · CORTE DE LÍNEAS — LOS MÓDULOS SALEN DEL FEFO
   Al hacer el corte solo se piden las cajas de la depa (y el envase).
   De dónde toma el envase se lee del FEFO por diferencia: lo que bajó entre
   el último recorrido enviado ANTES del corte inicial y el primero enviado
   DESPUÉS del corte final. Solo el envase: el producto y dónde se ubica no
   entran.
   1. Las cuentas (armarPar / armarTabla).
   2. La pantalla: el formulario sin módulos, lo que se manda a la base, la
      diferencia con su aviso del FEFO, el flujo sin «Ubicados en».
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
process.on("uncaughtException", (e) => { fallas.forEach((x) => console.log("✗ " + x)); console.log("✗ el arnés no pudo terminar: " + e.message); process.exit(1) });

writeFileSync(R(".arnes/_cf.mjs"), buildSync({ entryPoints: [R("src/modulos/inventario/corte.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" }).outputFiles[0].text);
const M = await import(R(".arnes/_cf.mjs") + "?" + Date.now());
const { armarPar, armarTabla, cruzar, fefoAntes, fefoDespues, conteoDelPar, usaFefo } = M;

/* ---------- 1 · LAS CUENTAS ---------- */
const CT = (id, enviado) => ({ id, codigo: id.toUpperCase(), fecha: enviado.slice(0, 10), enviado_en: enviado });
const cA = CT("a", "2026-09-30T12:00:00Z"), cB = CT("b", "2026-10-01T12:00:00Z"), cC = CT("c", "2026-10-03T12:00:00Z");
const conteos = [cC, cB, cA];
const LC = (c, p, u, t, extra = {}) => ({ conteo_id: c, producto_id: p, ubicacion_id: u, total_cajas: t, averia: false, pnc: false, ...extra });
const lineasPorConteo = new Map([
  ["a", [LC("a", "E1", "uA", 2000), LC("a", "E1", "uB", 500), LC("a", "P1", "uP", 100)]],
  ["b", [LC("b", "E1", "uA", 1000), LC("b", "E1", "uB", 500), LC("b", "P1", "uP", 5000)]],
  ["c", [LC("c", "E1", "uA", 900)]],
]);
const RN = (linea, cajas, envase = "E1", prod = "P1", extra = {}) => ({ linea, cajas_depa: cajas, material_id: prod, envase_id: envase, origenes: [], destinos: [], nota: null, ...extra });
const corte = (id, tipo, en, rens, ini = null) => ({ id, tipo, inicial_id: ini, cortado_en: en, nota: null, creado_por: "u", renglones: rens });
const ctx = { conteos, lineasPorConteo, envaseDe: (r) => r.envase_id };
const nombre = (id) => id;
const est = () => 1;
const tabla = (par, conteoId, i = 0) => armarTabla(cruzar(par.a, conteoId, lineasPorConteo.get(conteoId) ?? [])[i], true, nombre);

const ini = corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0)]);
const fin = (c) => corte("f", "final", "2026-10-01T11:00:00Z", [RN("L1", c)], "i");

ok(fefoAntes(ini, conteos, null)?.id === "a", "ANTES: el último enviado antes del corte inicial: " + fefoAntes(ini, conteos, null)?.id);
ok(fefoDespues(conteos)?.id === "c", "DESPUÉS por defecto: el ÚLTIMO recorrido enviado: " + fefoDespues(conteos)?.id);
ok(conteoDelPar(ini, fin(1000), conteos) === "c", "el conteo del par sin módulos es el último enviado");
const cE = CT("e", "2026-10-01T10:30:00Z"); // enviado ENTRE el inicial y el final
ok(conteoDelPar(ini, fin(1000), [cE, cA]) === "e", "se toma el último enviado aunque se haya enviado antes del corte final (como pasa con un recorrido que se manda mientras se cortan las líneas): " + conteoDelPar(ini, fin(1000), [cE, cA]));
ok(usaFefo(fin(1000)) && !usaFefo(corte("f2", "final", "2026-10-01T11:00:00Z", [RN("L1", 5, "E1", "P1", { origenes: [{ ubicacion_id: "uA", cant: 1, unidad: "cajas" }] })], "i")), "usaFefo solo si el renglón no trae módulos");

let p = armarPar(ini, fin(1000), est, nombre, ctx, "b");
let t = tabla(p, "b");
ok(p.a.fefo?.antes?.id === "a" && p.a.fefo?.despues?.id === "b" && p.a.fefo.lineas.join() === "L1", "el análisis dice de qué FEFO salió");
ok(p.a.filas[0].origen.modulos.length === 1, "solo sale el módulo donde BAJÓ el envase (el que no cambió no): " + p.a.filas[0].origen.modulos.length);
ok(t.grupos.length === 1 && t.grupos[0].titulo === "Tomando de", "SOLO el envase: no hay «Ubicados en»: " + t.grupos.map((g) => g.titulo));
ok(t.estado === "cuadra", "el envase bajó 1.000 y la depa pasó 1.000: cuadra (" + t.estado + ")");
ok(p.a.filas[0].origen.mov === 1000 && p.a.filas[0].origen.dif === 0, "mov 1000, dif 0: " + p.a.filas[0].origen.mov + "/" + p.a.filas[0].origen.dif);
ok(!t.grupos[0].filas.some((f) => f.clase === "inv") && t.grupos[0].filas.some((f) => /FEFO/.test(f.etiqueta)), "la fila se llama «según el FEFO» y no repite un «según el inventario»");

p = armarPar(ini, fin(1500), est, nombre, ctx, "b"); t = tabla(p, "b");
ok(t.estado === "no_cuadra" && p.a.filas[0].origen.dif === 500, "la depa pasó 1.500 y el envase bajó 1.000: no cuadra, +500: " + t.estado + " " + p.a.filas[0].origen.dif);

/* El producto no cuenta: que haya subido 4.900 no cambia nada. */
ok(p.a.filas[0].destino.modulos.length === 0, "el producto no se lee del FEFO");

/* Dos líneas con el mismo envase: lo que bajó se reparte según lo que pasó cada una. */
const ini2 = corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0), RN("L2", 0)]);
const fin2 = corte("f", "final", "2026-10-01T11:00:00Z", [RN("L1", 600), RN("L2", 400)], "i");
p = armarPar(ini2, fin2, est, nombre, ctx, "b");
ok(p.a.filas.map((f) => f.origen.mov).join() === "600,400" && p.a.filas.every((f) => f.origen.dif === 0), "dos líneas, mismo envase: se reparte 600/400 y cuadran: " + p.a.filas.map((f) => f.origen.mov));

/* Sin FEFO antes / sin FEFO después / sin envase. */
p = armarPar(ini, fin(1000), est, nombre, { ...ctx, conteos: [cB] }, "b"); t = tabla(p, "b");
ok(t.estado === "incompleto" && /antes del corte inicial/.test(p.a.fefo.falta) && /antes del corte inicial/.test(p.a.filas[0].origen.motivo), "sin FEFO anterior al corte lo dice: " + p.a.fefo.falta);
p = armarPar(ini, fin(1000), est, nombre, ctx, null); t = tabla(p, null);
ok(t.estado === "incompleto" && /No hay recorridos enviados/.test(p.a.fefo.falta), "sin FEFO enviado lo dice: " + p.a.fefo.falta);
p = armarPar(corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0, null)]), corte("f", "final", "2026-10-01T11:00:00Z", [RN("L1", 1000, null)], "i"), est, nombre, ctx, "b"); t = tabla(p, "b");
ok(t.estado === "incompleto" && /escoger el envase/.test(p.a.filas[0].origen.motivo), "sin envase dice que falta escogerlo: " + p.a.filas[0].origen.motivo);
p = armarPar(ini, fin(1000), est, nombre, ctx, "c"); t = tabla(p, "c");
ok(p.a.fefo.antes.id === "a" && p.a.filas[0].origen.mov === 1100, "al escoger otro FEFO (c) se recalcula, y el módulo que ese FEFO no visitó (uB) no cuenta como vacío: " + p.a.fefo.antes.id + " " + p.a.filas[0].origen.mov);
/* La avería no cuenta como envase bueno. */
const conAveria = new Map(lineasPorConteo); conAveria.set("b", [LC("b", "E1", "uA", 1000), LC("b", "E1", "uA", 300, { averia: true })]);
p = armarPar(ini, fin(1000), est, nombre, { ...ctx, lineasPorConteo: conAveria }, "b");
ok(p.a.filas[0].origen.mov === 1000 && p.a.filas[0].origen.modulos[0].fin === 1000, "la avería no suma como envase bueno");
/* LA INFORMACIÓN QUE YA SE TENÍA: el inicial trae de dónde tomaba y el final no trae módulos. Se usan los del inicial y la cantidad final sale del FEFO. */
const iniD = corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0, "E1", "P1", { origenes: [{ ubicacion_id: "uA", cant: 2000, unidad: "cajas" }] })]);
p = armarPar(iniD, fin(1000), est, nombre, { ...ctx, conteos: [cB] }, "b"); t = tabla(p, "b");
ok(p.a.fefo?.falta === null && p.a.filas[0].origen.mov === 1000 && p.a.filas[0].origen.modulos[0].ubicacion_id === "uA" && t.estado === "cuadra", "con los módulos del inicial NO hace falta un FEFO de antes: " + p.a.filas[0].origen.mov + " " + t.estado + " " + p.a.fefo?.falta);
p = armarPar(iniD, fin(1000), est, nombre, { ...ctx, lineasPorConteo: new Map([["b", [LC("b", "E1", "uZ", 5)]]]) }, "b");
ok(p.a.filas[0].origen.motivo === null && /no pasó por uA: se toma como 0/.test(p.a.filas[0].origen.aviso), "si el FEFO no pasó por el módulo lo dice, y lo toma como 0: " + p.a.filas[0].origen.aviso);
/* LA UBICACIÓN DE DONDE SE TOMÓ SIEMPRE SE VE, y lo que el FEFO no tiene ahí es 0 (se fue todo): se compara con la depa. */
t = tabla(p, "b");
ok(p.a.filas[0].origen.modulos.length === 1 && p.a.filas[0].origen.modulos[0].ubicacion_id === "uA" && p.a.filas[0].origen.modulos[0].ini === 2000 && p.a.filas[0].origen.modulos[0].fin === 0 && p.a.filas[0].origen.mov === 2000, "el módulo se ve con lo que había y 0 en el FEFO: " + JSON.stringify(p.a.filas[0].origen.modulos));
ok(t.grupos[0].donde === "uA" && t.grupos[0].filas.length === 1 && t.grupos[0].filas[0].ini === 2000 && t.grupos[0].filas[0].fin === 0 && /FEFO/.test(t.grupos[0].filas[0].etiqueta) && /se toma como 0/.test(t.grupos[0].nota) && t.estado === "no_cuadra", "la tabla trae el módulo, lo que había, 0 y el aviso: " + JSON.stringify(t.grupos[0]));
/* TOLERANCIA: 72 estibas (3.888 cajas) tomadas y 3.744 por la depa = 144 cajas (3,8 %): dentro de tolerancia. */
const ini72 = corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0, "E1", "P1", { origenes: [{ ubicacion_id: "uA", cant: 3888, unidad: "cajas" }] })]);
const sinA = { ...ctx, lineasPorConteo: new Map([["b", [LC("b", "E1", "uZ", 5)]]]) };
p = armarPar(ini72, fin(3744), est, nombre, sinA, "b"); t = tabla(p, "b");
ok(t.estado === "cuadra" && /Dentro de tolerancia/.test(t.grupos[0].filas[0].lectura) && /faltan 144 cajas/.test(t.grupos[0].filas[0].lectura), "144 cajas de 3.744 (3,8 %) entran en la tolerancia: " + t.estado + " " + t.grupos[0].filas[0].lectura);
p = armarPar(ini72, fin(3000), est, nombre, sinA, "b"); t = tabla(p, "b");
ok(t.estado === "no_cuadra" && !/tolerancia/.test(t.grupos[0].filas[0].lectura), "888 cajas de 3.000 (30 %) no entran: " + t.estado + " " + t.grupos[0].filas[0].lectura);
p = armarPar(ini72, fin(3744), est, nombre, { ...ctx, lineasPorConteo: new Map([["b", [LC("b", "E1", "uA", 3888)]]]) }, "b"); t = tabla(p, "b");
ok(t.estado === "no_cuadra" && /Sobran|Faltan/.test(t.grupos[0].filas[0].lectura) , "si el FEFO sigue viendo todo en el módulo, el envase no bajó: " + t.estado + " " + t.grupos[0].filas[0].lectura);
/* Un par con módulos anotados se analiza tal cual. */
const finM = corte("f", "final", "2026-10-01T11:00:00Z", [RN("L1", 1000, "E1", "P1", { origenes: [{ ubicacion_id: "uA", cant: 5, unidad: "cajas" }] })], "i");
const iniM = corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0, "E1", "P1", { origenes: [{ ubicacion_id: "uA", cant: 1005, unidad: "cajas" }] })]);
/* La tolerancia es SOLO para lo que se lee del FEFO: un corte con sus dos lados anotados sigue siendo exacto. */
p = armarPar(corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0, "E1", "P1", { origenes: [{ ubicacion_id: "uA", cant: 3888, unidad: "cajas" }] })]),
  corte("f", "final", "2026-10-01T11:00:00Z", [RN("L1", 3744, "E1", "P1", { origenes: [{ ubicacion_id: "uA", cant: 0, unidad: "cajas" }] })], "i"), est, nombre, ctx, "b");
ok(tabla(p, "zz").estado === "no_cuadra", "con dos cortes anotados 144 cajas de diferencia sí son diferencia: " + tabla(p, "zz").estado);
/* Solo el final trae módulos: también se ven (no desaparecen). */
p = armarPar(corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0, "E1", "P1")]), finM, est, nombre, ctx, "b");
ok(p.a.filas[0].origen.modulos.length === 1 && p.a.filas[0].origen.modulos[0].fin === 5 && p.a.filas[0].origen.modulos[0].ini === null && /Solo está en el final/.test(p.a.filas[0].origen.modulos[0].nota), "si solo el final trae el módulo, también se ve: " + JSON.stringify(p.a.filas[0].origen.modulos));
p = armarPar(iniM, finM, est, nombre, ctx, "b");
ok(p.a.fefo === undefined && p.a.filas[0].origen.mov === 1000, "un corte con sus módulos no se toca");

/* ---------- 2 · LA PANTALLA ---------- */
writeFileSync(R(".arnes/_cf-cliente.ts"), `
const w = window as any; w.__rpc = [];
export function createClient() { return { rpc: async (n: string, a: any) => { w.__rpc.push({ n, a }); return { data: "id", error: null } } } }`);
writeFileSync(R(".arnes/_cf-nav.ts"), `export function useRouter() { return { refresh() {}, push() {}, replace() {}, back() {} } }`);
writeFileSync(R(".arnes/_cf-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Corte } from "../src/app/(app)/inventario/corte/Corte";
const AHORA = "2026-10-02T17:30:00.000Z";
const lineas = [{ clave: "L1", nombre: "Línea 1" }, { clave: "L2", nombre: "Línea 2" }];
const ubis = [{ id: "uA", calle: "A", modulo: "01", lado: "DER" }, { id: "uB", calle: "B", modulo: "12", lado: "IZQ" }];
const mats = [{ id: "E1", sku: "3500887", nombre: "Botella Flint 1000R", cajas_por_estiba: 60, unidades_por_caja: 12, tipo: "ENVASE" },
              { id: "P1", sku: "3128", nombre: "Águila RN 330cc X30", cajas_por_estiba: 36, unidades_por_caja: 30, tipo: "PRODUCTO" }];
const RN = (linea: string, cajas: number, envase: string | null = "E1") => ({ linea, cajas_depa: cajas, material_id: envase ? "P1" : null, envase_id: envase, origenes: [], destinos: [], nota: null });
const ini = { id: "i", tipo: "inicial", inicial_id: null, cortado_en: "2026-10-01T10:00:00.000Z", nota: null, creado_por: "u1", renglones: [{ ...RN("L1", 0), origenes: [{ ubicacion_id: "uA", cant: 2000, unidad: "cajas" }] }, RN("L2", 0, null)] };
const fin = { id: "f", tipo: "final", inicial_id: "i", cortado_en: "2026-10-01T11:00:00.000Z", nota: null, creado_por: "u1", renglones: [RN("L1", 1000), RN("L2", 50, null)] };
const sin = { id: "s", tipo: "inicial", inicial_id: null, cortado_en: "2026-10-02T15:00:00.000Z", nota: null, creado_por: "u1", renglones: [RN("L1", 0)] };
const conteos = [{ id: "b", codigo: "FEFO-B", fecha: "2026-10-01", enviado_en: "2026-10-01T12:00:00Z" }, { id: "a", codigo: "FEFO-A", fecha: "2026-09-30", enviado_en: "2026-09-30T12:00:00Z" }, { id: "z", codigo: "FEFO-Z", fecha: "2026-09-29", enviado_en: "2026-09-29T12:00:00Z" }];
const lc = (c: string, p: string, u: string, t: number) => ({ conteo_id: c, producto_id: p, ubicacion_id: u, total_cajas: t, averia: false, pnc: false });
const lineasConteo = [lc("a", "E1", "uA", 2000), lc("b", "E1", "uA", 1000), lc("z", "E1", "uB", 5)];
const c = new URL(location.href).searchParams.get("c") ?? "todo";
createRoot(document.getElementById("r")!).render(<Corte bodegaId="bod1" lineas={lineas} ubicaciones={ubis} materiales={mats} cortes={(c === "vacio" ? [] : c === "sin" ? [sin] : [sin, fin, ini]) as any}
  conteos={conteos} lineasConteo={lineasConteo} nombres={{ u1: "Cristian" }} puedeEditar={true} manda={true} verDiferencia={true} ahora={AHORA} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_cf-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_cf-cliente.ts"), "next/navigation": R(".arnes/_cf-nav.ts"), "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/corte/corte.css"].map((q) => readFileSync(R(q), "utf8")).join("\n");
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (query, ancho = 1440) => {
  await pg.unrouteAll(); await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({ contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div><script>${js}<\/script></body></html>` }));
  await pg.goto(`http://arnes.local/?${query}`); await pg.waitForSelector("#r > *");
};
const txt = () => pg.$eval("#r", (e) => e.textContent.replace(/\s+/g, " "));

/* El formulario: la depa, el producto y de dónde se toma el envase. NO dónde queda ubicado. */
await monta("c=vacio");
await pg.click('button:has-text("Nuevo corte inicial")');
ok(await pg.locator("fieldset.cl-sitio").count() === 1 && /Tomando de/.test(await pg.locator("fieldset.cl-sitio").textContent()), "pide de dónde toma y NO dónde ubica (un solo bloque: «Tomando de»)");
ok(!/Ubicados en/.test(await txt()), "no aparece «Ubicados en»");
ok(await pg.locator(".cl-par .cl-depa input").count() === 1 && await pg.locator(".cl-par .cl-mat").count() === 1 && await pg.locator(".cl-mat").count() === 2 && /Envase/.test(await pg.locator(".cl-mat-t").first().textContent()) && /Producto/.test(await pg.locator(".cl-mat-t").nth(1).textContent()), "como el diseño: Envase → cajas de la depa en una fila, y el PRODUCTO (con su SKU)");
ok(await pg.locator(".cl-unidad").count() === 0 && /¿Cuántas cajas\?/.test(await pg.locator("fieldset.cl-sitio .cl-cant-c").textContent()) && await pg.locator("fieldset.cl-sitio .cl-mat").count() === 0, "solo cajas, y el envase no se pide dos veces");
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + "-form.png", fullPage: true });
await pg.fill(".cl-depa input", "1234");
await pg.locator("fieldset.cl-sitio select").nth(0).selectOption("A");
await pg.locator("fieldset.cl-sitio select").nth(1).selectOption("01");
await pg.locator("fieldset.cl-sitio .cl-cant-c input").fill("40");
await pg.locator(".cl-par .cl-busca input").fill("flint"); await pg.locator(".cl-par .cl-busca li button").click();
await pg.click(".cl-guardar .cl-go");
ok(/el producto/.test(await pg.locator(".cl-mal").textContent()) && await pg.evaluate(() => window.__rpc.length) === 0, "sin producto no guarda y dice que falta el producto");
await pg.locator(".cl-mat").nth(1).locator(".cl-busca input").fill("3128"); await pg.locator(".cl-mat").nth(1).locator(".cl-busca li button").click();
ok(/3128/.test(await pg.locator(".cl-mat").nth(1).locator(".cl-mae").textContent()), "la tarjeta del producto trae su SKU: " + await pg.locator(".cl-mat").nth(1).locator(".cl-mae").textContent());
await pg.click(".cl-guardar .cl-go");
await pg.waitForFunction(() => window.__rpc.length === 1);
const rpc = await pg.evaluate(() => window.__rpc[0]);
const r0 = rpc.a.p_renglones[0];
ok(rpc.n === "inv_corte_guardar" && r0.cajas_depa === 1234 && r0.envase_id === "E1" && r0.material_id === "P1" && r0.origenes.length === 1 && r0.origenes[0].ubicacion_id === "uA" && r0.destinos.length === 0, "se manda la depa, el producto, el envase y de dónde toma; sin dónde ubica: " + JSON.stringify(r0));
await pg.reload(); await pg.waitForSelector("#r > *");
await pg.click('button:has-text("Nuevo corte inicial")');
await pg.click('button:has-text("Anotar también dónde quedó ubicado")');
ok(await pg.locator("fieldset.cl-sitio").count() === 2, "«Anotar también dónde quedó ubicado» sigue disponible, cerrado de entrada");

/* La diferencia y el flujo. */
await monta("c=todo");
const t0 = await txt();
ok(/De dónde tomaba el envase sale del FEFO/.test(t0) && /Solo cuenta el envase/.test(t0), "la diferencia dice de qué FEFO salió: " + t0.slice(t0.indexOf("De dónde tomaba"), t0.indexOf("De dónde tomaba") + 250));
ok(/FEFO de después/.test(t0), "el selector se llama «FEFO de después»");
{ const dc = await pg.locator(".dq-cuerpo").first().textContent(); ok(!/Ubicados en/.test(dc), "la diferencia no tiene «Ubicados en»: " + dc.replace(/\s+/g, " ").slice(dc.indexOf("Ubicados") - 150, dc.indexOf("Ubicados") + 100)) }
ok(await pg.locator(".dq-cuerpo .dq-card").count() === 2, "una tarjeta por línea");
const tarj = (await pg.locator(".dq-card").first().textContent()).replace(/\s+/g, " ");
ok(/Según el FEFO/.test(tarj) && /Cuadra/i.test(tarj), "L1: según el FEFO, cuadra: " + tarj.slice(0, 200));
const tarj2 = (await pg.locator(".dq-card").nth(1).textContent()).replace(/\s+/g, " ");
ok(/La línea no dice el envase/.test(tarj2), "L2 sin envase lo dice: " + tarj2.slice(-200));
ok(/para 3128 · Águila RN 330cc X30/.test(tarj), "la diferencia dice a qué producto (con su SKU) le entra el envase: " + tarj.slice(0, 300));
/* Cambiar el FEFO de después recalcula. */
await pg.selectOption(".dq-barra select", "a");
ok(/FEFO-A|no hay un FEFO enviado antes|Falta/.test(await txt()), "al cambiar el FEFO se recalcula");

if (process.env.SHOT) await pg.locator(".dq-card").first().screenshot({ path: process.env.SHOT + "-dif.png" });
/* Un FEFO que NO pasó por el módulo de donde se tomó: la ubicación se ve igual, con lo que había al iniciar. */
await pg.selectOption(".dq-barra select", "z");
{ const tz = (await pg.locator(".dq-card").first().textContent()).replace(/\s+/g, " ");
  ok(/A · 01 · DER/.test(tz) && /no pasó por A · 01 · DER: se toma como 0/.test(tz), "aunque el FEFO no pasó por el módulo, se ve de dónde se tomó: " + tz.slice(0, 400)) }
await pg.selectOption(".dq-barra select", "b");

/* El proceso: el corte 1 abre y no tiene «Ubicados en». */
await pg.locator(".pr-corte").first().locator("summary").click();
const pr = (await pg.locator(".pr-corte").first().textContent()).replace(/\s+/g, " ");
ok(/→ para 3128/.test(pr), "el flujo dice el SKU del producto al que le entra el envase: " + pr.slice(0, 300));
ok(!/Ubicados en/.test(pr) && !/Recibe \(debía subir\)/.test(pr) && /Tomando de/.test(pr) && /Surte \(debía bajar\)/.test(pr), "el flujo solo muestra el envase: " + pr.slice(0, 300));
await monta("c=sin");
ok(/Envase: 3500887 · Botella Flint 1000R · de dónde toma sale del FEFO/.test(await txt()), "el corte que espera su final dice el envase y que lo demás sale del FEFO: " + (await txt()).slice(0, 300));

for (const w of [1440, 820, 390, 360]) {
  await monta("c=todo", w);
  const fuera = await pg.evaluate(() => [...document.querySelectorAll(".fe *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && !e.closest(".pr-banda") && !e.closest("table") }).slice(0, 3).map((e) => e.tagName + "." + String(e.className) + " " + Math.round(e.getBoundingClientRect().right) + ">" + innerWidth + " " + (e.textContent || "").slice(0, 30)));
  ok(fuera.length === 0, `nada se sale a ${w}px: ${fuera}`);
}
await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Corte con módulos del FEFO: solo se piden las cajas de la depa y el envase; de dónde toma sale de lo que bajó entre dos FEFO; el producto no entra; se reparte entre líneas; avisa lo que falta.");
