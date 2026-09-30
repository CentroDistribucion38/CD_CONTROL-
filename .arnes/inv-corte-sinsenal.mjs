/* =====================================================================
   INVENTARIO · CORTE DE LÍNEAS — SIN SEÑAL
   Monta el componente REAL (solo supabase y next/navigation son dobles) y
   prueba lo que se ve: las listas, el análisis con su signo, el formulario
   (calle → módulo → lado, el lado que se pone solo, el final que arranca con
   lo del inicial), lo que se manda a la base y que nada se salga de la
   pantalla en 360/390/820/1440.

     node .arnes/inv-corte-sinsenal.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e)); if (process.env.TRAZA) console.log(e.stack);
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_ic-cliente.ts"), `
const w = window as any;
w.__rpc = []; w.__refresh = 0; w.__desde = []; w.__eq = []; w.__red = false; w.__falla = null;
w.__yaEsta = new URL(location.href).searchParams.get("ya") === "1";
const consulta = (): any => new Proxy(function () {}, {
  get: (_, k) => k === "eq" ? (...a: any[]) => { w.__eq.push(a.join("=")); return consulta() } : k === "then" ? (ok: any) => ok({ data: w.__red ? null : (w.__yaEsta ? [{ id: "ya" }] : []), error: w.__red ? { message: "TypeError: Failed to fetch" } : null }) : () => consulta(),
  apply: () => consulta() });
export function createClient() {
  return {
    from: (t: string) => { w.__desde.push(t); return consulta() },
    rpc: async (n: string, a: any) => {
      w.__rpc.push({ n, a });
      if (w.__red) return { data: null, error: { message: "TypeError: Failed to fetch" } };
      if (w.__falla) return { data: null, error: { message: w.__falla } };
      return { data: "nuevo-id", error: null };
    } };
}`);
writeFileSync(R(".arnes/_ic-nav.ts"), `
export function useRouter() { return { refresh: () => { (window as any).__refresh++ }, push() {}, replace() {}, back() {} } }`);

writeFileSync(R(".arnes/_ic-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Corte } from "../src/app/(app)/inventario/corte/Corte";

const AHORA = "2026-09-30T17:30:00.000Z"; // 12:30 en Colombia
const lineas = [{ clave: "L1", nombre: "Línea 1" }, { clave: "L2", nombre: "Línea 2" }, { clave: "L4", nombre: "Línea 4" }, { clave: "L6", nombre: "Línea 6" }];
const ubis = [
  { id: "uA01D", calle: "A", modulo: "01", lado: "DER" }, { id: "uA01I", calle: "A", modulo: "01", lado: "IZQ" },
  { id: "uA02D", calle: "A", modulo: "02", lado: "DER" },
  { id: "uB12I", calle: "B", modulo: "12", lado: "IZQ" }, { id: "uB12D", calle: "B", modulo: "12", lado: "DER" },
  { id: "uC05", calle: "C", modulo: "05", lado: null },
];
const mats = [{ id: "m1", sku: "3500887", nombre: "Botella Flint 1000R", cajas_por_estiba: 60, unidades_por_caja: 12, tipo: "ENVASE" },
              { id: "m2", sku: "3500005", nombre: "Envase Costeñita 175R", cajas_por_estiba: null, unidades_por_caja: null, tipo: "ENVASE" },
              { id: "m3", sku: "3128", nombre: "Águila RN 330cc X30", cajas_por_estiba: 36, unidades_por_caja: 30, tipo: "PRODUCTO" }];
const S = (u: string, cant: number, unidad: string) => ({ ubicacion_id: u, cant, unidad });
const R = (linea: string, cajas: number, o: any, d: any, mat: string | null = null, env: string | null = null) => ({ linea, cajas_depa: cajas, material_id: mat, envase_id: env, origenes: o ? [o] : [], destinos: d ? [d] : [], nota: null });
const ini = { id: "i1", tipo: "inicial", inicial_id: null, cortado_en: "2026-09-30T11:00:00.000Z", nota: null, creado_por: "u1",
  renglones: [R("L1", 18801, S("uA01D", 40, "estibas"), S("uB12I", 900, "cajas"), "m3", "m1"), R("L2", 5000, S("uA02D", 100, "cajas"), S("uB12D", 0, "cajas"))] };
const fin = { id: "f1", tipo: "final", inicial_id: "i1", cortado_en: "2026-09-30T17:00:00.000Z", nota: "Todo normal", creado_por: "u1",
  renglones: [R("L1", 30801, S("uA01D", 30, "estibas"), S("uB12I", 1800, "cajas"), "m3", "m1"), R("L2", 4000, S("uA02D", 50, "cajas"), S("uB12D", 200, "cajas"))] };
const abierto = { id: "i2", tipo: "inicial", inicial_id: null, cortado_en: "2026-09-30T16:00:00.000Z", nota: "Línea 4 parada", creado_por: "u2",
  renglones: [R("L1", 30801, S("uA01D", 30, "estibas"), S("uB12I", 1800, "cajas"), "m3", "m1"), R("L4", 777, S("uC05", 5, "estibas"), S("uB12D", 10, "cajas"))] };

const q = new URL(location.href).searchParams;
const c = q.get("c") ?? "todo";
const cortes = c === "vacio" ? [] : [abierto, fin, ini];
createRoot(document.getElementById("r")!).render(
  <Corte bodegaId="bod1" lineas={lineas} ubicaciones={ubis} materiales={mats} cortes={cortes as any}
    nombres={{ u1: "Cristian Padilla", u2: "Muchacho Uno" }} puedeEditar={c !== "lectura"} manda={c === "manda"} ahora={AHORA} />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_ic-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_ic-cliente.ts"), "next/navigation": R(".arnes/_ic-nav.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/corte/corte.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = [];
pg.on("pageerror", (e) => roto.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") roto.push(m.text()) });
const monta = async (query, ancho = 1440, tema = "") => {
  await pg.unrouteAll();
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head>
      <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main">
      <div class="fe"><div id="r"></div></div></main></div></div><script>${js}<\/script></body></html>`,
  }));
  await pg.goto(`http://arnes.local/?${query}`);
  try { await pg.waitForSelector("#r > *", { timeout: 8000 }) }
  catch { throw new Error(`«${query}» no pintó nada. Errores: ${roto.slice(-3).join(" | ") || "ninguno"}`) }
};
const txt = () => pg.$eval("#r", (e) => e.textContent.replace(/\s+/g, " "));
const rpcs = () => pg.evaluate(() => window.__rpc);
const sitio = (n) => `fieldset.cl-sitio >> nth=${n}`;   // 0 origen L1, 1 destino L1, 2 origen L2 …
const eligeUbi = async (n, calle, modulo, lado) => {
  const f = pg.locator("fieldset.cl-sitio").nth(n);
  await f.locator("select").nth(0).selectOption(calle);
  await f.locator("select").nth(1).selectOption(modulo);
  if (lado !== undefined) await f.locator("select").nth(2).selectOption(lado);
};


const ctx = pg.context();
const llave = "corte.cola.bod1";
const cola = () => pg.evaluate((k) => { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null }, llave);
const campo = (n, k) => pg.locator("fieldset.cl-sitio").nth(n).locator(k);
const banner = () => pg.$eval(".fe-cola", (e) => e.textContent.replace(/\s+/g, " ")).catch(() => null);
const limpio = async () => { await ctx.setOffline(false); await pg.evaluate((k) => localStorage.removeItem(k), llave).catch(() => {}) };

/* Llena un corte inicial mínimo: L1, todo en cajas (sin material). */
async function llenaInicial() {
  await pg.click('button:has-text("Nuevo corte inicial")');
  await pg.fill(".cl-depa input", "100");
  await campo(0, "select").nth(0).selectOption("A");
  await campo(0, "select").nth(1).selectOption("02");
  await campo(0, ".cl-cant-c input").fill("10");
  await campo(0, ".cl-unidad button:has-text('Cajas')").click();
  await pg.locator("fieldset.cl-sitio").nth(1).locator("select").nth(0).selectOption("B");
  await pg.locator("fieldset.cl-sitio").nth(1).locator("select").nth(1).selectOption("12");
  await pg.locator("fieldset.cl-sitio").nth(1).locator("select").nth(2).selectOption("DER");
  await campo(1, ".cl-cant-c input").fill("5");
  await campo(1, ".cl-unidad button:has-text('Cajas')").click();
}
const enLaLista = async () => /Nuevo corte inicial/.test(await txt());
/* Estos pendientes traen la forma VIEJA (un solo «origen» y «destino»): así quedaron los que se anotaron
   antes de poder poner varios módulos, y la base los sigue aceptando. */
const item = (id, tipo, extra = {}) => ({
  id, t: 1, sku: "Corte " + tipo, lugar: "L1", ubicacionId: null,
  bb: { bodega: "bod1", tipo, inicial: tipo === "final" ? "i2" : null, cortado: "2026-09-30T16:30:00.000Z", nota: null,
        renglones: [{ linea: "L1", cajas_depa: 100, material_id: null, envase_id: null, origen: { ubicacion_id: "uA02D", cant: 10, unidad: "cajas" }, destino: { ubicacion_id: "uB12D", cant: 5, unidad: "cajas" }, nota: null }] },
  ...extra });
const siembra = (items) => pg.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [llave, items]);

/* ---------- 1 · SIN SEÑAL AL GUARDAR: queda en el teléfono y no pierde nada ---------- */
await monta("c=todo");
await limpio();
await monta("c=todo");
{
  await llenaInicial();
  await ctx.setOffline(true);
  await pg.waitForFunction(() => navigator.onLine === false);
  await pg.waitForSelector(".fe-cola", { timeout: 3000 }).catch(() => {});
  ok(/Sin señal/.test(await txt()), "sin señal y la pantalla no lo dice: " + (await txt()).slice(0, 200));
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForSelector(".cl-ok");
  ok((await rpcs()).length === 0, "sin señal se llamó a la base igual");
  ok(await enLaLista(), "sin señal el formulario no volvió a la lista");
  const c = await cola();
  ok(c && c.length === 1 && c[0].bb.tipo === "inicial" && c[0].bb.bodega === "bod1" && c[0].bb.inicial === null, "el corte no quedó en la cola del teléfono: " + JSON.stringify(c));
  ok(c && c[0].bb.renglones.length === 1 && c[0].bb.renglones[0].linea === "L1" && c[0].bb.renglones[0].cajas_depa === 100
     && c[0].bb.renglones[0].origenes[0].ubicacion_id === "uA02D" && c[0].bb.renglones[0].destinos[0].ubicacion_id === "uB12D", "lo guardado en el teléfono no es lo tecleado: " + JSON.stringify(c && c[0].bb.renglones));
  ok(/2026-09-30T17:30:00\.000Z/.test(c?.[0]?.bb.cortado ?? ""), "la hora del corte guardada: " + c?.[0]?.bb.cortado);
  const b = await banner();
  ok(/Sin señal/.test(b ?? "") && /1 corte sin enviar/.test(b ?? ""), "el aviso de pendientes: " + b);
  ok(/Sin señal: el corte quedó guardado en este teléfono/.test(await pg.textContent(".cl-ok")), "no dijo que quedó guardado en el teléfono");
  ok(await pg.$$eval(".fe-cola button", (x) => !x.some((y) => /Enviar ahora/.test(y.textContent))), "sin señal no debe ofrecer «Enviar ahora»");

  /* ---------- 2 · VUELVE LA SEÑAL: sale solo, en una llamada, y limpia ---------- */
  await ctx.setOffline(false);
  await pg.waitForFunction(() => window.__rpc.length > 0, null, { timeout: 8000 });
  await pg.waitForFunction(() => window.__refresh > 0);
  const r = await rpcs();
  ok(r.length === 1 && r[0].n === "inv_corte_guardar", "no mandó el corte pendiente: " + JSON.stringify(r));
  ok(r[0].a.p_bodega === "bod1" && r[0].a.p_tipo === "inicial" && r[0].a.p_inicial === null && r[0].a.p_cortado === "2026-09-30T17:30:00.000Z" && r[0].a.p_renglones.length === 1, "el corte se mandó distinto de como se guardó: " + JSON.stringify(r[0].a));
  ok((await pg.evaluate(() => window.__desde)).includes("inv_cortes"), "antes de mandar un inicial no miró si ya estaba en la base");
  await pg.waitForFunction((k) => localStorage.getItem(k) === null, llave);
  ok(await cola() === null, "enviado y la cola no se borró");
  ok(/1 corte pendiente enviado/.test(await txt()) && !(await banner()), "no avisó que se envió o el aviso se quedó: " + (await txt()).slice(0, 160));
}

/* ---------- 2b · DOS CORTES SIN SEÑAL: quedan en el orden en que se hicieron ---------- */
await limpio();
await monta("c=todo");
{
  await ctx.setOffline(true);
  await pg.waitForFunction(() => navigator.onLine === false);
  await llenaInicial();
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForSelector(".cl-ok");
  await llenaInicial();
  await pg.fill(".cl-depa input", "250");
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || "[]")).length === 2, llave);
  const c = await cola();
  ok(c[0].bb.renglones[0].cajas_depa === 100 && c[1].bb.renglones[0].cajas_depa === 250, "los cortes sin señal no quedaron en el orden en que se hicieron: " + JSON.stringify(c.map((x) => x.bb.renglones[0].cajas_depa)));
  ok(/2 cortes sin enviar/.test((await banner()) ?? ""), "no cuenta los dos: " + await banner());
  ok(new Set(c.map((x) => x.id)).size === 2, "los dos pendientes comparten id");
}

/* ---------- 3 · «FAILED TO FETCH» con el navegador creyéndose en línea ---------- */
await limpio();
await monta("c=todo");
{
  await llenaInicial();
  await pg.evaluate(() => { window.__red = true });
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForSelector(".cl-ok");
  ok(!(await pg.$(".cl-mal")), "una caída de red se mostró como error de la base");
  const c = await cola();
  ok(c && c.length === 1 && !c[0].error, "la caída de red no dejó el corte en cola: " + JSON.stringify(c));
  ok(/1 corte sin enviar/.test((await banner()) ?? ""), "con señal pero servidor caído no muestra el pendiente: " + await banner());
  /* «Enviar ahora» con el servidor todavía caído: sigue pendiente, sin error inventado. */
  await pg.evaluate(() => { window.__rpc.length = 0 });
  await pg.click('.fe-cola button:has-text("Enviar ahora")');
  await pg.waitForSelector(".cl-mal");
  const c2 = await cola();
  ok(c2 && c2.length === 1 && !c2[0].error && /Se cortó la señal/.test(await pg.textContent(".cl-mal")), "«Enviar ahora» con el servidor caído perdió o marcó el corte: " + JSON.stringify(c2));
  /* Vuelve el servidor y se manda a mano. */
  await pg.evaluate(() => { window.__red = false; window.__rpc.length = 0 });
  await pg.click('.fe-cola button:has-text("Enviar ahora")');
  await pg.waitForFunction(() => window.__rpc.length === 1);
  await pg.waitForFunction((k) => localStorage.getItem(k) === null, llave);
  ok((await rpcs())[0].a.p_tipo === "inicial", "el envío manual no mandó el corte");
}

/* ---------- 4 · UN ERROR DE LA BASE NO SE ENCOLA ---------- */
await limpio();
await monta("c=todo");
{
  await llenaInicial();
  await pg.evaluate(() => { window.__falla = "Hacer un corte de líneas requiere el permiso «Corte de líneas» (Roles)" });
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForSelector(".cl-mal");
  ok(/requiere el permiso/.test(await pg.textContent(".cl-mal")), "no dijo el error de la base: " + await pg.textContent(".cl-mal"));
  ok(await cola() === null && !(await enLaLista()), "un error de permiso se encoló o cerró el formulario");
}

/* ---------- 5 · EL INICIAL QUE YA HABÍA LLEGADO no se duplica ---------- */
await limpio();
await siembra([item("a", "inicial")]);
await monta("c=todo&ya=1");
{
  /* Se abre con señal y con el pendiente: el envío automático corre al montar y la base
     ya tiene un inicial de esa bodega a esa hora (la respuesta se perdió). */
  await pg.waitForFunction((k) => localStorage.getItem(k) === null, llave, { timeout: 8000 });
  const r = await rpcs();
  ok(r.filter((x) => x.n === "inv_corte_guardar").length === 0, "un inicial que ya estaba en la base se mandó otra vez (duplicado): " + JSON.stringify(r));
  ok(await cola() === null, "el inicial que ya estaba no salió de la cola");
  const eq = await pg.evaluate(() => window.__eq);
  ok(eq.includes("bodega_id=bod1") && eq.includes("tipo=inicial") && eq.includes("cortado_en=2026-09-30T16:30:00.000Z"), "la pregunta «¿ya está?» no filtra por bodega, tipo y hora: " + eq.join(" | "));
}

/* ---------- 6 · UN FINAL QUE LA BASE RECHAZA se queda, con su porqué ---------- */
await limpio();
await siembra([item("f", "final"), item("g", "inicial")]);
await ctx.setOffline(true);
await monta("c=todo");
{
  await pg.waitForSelector(".fe-cola");
  const b = await banner();
  ok(/2 cortes sin enviar/.test(b ?? ""), "abrir con pendientes no los cuenta: " + b);
  ok(/Corte final/.test(await pg.$eval(".fe-cola details", (e) => e.textContent)) && /Corte inicial/.test(await pg.$eval(".fe-cola details", (e) => e.textContent)), "no lista los pendientes por tipo");
  /* La base ya está rechazando ANTES de que vuelva la señal: si no, el envío automático ganaría la carrera. */
  await pg.evaluate(() => { window.__falla = "Ese corte inicial ya tiene su corte final"; window.__rpc.length = 0 });
  await ctx.setOffline(false);
  await pg.waitForFunction(() => window.__rpc.length >= 2, null, { timeout: 8000 });
  await pg.waitForSelector(".fe-cola li em");
  const c = await cola();
  ok(c && c.length === 2 && c.every((x) => x.error && x.duplicado), "los rechazados debían quedar con su error y marcados duplicado: " + JSON.stringify(c && c.map((x) => [x.id, x.error, x.duplicado])));
  ok(/ya tiene su corte final/.test(await pg.$eval(".fe-cola", (e) => e.textContent)), "no muestra por qué se quedó");
  ok((await rpcs()).length === 2, "no probó los dos: un rechazo no puede encerrar al siguiente");
  const fin = (await rpcs()).find((x) => x.a.p_tipo === "final");
  ok(fin && fin.a.p_inicial === "i2" && fin.a.p_bodega === "bod1", "el final se mandó sin su inicial: " + JSON.stringify(fin));
  ok(await pg.$eval(".fe-cola details", (e) => e.open), "con error la lista debía abrirse sola");
  await pg.click('.fe-cola li:has-text("Corte final") button:has-text("Quitar")');
  const c3 = await cola();
  ok(c3 && c3.length === 1 && c3[0].id === "g", "«Quitar» no quitó solo el escogido: " + JSON.stringify(c3));
  await pg.evaluate(() => { window.__falla = null; window.__rpc.length = 0 });
  await pg.click('.fe-cola button:has-text("Enviar ahora")').catch(() => {});
}

/* ---------- 7 · EL ORDEN: el que se anotó primero se manda primero ---------- */
await limpio();
await siembra([item("p1", "inicial"), item("p2", "inicial")]);
await siembra([{ ...item("p1", "inicial"), bb: { ...item("p1", "inicial").bb, cortado: "2026-09-30T10:00:00.000Z" } }, { ...item("p2", "inicial"), bb: { ...item("p2", "inicial").bb, cortado: "2026-09-30T11:00:00.000Z" } }]);
await monta("c=todo");
{
  await pg.waitForFunction(() => window.__rpc.length >= 2, null, { timeout: 8000 });
  const r = (await rpcs()).map((x) => x.a.p_cortado);
  ok(r.join() === "2026-09-30T10:00:00.000Z,2026-09-30T11:00:00.000Z", "los pendientes no salieron en el orden en que se anotaron: " + r.join());
}

/* ---------- 8 · QUE NADA SE SALGA DE LA PANTALLA con el aviso, en 360/390/820/1440 ---------- */
await limpio();
await siembra([item("x", "inicial"), item("y", "final", { error: "Ese corte inicial ya tiene su corte final", duplicado: true })]);
await ctx.setOffline(true);
for (const w of [360, 390, 820, 1440]) {
  await monta("c=todo", w);
  await pg.waitForSelector(".fe-cola");
  const d = await pg.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  ok(d.s <= d.c + 1, `a ${w}px la pantalla se sale: ${d.s} > ${d.c}`);
}
await limpio();

ok(roto.length === 0, "errores en la consola: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)); console.log("\n✗ " + fallas.length + " falla(s)"); process.exit(1) }
console.log("✓ Corte sin señal: queda en el teléfono, sale solo al volver la señal, no duplica y no pierde nada");
