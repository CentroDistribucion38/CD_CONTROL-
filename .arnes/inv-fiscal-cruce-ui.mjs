/* =====================================================================
   INVENTARIO FISCAL · EL AVANCE DE CADA HOJA Y EL CRUCE (pantalla de quien arma el plan)
   Con el componente de verdad en Chromium (solo supabase y next/navigation son dobles) y la
   lógica pura (fiscal-cruce.ts) aparte. Lo que se prueba: el avance por equipo, cuándo sale
   «Ver cruce» (solo con las dos hojas terminadas y permiso de edición), lo que se pide a la base,
   cómo se lee el cruce (diferencias primero, nada soplado) y que nada se sale en 4 anchos.
     node .arnes/inv-fiscal-cruce-ui.mjs
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

/* ---------- A · LA LÓGICA PURA ---------- */
const lib = buildSync({ entryPoints: [R("src/modulos/inventario/fiscal-cruce.ts")], bundle: true, write: false, format: "esm", logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_fc-lib.mjs"), lib);
const L = await import(R(".arnes/_fc-lib.mjs") + "?" + Date.now());
const T = "2026-10-02T10:00:00Z";
const av = (a, b, c, d) => L.avanceDesdeBD({ fiscal_id: "f", hoja_id: "h", numero: 1, ol_renglones: a, ol_termino: b, bavaria_renglones: c, bavaria_termino: d });
ok(L.estadoHoja(av(0, null, 0, null)) === "sin-empezar", "estado: sin empezar");
ok(L.estadoHoja(av(2, null, 0, null)) === "contando", "estado: contando (uno solo con renglones)");
ok(L.estadoHoja(av(0, null, 3, null)) === "contando", "estado: contando (el otro equipo)");
ok(L.estadoHoja(av(2, T, 1, null)) === "una-termino", "estado: terminó el operador, falta Bavaria");
ok(L.estadoHoja(av(2, null, 1, T)) === "una-termino", "estado: terminó Bavaria, falta el operador");
ok(L.estadoHoja(av(2, T, 1, T)) === "lista", "estado: las dos terminaron");
ok(L.puedeCruzar(av(2, T, 1, T)) === true && L.puedeCruzar(av(2, T, 1, null)) === false && L.puedeCruzar(undefined) === false, "puedeCruzar solo con las dos terminadas");
ok(av("7", null, "3", null).olRenglones === 7 && av(null, null, undefined, null).bavariaRenglones === 0, "los renglones llegan como bigint (texto) o nulos y se vuelven número");
ok(L.textoEquipo(1, null) === "1 renglón · contando" && L.textoEquipo(3, null) === "3 renglones · contando", "texto del equipo contando");
ok(L.textoEquipo(0, null) === "sin empezar" && L.textoEquipo(1, T) === "1 renglón · terminó" && L.textoEquipo(4, T) === "4 renglones · terminó", "texto del equipo sin empezar / terminó");
ok(L.textoVenc(25, 12, 2026) === "25/12/2026" && L.textoVenc(null, 3, 2027) === "03/2027" && L.textoVenc(null, null, null) === "sin vencimiento" && L.textoVenc(5, 1, 2026) === "05/01/2026", "texto del vencimiento");
const F = (estado, co, cb, extra = {}) => L.filaDesdeBD({ ubicacion: "A-01", sku: "100", material: "M", venc_dia: null, venc_mes: null, venc_anio: null, cajas_ol: co, cajas_bavaria: cb, diferencia: (co ?? 0) - (cb ?? 0), estado, ...extra });
const filas = [F("COINCIDE", 10, 10), F("DIFIERE", "8", "5"), F("SOLO_OL", 4, null), F("SOLO_BAVARIA", null, 6), F("COINCIDE", 1, 1)];
const rs = L.resumenCruce(filas);
ok(rs.total === 5 && rs.coinciden === 2 && rs.difieren === 1 && rs.soloOl === 1 && rs.soloBavaria === 1 && rs.conDiferencia === 3, "resumen: " + JSON.stringify(rs));
ok(rs.cajasOl === 23 && rs.cajasBavaria === 22, "resumen: las cajas de cada equipo suman (los vacíos cuentan 0): " + rs.cajasOl + "/" + rs.cajasBavaria);
ok(L.titularCruce(rs) === "3 de 5 renglones no coinciden.", "titular con diferencias: " + L.titularCruce(rs));
ok(L.titularCruce(L.resumenCruce([F("DIFIERE", 3, 2)])) === "1 de 1 renglón no coincide.", "titular en singular");
ok(L.titularCruce(L.resumenCruce([F("SOLO_OL", 3, null), F("COINCIDE", 1, 1)])) === "1 de 2 renglones no coinciden.", "titular con un solo lado: " + L.titularCruce(L.resumenCruce([F("SOLO_OL", 3, null), F("COINCIDE", 1, 1)])));
ok(!/Todo coincide/.test(L.titularCruce(L.resumenCruce([F("SOLO_OL", 3, null), F("COINCIDE", 1, 1)]))), "lo que solo contó uno de los dos no puede dar «Todo coincide»");
ok(!/Todo coincide/.test(L.titularCruce(L.resumenCruce([F("SOLO_BAVARIA", null, 3)]))), "solo Bavaria tampoco da «Todo coincide»");
ok(L.titularCruce(L.resumenCruce([F("COINCIDE", 3, 3), F("COINCIDE", 1, 1)])) === "Todo coincide: 2 renglones iguales.", "titular todo coincide");
ok(L.titularCruce(L.resumenCruce([])) === "Ninguno de los dos contó nada en esta hoja.", "titular vacío");
ok(L.ordenarCruce(filas).map((f) => f.estado).join() === "DIFIERE,SOLO_OL,SOLO_BAVARIA,COINCIDE,COINCIDE", "orden: las diferencias primero, y entre ellas se respeta el orden de la base: " + L.ordenarCruce(filas).map((f) => f.estado).join());
ok(F("RARO", 1, 2).estado === "DIFIERE", "un estado desconocido se trata como diferencia (nunca como coincide)");
ok(F("DIFIERE", "8", "5").cajasOl === 8 && F("SOLO_OL", 4, null).cajasBavaria === null, "las cajas vacías siguen vacías (no son 0)");

/* ---------- B · LA PANTALLA ---------- */
writeFileSync(R(".arnes/_fx-cliente.ts"), `
const w = window as any;
w.__rpc = [];
export function createClient() {
  return { auth: { getUser: async () => ({ data: { user: { id: "p1" } } }) }, rpc: async (n: string, a: any) => {
    w.__rpc.push({ n, a });
    const r = (w.__RESP || {})[n];
    if (r && r.error) return { data: null, error: { message: r.error } };
    if (r && r.espera) await new Promise((x) => { w.__suelta = x });
    return { data: r ? r.data : "ok", error: null };
  } };
}`);
writeFileSync(R(".arnes/_fx-nav.ts"), `export function useRouter() { return { refresh() {}, push() {}, replace() {}, back() {} } }`);
writeFileSync(R(".arnes/_fx-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Fiscal } from "../src/app/(app)/inventario/fiscal/Fiscal";
const p = (window as any).__PROPS;
createRoot(document.getElementById("r")!).render(<Fiscal {...p} />);
`);
const js = buildSync({
  entryPoints: [R(".arnes/_fx-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_fx-cliente.ts"), "next/navigation": R(".arnes/_fx-nav.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/corte/corte.css", "src/app/(app)/inventario/fiscal/fiscal.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const roles = [{ clave: "operador", nombre: "Operador logístico" }, { clave: "abi", nombre: "ABI" }];
const personas = Array.from({ length: 8 }, (_, i) => ({ id: "p" + (i + 1), nombre: "Persona " + (i + 1), activo: true, rol: i < 4 ? "operador" : "abi" }));
const H = (numero, ol = "", bavaria = "") => ({ numero, ol, bavaria });
const A = (olR, olT, baR, baT) => ({ olRenglones: olR, olTermino: olT, bavariaRenglones: baR, bavariaTermino: baT });
/* Cuatro hojas, una en cada punto del camino. */
const plan = {
  id: "fp", nombre: "Fiscal viernes", fecha: "2026-10-02", estado: "abierto", publicado: "2026-10-01T12:00:00Z",
  hojas: [H(1, "p1", "p5"), H(2, "p2", "p6"), H(3, "p3", "p7"), H(4, "p4", "p8")],
  hojaIds: { 1: "hoja-1", 2: "hoja-2", 3: "hoja-3", 4: "hoja-4" },
  avance: { 1: A(0, null, 0, null), 2: A(5, null, 2, null), 3: A(6, T, 2, null), 4: A(9, T, 8, T) },
};
const base = { bodegaId: "bod1", personas, roles, fiscales: [plan], puedeEditar: true, manda: false, ahora: "2026-10-01T15:00:00.000Z" };
const CRUCE = [
  { ubicacion: "A-01", sku: "100", material: "Cerveza 330", venc_dia: 25, venc_mes: 12, venc_anio: 2026, cajas_ol: 10, cajas_bavaria: 7, diferencia: 3, estado: "DIFIERE" },
  { ubicacion: "A-02", sku: "200", material: "Agua 600", venc_dia: null, venc_mes: 3, venc_anio: 2027, cajas_ol: 4, cajas_bavaria: null, diferencia: 4, estado: "SOLO_OL" },
  { ubicacion: "B-01", sku: "300", material: "Gaseosa 1L", venc_dia: null, venc_mes: null, venc_anio: null, cajas_ol: null, cajas_bavaria: 6, diferencia: -6, estado: "SOLO_BAVARIA" },
  { ubicacion: "A-03", sku: "400", material: "Malta", venc_dia: 1, venc_mes: 1, venc_anio: 2027, cajas_ol: 1200, cajas_bavaria: 1200, diferencia: 0, estado: "COINCIDE" },
];

const CT = (equipo, persona, ubicacion, sku, material, est, sal, caj, total) => ({ equipo, persona, ubicacion, sku, material, cajas_por_estiba: est === null ? null : 54, estibas: est, saldo: sal, cajas: caj, total_cajas: total,
  venc_dia: null, venc_mes: 3, venc_anio: 2027, nota: null, contado_en: "2026-10-02T15:10:00Z" });
const CONTEOS = [CT("OL", "Persona 4", "A-01", "100", "Cerveza 330", 0, 0, null, 10), CT("BAVARIA", "Persona 8", "A-01", "100", "Cerveza 330", null, null, 7, 7)];
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = [];
pg.on("pageerror", (e) => roto.push(e.message));
/* El logo (/marca/logo-b.png) no existe al abrir el archivo suelto: es lo único que se ignora. */
pg.on("console", (m) => { if (m.type() === "error" && !/logo-b\.png|ERR_FAILED/.test(m.text())) roto.push(m.text()) });
const monta = async (props = {}, resp = {}, ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  writeFileSync(R(".arnes/tmp/_ui-fiscal.html"), `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div>
    <script>window.__RESP=${JSON.stringify({ inv_fiscal_cruce: { data: CRUCE }, inv_fiscal_conteos: { data: CONTEOS }, ...resp })};window.__PROPS=${JSON.stringify({ ...base, ...props })};</script><script>${js.replace(/<\/script/gi, "<\\/script")}<\/script></body></html>`);
  await pg.goto("file://" + R(".arnes/tmp/_ui-fiscal.html"));
  await pg.waitForSelector("#r > *", { timeout: 8000 }).catch((e) => { throw new Error(e.message.split("\n")[0] + " · errores: " + roto.slice(0, 3).join(" | ")) });
};
const txt = () => pg.$eval("#r", (e) => e.textContent.replace(/\s+/g, " "));
const rpcs = () => pg.evaluate(() => window.__rpc);
const fila = (n) => pg.locator(".fi-hojas tbody tr").nth(n - 1);
const abre = async (n = 4) => { await fila(n).locator("button.fi-cruzar").click(); await pg.waitForSelector(".fi-cruce-titular, .fi-cruce .cl-mal") };

/* ---------- 1 · EL AVANCE ---------- */
await monta();
{
  const cab = await pg.locator(".fi-hojas thead th").allTextContents();
  ok(cab.join("|") === "Hoja|Operador logístico|Bavaria|Avance", "columnas de la tabla: " + cab.join("|"));
  const chip = (n) => fila(n).locator(".fi-av").textContent();
  ok(await chip(1) === "Sin empezar", "hoja 1 (nadie empezó): " + await chip(1));
  ok(await chip(2) === "Contando", "hoja 2 (contando): " + await chip(2));
  ok(await chip(3) === "Falta una", "hoja 3 (terminó uno): " + await chip(3));
  ok(await chip(4) === "Lista para cruzar", "hoja 4 (las dos terminaron): " + await chip(4));
  const t2 = await fila(2).textContent();
  ok(/Persona 2.*5 renglones · contando.*Persona 6.*2 renglones · contando/.test(t2), "hoja 2: renglones por equipo: " + t2);
  const t3 = await fila(3).textContent();
  ok(/Persona 3.*6 renglones · terminó.*Persona 7.*2 renglones · contando/.test(t3), "hoja 3: un equipo terminó y el otro no: " + t3);
  ok(/Persona 1sin empezar|Persona 1 ?sin empezar/.test((await fila(1).textContent())), "hoja 1: «sin empezar» bajo cada nombre");
  /* Solo el que tiene las dos hojas terminadas puede cruzar. */
  ok(await pg.locator("button.fi-cruzar").count() === 1 && await fila(4).locator("button.fi-cruzar").count() === 1, "«Ver cruce» solo en la hoja 4: salen " + await pg.locator("button.fi-cruzar").count());
  /* El avance son cifras: nada de lo contado. */
  ok(!/cajas|Cerveza|A-01/.test(await txt()), "el avance suelta lo contado: " + (await txt()).slice(0, 300));
}
/* Sin permiso de edición: ve el avance, no cruza. */
await monta({ puedeEditar: false });
ok(await pg.locator(".fi-av").count() === 4 && await pg.locator("button.fi-cruzar").count() === 0, "solo lectura: ve el avance pero no «Ver cruce»");
/* Un plan que no está en Contar no tiene avance. */
await monta({ fiscales: [{ ...plan, publicado: null }] });
ok(await pg.locator(".fi-av").count() === 0 && (await pg.locator(".fi-hojas thead th").allTextContents()).length === 3, "un plan sin mostrar en Contar no debe tener columna de avance");
/* Un inventario viejo sin avance (la base no devolvió su fila): sigue sirviendo. */
await monta({ fiscales: [{ ...plan, avance: { 4: plan.avance[4] } }] });
ok(await fila(1).locator(".fi-av").count() === 0 && /—/.test(await fila(1).textContent()) && await fila(4).locator(".fi-av").count() === 1, "una hoja sin avance sale con «—»");
/* A la base le falta el SQL. */
await monta({ conCruce: false, fiscales: [{ ...plan, avance: undefined, hojaIds: undefined }] });
ok(/2026-10-fiscal-cruce\.sql/.test(await txt()) && await pg.locator(".fi-av").count() === 0, "sin el SQL no avisa o enseña avance");
await monta({ conCruce: false, puedeEditar: false, fiscales: [{ ...plan, avance: undefined, hojaIds: undefined }] });
ok(!/fiscal-cruce\.sql/.test(await txt()), "solo lectura: no debe ver la instrucción del SQL");
await monta();
ok(!/fiscal-cruce\.sql/.test(await txt()), "con el SQL no debe haber aviso");

/* ---------- 2 · EL CRUCE ---------- */
await monta();
await abre(4);
{
  const llamadas = (await rpcs()).filter((x) => x.n === "inv_fiscal_cruce");
  ok(llamadas.length === 1 && llamadas[0].a.p_hoja === "hoja-4", "se pide el cruce de la hoja correcta: " + JSON.stringify(llamadas));
  const t = await pg.locator(".fi-cruce").textContent();
  ok(/Cruce · Hoja 4/.test(t), "el panel no dice de qué hoja es");
  ok(/3 de 4 renglones no coinciden\./.test(t), "titular: " + t.slice(0, 200));
  const cifras = (await pg.locator(".fi-cruce-cifras li").allTextContents()).join("|");
  ok(cifras === "1 coinciden|1 difiere|1 solo el operador|1 solo Bavaria", "cifras: " + cifras);
  const est = await pg.locator(".fi-cruce-tabla tbody .fi-ef").allTextContents();
  ok(est.join("|") === "Difiere|Solo el operador|Solo Bavaria|Coincide", "las diferencias primero y lo que coincide al final: " + est.join("|"));
  const f1 = await pg.locator(".fi-cruce-tabla tbody tr").nth(0).textContent();
  ok(/A-01/.test(f1) && /100/.test(f1) && /Cerveza 330/.test(f1) && /25\/12\/2026/.test(f1) && /10/.test(f1) && /7/.test(f1) && /\+3/.test(f1), "renglón que difiere: " + f1);
  const f2 = await pg.locator(".fi-cruce-tabla tbody tr").nth(1).textContent();
  ok(/03\/2027/.test(f2) && /—/.test(f2) && /\+4/.test(f2), "solo el operador: Bavaria queda en «—»: " + f2);
  const f3 = await pg.locator(".fi-cruce-tabla tbody tr").nth(2).textContent();
  ok(/sin vencimiento/.test(f3) && /—/.test(f3) && /-6/.test(f3), "solo Bavaria: negativo y sin vencimiento: " + f3);
  const f4 = await pg.locator(".fi-cruce-tabla tbody tr").nth(3).locator("td").allTextContents();
  ok(f4.join("|") === "Coincide|A-03|400 Malta|01/01/2027|1.200|1.200|0", "coincide: miles con punto y diferencia 0: " + f4.join("|"));
  ok(await pg.locator(".fi-cruce-filtro").count() === 1, "falta el filtro de lo que coincide");
  await pg.click(".fi-cruce-filtro");
  ok(await pg.locator(".fi-cruce-tabla tbody tr").count() === 3 && !/Coincide/.test(await pg.locator(".fi-cruce-tabla").textContent()), "ocultar lo que coincide deja 3 renglones");
  ok(/Mostrar también/.test(await pg.locator(".fi-cruce-filtro").textContent()), "el filtro cambia de texto");
  await pg.click(".fi-cruce-filtro");
  ok(await pg.locator(".fi-cruce-tabla tbody tr").count() === 4, "mostrar de nuevo trae los 4");
  await pg.click(".fi-cruce-cerrar");
  ok(await pg.locator(".fi-cruce").count() === 0, "«Cerrar» no cierra el cruce");
  ok((await rpcs()).every((x) => x.n === "inv_fiscal_cruce"), "mirar el cruce no debe escribir nada: " + JSON.stringify((await rpcs()).map((x) => x.n)));
}
/* La base manda lo que quiera: la pantalla pone las diferencias primero. */
await monta({}, { inv_fiscal_cruce: { data: [CRUCE[3], CRUCE[0], { ...CRUCE[3], ubicacion: "A-09" }, CRUCE[1]] } });
await abre(4);
ok((await pg.locator(".fi-cruce-tabla tbody .fi-ef").allTextContents()).join("|") === "Difiere|Solo el operador|Coincide|Coincide", "la pantalla no reordena: las diferencias primero: " + (await pg.locator(".fi-cruce-tabla tbody .fi-ef").allTextContents()).join("|"));
/* Dos planes con hojas listas: el cruce sale bajo el plan que se pidió, no bajo los dos. */
{
  const otro = { ...plan, id: "fq", nombre: "Fiscal sábado", fecha: "2026-10-03", hojaIds: { 1: "q-1", 2: "q-2", 3: "q-3", 4: "q-4" } };
  await monta({ fiscales: [plan, otro] });
  await pg.locator(".fi-fila").nth(1).locator("tbody tr").nth(3).locator("button.fi-cruzar").click();
  await pg.waitForSelector(".fi-cruce-titular");
  ok(await pg.locator(".fi-cruce").count() === 1 && await pg.locator(".fi-fila").nth(1).locator(".fi-cruce").count() === 1 && await pg.locator(".fi-fila").nth(0).locator(".fi-cruce").count() === 0, "el cruce debe salir solo bajo el plan que se pidió");
  ok((await rpcs()).at(-1).a.p_hoja === "q-4", "pidió la hoja de otro plan: " + JSON.stringify((await rpcs()).at(-1)));
}
/* Todo coincide. */
await monta({}, { inv_fiscal_cruce: { data: [CRUCE[3], { ...CRUCE[3], ubicacion: "A-04" }] } });
await abre(4);
ok(/Todo coincide: 2 renglones iguales\./.test(await pg.locator(".fi-cruce-titular").textContent()) && await pg.locator(".fi-cruce-filtro").count() === 0, "todo coincide: titular y sin filtro");
ok(await pg.locator(".fi-cruce-titular.bien").count() === 1, "todo coincide: el titular va en tono bueno");
/* Nadie contó nada. */
await monta({}, { inv_fiscal_cruce: { data: [] } });
await abre(4);
ok(/Ninguno de los dos contó nada/.test(await pg.locator(".fi-cruce-titular").textContent()) && await pg.locator(".fi-cruce-tabla").count() === 0, "cruce vacío");
/* Solo diferencias (nada coincide): sin filtro. */
await monta({}, { inv_fiscal_cruce: { data: [CRUCE[0]] } });
await abre(4);
ok(await pg.locator(".fi-cruce-filtro").count() === 0 && /1 de 1 renglón no coincide\./.test(await pg.locator(".fi-cruce-titular").textContent()), "una sola diferencia: sin filtro y en singular");
/* La base rechaza. */
await monta({}, { inv_fiscal_cruce: { error: "El cruce se hace cuando las dos personas de la hoja terminan de contar." } });
await abre(4);
ok(/dos personas de la hoja terminan/.test(await pg.locator(".fi-cruce .cl-mal").textContent()) && await pg.locator(".fi-cruce-tabla").count() === 0, "el error de la base no se muestra");
/* Mientras carga. */
await monta({}, { inv_fiscal_cruce: { data: CRUCE, espera: true } });
await fila(4).locator("button.fi-cruzar").click();
await pg.waitForSelector(".fi-cruce");
ok(/Cruzando/.test(await pg.locator(".fi-cruce").textContent()) && await pg.locator(".fi-cruce-tabla").count() === 0, "mientras carga debe decir «Cruzando…»");
await pg.evaluate(() => window.__suelta());
await pg.waitForSelector(".fi-cruce-tabla");
/* Dos hojas listas: el cruce que se ve es el de la última pedida, y está bajo el plan de esa hoja. */
const plan2 = { ...plan, avance: { ...plan.avance, 3: A(6, T, 2, T) } };
await monta({ fiscales: [plan2] });
await abre(3);
ok(/Hoja 3/.test(await pg.locator(".fi-cruce").textContent()) && (await rpcs()).at(-1).a.p_hoja === "hoja-3", "el cruce de la hoja 3 pide la hoja 3");
await pg.locator(".fi-hojas tbody tr").nth(3).locator("button.fi-cruzar").click();
await pg.waitForFunction(() => /Hoja 4/.test(document.querySelector(".fi-cruce")?.textContent || ""));
ok(await pg.locator(".fi-cruce").count() === 1, "solo un cruce abierto a la vez");

/* ---------- 2b · EL EXCEL DEL CRUCE, EN UNO SOLO ---------- */
{
  const { default: ExcelJS } = await import("exceljs");
  /* Con dos hojas listas (1 y 4) y una sin terminar. Se piden SOLO las listas. */
  const plan3 = { ...plan, avance: { ...plan.avance, 1: A(3, T, 2, T) } };
  await monta({ fiscales: [plan3] });
  ok(await pg.locator("button.fi-excel").count() === 1, "falta el botón del Excel del cruce en el inventario");
  ok(/Excel del cruce \(todas las hojas\)/.test(await pg.locator("button.fi-excel").textContent()), "el botón no dice qué baja");
  const antes = (await rpcs()).length;
  const [d] = await Promise.all([pg.waitForEvent("download"), pg.click("button.fi-excel")]);
  ok(d.suggestedFilename() === "cruce-fiscal-2026-10-02.xlsx", "nombre del archivo: " + d.suggestedFilename());
  await d.saveAs(R(".arnes/tmp/_ui-cruce.xlsx"));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(R(".arnes/tmp/_ui-cruce.xlsx"));
  ok(wb.worksheets.map((w) => w.name).join("|") === "Resumen|Diferencias|Por material|Por persona|Conteos por persona|Conteos cruzados", "hojas del libro: " + wb.worksheets.map((w) => w.name).join("|"));
  const pedidas = (await rpcs()).slice(antes).filter((x) => x.n === "inv_fiscal_cruce").map((x) => x.a.p_hoja).sort().join();
  ok(pedidas === "hoja-1,hoja-4", "solo se piden las hojas listas para cruzar: " + pedidas);
  const pedidasC = (await rpcs()).slice(antes).filter((x) => x.n === "inv_fiscal_conteos").map((x) => x.a.p_hoja).sort().join();
  ok(pedidasC === "hoja-1,hoja-4", "lo que contó cada persona se pide de las mismas hojas: " + pedidasC);
  ok((await rpcs()).slice(antes).every((x) => x.n === "inv_fiscal_cruce" || x.n === "inv_fiscal_conteos"), "exportar no debe escribir nada");
  ok(wb.getWorksheet("Conteos cruzados").rowCount >= 8 + 1, "el cruce junta los renglones de las dos hojas: " + wb.getWorksheet("Conteos cruzados").rowCount);
  ok(wb.getWorksheet("Conteos por persona").rowCount >= 8 + 3, "los conteos por persona traen lo anotado: " + wb.getWorksheet("Conteos por persona").rowCount);
  ok(/con lo que contó cada persona/.test(await pg.locator(".cl-ok").textContent()), "el aviso dice que trae lo de cada persona: " + await pg.locator(".cl-ok").textContent());
  const resumen = []; wb.getWorksheet("Resumen").eachRow((r) => resumen.push(r.values.join(" ")));
  ok(/Persona 1/.test(resumen.join("\n")) && /Persona 4/.test(resumen.join("\n")), "el resumen no nombra las parejas");
  ok(/exportado por Persona 1/.test(resumen.join("\n")), "el resumen no dice quién exportó");
  ok(/2 de 4 hojas cruzadas/.test(await pg.locator(".cl-ok").textContent()), "aviso: " + await pg.locator(".cl-ok").textContent());
  /* Sin permiso de edición o sin avance: no hay botón. */
  await monta({ fiscales: [plan3], puedeEditar: false });
  ok(await pg.locator("button.fi-excel").count() === 0, "sin permiso de edición no debe haber botón de Excel");
  await monta({ fiscales: [{ ...plan3, publicado: null }] });
  ok(await pg.locator("button.fi-excel").count() === 0, "sin mostrar en Contar no hay avance ni Excel");
  /* A la base le falta el SQL de los conteos por persona: el cruce sale igual y se avisa qué correr. */
  await monta({ fiscales: [plan3] }, { inv_fiscal_conteos: { error: "Could not find the function public.inv_fiscal_conteos(p_hoja) in the schema cache" } });
  const [d2] = await Promise.all([pg.waitForEvent("download"), pg.click("button.fi-excel")]);
  await d2.saveAs(R(".arnes/tmp/_ui-cruce2.xlsx"));
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.readFile(R(".arnes/tmp/_ui-cruce2.xlsx"));
  ok(/inv_fiscal_conteos|fiscal-conteos-por-persona/.test(JSON.stringify(wb2.getWorksheet("Conteos por persona").getRow(8).values)), "sin el SQL el libro lo dice en la pestaña");
  await pg.waitForFunction(() => /fiscal-conteos-por-persona\.sql/.test(document.querySelector(".cl-ok")?.textContent || ""));
  /* La base rechaza: se dice y no se baja nada. */
  await monta({ fiscales: [plan3] }, { inv_fiscal_cruce: { error: "El cruce se hace cuando las dos personas de la hoja terminan de contar." } });
  await pg.click("button.fi-excel");
  await pg.waitForSelector(".cl-mal");
  ok(/dos personas de la hoja terminan/.test(await pg.locator(".cl-mal").first().textContent()), "el error de la base no se muestra al exportar");
}

/* ---------- 3 · NADA SE SALE, y el dedo alcanza ---------- */
for (const w of [360, 390, 820, 1440]) {
  await monta({}, {}, w);
  await abre(4);
  const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
    fuera: [...document.querySelectorAll("#r *")].filter((e) => e.getBoundingClientRect().width && e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className || e.tagName).slice(0, 4) }));
  ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
  const chico = await pg.evaluate(() => [...document.querySelectorAll("#r .btn")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43).map((e) => e.className));
  ok(chico.length === 0, `a ${w} px hay controles de menos de 44 px: ${chico.join(",")}`);
}
if (process.env.FOTO) {
  for (const [w, n] of [[390, "m"], [1440, "d"]]) { await monta({}, {}, w); await abre(4); await pg.screenshot({ path: process.env.FOTO + `/cruce-${n}.png`, fullPage: true }) }
}
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Inventario fiscal, avance y cruce: lógica pura, avance por equipo, «Ver cruce» solo con las dos hojas terminadas y permiso, diferencias primero, errores, carga, y nada se sale en 4 anchos.");
