/* =====================================================================
   INVENTARIO · CORTE DE LÍNEAS — EL CORTE CONTRA EL CONTEO
   Monta el componente REAL (solo supabase y next/navigation son dobles) y
   prueba lo que se ve: las listas, el análisis con su signo, el formulario
   (calle → módulo → lado, el lado que se pone solo, el final que arranca con
   lo del inicial), lo que se manda a la base y que nada se salga de la
   pantalla en 360/390/820/1440.

     node .arnes/inv-corte-cruce.mjs
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
w.__rpc = []; w.__refresh = 0; w.__rpcFalla = null;
export function createClient() {
  return { rpc: async (n: string, a: any) => {
    w.__rpc.push({ n, a });
    return w.__rpcFalla ? { data: null, error: { message: w.__rpcFalla } } : { data: "nuevo-id", error: null };
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

/* VARIOS MÓDULOS: tomaba de A01 y A02, y dejaba en B12. */
const RM = (linea: string, cajas: number, os: any[], ds: any[], mat: string | null = "m3", env: string | null = "m1") => ({ linea, cajas_depa: cajas, material_id: mat, envase_id: env, origenes: os, destinos: ds, nota: null });
const iniM = { id: "im", tipo: "inicial", inicial_id: null, cortado_en: "2026-09-30T11:00:00.000Z", nota: null, creado_por: "u1",
  renglones: [RM("L1", 1000, [S("uA01D", 40, "estibas"), S("uA02D", 20, "estibas")], [S("uB12I", 0, "cajas")])] };
const finM = { id: "fm", tipo: "final", inicial_id: "im", cortado_en: "2026-09-30T17:00:00.000Z", nota: null, creado_por: "u1",
  renglones: [RM("L1", 2800, [S("uA01D", 30, "estibas"), S("uA02D", 0, "estibas")], [S("uB12I", 1800, "cajas")])] };
const abM = { id: "am", tipo: "inicial", inicial_id: null, cortado_en: "2026-09-30T16:00:00.000Z", nota: null, creado_por: "u1",
  renglones: [RM("L1", 5000, [S("uA01D", 40, "estibas"), S("uA02D", 20, "estibas")], [S("uB12I", 100, "cajas")])] };
const LC = (conteo_id: string, producto_id: string, ubicacion_id: string, total_cajas: number, averia = false) => ({ conteo_id, producto_id, ubicacion_id, total_cajas, averia, pnc: false });
const conteos = [{ id: "k2", codigo: "CF-0929", fecha: "2026-09-29", enviado_en: "2026-09-29T22:00:00Z" },
                 { id: "k1", codigo: "CF-0930", fecha: "2026-09-30", enviado_en: "2026-09-30T20:00:00Z" }];
const lineasConteo = [LC("k1", "m1", "uA01D", 1900), LC("k1", "m1", "uA01D", 120, true), LC("k1", "m1", "uA02D", 300), LC("k1", "m3", "uB12I", 2100), LC("k1", "m5", "uB12I", 999),
                      LC("k2", "m1", "uA01D", 2000)];
const q = new URL(location.href).searchParams;
const c = q.get("c") ?? "todo";
const cortes = c === "vacio" ? [] : (c === "multi" || c === "cruce" || c === "crucesin") ? [abM, finM, iniM] : [abierto, fin, ini];
createRoot(document.getElementById("r")!).render(
  <Corte bodegaId="bod1" lineas={lineas} ubicaciones={ubis} materiales={mats} cortes={cortes as any}
    conteos={c === "crucesin" ? [] : conteos} lineasConteo={lineasConteo} nombres={{ u1: "Cristian Padilla", u2: "Muchacho Uno" }} puedeEditar={c !== "lectura"} manda={c === "manda"} ahora={AHORA} />);
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


if (process.env.SHOT) {
  const [qq, w, ruta, tocar] = process.env.SHOT.split("@");
  await monta(qq, Number(w), process.env.TEMA ?? "");
  if (tocar) await pg.click(`button:has-text("${tocar}")`);
  await pg.screenshot({ path: ruta, fullPage: true });
  await nav.close(); process.exit(0);
}

const cruce = () => pg.$eval(".cl-cruce", (e) => e.textContent.replace(/\s+/g, " "));
const fila = (texto) => pg.locator(`.cl-cruce-mods li:has(b:text-is("${texto}"))`);
const celdas = async (texto, n = 0) => (await fila(texto).nth(n).locator("span, em").allTextContents()).map((x) => x.replace(/\s+/g, " ").trim());

/* ---------- 1 · CON QUÉ CONTEO SE COMPARA ---------- */
await monta("c=cruce");
{
  ok(await pg.locator(".cl-cruce").count() === 1, "el par cerrado debía traer «Contra el conteo del inventario»");
  ok(/Contra el conteo del inventario/.test(await cruce()), "falta el título");
  const op = await pg.locator(".cl-cruce select option").allTextContents();
  ok(op.length === 2 && op[0] === "CF-0929 · 29/09/2026" && op[1] === "CF-0930 · 30/09/2026", "las opciones del selector: " + op.join(" | "));
  ok(await pg.locator(".cl-cruce select").inputValue() === "k1", "el conteo por defecto debía ser el del mismo día del corte (CF-0930): " + await pg.locator(".cl-cruce select").inputValue());
  ok(/entre los dos cortes/.test(await cruce()) && /Conteo − corte/.test(await cruce()), "no explica cómo leer las diferencias");
}

/* ---------- 2 · LOS TRES NÚMEROS Y LAS DOS DIFERENCIAS ---------- */
{
  /* A01: envase m1 (60 por estiba): 40 → 30 estibas = 2.400 → 1.800; el conteo dio 1.900 (+120 de avería aparte). */
  const a1 = await celdas("A · 01 · DER");
  ok(a1[0] === "2.400" && a1[1] === "1.900" && a1[2] === "1.800", "A01: corte inicial, conteo, corte final: " + a1.join(" | "));
  ok(a1[3] === "−500" && a1[4] === "+100", "A01: conteo − inicial y conteo − final: " + a1.join(" | "));
  ok(/Entre los dos cortes/.test(a1[5]) && /\+ 120 en avería\/PNC/.test(a1[5]), "A01: la lectura y la avería aparte: " + a1[5]);
  /* A02: 20 → 0 estibas = 1.200 → 0; el conteo dio 300. */
  const a2 = await celdas("A · 02 · DER");
  ok(a2[0] === "1.200" && a2[1] === "300" && a2[2] === "0" && a2[3] === "−900" && a2[4] === "+300" && /Entre los dos cortes/.test(a2[5]), "A02: " + a2.join(" | "));
  /* B12: el destino (producto m3) subió de 0 a 1.800; el conteo dio 2.100: FUERA. El otro material del módulo (999) no cuenta. */
  const b = await celdas("B · 12 · IZQ");
  ok(b[0] === "0" && b[1] === "2.100" && b[2] === "1.800" && b[3] === "+2.100" && b[4] === "+300" && /Fuera del rango/.test(b[5]), "B12: " + b.join(" | "));
  ok(await fila("A · 01 · DER").nth(0).evaluate((e) => e.className) === "l-entre" && await fila("B · 12 · IZQ").evaluate((e) => e.className) === "l-fuera", "la lectura no cambia de color por clase");
  const col = await pg.evaluate(() => [document.querySelector(".cl-cruce-mods li.l-entre em"), document.querySelector(".cl-cruce-mods li.l-fuera em")].map((e) => getComputedStyle(e).color));
  ok(col[0] !== col[1], "«entre» y «fuera» se ven del mismo color: " + col.join(" / "));
  ok(/Tomando de/.test(await pg.locator(".cl-cruce-lado .cl-t").nth(0).textContent()) && /Botella Flint 1000R/.test(await pg.locator(".cl-cruce-lado .cl-t").nth(0).textContent()), "Tomando de debía decir el ENVASE buscado");
  ok(/Ubicados en/.test(await pg.locator(".cl-cruce-lado .cl-t").nth(1).textContent()) && /Águila RN 330cc X30/.test(await pg.locator(".cl-cruce-lado .cl-t").nth(1).textContent()), "Ubicados en debía decir el PRODUCTO buscado");
}

/* ---------- 3 · OTRO CONTEO: un módulo que no visitó queda «sin contar», no en cero ---------- */
{
  await pg.selectOption(".cl-cruce select", "k2");
  const a1 = await celdas("A · 01 · DER");
  ok(a1[1] === "2.000" && a1[3] === "−400" && a1[4] === "+200" && /Entre los dos cortes/.test(a1[5]), "A01 con el otro conteo (2.000, entre 1.800 y 2.400): " + a1.join(" | "));
  for (const m of ["A · 02 · DER", "B · 12 · IZQ"]) {
    const x = await celdas(m);
    ok(x[1] === "—" && x[3] === "—" && x[4] === "—" && /Sin contar/.test(x[5]), m + " no está en ese conteo: debía decir «Sin contar», no 0: " + x.join(" | "));
  }
  ok(await fila("A · 02 · DER").evaluate((e) => e.className) === "l-sin_contar", "la clase de «sin contar»");
  /* Volver al otro conteo vuelve a calcular. */
  await pg.selectOption(".cl-cruce select", "k1");
  const b = await celdas("B · 12 · IZQ");
  ok(b[1] === "2.100" && /Fuera del rango/.test(b[5]), "al volver a CF-0930 se recalcula: " + b.join(" | "));
}

/* ---------- 4 · SIN CONTEOS ENVIADOS ---------- */
await monta("c=crucesin");
{
  ok(/No hay conteos enviados de esta bodega para comparar/.test(await cruce()), "sin conteos debía decirlo: " + await cruce());
  ok(await pg.locator(".cl-cruce select").count() === 0 && await pg.locator(".cl-cruce-mods").count() === 0, "sin conteos no debía haber selector ni tabla");
}

/* ---------- 5 · NADA SE SALE, en cuatro anchos ---------- */
for (const w of [360, 390, 820, 1440]) {
  await monta("c=cruce", w);
  const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
    fuera: [...document.querySelectorAll("#r *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className || e.tagName).slice(0, 4) }));
  ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
  const chico = await pg.evaluate(() => [...document.querySelectorAll("#r button, #r select, #r input")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43).length);
  ok(chico === 0, `a ${w} px hay ${chico} controles de menos de 44 px`);
  if (w <= 720) {
    const cab = await pg.evaluate(() => getComputedStyle(document.querySelector(".cl-cruce-mods .cab")).display);
    ok(cab === "none", `a ${w} px la cabecera de columnas debía esconderse (cada celda trae su nombre): ${cab}`);
    const k = await pg.evaluate(() => getComputedStyle(document.querySelector('.cl-cruce-mods li:not(.cab) span[data-k]'), "::before").content);
    ok(/Corte inicial/.test(k), `a ${w} px cada celda debía traer su nombre: ${k}`);
  }
}

ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Corte contra conteo: los tres números y las dos diferencias, «entre»/«fuera»/«sin contar», el selector recalcula, sin conteos lo dice y nada se sale en 4 anchos.");
