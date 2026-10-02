/* =====================================================================
   INVENTARIO · CORTE DE LÍNEAS — VARIOS MÓDULOS POR LADO
   Monta el componente REAL (solo supabase y next/navigation son dobles) y
   prueba lo que se ve: las listas, el análisis con su signo, el formulario
   (calle → módulo → lado, el lado que se pone solo, el final que arranca con
   lo del inicial), lo que se manda a la base y que nada se salga de la
   pantalla en 360/390/820/1440.

     node .arnes/inv-corte-multi.mjs
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
const q = new URL(location.href).searchParams;
const c = q.get("c") ?? "todo";
const cortes = c === "vacio" ? [] : c === "multi" ? [abM, finM, iniM] : [abierto, fin, ini];
createRoot(document.getElementById("r")!).render(
  <Corte bodegaId="bod1" lineas={lineas} ubicaciones={ubis} materiales={mats} cortes={cortes as any}
    nombres={{ u1: "Cristian Padilla", u2: "Muchacho Uno" }} puedeEditar={c !== "lectura"} manda={c === "manda"} verDiferencia={c !== "sinanalisis"} ahora={AHORA} />);
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
const mod = (f, i) => pg.locator("fieldset.cl-sitio").nth(f).locator(".cl-mod").nth(i);
const est = (clave) => pg.locator(`.cl-lin:has(.cl-cod:text-is("${clave}")) .cl-st`).textContent();
const eligeMod = async (f, i, calle, modulo, lado) => {
  const m = mod(f, i);
  await m.locator("select").nth(0).selectOption(calle);
  await m.locator("select").nth(1).selectOption(modulo);
  if (lado !== undefined) await m.locator("select").nth(2).selectOption(lado);
};
const llenaDestino = async () => { await eligeMod(1, 0, "B", "12", "DER"); await mod(1, 0).locator(".cl-cant-c input").fill("5"); await mod(1, 0).locator(".cl-unidad button:has-text('Cajas')").click() };

/* ---------- 1 · EL ANÁLISIS con varios módulos: total arriba, detalle debajo ---------- */
await monta("c=multi");
{
  const l1 = await pg.$eval('.dq-card[aria-label="Línea 1"]', (e) => e.textContent.replace(/\s+/g, " "));
  ok(/Tomando de · 2 módulos/.test(l1), "el grupo de origen dice «2 módulos»: " + l1);
  const fila = (texto) => pg.locator(`.dq-card[aria-label="Línea 1"] tr:has(td.q:text-is("${texto}"))`).first().locator("td").allTextContents().then((x) => x.map((y) => y.replace(/\s+/g, " ").trim()));
  const a1 = await fila("A · 01 · DER · según el corte"), a2 = await fila("A · 02 · DER · según el corte");
  ok(a1[2] === "2.400" && a1[5] === "1.800" && a1[8] === "−600" && a1[11] === "—", "el detalle del primer módulo (sin diferencia con la depa): " + a1.join(" | "));
  ok(a2[2] === "1.200" && a2[5] === "0" && a2[8] === "−1.200" && a2[11] === "—", "el detalle del segundo módulo: " + a2.join(" | "));
  const tot = await fila("Total según el corte");
  ok(tot[2] === "3.600" && tot[5] === "1.800" && tot[8] === "−1.800" && tot[11] === "0" && /^Cuadra con la depa/.test(tot[13]), "el total de los dos módulos cuadra con la depa (1.800): " + tot.join(" | "));
  ok(await pg.$$eval('.dq-card[aria-label="Línea 1"] tr.r-corte', (x) => x.length) === 3, "debía haber una fila «según el corte» por módulo de origen (2) y la del destino (1); el total va aparte");
  ok(await pg.$$eval('.dq-card[aria-label="Línea 1"] tr.r-total', (x) => x.length) === 1, "con varios módulos el total va en su propia fila");
  ok(!/Quedaron por fuera/.test(l1), "todos emparejados y avisa que quedó algo por fuera");
  /* El corte abierto lista TODOS los módulos de cada lado. */
  const ab = await pg.$eval(".cl-abierto", (e) => e.textContent.replace(/\s+/g, " "));
  ok(/Tomando de A · 01 · DER: 40 estibas \+ A · 02 · DER: 20 estibas de 3500887 · Botella Flint 1000R/.test(ab), "el corte abierto no lista los dos módulos de origen: " + ab);
  ok(/Ubicados en B · 12 · IZQ: 100 cajas de 3128 · Águila RN 330cc X30/.test(ab), "el destino del abierto: " + ab);
}

/* ---------- 2 · EL FORMULARIO: agregar, quitar, repetir ---------- */
await monta("c=todo");
{
  await pg.click('button:has-text("Nuevo corte inicial")');
  const orig = pg.locator("fieldset.cl-sitio").nth(0);
  ok(await orig.locator(".cl-mod").count() === 1 && await orig.locator('button:has-text("Quitar este módulo")').count() === 0, "con un solo módulo no debe ofrecer «Quitar»");
  ok(await orig.locator('button:has-text("+ Agregar otro módulo de donde se toma")').count() === 1, "falta «+ Agregar otro módulo de donde se toma»");
  ok(await pg.locator("fieldset.cl-sitio").nth(1).locator('button:has-text("+ Agregar otro módulo donde quedó ubicado")').count() === 1, "falta «+ Agregar otro módulo donde quedó ubicado»");
  await pg.fill(".cl-depa input", "100");
  await eligeMod(0, 0, "A", "02");
  await mod(0, 0).locator(".cl-cant-c input").fill("10");
  await mod(0, 0).locator(".cl-unidad button:has-text('Cajas')").click();
  await llenaDestino();
  /* Agregar un segundo módulo: hereda la unidad del anterior y trae su propio «Quitar». */
  await orig.locator('button:has-text("+ Agregar otro módulo")').click();
  ok(await orig.locator(".cl-mod").count() === 2, "«Agregar» no agregó un módulo");
  ok(await orig.locator('button:has-text("Quitar este módulo")').count() === 2, "con dos módulos cada uno debe poder quitarse");
  ok(/Módulo 1/.test(await orig.locator(".cl-mod-cab").nth(0).textContent()) && /Módulo 2/.test(await orig.locator(".cl-mod-cab").nth(1).textContent()), "los módulos no se numeran");
  ok(await mod(0, 1).locator(".cl-unidad button.on").textContent() === "Cajas", "el módulo nuevo debía heredar la unidad del anterior");
  ok(await mod(0, 1).locator("select").nth(0).inputValue() === "", "el módulo nuevo debía venir vacío");
  /* El mismo módulo dos veces: lo dice y no llama a la base. */
  await eligeMod(0, 1, "A", "02");
  await mod(0, 1).locator(".cl-cant-c input").fill("3");
  await pg.click(".cl-guardar .cl-go");
  const repe = await pg.$eval(".cl-mal", (e) => e.textContent.replace(/\s+/g, " "));
  ok(/L1:/.test(repe) && /de dónde tomaba: el módulo 2 está repetido/.test(repe) && (await rpcs()).length === 0, "el módulo repetido no se rechazó por su nombre: " + repe);
  /* Se cambia por otro, y el total suma los dos. */
  await eligeMod(0, 1, "A", "01", "DER");
  await mod(0, 1).locator(".cl-cant-c input").fill("5");
  ok(/Total de los 2 módulos: 15 cajas/.test(await orig.locator(".cl-total").textContent()), "el total de los dos módulos: " + await orig.locator(".cl-total").textContent().catch(() => "sin total"));
  /* Un tercero en blanco se ignora al guardar. */
  await orig.locator('button:has-text("+ Agregar otro módulo")').click();
  ok(await orig.locator(".cl-mod").count() === 3, "el tercer módulo");
  ok(await est("L1") === "ANOTADA", "con un módulo extra en blanco la línea debía seguir ANOTADA: " + await est("L1"));
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForFunction(() => window.__refresh > 0);
  const r = (await rpcs())[0].a.p_renglones[0];
  ok(Array.isArray(r.origenes) && r.origenes.length === 2, "viajaron " + (r.origenes || []).length + " módulos de origen (el tercero, en blanco, no debía viajar)");
  ok(r.origenes[0].ubicacion_id === "uA02D" && r.origenes[0].cant === 10 && r.origenes[1].ubicacion_id === "uA01D" && r.origenes[1].cant === 5 && r.origenes[1].unidad === "cajas", "los módulos no viajaron como se anotaron y en orden: " + JSON.stringify(r.origenes));
  ok(r.destinos.length === 1 && r.destinos[0].ubicacion_id === "uB12D" && r.destinos[0].cant === 5, "el destino: " + JSON.stringify(r.destinos));
  ok(!("origen" in r) && !("destino" in r), "no debía mandar la forma vieja de un solo módulo");
}

/* Quitar un módulo: el que sigue se queda. */
await monta("c=todo");
{
  await pg.click('button:has-text("Nuevo corte inicial")');
  const dest = pg.locator("fieldset.cl-sitio").nth(1);
  await dest.locator('button:has-text("+ Agregar otro módulo")').click();
  await eligeMod(1, 0, "B", "12", "DER");
  await eligeMod(1, 1, "C", "05");
  await mod(1, 1).locator(".cl-cant-c input").fill("7");
  await dest.locator('button:has-text("Quitar este módulo")').nth(0).click();
  ok(await dest.locator(".cl-mod").count() === 1 && await mod(1, 0).locator("select").nth(0).inputValue() === "C" && await mod(1, 0).locator(".cl-cant-c input").inputValue() === "7", "quitar el módulo 1 debía dejar el 2, con lo que tenía");
  ok(await dest.locator('button:has-text("Quitar este módulo")').count() === 0, "con uno solo ya no hay «Quitar»");
  /* Y quitar el SEGUNDO deja el primero. */
  await dest.locator('button:has-text("+ Agregar otro módulo")').click();
  await eligeMod(1, 1, "B", "12", "DER");
  await dest.locator('button:has-text("Quitar este módulo")').nth(1).click();
  ok(await dest.locator(".cl-mod").count() === 1 && await mod(1, 0).locator("select").nth(0).inputValue() === "C", "quitar el módulo 2 debía dejar el 1 (C · 05)");
}

/* ---------- 3 · EL FINAL arranca con TODOS los módulos del inicial ---------- */
await monta("c=multi");
{
  await pg.click('.cl-abierto button:has-text("Hacer el corte final")');
  const orig = pg.locator("fieldset.cl-sitio").nth(0);
  ok(await orig.locator(".cl-mod").count() === 2, "el final debía traer los 2 módulos del inicial: " + await orig.locator(".cl-mod").count());
  ok(await mod(0, 0).locator("select").nth(0).inputValue() === "A" && await mod(0, 0).locator("select").nth(1).inputValue() === "01" && await mod(0, 0).locator("select").nth(2).inputValue() === "DER", "el módulo 1 no viene del inicial");
  ok(await mod(0, 1).locator("select").nth(1).inputValue() === "02", "el módulo 2 no viene del inicial");
  ok(await mod(0, 0).locator(".cl-cant-c input").inputValue() === "" && await mod(0, 1).locator(".cl-cant-c input").inputValue() === "", "las cantidades del final no deben venir copiadas");
  ok(await est("L1") === "ANOTANDO", "los módulos puestos no cuentan como línea tocada: " + await est("L1"));
  /* Quitar un módulo del inicial SÍ es tocar la línea (hay que guardar que ya no se toma de ahí). */
  await pg.locator("fieldset.cl-sitio").nth(0).locator('button:has-text("Quitar este módulo")').nth(1).click();
  ok(await est("L1") === "A MEDIAS", "quitar un módulo de los que trajo el final debía contar como tocar la línea: " + await est("L1"));
  await pg.click('button:has-text("No cortar esta línea")');
  ok(await pg.locator("fieldset.cl-sitio").nth(0).locator(".cl-mod").count() === 2 && await est("L1") === "ANOTANDO", "«No cortar esta línea» no devolvió los 2 módulos del inicial");
  await pg.fill(".cl-depa input", "5600");
  /* Falta la cantidad del destino: la pide por su nombre y no llama. */
  await mod(0, 0).locator(".cl-cant-c input").fill("30");
  await mod(0, 1).locator(".cl-cant-c input").fill("0");
  await pg.click(".cl-guardar .cl-go");
  const falta = await pg.$eval(".cl-mal", (e) => e.textContent.replace(/\s+/g, " ")).catch(() => "");
  ok((await rpcs()).length === 0 && /cuántas cajas hay donde estaba ubicado/.test(falta), "con el destino sin cantidad debía pedirla: " + falta);
  await mod(1, 0).locator(".cl-cant-c input").fill("1800");
  await pg.click(".cl-guardar .cl-go");
  await pg.waitForFunction(() => window.__refresh > 0);
  const p = (await rpcs())[0].a;
  ok(p.p_tipo === "final" && p.p_inicial === "am", "el final no viaja atado a su inicial");
  ok(p.p_renglones[0].origenes.length === 2 && p.p_renglones[0].origenes[0].cant === 30 && p.p_renglones[0].origenes[1].cant === 0 && p.p_renglones[0].origenes[1].ubicacion_id === "uA02D", "los dos módulos de origen del final: " + JSON.stringify(p.p_renglones[0].origenes));
}

/* ---------- 4 · NADA SE SALE con varios módulos, en cuatro anchos ---------- */
for (const w of [360, 390, 820, 1440]) {
  for (const [c, tocar] of [["multi", null], ["multi", "Hacer el corte final"], ["todo", "Nuevo corte inicial"]]) {
    await monta("c=" + c, w);
    if (tocar) await pg.click(`button:has-text("${tocar}")`);
    if (tocar === "Nuevo corte inicial") {
      for (let k = 0; k < 2; k++) await pg.locator('fieldset.cl-sitio').nth(0).locator('button:has-text("+ Agregar otro módulo")').click();
      await eligeMod(0, 0, "A", "02"); await mod(0, 0).locator(".cl-cant-c input").fill("10");
    }
    const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
      fuera: [...document.querySelectorAll("#r *")].filter((e) => { const t = e.closest(".tw"); return !(t && getComputedStyle(t).overflowX !== "visible") && e.getBoundingClientRect().right > window.innerWidth + 1 }).map((e) => e.className || e.tagName).slice(0, 4) }));
    ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px (${c}${tocar ? " · " + tocar : ""}) se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
    const chico = await pg.evaluate(() => [...document.querySelectorAll("#r button, #r select, #r input")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43).length);
    ok(chico === 0, `a ${w} px (${c}${tocar ? " · " + tocar : ""}) hay ${chico} controles de menos de 44 px`);
  }
}

ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Corte con varios módulos por lado: se suman, se agrega y se quita, el repetido se rechaza, el final trae todos los del inicial y nada se sale en 4 anchos.");
