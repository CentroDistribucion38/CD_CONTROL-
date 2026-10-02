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
ok(fefoDespues(fin(1000), conteos)?.id === "b", "DESPUÉS: el primero enviado después del final (no el último de todos): " + fefoDespues(fin(1000), conteos)?.id);
ok(conteoDelPar(ini, fin(1000), conteos) === "b", "el conteo del par sin módulos es el de DESPUÉS");
const cE = CT("e", "2026-10-01T23:00:00Z");
ok(conteoDelPar(ini, fin(1000), [cE, cB, cA]) === "b", "el de DESPUÉS es el PRIMERO enviado tras el final, aunque haya otro más tarde el mismo día: " + conteoDelPar(ini, fin(1000), [cE, cB, cA]));
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
ok(t.estado === "incompleto" && /después del corte final/.test(p.a.fefo.falta), "sin FEFO posterior lo dice: " + p.a.fefo.falta);
p = armarPar(corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0, null)]), corte("f", "final", "2026-10-01T11:00:00Z", [RN("L1", 1000, null)], "i"), est, nombre, ctx, "b"); t = tabla(p, "b");
ok(t.estado === "incompleto" && /escoger el envase/.test(p.a.filas[0].origen.motivo), "sin envase dice que falta escogerlo: " + p.a.filas[0].origen.motivo);
p = armarPar(ini, fin(1000), est, nombre, ctx, "c"); t = tabla(p, "c");
ok(p.a.fefo.antes.id === "a" && p.a.filas[0].origen.mov === 1100, "al escoger otro FEFO (c) se recalcula, y el módulo que ese FEFO no visitó (uB) no cuenta como vacío: " + p.a.fefo.antes.id + " " + p.a.filas[0].origen.mov);
/* La avería no cuenta como envase bueno. */
const conAveria = new Map(lineasPorConteo); conAveria.set("b", [LC("b", "E1", "uA", 1000), LC("b", "E1", "uA", 300, { averia: true })]);
p = armarPar(ini, fin(1000), est, nombre, { ...ctx, lineasPorConteo: conAveria }, "b");
ok(p.a.filas[0].origen.mov === 1000 && p.a.filas[0].origen.modulos[0].fin === 1000, "la avería no suma como envase bueno");
/* Un par con módulos anotados se analiza tal cual. */
const finM = corte("f", "final", "2026-10-01T11:00:00Z", [RN("L1", 1000, "E1", "P1", { origenes: [{ ubicacion_id: "uA", cant: 5, unidad: "cajas" }] })], "i");
const iniM = corte("i", "inicial", "2026-10-01T10:00:00Z", [RN("L1", 0, "E1", "P1", { origenes: [{ ubicacion_id: "uA", cant: 1005, unidad: "cajas" }] })]);
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
const RN = (linea: string, cajas: number, envase: string | null = "E1") => ({ linea, cajas_depa: cajas, material_id: null, envase_id: envase, origenes: [], destinos: [], nota: null });
const ini = { id: "i", tipo: "inicial", inicial_id: null, cortado_en: "2026-10-01T10:00:00.000Z", nota: null, creado_por: "u1", renglones: [RN("L1", 0), RN("L2", 0, null)] };
const fin = { id: "f", tipo: "final", inicial_id: "i", cortado_en: "2026-10-01T11:00:00.000Z", nota: null, creado_por: "u1", renglones: [RN("L1", 1000), RN("L2", 50, null)] };
const sin = { id: "s", tipo: "inicial", inicial_id: null, cortado_en: "2026-10-02T15:00:00.000Z", nota: null, creado_por: "u1", renglones: [RN("L1", 0)] };
const conteos = [{ id: "b", codigo: "FEFO-B", fecha: "2026-10-01", enviado_en: "2026-10-01T12:00:00Z" }, { id: "a", codigo: "FEFO-A", fecha: "2026-09-30", enviado_en: "2026-09-30T12:00:00Z" }];
const lc = (c: string, p: string, u: string, t: number) => ({ conteo_id: c, producto_id: p, ubicacion_id: u, total_cajas: t, averia: false, pnc: false });
const lineasConteo = [lc("a", "E1", "uA", 2000), lc("b", "E1", "uA", 1000)];
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

/* El formulario: solo cajas de la depa y envase. */
await monta("c=vacio");
await pg.click('button:has-text("Nuevo corte inicial")');
ok(await pg.locator("fieldset.cl-sitio").count() === 0 && await pg.locator(".cl-mod").count() === 0, "el formulario NO pide de dónde toma ni dónde ubica");
ok(await pg.locator(".cl-depa input").count() === 1 && await pg.locator(".cl-mat").count() === 1 && /Envase/.test(await pg.locator(".cl-mat-t").textContent()), "pide las cajas de la depa y el envase (solo el envase)");
ok(/sale del FEFO/.test(await pg.locator(".cl-fefo").textContent()), "dice que de dónde toma sale del FEFO");
await pg.fill(".cl-depa input", "1234");
await pg.fill(".cl-busca input", "flint"); await pg.click(".cl-busca li button");
await pg.click(".cl-guardar .cl-go");
await pg.waitForFunction(() => window.__rpc.length === 1);
const rpc = await pg.evaluate(() => window.__rpc[0]);
const r0 = rpc.a.p_renglones[0];
ok(rpc.n === "inv_corte_guardar" && r0.cajas_depa === 1234 && r0.envase_id === "E1" && r0.material_id === null && r0.origenes.length === 0 && r0.destinos.length === 0, "se manda solo la depa y el envase, sin módulos ni producto: " + JSON.stringify(r0));
await pg.reload(); await pg.waitForSelector("#r > *");
await pg.click('button:has-text("Nuevo corte inicial")');
await pg.click('button:has-text("Anotar los módulos a mano")');
ok(await pg.locator("fieldset.cl-sitio").count() === 2, "«Anotar los módulos a mano» sigue disponible, cerrado de entrada");

/* La diferencia y el flujo. */
await monta("c=todo");
const t0 = await txt();
ok(/De dónde tomaba el envase sale del FEFO: lo que bajó entre FEFO-A \(30\/09\/2026\) y FEFO-B \(01\/10\/2026\)/.test(t0) && /Solo cuenta el envase/.test(t0), "la diferencia dice de qué FEFO salió: " + t0.slice(t0.indexOf("De dónde tomaba"), t0.indexOf("De dónde tomaba") + 200));
ok(/FEFO de después/.test(t0), "el selector se llama «FEFO de después»");
ok(!/Ubicados en/.test(await pg.locator(".dq-cuerpo").first().textContent()), "la diferencia no tiene «Ubicados en»");
ok(await pg.locator(".dq-cuerpo .dq-card").count() === 2, "una tarjeta por línea");
const tarj = (await pg.locator(".dq-card").first().textContent()).replace(/\s+/g, " ");
ok(/Según el FEFO/.test(tarj) && /Cuadra/i.test(tarj), "L1: según el FEFO, cuadra: " + tarj.slice(0, 200));
const tarj2 = (await pg.locator(".dq-card").nth(1).textContent()).replace(/\s+/g, " ");
ok(/La línea no dice el envase/.test(tarj2), "L2 sin envase lo dice: " + tarj2.slice(-200));
/* Cambiar el FEFO de después recalcula. */
await pg.selectOption(".dq-barra select", "a");
ok(/FEFO-A|no hay un FEFO enviado antes|Falta/.test(await txt()), "al cambiar el FEFO se recalcula");

/* El proceso: el corte 1 abre y no tiene «Ubicados en». */
await pg.locator(".pr-corte").first().locator("summary").click();
const pr = (await pg.locator(".pr-corte").first().textContent()).replace(/\s+/g, " ");
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
