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

if (process.env.SHOT) {
  const [qq, w, ruta, tocar] = process.env.SHOT.split("@");
  await monta(qq, Number(w), process.env.TEMA ?? "");
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
  ok(/Inicial · 30\/09\/2026 11:00/.test(t) && /Línea 4 parada/.test(t) && /L1 30\.801 cajas por la depa/.test(t) && /Tomando de A · 01 · DER: 30 estibas de Botella Flint 1000R/.test(t) && /Ubicados en B · 12 · IZQ: 1\.800 cajas de Águila RN 330cc X30/.test(t) && /L4 777 cajas por la depa/.test(t) && /Tomando de C · 05 · —: 5 estibas/.test(t) && /Ubicados en B · 12 · DER: 10 cajas/.test(t), "el corte abierto no dice su hora, su nota o sus líneas: " + t.slice(0, 400));
  ok(/Paso 1|PASO 1/.test(t) && /1 abierto esperando/.test(t) && /Corte final/.test(t) && /sale sola|1 lista/.test(t), "la cabeza no muestra los tres pasos: " + t.slice(0, 200));
  ok(/30\/09\/2026 06:00 → 30\/09\/2026 12:00/.test(t) && /6 h/.test(t) && /6 h · 12\.000 cajas por la depa/.test(t), "el par no dice su intervalo o el total: " + t);
  const l1 = await pg.$eval('.dq-card[aria-label="Línea 1"]', (e) => e.textContent.replace(/\s+/g, " "));
  ok(/12\.000 cajas por la depa \(18\.801 → 30\.801\)/.test(l1), "L1 no dice lo que pasó por la depa: " + l1);
  ok(/Botella Flint 1000R/.test(l1) && /Águila RN 330cc X30/.test(l1), "el análisis no dice el envase que se tomó y el producto que quedó: " + l1);
  ok(/Tomando de · A · 01 · DER/.test(l1) && /debe BAJAR lo mismo que pasó por la depa/.test(l1), "L1 origen: " + l1);
  ok(/Ubicados en · B · 12 · IZQ/.test(l1) && /debe SUBIR lo mismo que pasó por la depa/.test(l1), "L1 destino: " + l1);
  /* La tabla: el origen bajó 600 (de 2.400 a 1.800 cajas) y debía bajar 12.000: la diferencia es +11.400. */
  const filaT = (card, texto, n = 0) => pg.locator(`.dq-card[aria-label="${card}"] tr:has(td.q:text-is("${texto}"))`).nth(n).locator("td").allTextContents().then((x) => x.map((y) => y.replace(/\s+/g, " ").trim()));
  const oc = await filaT("Línea 1", "Según el corte", 0);
  ok(oc[2] === "2.400" && oc[5] === "1.800" && oc[8] === "−600" && oc[11] === "+11.400" && /^Sobran/.test(oc[13]), "L1 origen según el corte: " + oc.join(" | "));
  ok(oc[1] === "40" && oc[4] === "30" && oc[7] === "−10" && oc[3] === "28.800", "L1 origen: estibas y unidades salen del factor (60 por estiba, 12 por caja): " + oc.join(" | "));
  const dc = await filaT("Línea 1", "Según el corte", 1);
  ok(dc[8] === "+900" && dc[11] === "−11.100" && /^Faltan/.test(dc[13]), "L1 destino según el corte: " + dc.join(" | "));
  const dp = await filaT("Línea 1", "Depaletizadora");
  ok(dp[2] === "18.801" && dp[5] === "30.801" && dp[8] === "+12.000" && dp[1] === "522,3" && dp[4] === "855,6" && dp[11] === "—", "la fila de la depa: " + dp.join(" | "));
  ok(await pg.$eval('.dq-card[aria-label="Línea 1"] .dq-chip', (e) => e.textContent) === "NO CUADRA", "el chip de L1");
  ok(/Factores:/.test(l1) && /60 cajas por estiba/.test(l1), "el pie de L1 debía decir los factores: " + l1);
  ok(/No hay conteos enviados de esta bodega/.test(await txt()), "sin conteos debía decirlo");
  ok(await pg.locator(".dq-cab + .tw table").count() >= 1 && await pg.locator(".dq thead tr.g th").allTextContents().then((x) => ["Corte inicial", "Corte final", "Se movió", "Diferencia con la depa"].every((k) => x.includes(k))), "los cuatro bloques de la tabla");
  const l2 = await pg.$eval('.dq-card[aria-label="Línea 2"]', (e) => e.textContent.replace(/\s+/g, " "));
  ok(/El contador retrocedió/.test(l2), "L2 con el contador atrás no lo dice: " + l2);
  ok(await pg.$$eval(".dq td.rojo", (x) => x.length) >= 2, "las diferencias con número no se marcan en rojo");
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

/* ---------- 3 · EL CORTE INICIAL (una línea a la vez) ---------- */
const est = (clave) => pg.locator(`.cl-lin:has(.cl-cod:text-is("${clave}")) .cl-st`).textContent();
const campo = (n, k) => pg.locator("fieldset.cl-sitio").nth(n).locator(k);
await monta("c=todo");
{
  await pg.click('button:has-text("Nuevo corte inicial")');
  ok(await pg.$$eval(".cl-lin", (x) => x.length) === 4, "no salen las 4 líneas en la lista");
  ok(await pg.$$eval(".cl-ficha", (x) => x.length) === 1, "debía verse UNA línea a la vez");
  ok(/Corte inicial/.test(await pg.textContent(".cl-flujo li.on")) && /anotando ahora/.test(await pg.textContent(".cl-flujo li.on")), "la cabeza no marca el paso 1");
  ok(await est("L1") === "ANOTANDO" && await est("L2") === "SIN TOCAR", "los estados al empezar: " + await est("L1") + " / " + await est("L2"));
  ok(await pg.inputValue(".cl-cuando input[type=datetime-local]") === "2026-09-30T12:30", "la hora por defecto no es la de Colombia de ahora");
  ok(/0 de 4 líneas anotadas/.test(await pg.textContent(".cl-prog")), "el progreso al empezar");
  /* Sin llenar nada: dice qué falta y no llama. */
  await pg.click(".cl-guardar .cl-go");
  ok(/Llena al menos una línea/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && (await rpcs()).length === 0, "guardó vacío o no avisó");
  /* La calle abre los módulos, el módulo abre los lados; un módulo con un solo lado lo pone solo. */
  const o1 = pg.locator("fieldset.cl-sitio").nth(0);
  ok(await o1.locator("select").nth(1).isDisabled() && await o1.locator("select").nth(2).isDisabled(), "módulo y lado no esperan a la calle");
  ok((await o1.locator("select").nth(2).locator("option").allTextContents()).join() === "—", "el lado sin módulo debía mostrar «—»");
  await o1.locator("select").nth(0).selectOption("A");
  ok(await o1.locator("select").nth(1).locator("option").allTextContents().then((x) => x.join()) === "—,01,02", "los módulos de la calle A");
  await o1.locator("select").nth(1).selectOption("02");
  ok(await o1.locator("select").nth(2).inputValue() === "DER" && await o1.locator("select").nth(2).isDisabled(), "A02 tiene un solo lado y no se puso solo");
  await o1.locator("select").nth(1).selectOption("01");
  ok(await o1.locator("select").nth(2).isEnabled() && await o1.locator("select").nth(2).inputValue() === "", "A01 tiene dos lados: hay que escoger");
  ok((await o1.locator("select").nth(2).locator("option").allTextContents()).join() === "—,Derecho,Izquierdo", "los lados no dicen Izquierdo/Derecho: " + await o1.locator("select").nth(2).locator("option").allTextContents());
  /* L1 a medias: dice QUÉ falta, por su nombre, y la lista lo marca. */
  await pg.fill(".cl-depa input", "18801");
  ok(await est("L1") === "A MEDIAS", "L1 con algo escrito y sin terminar no dice «A MEDIAS»: " + await est("L1"));
  ok(/0 de 4 líneas anotadas/.test(await pg.textContent(".cl-prog")), "una línea a medias cuenta como anotada");
  await pg.click(".cl-guardar .cl-go");
  const m1 = await pg.$eval(".cl-mal", (e) => e.textContent.replace(/\s+/g, " "));
  ok(/L1:/.test(m1) && /de dónde tomaba/.test(m1) && /dónde estaba ubicado/.test(m1) && !/las cajas de la depa/.test(m1) && !/L2/.test(m1), "el aviso de lo que falta en L1: " + m1);
  ok((await rpcs()).length === 0, "guardó con la línea a medias");
  await o1.locator("select").nth(2).selectOption("DER");
  await campo(0, ".cl-cant-c input").fill("40");
  /* Sin envase, las estibas no se pueden pasar a cajas y lo dice. Lo que se TOMA es ENVASE. */
  ok(/Escoge el envase/.test(await campo(0, ".cl-eco").textContent()), "estibas sin envase no avisa que falta el envase: " + await campo(0, ".cl-eco").textContent());
  ok(/Envase/.test(await campo(0, ".cl-mat-t").textContent()) && /Material/.test(await campo(1, ".cl-mat-t").textContent()), "«Tomando de» debe pedir ENVASE y «Ubicados en» el material (producto)");
  await eligeUbi(1, "B", "12", "IZQ");
  await campo(1, ".cl-cant-c input").fill("900");
  await campo(1, ".cl-unidad button:has-text('Cajas')").click();
  ok(/900 cajas/.test(await campo(1, ".cl-eco").textContent()), "900 cajas no dice 900 cajas");
  /* EL ENVASE SE FILTRA: entre envases solo salen envases, entre productos solo productos. */
  await campo(0, ".cl-busca input").fill("XYZ inventado");
  ok(/Ningún envase coincide/.test(await campo(0, ".cl-busca").textContent()), "un envase inventado no dice que no coincide");
  await campo(0, ".cl-busca input").fill("águila");
  ok((await campo(0, ".cl-busca li").count()) === 0, "el buscador de ENVASE ofreció un producto");
  await campo(1, ".cl-busca input").fill("botella");
  ok((await campo(1, ".cl-busca li").count()) === 0, "el buscador de PRODUCTO ofreció un envase");
  await campo(0, ".cl-busca input").fill("flint");
  ok((await campo(0, ".cl-busca li").count()) === 1, "no encontró el envase «flint»");
  await campo(0, ".cl-busca li button").click();
  ok(/Botella Flint 1000R/.test(await campo(0, ".cl-mae").textContent()) && /3500887 · 12 por caja · 60 cajas por estiba/.test(await campo(0, ".cl-mae").textContent()), "la tarjeta del envase: " + await campo(0, ".cl-mae").textContent());
  ok(/2\.400 cajas · 28\.800 unidades/.test(await campo(0, ".cl-eco").textContent()), "40 estibas de envase (60 cajas por 12): " + await campo(0, ".cl-eco").textContent());
  /* El producto, con el factor del PRODUCTO (900 cajas × 30 unidades). */
  ok(/Escoge el material/.test(await campo(1, ".cl-eco").textContent()) === false, "900 cajas no necesitan material");
  await campo(1, ".cl-busca input").fill("330");
  await campo(1, ".cl-busca li button").click();
  ok(/Águila RN 330cc X30/.test(await campo(1, ".cl-mae").textContent()) && /3128 · 30 por caja · 36 cajas por estiba/.test(await campo(1, ".cl-mae").textContent()), "la tarjeta del producto: " + await campo(1, ".cl-mae").textContent());
  ok(/900 cajas · 27\.000 unidades/.test(await campo(1, ".cl-eco").textContent()), "900 cajas en unidades del producto: " + await campo(1, ".cl-eco").textContent());
  /* Las estibas del destino usan el factor del PRODUCTO (36), no el del envase (60). */
  await campo(1, ".cl-unidad button:has-text('Estibas')").click();
  await campo(1, ".cl-cant-c input").fill("2");
  ok(/72 cajas/.test(await campo(1, ".cl-eco").textContent()), "2 estibas de producto (36 por estiba): " + await campo(1, ".cl-eco").textContent());
  await campo(1, ".cl-unidad button:has-text('Cajas')").click();
  await campo(1, ".cl-cant-c input").fill("900");
  /* «Cambiar» abre la búsqueda; «Dejar el que estaba» la cierra sin tocar nada. */
  await campo(0, '.cl-mae button:has-text("Cambiar")').click();
  ok(!!(await campo(0, ".cl-busca").count()), "«Cambiar» no abre la búsqueda");
  await campo(0, '.cl-busca button:has-text("Dejar el que estaba")').click();
  ok(!!(await campo(0, ".cl-mae").count()) && /Botella Flint/.test(await campo(0, ".cl-mae").textContent()), "«Dejar el que estaba» no lo dejó");
  ok(await est("L1") === "ANOTADA" && /1 de 4 líneas anotadas/.test(await pg.textContent(".cl-prog")), "L1 completa no dice ANOTADA / 1 de 4: " + await est("L1"));
  /* «Siguiente» pasa a L2 y conserva lo de L1. */
  await pg.click('.cl-guardar button:has-text("Siguiente: L2")');
  ok(/L2/.test(await pg.textContent(".cl-grande")) && await est("L2") === "ANOTANDO" && await est("L1") === "ANOTADA", "«Siguiente» no pasó a L2 dejando L1 anotada");
  /* L2 sin material, con un módulo de UN SOLO lado (A02): el lado se pone solo y viaja en el envío. */
  await pg.fill(".cl-depa input", "5000");
  const o2 = pg.locator("fieldset.cl-sitio").nth(0);
  await o2.locator("select").nth(0).selectOption("A");
  await o2.locator("select").nth(1).selectOption("02");
  await campo(0, ".cl-cant-c input").fill("100");
  await campo(0, ".cl-unidad button:has-text('Cajas')").click();
  await eligeUbi(1, "B", "12", "DER");
  await campo(1, ".cl-cant-c input").fill("0");
  await campo(1, ".cl-unidad button:has-text('Cajas')").click();
  /* L4: se toca y se arrepiente: «No cortar esta línea» la deja sin tocar. */
  await pg.click('.cl-lin:has(.cl-cod:text-is("L4"))');
  ok(/Siguiente: L6/.test(await pg.textContent(".cl-guardar")), "desde L4 el siguiente no es L6");
  await pg.fill(".cl-depa input", "12");
  ok(await est("L4") === "A MEDIAS", "L4 tocada no dice A MEDIAS");
  ok(/2 de 4 líneas anotadas/.test(await pg.textContent(".cl-prog")), "una línea a medias entra en la cuenta de las anotadas");
  /* Al guardar con L4 a medias estando en otra línea, salta a L4, que es donde hay que mirar. */
  await pg.click('.cl-lin:has(.cl-cod:text-is("L6"))');
  ok(!/Siguiente/.test(await pg.textContent(".cl-guardar")), "en la última línea no debía haber «Siguiente»");
  await pg.click('.cl-lin:has(.cl-cod:text-is("L2"))');
  await pg.click(".cl-guardar .cl-go");
  ok(/L4/.test(await pg.textContent(".cl-grande")) && /L4:/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && (await rpcs()).length === 0, "al guardar con L4 a medias no saltó a L4");
  await pg.click('button:has-text("No cortar esta línea")');
  ok(await est("L4") === "ANOTANDO" && await pg.inputValue(".cl-depa input") === "" && !(await pg.$('button:has-text("No cortar esta línea")')), "«No cortar esta línea» no la dejó como nueva");
  ok(/2 de 4 líneas anotadas/.test(await pg.textContent(".cl-prog")), "el progreso no dice 2 de 4");
  /* Un rechazo de la base no cierra el formulario ni refresca. */
  await pg.evaluate(() => { window.__rpcFalla = "Hacer un corte de líneas requiere el permiso «Corte de líneas» (Roles)" });
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForFunction(() => window.__rpc.length > 0);
  ok(/requiere el permiso/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && await pg.evaluate(() => window.__refresh) === 0 && await pg.$$eval(".cl-ficha", (x) => x.length) === 1, "el rechazo cerró el formulario, refrescó o no dijo por qué");
  await pg.evaluate(() => { window.__rpcFalla = null; window.__rpc = [] });
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForFunction(() => window.__refresh > 0);
  const r = await rpcs();
  ok(r.length === 1 && r[0].n === "inv_corte_guardar", "no llamó a inv_corte_guardar: " + JSON.stringify(r));
  ok(JSON.stringify(r[0].a) === JSON.stringify({
    p_bodega: "bod1", p_tipo: "inicial", p_inicial: null, p_cortado: "2026-09-30T17:30:00.000Z", p_nota: null,
    p_renglones: [{ linea: "L1", cajas_depa: 18801, material_id: "m3", envase_id: "m1",
      origenes: [{ ubicacion_id: "uA01D", cant: 40, unidad: "estibas" }], destinos: [{ ubicacion_id: "uB12I", cant: 900, unidad: "cajas" }] },
      { linea: "L2", cajas_depa: 5000, material_id: null, envase_id: null,
        origenes: [{ ubicacion_id: "uA02D", cant: 100, unidad: "cajas" }], destinos: [{ ubicacion_id: "uB12D", cant: 0, unidad: "cajas" }] }] }),
     "los parámetros son " + JSON.stringify(r[0].a));
  ok(/Corte inicial guardado/.test(await txt()) && /cuando vuelvas/.test(await txt()) && await pg.$$eval(".cl-ficha", (x) => x.length) === 0, "no volvió a la lista con su aviso");
}
/* «Sin envase» quita el envase puesto, y la línea vuelve a pedirlo para las estibas. */
await monta("c=todo");
{
  await pg.click('.cl-abierto button:has-text("Hacer el corte final")');
  await campo(0, '.cl-mae button:has-text("Cambiar")').click();
  await campo(0, '.cl-busca button:has-text("Sin envase")').click();
  ok(!!(await campo(0, ".cl-busca").count()) && !(await campo(0, ".cl-mae").count()), "«Sin envase» no dejó el buscador");
  await campo(0, ".cl-cant-c input").fill("30");
  ok(/Escoge el envase/.test(await campo(0, ".cl-eco").textContent()), "sin envase las estibas no avisan");
}

/* ---------- 4 · EL CORTE FINAL ARRANCA CON LO DEL INICIAL ---------- */
await monta("c=todo");
{
  await pg.click('.cl-abierto button:has-text("Hacer el corte final")');
  const hh = await pg.$eval(".cl-sub", (e) => e.textContent);
  ok(/Corte final/.test(hh) && /11:00/.test(hh), "no dice de cuál inicial es: " + hh);
  ok(/Corte final/.test(await pg.textContent(".cl-flujo li.on")) && /anotando ahora/.test(await pg.textContent(".cl-flujo li.on")), "la cabeza no marca el paso 2");
  const o1 = pg.locator("fieldset.cl-sitio").nth(0);
  ok(await o1.locator("select").nth(0).inputValue() === "A" && await o1.locator("select").nth(1).inputValue() === "01" && await o1.locator("select").nth(2).inputValue() === "DER", "el origen de L1 no viene del inicial");
  ok(/Botella Flint 1000R/.test(await campo(0, ".cl-mae").textContent()) && /Águila RN 330cc X30/.test(await campo(1, ".cl-mae").textContent()), "el envase y el producto no vienen del inicial");
  ok(await pg.inputValue(".cl-depa input") === "" && await campo(0, ".cl-cant-c input").inputValue() === "", "las cantidades no arrancan vacías");
  ok(await campo(0, ".cl-unidad .on").textContent() === "Estibas", "la unidad no viene del inicial");
  ok(await est("L1") === "ANOTANDO" && await est("L4") === "SIN TOCAR", "lo que viene del inicial sin tocar debe decir SIN TOCAR");
  /* L4 (con módulo sin lado): el lado va vacío y bloqueado, y aun así se resuelve. */
  await pg.click('.cl-lin:has(.cl-cod:text-is("L4"))');
  const l4 = pg.locator("fieldset.cl-sitio").nth(0);
  ok(await l4.locator("select").nth(0).inputValue() === "C" && await l4.locator("select").nth(2).isDisabled(), "L4 no viene con su módulo sin lado");
  ok(await est("L4") === "ANOTANDO", "L4 no quedó como la actual");
  ok(await est("L2") === "SIN TOCAR", "L2 (no estaba en el inicial) debía estar sin tocar");
  /* Cambiar SOLO el envase de una línea ya la cuenta como tocada. */
  await pg.click('.cl-lin:has(.cl-cod:text-is("L2"))');
  await campo(0, ".cl-busca input").fill("coste");
  await campo(0, ".cl-busca li button").click();
  ok(await est("L2") === "A MEDIAS", "escoger solo el envase no tocó la línea: " + await est("L2"));
  await pg.click('button:has-text("No cortar esta línea")');
  await pg.click('.cl-lin:has(.cl-cod:text-is("L4"))');
  await pg.click('.cl-lin:has(.cl-cod:text-is("L1"))');
  /* El final no puede ser antes del inicial. */
  await pg.fill(".cl-cuando input[type=datetime-local]", "2026-09-30T05:00");
  await pg.fill(".cl-depa input", "30801");
  await campo(0, ".cl-cant-c input").fill("30");
  await campo(1, ".cl-cant-c input").fill("1800");
  await pg.click(".cl-guardar .cl-go");
  ok(/tiene que ser después del inicial/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && (await rpcs()).length === 0, "aceptó un final antes del inicial");
  await pg.fill(".cl-cuando input[type=datetime-local]", "2026-09-30T13:30");
  await pg.click(".cl-guardar .cl-go");
  ok(/después de|futuro/.test(await pg.$eval(".cl-mal", (e) => e.textContent)) && (await rpcs()).length === 0, "aceptó una hora del futuro");
  await pg.fill(".cl-cuando input[type=datetime-local]", "2026-09-30T12:00");
  await pg.fill('.cl-barra label:has-text("Nota") input', "L4 vuelve a las 3");
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForFunction(() => window.__refresh > 0);
  const r = await rpcs();
  ok(r.length === 1 && r[0].a.p_tipo === "final" && r[0].a.p_inicial === "i2" && r[0].a.p_cortado === "2026-09-30T17:00:00.000Z" && r[0].a.p_nota === "L4 vuelve a las 3", "el final no viaja atado a su inicial: " + JSON.stringify(r[0].a).slice(0, 200));
  ok(r[0].a.p_renglones.length === 1 && r[0].a.p_renglones[0].linea === "L1", "solo debía viajar L1 (la única tocada): " + JSON.stringify(r[0].a.p_renglones).slice(0, 200));
  ok(/Corte final guardado/.test(await txt()), "no avisó del final");
}

/* ---------- 4b · EL COLOR ES EL DEL TEMA ELEGIDO (en negro/gris/halo: ámbar; el rojo es solo «ojo con esto») ---------- */
for (const tema of ["negro", "gris", "halo"]) {
  await monta("c=todo", 1440, tema);
  await pg.click('button:has-text("Nuevo corte inicial")');
  const c = await pg.evaluate(() => {
    const col = (q, p = "color") => getComputedStyle(document.querySelector(q))[p];
    return { paso: col(".cl-flujo li.on span"), guardar: col(".cl-go", "backgroundColor"), unidad: col(".cl-unidad .on", "backgroundColor"),
             marca: getComputedStyle(document.querySelector(".fe")).getPropertyValue("--c-marca").trim() || getComputedStyle(document.querySelector(".sh")).getPropertyValue("--c-marca").trim() };
  });
  ok(c.paso === "rgb(255, 192, 0)", `tema ${tema}: «PASO 1» no es ámbar sino ${c.paso}`);
  ok(c.guardar === "rgb(255, 192, 0)" && c.unidad === "rgb(255, 192, 0)", `tema ${tema}: los botones no son ámbar: ${c.guardar} / ${c.unidad}`);
}

/* ---------- 5 · NADA SE SALE, EN CUATRO ANCHOS ---------- */
for (const w of [360, 390, 820, 1440]) {
  for (const [c, tocar] of [["todo", null], ["todo", "Nuevo corte inicial"], ["todo", "Hacer el corte final"]]) {
    await monta("c=" + c, w);
    if (tocar) await pg.click(`button:has-text("${tocar}")`);
  if (process.env.UP) console.log(await pg.evaluate(() => { let e = document.querySelector(".cl-nota"); const o = []; while (e && e.id !== "r") { o.push(e.tagName + "." + e.className + ":" + getComputedStyle(e).textTransform); e = e.parentElement } return o.join(" < ") }));
    const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
      fuera: [...document.querySelectorAll("#r *")].filter((e) => { const t = e.closest(".tw"); return !(t && getComputedStyle(t).overflowX !== "visible") && e.getBoundingClientRect().right > window.innerWidth + 1 }).map((e) => e.className || e.tagName).slice(0, 4) }));
    ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px${tocar ? " (formulario)" : ""} se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
    const chico = await pg.evaluate(() => [...document.querySelectorAll("#r button, #r select, #r input")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43).length);
    ok(chico === 0, `a ${w} px hay ${chico} controles de menos de 44 px`);
  }
}
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Corte de líneas en pantalla: las listas y el análisis con su signo, el formulario (calle → módulo → lado, el lado que se pone solo, lo que falta por su nombre), el final que arranca con lo del inicial y viaja atado a él, eliminar con confirmación solo para quien administra, y nada se sale en 4 anchos.");
