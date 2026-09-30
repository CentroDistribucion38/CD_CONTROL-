/* =====================================================================
   INVENTARIO · CORTE DE LÍNEAS — LA PANTALLA
   Monta el componente REAL (solo supabase y next/navigation son dobles) y
   prueba lo que se ve: las listas, el análisis con su signo, el formulario
   (calle → módulo → lado, el lado que se pone solo, el final que arranca con
   lo del inicial), lo que se manda a la base y que nada se salga de la
   pantalla en 360/390/820/1440.

     node .arnes/inv-corte-pantalla.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
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
const mats = [{ id: "m1", sku: "3500887", nombre: "Botella Flint 1000R", cajas_por_estiba: 60 },
              { id: "m2", sku: "3500005", nombre: "Envase Costeñita 175R", cajas_por_estiba: null }];
const S = (u: string, cant: number, unidad: string) => ({ ubicacion_id: u, cant, unidad });
const R = (linea: string, cajas: number, o: any, d: any, mat: string | null = null) => ({ linea, cajas_depa: cajas, material_id: mat, origen: o, destino: d, nota: null });
const ini = { id: "i1", tipo: "inicial", inicial_id: null, cortado_en: "2026-09-30T11:00:00.000Z", nota: null, creado_por: "u1",
  renglones: [R("L1", 18801, S("uA01D", 40, "estibas"), S("uB12I", 900, "cajas"), "m1"), R("L2", 5000, S("uA02D", 100, "cajas"), S("uB12D", 0, "cajas"))] };
const fin = { id: "f1", tipo: "final", inicial_id: "i1", cortado_en: "2026-09-30T17:00:00.000Z", nota: "Todo normal", creado_por: "u1",
  renglones: [R("L1", 30801, S("uA01D", 30, "estibas"), S("uB12I", 1800, "cajas"), "m1"), R("L2", 4000, S("uA02D", 50, "cajas"), S("uB12D", 200, "cajas"))] };
const abierto = { id: "i2", tipo: "inicial", inicial_id: null, cortado_en: "2026-09-30T16:00:00.000Z", nota: "Línea 4 parada", creado_por: "u2",
  renglones: [R("L1", 30801, S("uA01D", 30, "estibas"), S("uB12I", 1800, "cajas"), "m1"), R("L4", 777, S("uC05", 5, "estibas"), S("uB12D", 10, "cajas"))] };

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

if (process.env.SHOT) {
  const [qq, w, ruta, tocar] = process.env.SHOT.split("@");
  await monta(qq, Number(w));
  if (tocar) await pg.click(`button:has-text("${tocar}")`);
  if (process.env.UP) console.log(await pg.evaluate(() => { let e = document.querySelector(".cl-nota"); const o = []; while (e && e.id !== "r") { o.push(e.tagName + "." + e.className + ":" + getComputedStyle(e).textTransform); e = e.parentElement } return o.join(" < ") }));
  await pg.screenshot({ path: ruta, fullPage: true });
  await nav.close(); process.exit(0);
}

/* ---------- 1 · LAS LISTAS Y EL ANÁLISIS ---------- */
await monta("c=todo");
{
  const t = await txt();
  ok(/Esperando el corte final 1/.test(t) && /La diferencia 1/.test(t), "los contadores de las dos listas: " + t.slice(0, 120));
  ok(/Inicial · 30\/09\/2026 11:00/.test(t) && /Línea 4 parada/.test(t) && /L1 30\.801 · L4 777/.test(t), "el corte abierto no dice su hora, su nota o sus líneas");
  ok(/30\/09\/2026 06:00 → 30\/09\/2026 12:00/.test(t) && /6 h/.test(t) && /6 h · 12\.000 cajas por la depa/.test(t), "el par no dice su intervalo o el total: " + t);
  const l1 = await pg.$eval('.cl-linea[aria-label="Línea 1"]', (e) => e.textContent.replace(/\s+/g, " "));
  ok(/12\.000 cajas por la depa \(18\.801 → 30\.801\)/.test(l1), "L1 no dice lo que pasó por la depa: " + l1);
  ok(/A · 01 · DER/.test(l1) && /40 estibas → 30 estibas/.test(l1) && /bajó 600 cajas/.test(l1) && /diferencia \+11\.400/.test(l1), "L1 origen: " + l1);
  ok(/B · 12 · IZQ/.test(l1) && /subió 900 cajas/.test(l1) && /diferencia \+11\.100/.test(l1), "L1 destino: " + l1);
  const l2 = await pg.$eval('.cl-linea[aria-label="Línea 2"]', (e) => e.textContent.replace(/\s+/g, " "));
  ok(/El contador retrocedió/.test(l2), "L2 con el contador atrás no lo dice: " + l2);
  ok(await pg.$$eval(".cl-dif.mal", (x) => x.length) >= 2, "las diferencias con número no se marcan");
  ok(await pg.$$eval(".cl-pasadas b", (x) => x.length) >= 1, "sin cifra en negrita");
  ok(await pg.$$eval("button", (b) => b.some((x) => /Nuevo corte inicial/.test(x.textContent)) && b.some((x) => /Hacer el corte final/.test(x.textContent))), "faltan los botones de quien puede cortar");
  ok(!/Eliminar/.test(t), "quien no administra ve «Eliminar»");
}
await monta("c=lectura");
ok(await pg.$$eval("button", (b) => b.length) === 0, "solo lectura: hay botones");
await monta("c=vacio");
ok(/No hay cortes iniciales abiertos/.test(await txt()) && /Todavía no hay cortes cerrados/.test(await txt()), "los vacíos no dicen qué hacer");

/* ---------- 2 · ELIMINAR (solo quien administra) ---------- */
await monta("c=manda");
{
  await pg.click('.cl-abierto button:has-text("Eliminar")');
  ok(/¿Eliminar este corte\?/.test(await txt()) && (await rpcs()).length === 0, "eliminar no pide confirmar primero");
  await pg.click('.cl-abierto button:has-text("No")');
  ok((await rpcs()).length === 0 && !/¿Eliminar este corte/.test(await txt()), "«No» llamó a la base o no cerró");
  await pg.click('.cl-abierto button:has-text("Eliminar")');
  await pg.click('.cl-abierto button:has-text("Sí, eliminar")');
  await pg.waitForFunction(() => window.__refresh > 0);
  const r = await rpcs();
  ok(r.length === 1 && r[0].n === "inv_corte_eliminar" && r[0].a.p_id === "i2", "no eliminó el corte escogido: " + JSON.stringify(r));
  ok(/Corte eliminado/.test(await txt()), "no avisó");
  await pg.click('.cl-par button:has-text("Eliminar el par")');
  ok(/inicial y el final/.test(await txt()), "el par no dice que se lleva los dos");
}

/* ---------- 3 · EL CORTE INICIAL ---------- */
await monta("c=todo");
{
  await pg.click('button:has-text("Nuevo corte inicial")');
  ok(await pg.$$eval(".cl-tarjeta", (x) => x.length) === 4, "no salen las 4 líneas");
  ok(await pg.inputValue(".cl-cuando input") === "2026-09-30T12:30", "la hora por defecto no es la de Colombia de ahora: " + await pg.inputValue(".cl-cuando input"));
  /* Sin llenar nada: dice qué falta y no llama. */
  await pg.click('.cl-guardar button');
  ok(/Llena al menos una línea/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && (await rpcs()).length === 0, "guardó vacío o no avisó");
  /* La calle abre los módulos, el módulo abre los lados; un módulo con un solo lado lo pone solo. */
  const o1 = pg.locator("fieldset.cl-sitio").nth(0);
  ok(await o1.locator("select").nth(1).isDisabled() && await o1.locator("select").nth(2).isDisabled(), "módulo y lado no esperan a la calle");
  await o1.locator("select").nth(0).selectOption("A");
  ok(await o1.locator("select").nth(1).locator("option").allTextContents().then((x) => x.join()) === "—,01,02", "los módulos de la calle A: " + await o1.locator("select").nth(1).locator("option").allTextContents());
  await o1.locator("select").nth(1).selectOption("02");
  ok(await o1.locator("select").nth(2).inputValue() === "DER" && await o1.locator("select").nth(2).isDisabled(), "A02 tiene un solo lado y no se puso solo");
  await o1.locator("select").nth(1).selectOption("01");
  ok(await o1.locator("select").nth(2).isEnabled() && await o1.locator("select").nth(2).inputValue() === "", "A01 tiene dos lados: hay que escoger");
  /* L1 a medias: dice QUÉ falta, por su nombre. */
  await pg.fill(".cl-tarjeta >> nth=0 >> .cl-depa input", "18801");
  await pg.click('.cl-guardar button');
  const m1 = await pg.$eval(".cl-mal", (e) => e.textContent.replace(/\s+/g, " "));
  ok(/L1:/.test(m1) && /de dónde tomaba/.test(m1) && /dónde estaba ubicado/.test(m1) && !/las cajas de la depa/.test(m1) && !/L2/.test(m1), "el aviso de lo que falta en L1: " + m1);
  ok((await rpcs()).length === 0, "guardó con la línea a medias");
  await o1.locator("select").nth(2).selectOption("DER");
  await pg.fill(".cl-tarjeta >> nth=0 >> .cl-sitio >> nth=0 >> .cl-cant-c input", "40");
  await eligeUbi(1, "B", "12", "IZQ");
  await pg.fill(".cl-tarjeta >> nth=0 >> .cl-sitio >> nth=1 >> .cl-cant-c input", "900");
  await pg.click(".cl-tarjeta >> nth=0 >> .cl-sitio >> nth=1 >> .cl-unidad button:has-text('Cajas')");
  ok(/A · 01 · DER/.test(await pg.$eval(".cl-tarjeta >> nth=0 >> .cl-eco", (e) => e.textContent)), "no repite la ubicación escogida");
  /* material que no existe: se rechaza; con uno de la lista, pasa. */
  await pg.fill(".cl-tarjeta >> nth=0 >> .cl-mat input", "XYZ inventado");
  await pg.click('.cl-guardar button');
  ok(/el material/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && (await rpcs()).length === 0, "aceptó un material inventado");
  await pg.fill(".cl-tarjeta >> nth=0 >> .cl-mat input", "3500887 · Botella Flint 1000R");
  /* L2 con un módulo de UN SOLO lado (A02): el lado se pone solo y viaja en el envío. */
  await pg.fill(".cl-tarjeta >> nth=1 >> .cl-depa input", "5000");
  const o2 = pg.locator(".cl-tarjeta").nth(1).locator("fieldset.cl-sitio").nth(0);
  await o2.locator("select").nth(0).selectOption("A");
  await o2.locator("select").nth(1).selectOption("02");
  await pg.fill(".cl-tarjeta >> nth=1 >> .cl-sitio >> nth=0 >> .cl-cant-c input", "100");
  await pg.click(".cl-tarjeta >> nth=1 >> .cl-sitio >> nth=0 >> .cl-unidad button:has-text('Cajas')");
  await eligeUbi(3, "B", "12", "DER");
  await pg.fill(".cl-tarjeta >> nth=1 >> .cl-sitio >> nth=1 >> .cl-cant-c input", "0");
  await pg.click(".cl-tarjeta >> nth=1 >> .cl-sitio >> nth=1 >> .cl-unidad button:has-text('Cajas')");
  /* Un rechazo de la base no cierra el formulario ni refresca. */
  await pg.evaluate(() => { window.__rpcFalla = "Hacer un corte de líneas requiere el permiso «Corte de líneas» (Roles)" });
  await pg.click('.cl-guardar button');
  await pg.waitForFunction(() => window.__rpc.length > 0);
  ok(/requiere el permiso/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && await pg.evaluate(() => window.__refresh) === 0 && await pg.$$eval(".cl-tarjeta", (x) => x.length) === 4, "el rechazo cerró el formulario, refrescó o no dijo por qué");
  await pg.evaluate(() => { window.__rpcFalla = null; window.__rpc = [] });
  await pg.click('.cl-guardar button');
  await pg.waitForFunction(() => window.__refresh > 0);
  const r = await rpcs();
  ok(r.length === 1 && r[0].n === "inv_corte_guardar", "no llamó a inv_corte_guardar: " + JSON.stringify(r));
  ok(JSON.stringify(r[0].a) === JSON.stringify({
    p_bodega: "bod1", p_tipo: "inicial", p_inicial: null, p_cortado: "2026-09-30T17:30:00.000Z", p_nota: null,
    p_renglones: [{ linea: "L1", cajas_depa: 18801, material_id: "m1",
      origen: { ubicacion_id: "uA01D", cant: 40, unidad: "estibas" }, destino: { ubicacion_id: "uB12I", cant: 900, unidad: "cajas" } },
      { linea: "L2", cajas_depa: 5000, material_id: null,
        origen: { ubicacion_id: "uA02D", cant: 100, unidad: "cajas" }, destino: { ubicacion_id: "uB12D", cant: 0, unidad: "cajas" } }] }),
     "los parámetros son " + JSON.stringify(r[0].a));
  ok(/Corte inicial guardado/.test(await txt()) && await pg.$$eval(".cl-tarjeta", (x) => x.length) === 0, "no volvió a la lista con su aviso");
}

/* ---------- 4 · EL CORTE FINAL ARRANCA CON LO DEL INICIAL ---------- */
await monta("c=todo");
{
  await pg.click('.cl-abierto button:has-text("Hacer el corte final")');
  const hh = await pg.$eval(".cl-forma-cab h2", (e) => e.textContent);
  ok(/Corte final/.test(hh) && /11:00/.test(hh), "el título no dice de cuál inicial es: " + hh);
  const o1 = pg.locator("fieldset.cl-sitio").nth(0);
  ok(await o1.locator("select").nth(0).inputValue() === "A" && await o1.locator("select").nth(1).inputValue() === "01" && await o1.locator("select").nth(2).inputValue() === "DER", "el origen de L1 no viene del inicial");
  ok(await pg.inputValue(".cl-tarjeta >> nth=0 >> .cl-mat input") === "3500887 · Botella Flint 1000R", "el material no viene del inicial");
  ok(await pg.inputValue(".cl-tarjeta >> nth=0 >> .cl-depa input") === "" && await pg.inputValue(".cl-tarjeta >> nth=0 >> .cl-sitio >> nth=0 >> .cl-cant-c input") === "", "las cantidades no arrancan vacías");
  ok(await pg.$eval(".cl-tarjeta >> nth=0 >> .cl-sitio >> nth=0 >> .cl-unidad .on", (e) => e.textContent) === "Estibas", "la unidad no viene del inicial");
  /* L4 (con módulo sin lado): el lado va vacío y bloqueado, y aun así se resuelve. */
  const l4 = pg.locator(".cl-tarjeta").nth(2).locator("fieldset.cl-sitio").nth(0);
  ok(await l4.locator("select").nth(0).inputValue() === "C" && await l4.locator("select").nth(2).isDisabled(), "L4 no viene con su módulo sin lado");
  /* El final no puede ser antes del inicial. */
  await pg.fill(".cl-cuando input", "2026-09-30T05:00");
  await pg.fill(".cl-tarjeta >> nth=0 >> .cl-depa input", "30801");
  await pg.fill(".cl-tarjeta >> nth=0 >> .cl-sitio >> nth=0 >> .cl-cant-c input", "30");
  await pg.fill(".cl-tarjeta >> nth=0 >> .cl-sitio >> nth=1 >> .cl-cant-c input", "1800");
  await pg.click('.cl-guardar button');
  ok(/tiene que ser después del inicial/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && (await rpcs()).length === 0, "aceptó un final antes del inicial");
  await pg.fill(".cl-cuando input", "2026-09-30T13:30");
  await pg.click('.cl-guardar button');
  ok(/después de|futuro/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && (await rpcs()).length === 0, "aceptó una hora del futuro");
  await pg.fill(".cl-cuando input", "2026-09-30T12:00");
  await pg.fill(".cl-cuando + label input, label.cl-cuando:last-of-type input", "L4 vuelve a las 3");
  await pg.click('.cl-guardar button');
  await pg.waitForFunction(() => window.__refresh > 0);
  const r = await rpcs();
  ok(r.length === 1 && r[0].a.p_tipo === "final" && r[0].a.p_inicial === "i2" && r[0].a.p_cortado === "2026-09-30T17:00:00.000Z" && r[0].a.p_nota === "L4 vuelve a las 3", "el final no viaja atado a su inicial: " + JSON.stringify(r[0].a).slice(0, 200));
  ok(r[0].a.p_renglones.length === 1 && r[0].a.p_renglones[0].linea === "L1", "solo debía viajar L1 (la única tocada): " + JSON.stringify(r[0].a.p_renglones).slice(0, 200));
  ok(/Corte final guardado/.test(await txt()), "no avisó del final");
}

/* ---------- 5 · NADA SE SALE, EN CUATRO ANCHOS ---------- */
for (const w of [360, 390, 820, 1440]) {
  for (const [c, tocar] of [["todo", null], ["todo", "Nuevo corte inicial"]]) {
    await monta("c=" + c, w);
    if (tocar) await pg.click(`button:has-text("${tocar}")`);
  if (process.env.UP) console.log(await pg.evaluate(() => { let e = document.querySelector(".cl-nota"); const o = []; while (e && e.id !== "r") { o.push(e.tagName + "." + e.className + ":" + getComputedStyle(e).textTransform); e = e.parentElement } return o.join(" < ") }));
    const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
      fuera: [...document.querySelectorAll("#r *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className || e.tagName).slice(0, 4) }));
    ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px${tocar ? " (formulario)" : ""} se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
    const chico = await pg.evaluate(() => [...document.querySelectorAll("#r button, #r select, #r input")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43).length);
    ok(chico === 0, `a ${w} px hay ${chico} controles de menos de 44 px`);
  }
}
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Corte de líneas en pantalla: las listas y el análisis con su signo, el formulario (calle → módulo → lado, el lado que se pone solo, lo que falta por su nombre), el final que arranca con lo del inicial y viaja atado a él, eliminar con confirmación solo para quien administra, y nada se sale en 4 anchos.");
