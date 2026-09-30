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
                 { id: "k1", codigo: "CF-0930", fecha: "2026-09-30", enviado_en: "2026-09-30T20:00:00Z" },
                 { id: "k3", codigo: "CF-0928", fecha: "2026-09-28", enviado_en: "2026-09-28T20:00:00Z" }];
const lineasConteo = [LC("k1", "m1", "uA01D", 1900), LC("k1", "m1", "uA01D", 120, true), LC("k1", "m1", "uA02D", 300), LC("k1", "m3", "uB12I", 2100), LC("k1", "m5", "uB12I", 999),
                      LC("k2", "m1", "uA01D", 2000),
                      LC("k3", "m1", "uA01D", 1800), LC("k3", "m1", "uA02D", 0), LC("k3", "m3", "uB12I", 1800)];
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
  ok(op.length === 3 && op[0] === "CF-0929 · 29/09/2026" && op[1] === "CF-0930 · 30/09/2026", "las opciones del selector: " + op.join(" | "));
  ok(await pg.locator(".cl-cruce select").inputValue() === "k1", "el conteo por defecto debía ser el del mismo día del corte (CF-0930): " + await pg.locator(".cl-cruce select").inputValue());
  ok(/tres cosas/.test(await cruce()) && /lo que pasó por la depa/.test(await cruce()), "no explica qué tiene que coincidir");
  /* Nada de «corte» repetido en cada columna: las columnas son Inicial / Final / Diferencia. */
  const cab = (await pg.locator(".cl-cruce-mods li.cab").first().locator("span").allTextContents()).map((x) => x.trim());
  ok(cab.join("|") === "Qué se mide|Inicial|Final|Diferencia|Lectura", "las columnas: " + cab.join("|"));
}

/* ---------- 2 · LA DEPA, EL CORTE Y EL CONTEO, EN UNA TABLA ---------- */
{
  /* La depa: 1.000 → 2.800, pasaron 1.800. */
  const d = await celdas("Corte por depa");
  ok(d[0] === "1.000" && d[1] === "2.800" && d[2] === "+1.800", "la fila de la depa: " + d.join(" | "));
  /* A01 (envase, 60 por estiba): 40 → 30 estibas = 2.400 → 1.800; el inventario contó 1.900 (+120 de avería aparte). */
  const c1 = await celdas("A · 01 · DER en el corte");
  ok(c1[0] === "2.400" && c1[1] === "1.800" && c1[2] === "−600", "A01 en el corte: " + c1.join(" | "));
  const i1 = await celdas("A · 01 · DER en el inventario");
  ok(i1[0] === "2.400" && i1[1] === "1.900" && i1[2] === "−500", "A01 en el inventario: Inicial del corte, lo contado y la diferencia: " + i1.join(" | "));
  ok(/No cuadra: sobran 100 cajas/.test(i1[3]) && /\+ 120 en avería\/PNC/.test(i1[3]), "A01: la lectura y la avería aparte: " + i1[3]);
  const i2 = await celdas("A · 02 · DER en el inventario");
  ok(i2[0] === "1.200" && i2[1] === "300" && i2[2] === "−900" && /No cuadra: sobran 300 cajas/.test(i2[3]), "A02: " + i2.join(" | "));
  /* B12: el destino (producto) subió de 0 a 1.800 según los cortes; el inventario contó 2.100. El otro material (999) no cuenta. */
  const c3 = await celdas("B · 12 · IZQ en el corte");
  ok(c3[0] === "0" && c3[1] === "1.800" && c3[2] === "+1.800", "B12 en el corte: " + c3.join(" | "));
  const i3 = await celdas("B · 12 · IZQ en el inventario");
  ok(i3[0] === "0" && i3[1] === "2.100" && i3[2] === "+2.100" && /No cuadra: sobran 300 cajas/.test(i3[3]), "B12 en el inventario: " + i3.join(" | "));
  /* Los totales contra la depa. */
  const tc = await celdas("Total en el corte", 0), ti = await celdas("Total en el inventario", 0);
  ok(tc[0] === "3.600" && tc[1] === "1.800" && tc[2] === "−1.800" && /^Cuadra con la depa/.test(tc[3]), "total del origen en el corte: " + tc.join(" | "));
  ok(ti[0] === "3.600" && ti[1] === "2.200" && ti[2] === "−1.400" && /No cuadra con la depa: sobran 400 cajas/.test(ti[3]), "total del origen en el inventario: " + ti.join(" | "));
  const tdc = await celdas("Total en el corte", 1), tdi = await celdas("Total en el inventario", 1);
  ok(tdc[2] === "+1.800" && /^Cuadra con la depa/.test(tdc[3]) && tdi[1] === "2.100" && tdi[2] === "+2.100" && /sobran 300 cajas/.test(tdi[3]), "totales del destino: " + [...tdc, ...tdi].join(" | "));
  /* El color sale de la clase, y el «cuadra» y el «no cuadra» se ven distintos. */
  ok(await fila("Total en el corte").nth(0).evaluate((e) => e.classList.contains("l-cuadra")) && await fila("A · 01 · DER en el inventario").evaluate((e) => e.classList.contains("l-no_cuadra")), "la lectura no cambia de clase");
  /* Los títulos de cada lado dicen el material buscado. */
  ok(/Tomando de/.test(await pg.locator(".cl-cruce-lado .cl-t").nth(0).textContent()) && /Botella Flint 1000R/.test(await pg.locator(".cl-cruce-lado .cl-t").nth(0).textContent()), "Tomando de debía decir el ENVASE buscado");
  ok(/Ubicados en/.test(await pg.locator(".cl-cruce-lado .cl-t").nth(1).textContent()) && /Águila RN 330cc X30/.test(await pg.locator(".cl-cruce-lado .cl-t").nth(1).textContent()), "Ubicados en debía decir el PRODUCTO buscado");
}

/* ---------- 3 · OTROS CONTEOS: uno incompleto y uno que cuadra ---------- */
{
  await pg.selectOption(".cl-cruce select", "k2");
  const i1 = await celdas("A · 01 · DER en el inventario");
  ok(i1[1] === "2.000" && i1[2] === "−400" && /No cuadra: sobran 200 cajas/.test(i1[3]), "A01 con el otro conteo: " + i1.join(" | "));
  for (const m of ["A · 02 · DER en el inventario", "B · 12 · IZQ en el inventario"]) {
    const x = await celdas(m);
    ok(x[1] === "—" && x[2] === "—" && /Sin contar/.test(x[3]), m + " no está en ese conteo: debía decir «Sin contar», no 0: " + x.join(" | "));
  }
  ok(await fila("A · 02 · DER en el inventario").evaluate((e) => e.classList.contains("l-sin_contar")), "la clase de «sin contar»");
  const t = await celdas("Total en el inventario", 0);
  ok(t[1] === "—" && /Falta contar 1 módulo: no se puede comparar con la depa/.test(t[3]), "con un módulo sin contar el total no se compara con la depa: " + t.join(" | "));
  /* Un conteo que coincide con el corte final: todo cuadra. */
  await pg.selectOption(".cl-cruce select", "k3");
  for (const m of ["A · 01 · DER en el inventario", "A · 02 · DER en el inventario", "B · 12 · IZQ en el inventario"]) {
    const x = await celdas(m);
    ok(/^Cuadra/.test(x[3]), m + " con el conteo justo debía cuadrar: " + x.join(" | "));
  }
  const tt = await celdas("Total en el inventario", 0);
  ok(tt[1] === "1.800" && tt[2] === "−1.800" && /^Cuadra con la depa/.test(tt[3]), "total con el conteo justo: " + tt.join(" | "));
  const col = await pg.evaluate(() => [document.querySelector(".cl-cruce-mods li.r-inv.l-cuadra em"), document.querySelector(".cl-cruce-mods li.r-total.l-cuadra em")].map((e) => e && getComputedStyle(e).color));
  ok(col[0] !== null && col[0] === col[1], "«cuadra» debía verse de un mismo color: " + col.join(" / "));
  await pg.selectOption(".cl-cruce select", "k1");
  const col2 = await pg.evaluate(() => [document.querySelector(".cl-cruce-mods li.l-no_cuadra em"), document.querySelector(".cl-cruce-mods li.r-depa em")].map((e) => getComputedStyle(e).color));
  ok(col2[0] !== col[0], "«no cuadra» y «cuadra» se ven del mismo color: " + col2[0] + " / " + col[0]);
  const b = await celdas("B · 12 · IZQ en el inventario");
  ok(b[1] === "2.100" && /No cuadra/.test(b[3]), "al volver a CF-0930 se recalcula: " + b.join(" | "));
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
    ok(/Inicial/.test(k), `a ${w} px cada celda debía traer su nombre: ${k}`);
  }
}

ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Corte contra conteo: depa, corte y conteo en una tabla, «cuadra»/«no cuadra»/«sin contar», totales contra la depa, el selector recalcula, sin conteos lo dice y nada se sale en 4 anchos.");
