/* =====================================================================
   INVENTARIO · INVENTARIO FISCAL — en Chromium, con el componente de verdad
   (solo supabase y next/navigation son dobles). Lo que se prueba es lo que se ve y
   lo que se manda a la base: las hojas y sus parejas, que el número de hojas
   no está fijo, que una persona no se repite, qué se manda al guardar y que nada
   se sale de la pantalla en 360/390/820/1440.
     node .arnes/inv-fiscal-pantalla.mjs
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

writeFileSync(R(".arnes/_if-cliente.ts"), `
const w = window as any;
w.__rpc = []; w.__refresh = 0; w.__rpcFalla = null;
export function createClient() {
  return { rpc: async (n: string, a: any) => {
    w.__rpc.push({ n, a });
    return w.__rpcFalla ? { data: null, error: { message: w.__rpcFalla } } : { data: "nuevo-id", error: null };
  } };
}`);
writeFileSync(R(".arnes/_if-nav.ts"), `
export function useRouter() { return { refresh: () => { (window as any).__refresh++ }, push() {}, replace() {}, back() {} } }`);
writeFileSync(R(".arnes/_if-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Fiscal } from "../src/app/(app)/inventario/fiscal/Fiscal";
const p = (window as any).__PROPS;
createRoot(document.getElementById("r")!).render(<Fiscal {...p} />);
`);
const js = buildSync({
  entryPoints: [R(".arnes/_if-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_if-cliente.ts"), "next/navigation": R(".arnes/_if-nav.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/corte/corte.css", "src/app/(app)/inventario/fiscal/fiscal.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

/* Doce personas con rol. La 11 está desactivada pero sigue en un inventario. */
const roles = [{ clave: "operador", nombre: "Operador logístico" }, { clave: "abi", nombre: "ABI" }, { clave: "supervisor", nombre: "Supervisor" }];
const rolDe = (i) => (i <= 6 ? "operador" : i <= 10 ? "abi" : "supervisor");
const personas = Array.from({ length: 12 }, (_, i) => ({ id: "p" + (i + 1), nombre: "Persona " + (i + 1) + (i === 10 ? " Desactivada" : ""), activo: i !== 10, rol: rolDe(i + 1) }));
const H = (numero, ol = "", bavaria = "") => ({ numero, ol, bavaria });
/* «Hoy» es jueves 1 de octubre de 2026: el viernes es mañana. */
const sep = { id: "fs", nombre: "Fiscal viernes", fecha: "2026-10-02", estado: "abierto", hojas: [H(1, "p1", "p7"), H(2, "p2"), H(3)] };
const cer = { id: "fc", nombre: "Fiscal agosto", fecha: "2026-08-20", estado: "cerrado", hojas: [H(1, "p4", "p11"), H(2, "p5", "p6")] };
const dup = { id: "fd", nombre: "Con repetido", fecha: "2026-10-16", estado: "abierto", hojas: [H(1, "p4", "p8"), H(2, "p4", "p9")] };
const des = { id: "fx", nombre: "Con desactivada", fecha: "2026-10-09", estado: "abierto", hojas: [H(1, "p11", "p8")] };
const base = { bodegaId: "bod1", personas, roles, fiscales: [sep, cer], puedeEditar: true, manda: false, ahora: "2026-10-01T15:00:00.000Z" };

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = [];
pg.on("pageerror", (e) => roto.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") roto.push(m.text()) });
/* El almacenamiento del navegador, simulado y que sobrevive de un montaje al siguiente. */
let almacen = {};
const monta = async (props = {}, ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div>
    <script>(()=>{const d=${JSON.stringify(almacen)};window.__ls=d;Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem:k=>k in d?d[k]:null,setItem:(k,v)=>{d[k]=String(v)}}})})();</script>
    <script>window.__PROPS=${JSON.stringify({ ...base, ...props })};</script><script>${js}<\/script></body></html>`);
  await pg.waitForSelector("#r > *");
};
const recuerda = async () => { almacen = await pg.evaluate(() => window.__ls) };
const txt = () => pg.$eval("#r", (e) => e.textContent.replace(/\s+/g, " "));
const rpcs = () => pg.evaluate(() => window.__rpc);
const hojas = () => pg.locator(".fi-hoja");
const casilla = (n, eq) => pg.locator(".fi-hoja").nth(n).locator(".fi-casilla").nth(eq === "ol" ? 0 : 1);
const valorDe = (n, eq) => casilla(n, eq).locator(".bs-campo").inputValue();
/* Las personas que ofrece una casilla al abrirla. */
const ofrece = async (n, eq) => {
  const c = casilla(n, eq).locator(".bs-campo");
  await c.click();
  const t = await casilla(n, eq).locator("li[role=option] b").allTextContents();
  await pg.keyboard.press("Escape"); await c.evaluate((e) => e.blur());
  return t;
};
const eleg = async (n, eq, nombre) => {
  await casilla(n, eq).locator(".bs-campo").click();
  await casilla(n, eq).locator("li[role=option]").filter({ has: pg.locator("b", { hasText: new RegExp("^" + nombre + "$") }) }).click();
};
const nuevoForm = async () => { await pg.click('button:has-text("Nuevo inventario fiscal")'); await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))) };
const rol = (eq) => pg.locator(".fi-rol select").nth(eq === "ol" ? 0 : 1);
const guardar = () => pg.locator('button:has-text("Guardar")');
const nombreIn = () => pg.locator('.fi-form input[placeholder^="Ej"]');
const fechaIn = () => pg.locator('.fi-form input[type="date"]');
const P6 = ["Persona 1", "Persona 2", "Persona 3", "Persona 4", "Persona 5", "Persona 6"];
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- 1 · LA LISTA: lo que viene primero, con cuánto falta ---------- */
await monta({ fiscales: [cer, dup, sep] });
{
  const t = await txt();
  const hs = await pg.locator("h2.cl-h").allTextContents();
  ok(hs.length === 2 && /^Próximos/.test(hs[0]) && /^Anteriores/.test(hs[1]), "la lista no se parte en Próximos y Anteriores: " + hs.join(" | "));
  const nombres = await pg.locator(".fi-fila .cl-hora").allTextContents();
  ok(igual(nombres, ["Fiscal viernes", "Con repetido", "Fiscal agosto"]), "el orden: lo más cercano primero y lo ya hecho al final: " + nombres.join(" | "));
  ok(/viernes 02\/10\/2026 · mañana/.test(t), "no dice «viernes 02/10/2026 · mañana»: " + t.slice(0, 400));
  ok(/viernes 16\/10\/2026 · en 15 días/.test(t) || /16\/10\/2026 · en 15 días/.test(t), "no dice cuánto falta para el segundo");
  ok(/jueves 20\/08\/2026 · hace 42 días/.test(t), "no dice hace cuánto fue el cerrado");
  ok(/3 hojas · 1 pareja completa · 1 a medias · 1 sin nadie/.test(t), "el resumen del inventario del viernes: " + t.slice(0, 300));
  ok(/2 hojas · 2 parejas completas/.test(t), "el resumen del inventario de agosto");
  const filas = await pg.locator(".fi-fila").first().locator("tbody tr").allTextContents();
  ok(filas.length === 3 && /1.*Persona 1.*Persona 7/.test(filas[0]) && /2.*Persona 2.*falta/.test(filas[1]) && /3.*falta.*falta/.test(filas[2]), "las hojas con sus parejas: " + filas.join(" | "));
  ok(/Persona 11 Desactivada/.test(t), "una persona desactivada que sigue en un inventario pierde su nombre");
  ok(/ABIERTO/.test(t) && /CERRADO/.test(t), "no dice abierto y cerrado");
  ok(await pg.locator('button:has-text("Nuevo inventario fiscal")').count() === 1, "falta el botón de nuevo inventario");
  ok(await pg.locator('button:has-text("Editar")').count() === 2, "los abiertos se editan (2) y el cerrado no");
  ok(await pg.locator('button:has-text("Eliminar")').count() === 0, "quien no administra ve «Eliminar»");
}
await monta({ fiscales: [cer] });
ok(!/Próximos/.test(await txt()) && /Anteriores/.test(await txt()), "sin próximos no debe haber título de Próximos");
await monta({ puedeEditar: false });
ok(await pg.locator('button:has-text("Nuevo inventario fiscal"), button:has-text("Editar")').count() === 0, "solo lectura: hay botones para armar");
await monta({ fiscales: [] });
ok(/Todavía no hay ninguno/.test(await txt()), "sin inventarios no lo dice");
/* Una fecha que es hoy cuenta como próxima. */
await monta({ fiscales: [{ ...sep, fecha: "2026-10-01" }] });
ok(/Próximos/.test(await txt()) && /jueves 01\/10\/2026 · hoy/.test(await txt()), "un inventario de hoy no sale como próximo con «hoy»");

/* ---------- 2 · PLANIFICAR: la fecha del inventario ---------- */
await monta();
await nuevoForm();
{
  ok(await hojas().count() === 2, "el formulario nuevo no arranca con dos hojas");
  ok((await fechaIn().inputValue()) === "2026-10-01", "la fecha no arranca en el día de hoy en Colombia");
  ok(/jueves 01\/10\/2026 · hoy/.test(await pg.locator(".fi-fecha").textContent()), "no dice el día de la semana de la fecha");
  const pres = async () => (await pg.locator(".fi-atajos button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-pressed")))).join(",");
  ok(await pres() === "true,false,false", "el atajo «Hoy» no queda marcado: " + await pres());
  await pg.click('.fi-atajos button:has-text("Viernes")');
  ok((await fechaIn().inputValue()) === "2026-10-02", "«Viernes» no pone el próximo viernes");
  ok(/viernes 02\/10\/2026 · mañana/.test(await pg.locator(".fi-fecha").textContent()), "no dice «viernes · mañana»");
  ok(await pres() === "false,true,true", "marca «Mañana» y «Viernes» cuando coinciden: " + await pres());
  await pg.click('.fi-atajos button:has-text("Hoy")');
  ok((await fechaIn().inputValue()) === "2026-10-01", "«Hoy» no devuelve a hoy");
  await pg.click('.fi-atajos button:has-text("Mañana")');
  ok((await fechaIn().inputValue()) === "2026-10-02", "«Mañana» no pone mañana");
  await fechaIn().fill("2026-10-09");
  ok(/viernes 09\/10\/2026 · en 8 días/.test(await pg.locator(".fi-fecha").textContent()), "una fecha escogida a mano no dice su día y cuánto falta: " + await pg.locator(".fi-fecha").textContent());
  await fechaIn().fill("2026-10-02");
}
/* Si hoy es viernes, «Viernes» es hoy (no el de la otra semana). */
await monta({ ahora: "2026-10-02T15:00:00.000Z" });
await nuevoForm();
await pg.click('.fi-atajos button:has-text("Mañana")'); await pg.click('.fi-atajos button:has-text("Viernes")');
ok((await fechaIn().inputValue()) === "2026-10-02", "siendo viernes, «Viernes» no es hoy");

/* ---------- 3 · ESCOGER A LA PERSONA: por rol y tecleando ---------- */
await monta();
await nuevoForm();
{
  ok(await rol("ol").inputValue() === "operador", "el filtro del OL no arranca en el rol «Operador logístico»: " + await rol("ol").inputValue());
  ok(await rol("bavaria").inputValue() === "abi", "el filtro de Bavaria no arranca en el rol «ABI»: " + await rol("bavaria").inputValue());
  const ro = await rol("ol").locator("option").allTextContents();
  ok(igual(ro, ["Todos los usuarios", "ABI (4)", "Operador logístico (6)", "Supervisor (1)"]), "los roles del filtro, con cuánta gente tiene cada uno (la desactivada no cuenta): " + ro.join(" | "));
  ok(/6 disponibles · 0 ya en una hoja/.test(await pg.locator(".fi-rol").nth(0).textContent()), "no cuenta los disponibles del OL: " + await pg.locator(".fi-rol").nth(0).textContent());
  ok(/4 disponibles · 0 ya en una hoja/.test(await pg.locator(".fi-rol").nth(1).textContent()), "no cuenta los disponibles de Bavaria");

  ok(igual(await ofrece(0, "ol"), P6), "el OL no ofrece solo a los de su rol (y sin «sin asignar» si la casilla está vacía): " + (await ofrece(0, "ol")).join(","));
  ok(igual(await ofrece(0, "bavaria"), ["Persona 10", "Persona 7", "Persona 8", "Persona 9"]), "Bavaria no ofrece solo a los de ABI: " + (await ofrece(0, "bavaria")).join(","));
  const pistas = await casilla(0, "ol").locator(".bs-campo").click().then(() => casilla(0, "ol").locator("li em").allTextContents());
  await pg.keyboard.press("Escape"); await casilla(0, "ol").locator(".bs-campo").evaluate((e) => e.blur());
  ok(pistas.length === 6 && pistas.every((x) => x === "Operador logístico"), "cada persona dice su rol: " + pistas.join(","));
  /* Teclear filtra; Enter escoge. */
  await casilla(0, "ol").locator(".bs-campo").fill("persona 3");
  ok(igual(await casilla(0, "ol").locator("li[role=option] b").allTextContents(), ["Persona 3"]), "teclear no filtra");
  await pg.keyboard.press("Enter");
  ok((await valorDe(0, "ol")) === "Persona 3", "Enter no escoge a quien se tecleó: " + await valorDe(0, "ol"));
  ok((await ofrece(0, "ol"))[0] === "— sin asignar —", "con alguien puesto no se ofrece «sin asignar» para quitarla");
  await casilla(1, "ol").locator(".bs-campo").fill("zzz");
  ok(/Nada coincide con «zzz»/.test(await casilla(1, "ol").textContent()), "sin coincidencias no lo dice");
  await pg.keyboard.press("Escape"); await casilla(1, "ol").locator(".bs-campo").evaluate((e) => e.blur());

  /* Quien ya está en una hoja no sale en las otras. */
  ok(!(await ofrece(1, "ol")).includes("Persona 3") && (await ofrece(0, "ol")).includes("Persona 3"), "Persona 3 sigue saliendo en otra hoja, o desaparece de la suya");
  ok(/5 disponibles · 1 ya en una hoja/.test(await pg.locator(".fi-rol").nth(0).textContent()), "los disponibles no bajan al ponerla: " + await pg.locator(".fi-rol").nth(0).textContent());
  /* Y se puede dejar sin asignar para liberarla. */
  await eleg(0, "ol", "— sin asignar —");
  ok((await valorDe(0, "ol")) === "" && (await ofrece(1, "ol")).includes("Persona 3"), "dejarla «sin asignar» no la libera");

  /* Cambiar el rol cambia la lista; «Todos» trae a todos los activos. */
  await rol("bavaria").selectOption("");
  const todos = await ofrece(0, "bavaria");
  ok(todos.length === 11 && !todos.includes("Persona 11 Desactivada"), "«Todos los usuarios» no trae a los 11 activos: " + todos.length);
  await recuerda();
  ok(almacen["fiscal-rol-bavaria"] === "" && almacen["fiscal-rol-ol"] === undefined, "no recuerda lo que se escogió: " + JSON.stringify(almacen));
  await rol("ol").selectOption("supervisor");
  ok(igual(await ofrece(0, "ol"), ["Persona 12"]), "el filtro «Supervisor» no deja solo al supervisor");
  await recuerda();
  ok(almacen["fiscal-rol-ol"] === "supervisor", "no recuerda el rol del OL");
}
/* Se recuerda de un día para otro, y un rol que ya no existe se olvida. */
await monta();
await nuevoForm();
ok(await rol("ol").inputValue() === "supervisor" && await rol("bavaria").inputValue() === "", "no usa lo recordado: " + await rol("ol").inputValue() + "/" + await rol("bavaria").inputValue());
almacen = { "fiscal-rol-ol": "borrado", "fiscal-rol-bavaria": "borrado" };
await monta();
await nuevoForm();
ok(await rol("ol").inputValue() === "operador" && await rol("bavaria").inputValue() === "abi", "un rol recordado que ya no existe no vuelve al de por defecto: " + await rol("ol").inputValue() + "/" + await rol("bavaria").inputValue());
/* Sin un rol que se parezca, arranca en «Todos» y la pantalla funciona igual. */
almacen = {};
await monta({ roles: [{ clave: "supervisor", nombre: "Supervisor" }, { clave: "operador", nombre: "Operario de patio" }] });
await nuevoForm();
ok(await rol("ol").inputValue() === "" && await rol("bavaria").inputValue() === "abi", "sin un rol parecido el OL arranca en «Todos» (y Bavaria toma el «abi» que traen las personas): " + await rol("ol").inputValue() + "/" + await rol("bavaria").inputValue());
/* Si no llegaron los roles, se arman con lo que traen las personas. */
await monta({ roles: [] });
await nuevoForm();
ok((await rol("ol").locator("option").allTextContents()).includes("operador (6)"), "sin lista de roles no se arman con los de las personas");

/* ---------- 4 · ARMAR UNO NUEVO ---------- */
almacen = {};
await monta();
await nuevoForm();
{
  /* EL NOMBRE SE PONE SOLO: mes, año y la fecha programada, y sigue a la fecha mientras nadie lo escriba. */
  ok((await nombreIn().inputValue()) === "FISCAL OCTUBRE 2026 · jueves 01/10", "el nombre automático de hoy: " + await nombreIn().inputValue());
  ok(!(await guardar().isDisabled()), "con el nombre automático y la fecha ya se puede guardar");
  await pg.click('.fi-atajos button:has-text("Viernes")');
  ok((await nombreIn().inputValue()) === "FISCAL OCTUBRE 2026 · viernes 02/10", "el nombre no sigue a la fecha (viernes): " + await nombreIn().inputValue());
  await fechaIn().fill("2026-11-06");
  ok((await nombreIn().inputValue()) === "FISCAL NOVIEMBRE 2026 · viernes 06/11", "el nombre no sigue a la fecha (otro mes): " + await nombreIn().inputValue());
  ok(await pg.locator(".fi-auto").count() === 0, "ofrece «usar el nombre automático» cuando nadie lo ha tocado");
  await nombreIn().fill("Mi fiscal");
  await pg.click('.fi-atajos button:has-text("Hoy")');
  ok((await nombreIn().inputValue()) === "Mi fiscal", "cambiar la fecha pisó un nombre escrito a mano");
  ok(await pg.locator(".fi-auto").count() === 1 && /FISCAL OCTUBRE 2026 · jueves 01\/10/.test(await pg.locator(".fi-auto").textContent()), "no ofrece volver al nombre automático");
  await pg.locator(".fi-auto").click();
  ok((await nombreIn().inputValue()) === "FISCAL OCTUBRE 2026 · jueves 01/10" && await pg.locator(".fi-auto").count() === 0, "volver al automático no lo repone");
  await pg.click('.fi-atajos button:has-text("Mañana")');
  ok((await nombreIn().inputValue()) === "FISCAL OCTUBRE 2026 · viernes 02/10", "tras volver al automático, el nombre dejó de seguir la fecha");
  await nombreIn().fill("");
  ok(await guardar().isDisabled(), "se puede guardar sin nombre");
  await nombreIn().fill("  Fiscal octubre  ");
  ok(!(await guardar().isDisabled()), "con nombre y hojas vacías no se puede guardar (las hojas pueden armarse de a poco)");
  ok(/no tienen a nadie/.test(await txt()), "no avisa de las hojas sin nadie: " + (await txt()).slice(-300));
  await pg.click('.fi-atajos button:has-text("Viernes")');
  await eleg(0, "ol", "Persona 1"); await eleg(0, "bavaria", "Persona 7"); await eleg(1, "ol", "Persona 3");
  ok(!(await ofrece(1, "bavaria")).includes("Persona 7") && !(await ofrece(1, "ol")).includes("Persona 1"), "quien ya está en una hoja sigue saliendo en otra");
  /* Sin número fijo: se agregan varias, se quita una, y la que se agrega toma el hueco. */
  await pg.fill('.fi-agregar input', "3");
  await pg.click('.fi-agregar button');
  ok(await hojas().count() === 5, "agregar 3 hojas: no quedaron 5");
  await pg.locator(".fi-hoja").nth(1).locator('button:has-text("Quitar")').click();
  const nums = async () => (await pg.locator(".fi-hoja-cab b").allTextContents()).join(",");
  ok(await nums() === "Hoja 1,Hoja 3,Hoja 4,Hoja 5", "quitar la 2 renumera las demás: " + await nums());
  await pg.fill('.fi-agregar input', "1"); await pg.click('.fi-agregar button');
  ok(await nums() === "Hoja 1,Hoja 2,Hoja 3,Hoja 4,Hoja 5", "la hoja agregada no toma el hueco de la 2: " + await nums());
  /* La hoja quitada se lleva a su gente: Persona 3 vuelve a estar libre. */
  ok((await ofrece(0, "ol")).includes("Persona 3"), "quitar la hoja 2 no libera a la gente que tenía");
  await eleg(3, "ol", "Persona 6");
  await guardar().click();
  await pg.waitForFunction(() => window.__rpc.length === 1);
  const llamada = (await rpcs())[0];
  ok(llamada.n === "inv_fiscal_guardar", "no llamó a inv_fiscal_guardar");
  const a = llamada.a;
  ok(a.p_id === null && a.p_bodega === "bod1" && a.p_nombre === "Fiscal octubre" && a.p_fecha === "2026-10-02", "cabecera de lo que se manda: " + JSON.stringify({ ...a, p_hojas: undefined }));
  ok(JSON.stringify(a.p_hojas) === JSON.stringify([
    { numero: 1, ol: "p1", bavaria: "p7" }, { numero: 2, ol: null, bavaria: null }, { numero: 3, ol: null, bavaria: null },
    { numero: 4, ol: "p6", bavaria: null }, { numero: 5, ol: null, bavaria: null }]), "las hojas que se mandan: " + JSON.stringify(a.p_hojas));
  ok(/Inventario fiscal guardado para el viernes 02\/10\/2026/.test(await txt()) && await pg.evaluate(() => window.__refresh) === 1, "después de guardar no avisa (con el día) ni refresca: " + (await txt()).slice(0, 200));
  ok(await pg.locator(".fi-form").count() === 0, "después de guardar el formulario sigue abierto");
}
/* A las 9 de la noche en Colombia ya es «mañana» en UTC: la fecha es la de Colombia. */
await monta({ ahora: "2026-10-02T02:00:00.000Z" });
await nuevoForm();
ok((await fechaIn().inputValue()) === "2026-10-01", "de noche la fecha sale en UTC y no en hora de Colombia");
await pg.locator(".fi-form").waitFor();
await nombreIn().fill("x"); await fechaIn().fill("");
ok(await guardar().isDisabled(), "se puede guardar sin fecha");

/* ---------- 5 · EDITAR ---------- */
almacen = {};
await monta({ fiscales: [sep, cer, dup, des] });
await pg.locator(".fi-fila").first().locator('button:has-text("Editar")').click();
{
  ok(/Editar inventario fiscal/.test(await txt()) && await hojas().count() === 3, "editar no abre el inventario con sus 3 hojas");
  ok((await nombreIn().inputValue()) === "Fiscal viernes" && (await fechaIn().inputValue()) === "2026-10-02", "editar no trae el nombre y la fecha");
  ok(/viernes 02\/10\/2026 · mañana/.test(await pg.locator(".fi-fecha").textContent()), "editar no muestra el día");
  ok((await valorDe(1, "ol")) === "Persona 2" && (await valorDe(0, "bavaria")) === "Persona 7" && (await valorDe(1, "bavaria")) === "", "editar no trae a las personas de las hojas");
  ok(/1 hoja tiene una sola persona/.test(await txt()) && /1 hoja no tiene a nadie/.test(await txt()), "no avisa de la hoja a medias y de la vacía: " + (await txt()).slice(-260));
  await eleg(1, "bavaria", "Persona 9");
  await guardar().click();
  await pg.waitForFunction(() => window.__rpc.length === 1);
  const a = (await rpcs())[0].a;
  ok(a.p_id === "fs" && a.p_nombre === "Fiscal viernes" && a.p_fecha === "2026-10-02" && a.p_hojas[1].bavaria === "p9" && a.p_hojas[0].ol === "p1" && a.p_hojas[0].bavaria === "p7", "editar manda el id y lo cambiado: " + JSON.stringify(a));
  ok(/Inventario fiscal actualizado/.test(await txt()), "no dice que actualizó");
}
/* Un plan que conserva su nombre automático lo sigue al cambiar la fecha; uno con nombre propio no. */
await monta({ fiscales: [{ ...sep, id: "fa", nombre: "FISCAL OCTUBRE 2026 · viernes 02/10" }] });
await pg.locator('button:has-text("Editar")').click();
await pg.click('.fi-atajos button:has-text("Hoy")');
ok((await nombreIn().inputValue()) === "FISCAL OCTUBRE 2026 · jueves 01/10", "al editar, un nombre automático no sigue a la fecha: " + await nombreIn().inputValue());
await monta({ fiscales: [sep] });
await pg.locator('button:has-text("Editar")').click();
await pg.click('.fi-atajos button:has-text("Hoy")');
ok((await nombreIn().inputValue()) === "Fiscal viernes", "al editar, la fecha pisó un nombre propio");
/* Quien ya estaba puesto sigue viéndose aunque esté desactivado o sea de otro rol que el filtro. */
await monta({ fiscales: [des] });
await pg.locator('button:has-text("Editar")').click();
ok((await valorDe(0, "ol")) === "Persona 11 Desactivada" && (await valorDe(0, "bavaria")) === "Persona 8", "una persona desactivada o de otro rol se ve vacía al editar: " + await valorDe(0, "ol"));
ok((await ofrece(0, "ol")).includes("Persona 11 Desactivada"), "la persona puesta desaparece de su propia lista");
await casilla(0, "ol").locator(".bs-campo").click();
ok(/desactivado/.test(await casilla(0, "ol").locator("li[role=option] em").filter({ hasText: "desactivado" }).first().textContent()), "no dice que está desactivada");
await pg.keyboard.press("Escape");
await rol("bavaria").selectOption("");
ok(/10 disponibles · 1 ya en una hoja/.test(await pg.locator(".fi-rol").nth(1).textContent()), "los desactivados cuentan entre los usuarios: " + await pg.locator(".fi-rol").nth(1).textContent());
/* Un inventario que ya trae a una persona repetida: lo dice y no deja guardar. */
await monta({ fiscales: [dup] });
await pg.locator('button:has-text("Editar")').click();
{
  ok(/está en las hojas 1, 2: solo puede estar en una/.test(await txt()), "no avisa de la persona repetida: " + (await txt()).slice(-300));
  ok(await guardar().isDisabled(), "deja guardar con una persona en dos hojas");
  ok(await pg.locator(".fi-hoja.mal").count() === 2, "no marca las dos hojas con el repetido");
  await eleg(1, "ol", "Persona 5");
  ok(!(await guardar().isDisabled()) && await pg.locator(".fi-hoja.mal").count() === 0, "al arreglarlo no se puede guardar");
}

/* ---------- 6 · SI LA BASE RECHAZA, EL FORMULARIO SE QUEDA ---------- */
await monta({ fiscales: [sep] });
await pg.locator('button:has-text("Editar")').click();
await pg.evaluate(() => { window.__rpcFalla = "function public.inv_fiscal_guardar(uuid, uuid, text, date, jsonb) does not exist" });
await guardar().click();
await pg.waitForSelector(".cl-mal");
ok(/2026-10-inventario-fiscal\.sql/.test(await txt()), "si falta el SQL no dice cuál correr: " + (await txt()).slice(-200));
ok(await pg.locator(".fi-form").count() === 1, "un rechazo cierra el formulario y pierde lo armado");

/* ---------- 7 · ELIMINAR: solo quien administra, con confirmación ---------- */
await monta({ manda: true });
{
  ok(await pg.locator('button:has-text("Eliminar")').count() === 2, "quien administra no ve «Eliminar» en cada inventario");
  await pg.locator(".fi-fila").first().locator('button:has-text("Eliminar")').click();
  ok(/¿Eliminar este inventario fiscal\?/.test(await txt()), "no pide confirmar");
  await pg.click('.cl-conf button:has-text("No")');
  ok((await rpcs()).length === 0, "«No» eliminó");
  await pg.locator(".fi-fila").first().locator('button:has-text("Eliminar")').click();
  await pg.click('.cl-conf button:has-text("Sí, eliminar")');
  await pg.waitForFunction(() => window.__rpc.length === 1);
  const l = (await rpcs())[0];
  ok(l.n === "inv_fiscal_eliminar" && l.a.p_id === "fs", "eliminar no manda el id: " + JSON.stringify(l));
  ok(/Inventario fiscal eliminado/.test(await txt()), "no dice que lo eliminó");
}

/* ---------- 7b · MOSTRAR EN CONTAR, y el administrador edita aun lo cerrado ---------- */
const pub = { ...sep, id: "fp", nombre: "Ya visible", publicado: "2026-10-01T14:00:00Z" };
const vacio = { id: "fv", nombre: "Plan vacío", fecha: "2026-10-23", estado: "abierto", hojas: [H(1), H(2)] };
await monta({ fiscales: [sep, pub, vacio, cer] });
{
  const f = (n) => pg.locator(".fi-fila", { hasText: n });
  ok(await f("Fiscal viernes").locator('button:has-text("Mostrar en Contar")').count() === 1, "el plan armado no tiene «Mostrar en Contar»");
  ok(await f("Fiscal viernes").locator("text=VISIBLE EN CONTAR").count() === 0, "dice visible un plan que no se ha mostrado");
  ok(await f("Plan vacío").locator('button:has-text("Mostrar en Contar")').isDisabled(), "deja mostrar un plan sin nadie asignado");
  ok(await f("Fiscal agosto").locator('button:has-text("Mostrar en Contar"), button:has-text("Quitar de Contar")').count() === 0, "un plan cerrado se ofrece para Contar");
  ok(await f("Ya visible").locator("text=VISIBLE EN CONTAR").count() === 1 && await f("Ya visible").locator('button:has-text("Quitar de Contar")').count() === 1 && await f("Ya visible").locator('button:has-text("Mostrar en Contar")').count() === 0,
     "el plan visible no dice VISIBLE EN CONTAR con su «Quitar de Contar»");
  await f("Fiscal viernes").locator('button:has-text("Mostrar en Contar")').click();
  await pg.waitForFunction(() => window.__rpc.length === 1);
  const l = (await rpcs())[0];
  ok(l.n === "inv_fiscal_publicar" && l.a.p_id === "fs" && l.a.p_publicar === true, "mostrar manda: " + JSON.stringify(l));
  ok(/«Fiscal viernes» ya se ve en Contar/.test(await txt()) && await pg.evaluate(() => window.__refresh) === 1, "no avisa ni refresca al mostrar");
  await f("Ya visible").locator('button:has-text("Quitar de Contar")').click();
  await pg.waitForFunction(() => window.__rpc.length === 2);
  const q = (await rpcs())[1];
  ok(q.n === "inv_fiscal_publicar" && q.a.p_id === "fp" && q.a.p_publicar === false, "quitar manda: " + JSON.stringify(q));
  ok(/«Ya visible» ya no se ve en Contar/.test(await txt()), "no avisa al quitar");
}
/* La base rechaza (le falta el SQL): dice cuál correr. */
await monta({ fiscales: [sep] });
await pg.evaluate(() => { window.__rpcFalla = "function public.inv_fiscal_publicar(uuid, boolean) does not exist" });
await pg.click('button:has-text("Mostrar en Contar")');
await pg.waitForSelector(".cl-mal");
ok(/2026-10-fiscal-publicar\.sql/.test(await txt()), "si falta el SQL de publicar no dice cuál correr: " + (await txt()).slice(-200));
/* Sin la columna en la base, no se ofrece el botón y se avisa. */
await monta({ fiscales: [sep], puedePublicar: false });
ok(await pg.locator('button:has-text("Mostrar en Contar")').count() === 0 && /2026-10-fiscal-publicar\.sql/.test(await txt()), "sin el SQL se ofrece el botón o no se avisa");
/* Quien solo lee no lo ve. */
await monta({ fiscales: [sep, pub], puedeEditar: false });
ok(await pg.locator('button:has-text("Mostrar en Contar"), button:has-text("Quitar de Contar")').count() === 0, "solo lectura: ve el botón de Contar");
ok(await pg.locator("text=VISIBLE EN CONTAR").count() === 1, "solo lectura: no ve cuál plan está visible");
/* El administrador edita también lo cerrado; quien no administra, no. */
await monta({ fiscales: [sep, cer], manda: true });
ok(await pg.locator('button:has-text("Editar")').count() === 2, "el administrador no puede editar un plan cerrado");
await pg.locator(".fi-fila", { hasText: "Fiscal agosto" }).locator('button:has-text("Editar")').click();
ok(/Editar inventario fiscal/.test(await txt()) && await hojas().count() === 2, "editar un cerrado no abre sus 2 hojas");
await monta({ fiscales: [sep, cer], manda: false });
ok(await pg.locator(".fi-fila", { hasText: "Fiscal agosto" }).locator('button:has-text("Editar")').count() === 0, "quien no administra edita un plan cerrado");

/* ---------- 8 · NADA SE SALE, y el dedo alcanza, en cuatro anchos ---------- */
for (const w of [360, 390, 820, 1440]) {
  for (const modo of ["lista", "form", "lista-abierta"]) {
    await monta({ manda: true, fiscales: [sep, cer, dup] }, w);
    if (modo !== "lista") { await pg.locator(".fi-fila").first().locator('button:has-text("Editar")').click(); await pg.fill('.fi-agregar input', "4"); await pg.click(".fi-agregar button") }
    if (modo === "lista-abierta") { await casilla(1, "bavaria").locator(".bs-campo").click(); await pg.locator(".bs-lista").waitFor() }
    const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
      fuera: [...document.querySelectorAll("#r *")].filter((e) => e.getBoundingClientRect().width && e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className || e.tagName).slice(0, 4) }));
    ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px (${modo}) se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
    const chico = await pg.evaluate(() => [...document.querySelectorAll("#r select, #r input, #r .btn, #r .cl-quitar, #r .bs-campo")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43).map((e) => e.className || e.tagName));
    ok(chico.length === 0, `a ${w} px (${modo}) hay ${chico.length} controles de menos de 44 px: ${chico.slice(0, 4).join(",")}`);
  }
}
if (process.env.FOTO) {
  for (const [w, n] of [[390, "m"], [1440, "d"]]) {
    await monta({ fiscales: [sep, cer, dup] }, w);
    await pg.screenshot({ path: process.env.FOTO + `/fiscal-lista-${n}.png`, fullPage: true });
    await pg.locator(".fi-fila").first().locator('button:has-text("Editar")').click();
    await pg.screenshot({ path: process.env.FOTO + `/fiscal-form-${n}.png`, fullPage: true });
    await casilla(1, "bavaria").locator(".bs-campo").click();
    await pg.screenshot({ path: process.env.FOTO + `/fiscal-lista-abierta-${n}.png`, fullPage: false });
  }
}
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Inventario fiscal en pantalla: planificar por fecha (día, atajos, próximos/anteriores), escoger por rol y tecleando (recordado, sin repetir a nadie), hojas sin número fijo, lo que se manda a la base, editar, eliminar solo quien administra, y nada se sale en 4 anchos.");
