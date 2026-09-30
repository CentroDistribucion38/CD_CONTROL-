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
                 { id: "k3", codigo: "CF-0928", fecha: "2026-09-28", enviado_en: "2026-09-28T20:00:00Z" },
                 { id: "k4", codigo: "CF-1001", fecha: "2026-10-01", enviado_en: "2026-10-01T20:00:00Z" }];
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

const tarjeta = () => pg.$eval('.dq-card[aria-label="Línea 1"]', (e) => e.textContent.replace(/\s+/g, " "));
const celdas = async (texto, n = 0) => (await pg.locator(`.dq-card tr:has(td.q:text-is("${texto}"))`).nth(n).locator("td").allTextContents()).map((x) => x.replace(/\s+/g, " ").trim());
const chip = () => pg.$eval(".dq-card .dq-chip", (e) => e.textContent);
/* Celdas de una fila: 0 nombre · 1-3 inicial (estibas, cajas, unidades) · 4-6 final · 7-9 se movió · 10-12 diferencia · 13 lectura. */

/* ---------- 1 · LA TARJETA Y SUS BLOQUES ---------- */
await monta("c=cruce");
{
  ok(await pg.locator(".dq-card").count() === 1, "el par cerrado debía traer una tarjeta por línea");
  const op = await pg.locator(".dq select option").allTextContents();
  ok(op.length === 4 && op[0] === "CF-0929 · 29/09/2026" && op[1] === "CF-0930 · 30/09/2026", "las opciones del selector: " + op.join(" | "));
  ok(await pg.locator(".dq select").inputValue() === "k1", "el conteo por defecto debía ser el del mismo día del corte (CF-0930): " + await pg.locator(".dq select").inputValue());
  ok(await pg.locator(".dq-aviso").count() === 0, "el conteo es del mismo día de los cortes: no debía avisar");
  const g = (await pg.locator(".dq thead tr.g th").allTextContents()).map((x) => x.trim()).filter(Boolean);
  ok(g.join("|") === "Corte inicial|Corte final|Se movió|Diferencia con la depa", "los cuatro bloques: " + g.join("|"));
  const s = (await pg.locator(".dq thead tr.s th").allTextContents()).map((x) => x.trim());
  ok(s.length === 14 && s[1] === "Estibas" && s[2] === "Cajas" && s[3] === "Unidades" && s[13] === "Lectura", "las subcolumnas: " + s.join("|"));
  const h = await pg.$eval(".dq-card .dq-cab", (e) => e.textContent.replace(/\s+/g, " "));
  ok(/L1/.test(h) && /Línea 1/.test(h) && /1\.800 cajas por la depa \(1\.000 → 2\.800\)/.test(h), "la cabeza de la tarjeta: " + h);
  ok(await chip() === "NO CUADRA", "el chip: " + await chip());
  ok(/debe BAJAR lo mismo que pasó por la depa/.test(await tarjeta()) && /debe SUBIR lo mismo que pasó por la depa/.test(await tarjeta()), "los grupos no dicen qué debe pasar");
  ok(/Factores:/.test(await tarjeta()) && /Diferencia con la depa = lo que se movió − lo que debía moverse/.test(await tarjeta()), "falta el pie con la fórmula y los factores");
}

/* ---------- 2 · LA DEPA, EL CORTE Y EL CONTEO, EN UNA TABLA ---------- */
{
  /* La depa cuenta cajas del PRODUCTO (36 por estiba, 30 unidades por caja): 1.000 → 2.800, pasaron 1.800 cajas = 50 estibas. */
  const d = await celdas("Depaletizadora");
  ok(d[1] === "—" && d[2] === "1.000" && d[3] === "30.000" && d[5] === "2.800" && d[7] === "+50" && d[8] === "+1.800" && d[9] === "+54.000", "la fila de la depa: " + d.join(" | "));
  ok(d[10] === "—" && d[11] === "—" && /Pasaron 1\.800 cajas/.test(d[13]), "la depa es la referencia: no lleva diferencia: " + d.join(" | "));
  /* Origen (envase, 60 por estiba): A01 40 → 30 estibas; el inventario contó 1.900 (+120 de avería aparte). */
  const c1 = await celdas("A · 01 · DER · según el corte");
  ok(c1[1] === "40" && c1[2] === "2.400" && c1[4] === "30" && c1[5] === "1.800" && c1[7] === "−10" && c1[8] === "−600" && c1[11] === "—", "A01 según el corte: " + c1.join(" | "));
  const i1 = await celdas("A · 01 · DER · según el inventario");
  ok(i1[2] === "2.400" && i1[5] === "1.900" && i1[8] === "−500" && i1[4] === "31,7", "A01 según el inventario (inicial del corte, lo contado, lo que se movió, estibas con decimal): " + i1.join(" | "));
  ok(/Sobran 100 cajas contra el corte final/.test(i1[13]) && /\+ 120 en avería\/PNC/.test(i1[13]), "A01: la lectura y la avería aparte: " + i1[13]);
  const i2 = await celdas("A · 02 · DER · según el inventario");
  ok(i2[2] === "1.200" && i2[5] === "300" && i2[8] === "−900" && /Sobran 300 cajas/.test(i2[13]), "A02: " + i2.join(" | "));
  /* Los totales del origen contra la depa: debía bajar 1.800. */
  const tc = await celdas("Total según el corte"), ti = await celdas("Total según el inventario");
  ok(tc[2] === "3.600" && tc[5] === "1.800" && tc[8] === "−1.800" && tc[11] === "0" && /^Cuadra con la depa/.test(tc[13]), "total según el corte: " + tc.join(" | "));
  ok(ti[2] === "3.600" && ti[5] === "2.200" && ti[8] === "−1.400" && ti[11] === "+400" && /^Sobran/.test(ti[13]), "total según el inventario: " + ti.join(" | "));
  /* Destino (producto, 36 cajas por estiba): B12 subió de 0 a 1.800 y el inventario contó 2.100. */
  const dc = await celdas("Según el corte"), di = await celdas("Según el inventario");
  ok(dc[2] === "0" && dc[5] === "1.800" && dc[8] === "+1.800" && dc[11] === "0" && /^Cuadra/.test(dc[13]), "destino según el corte: " + dc.join(" | "));
  ok(di[5] === "2.100" && di[8] === "+2.100" && di[11] === "+300" && /^Sobran/.test(di[13]), "destino según el inventario: " + di.join(" | "));
  /* El color sale del tono: «cuadra» y «no cuadra» se ven distintos. */
  const col = await pg.evaluate(() => [...document.querySelectorAll(".dq td.lec")].map((e) => [e.className, getComputedStyle(e).color]));
  const okc = col.find((x) => /\bok\b/.test(x[0])), malc = col.find((x) => /\bmal\b/.test(x[0]));
  ok(okc && malc && okc[1] !== malc[1], "«cuadra» y «no cuadra» se ven del mismo color: " + JSON.stringify([okc, malc]));
  ok(await pg.$$eval(".dq td.dz.rojo", (x) => x.length) > 0 && await pg.$$eval(".dq td.dz.ok", (x) => x.length) > 0, "las diferencias se pintan en rojo o verde según se aparten o no");
  /* Los títulos de cada grupo dicen el material buscado. */
  const grp = await pg.locator(".dq tr.grp td").allTextContents();
  ok(/Tomando de · 2 módulos/.test(grp[0]) && /Botella Flint 1000R/.test(grp[0]) && /Ubicados en · B · 12 · IZQ/.test(grp[1]) && /Águila RN 330cc X30/.test(grp[1]), "los grupos: " + grp.join(" || "));
}

/* ---------- 3 · OTROS CONTEOS: uno incompleto, fuera de fecha, y uno que cuadra ---------- */
{
  await pg.selectOption(".dq select", "k2");
  ok(/El conteo es del 29\/09\/2026 y los cortes del 30\/09: escoge un conteo hecho entre los dos cortes/.test(await pg.$eval(".dq-aviso", (e) => e.textContent)), "un conteo de otro día debía avisar");
  const i1 = await celdas("A · 01 · DER · según el inventario");
  ok(i1[5] === "2.000" && i1[8] === "−400" && /Sobran 200 cajas/.test(i1[13]), "A01 con el otro conteo: " + i1.join(" | "));
  ok(await chip() === "NO CUADRA", "un módulo que no cuadra con el corte final basta para NO CUADRA aunque falte contar otro: " + await chip());
  const x = await celdas("A · 02 · DER · según el inventario");
  ok(x[5] === "—" && x[8] === "—" && /Sin contar/.test(x[13]), "A02 no está en ese conteo: debía decir «Sin contar», no 0: " + x.join(" | "));
  const t = await celdas("Total según el inventario");
  ok(t[5] === "—" && /Falta contar 1 módulo: no se puede comparar con la depa/.test(t[13]), "con un módulo sin contar el total no se compara con la depa: " + t.join(" | "));
  const di = await celdas("Según el inventario");
  ok(/^Sin contar/.test(di[13]), "el destino sin contar: " + di.join(" | "));
  /* Un conteo que coincide con el corte final: todo cuadra. */
  /* Un conteo DESPUÉS de los cortes también avisa. */
  await pg.selectOption(".dq select", "k4");
  ok(/El conteo es del 01\/10\/2026 y los cortes del 30\/09/.test(await pg.$eval(".dq-aviso", (e) => e.textContent)), "un conteo posterior a los cortes debía avisar");
  await pg.selectOption(".dq select", "k3");
  ok(await pg.locator(".dq-aviso").count() === 1, "el 28/09 también está fuera de los cortes");
  for (const m of ["A · 01 · DER · según el inventario", "A · 02 · DER · según el inventario"]) {
    const y = await celdas(m);
    ok(/^Cuadra con el corte final/.test(y[13]), m + " con el conteo justo debía cuadrar: " + y.join(" | "));
  }
  const tt = await celdas("Total según el inventario");
  ok(tt[5] === "1.800" && tt[8] === "−1.800" && tt[11] === "0" && /^Cuadra con la depa/.test(tt[13]), "total con el conteo justo: " + tt.join(" | "));
  ok(await chip() === "CUADRA", "con todo cuadrando el chip dice CUADRA: " + await chip());
  await pg.selectOption(".dq select", "k1");
  ok(await chip() === "NO CUADRA" && await pg.locator(".dq-aviso").count() === 0, "al volver a CF-0930 se recalcula y se quita el aviso");
}

/* ---------- 4 · SIN CONTEOS ENVIADOS ---------- */
await monta("c=crucesin");
{
  ok(/No hay conteos enviados de esta bodega/.test(await pg.$eval(".dq-aviso", (e) => e.textContent)), "sin conteos debía decirlo");
  ok(await pg.locator(".dq select").count() === 0, "sin conteos no debía haber selector");
  ok(await pg.locator(".dq tr.r-inv, .dq tr.r-total").count() === 0 || await pg.locator(".dq tr.r-inv").count() === 0, "sin conteo no debía haber filas del inventario");
  const c = await celdas("A · 01 · DER · según el corte");
  ok(c[2] === "2.400" && c[8] === "−600", "el corte se ve igual sin conteo: " + c.join(" | "));
}

/* ---------- 5 · NADA SE SALE, en cuatro anchos ---------- */
for (const w of [360, 390, 820, 1440]) {
  await monta("c=cruce", w);
  const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
    fuera: [...document.querySelectorAll("#r *")].filter((e) => { const t = e.closest(".tw"); return !(t && getComputedStyle(t).overflowX !== "visible") && e.getBoundingClientRect().right > window.innerWidth + 1 }).map((e) => e.className || e.tagName).slice(0, 4) }));
  ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
  const chico = await pg.evaluate(() => [...document.querySelectorAll("#r button, #r select, #r input")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43).length);
  ok(chico === 0, `a ${w} px hay ${chico} controles de menos de 44 px`);
  const cab = await pg.evaluate(() => getComputedStyle(document.querySelector(".dq thead")).display);
  if (w <= 720) {
    ok(cab === "none", `a ${w} px la cabecera de la tabla debía esconderse (cada cifra trae su nombre): ${cab}`);
    const k = await pg.evaluate(() => getComputedStyle(document.querySelector('.dq tr.r-corte td[data-k="Cajas"]'), "::before").content);
    ok(/Cajas/.test(k), `a ${w} px cada cifra debía traer su unidad: ${k}`);
    const b = await pg.evaluate(() => getComputedStyle(document.querySelector('.dq tr.r-corte td[data-b="Corte inicial"]'), "::after").content);
    ok(/Corte inicial/.test(b), `a ${w} px cada bloque debía traer su nombre: ${b}`);
    const sc = await pg.evaluate(() => { const t = document.querySelector(".dq .tw"); return t.scrollWidth <= t.clientWidth + 1 });
    ok(sc, `a ${w} px la tabla no debía necesitar rodar de lado`);
  } else {
    ok(cab !== "none", `a ${w} px la tabla con sus bloques debía verse`);
  }
}

ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ La diferencia como en el diseño: una tarjeta por línea, bloques Corte inicial / Corte final / Se movió / Diferencia con la depa en estibas, cajas y unidades, cuadra y no cuadra con su color, aviso si el conteo es de otro día, y nada se sale en 4 anchos.");
