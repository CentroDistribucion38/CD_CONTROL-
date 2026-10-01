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

/* Doce personas; la 11 está desactivada pero sigue en un inventario. */
const personas = Array.from({ length: 12 }, (_, i) => ({ id: "p" + (i + 1), nombre: "Persona " + (i + 1) + (i === 10 ? " Desactivada" : ""), activo: i !== 10 }));
const H = (numero, ol = "", bavaria = "") => ({ numero, ol, bavaria });
const sep = { id: "fs", nombre: "Fiscal septiembre", fecha: "2026-09-18", estado: "abierto", hojas: [H(1, "p1", "p2"), H(2, "p3"), H(3)] };
const cer = { id: "fc", nombre: "Fiscal agosto", fecha: "2026-08-20", estado: "cerrado", hojas: [H(1, "p4", "p11"), H(2, "p5", "p6")] };
const dup = { id: "fd", nombre: "Con repetido", fecha: "2026-09-25", estado: "abierto", hojas: [H(1, "p7", "p8"), H(2, "p7", "p9")] };
const base = { bodegaId: "bod1", personas, fiscales: [sep, cer], puedeEditar: true, manda: false, ahora: "2026-10-02T15:00:00.000Z" };

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = [];
pg.on("pageerror", (e) => roto.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") roto.push(m.text()) });
const monta = async (props = {}, ancho = 1440) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div>
    <script>window.__PROPS=${JSON.stringify({ ...base, ...props })};</script><script>${js}<\/script></body></html>`);
  await pg.waitForSelector("#r > *");
};
const txt = () => pg.$eval("#r", (e) => e.textContent.replace(/\s+/g, " "));
const rpcs = () => pg.evaluate(() => window.__rpc);
const hojas = () => pg.locator(".fi-hoja");
const eleg = (n, equipo, valor) => pg.locator(".fi-hoja").nth(n).locator("select").nth(equipo === "ol" ? 0 : 1).selectOption(valor);
const guardar = () => pg.locator('button:has-text("Guardar")');

/* ---------- 1 · LA LISTA ---------- */
await monta();
{
  const t = await txt();
  ok(/Fiscal septiembre/.test(t) && /Fiscal agosto/.test(t) && /18\/09\/2026/.test(t), "la lista no trae los dos inventarios con su fecha");
  ok(/3 hojas · 1 pareja completa · 1 a medias · 1 sin nadie/.test(t), "el resumen del inventario de septiembre: " + t.slice(0, 300));
  ok(/2 hojas · 2 parejas completas/.test(t), "el resumen del inventario de agosto");
  const filas = await pg.locator(".fi-fila").first().locator("tbody tr").allTextContents();
  ok(filas.length === 3 && /1.*Persona 1.*Persona 2/.test(filas[0]) && /2.*Persona 3.*falta/.test(filas[1]) && /3.*falta.*falta/.test(filas[2]), "las hojas con sus parejas: " + filas.join(" | "));
  ok(/Persona 11 Desactivada/.test(t), "una persona desactivada que sigue en un inventario pierde su nombre");
  ok(/ABIERTO/.test(t) && /CERRADO/.test(t), "no dice abierto y cerrado");
  ok(await pg.locator('button:has-text("Nuevo inventario fiscal")').count() === 1, "falta el botón de nuevo inventario");
  ok(await pg.locator('button:has-text("Editar")').count() === 1, "el cerrado no debe poder editarse y el abierto sí (un solo «Editar»)");
  ok(await pg.locator('button:has-text("Eliminar")').count() === 0, "quien no administra ve «Eliminar»");
}
await monta({ puedeEditar: false });
ok(await pg.locator('button:has-text("Nuevo inventario fiscal"), button:has-text("Editar")').count() === 0, "solo lectura: hay botones para armar");
await monta({ fiscales: [] });
ok(/Todavía no hay ninguno/.test(await txt()), "sin inventarios no lo dice");

/* ---------- 2 · ARMAR UNO NUEVO ---------- */
await monta();
await pg.click('button:has-text("Nuevo inventario fiscal")');
{
  ok(await hojas().count() === 2, "el formulario nuevo no arranca con dos hojas");
  ok((await pg.inputValue('.fi-form input[type="date"]')) === "2026-10-02", "la fecha no arranca en el día de hoy en Colombia");
  ok(await guardar().isDisabled(), "se puede guardar sin nombre");
  await pg.fill('.fi-form input:not([type="date"])', "  Fiscal octubre  ");
  ok(!(await guardar().isDisabled()), "con nombre y hojas vacías no se puede guardar (las hojas pueden armarse de a poco)");
  ok(/2 hojas sin nadie|2 hojas no tienen a nadie/.test(await txt()) || /no tienen a nadie/.test(await txt()), "no avisa de las hojas sin nadie: " + (await txt()).slice(-300));
  /* Las parejas. */
  await eleg(0, "ol", "p1"); await eleg(0, "bavaria", "p2"); await eleg(1, "ol", "p3");
  /* quien ya está en otra hoja sale deshabilitado, con su número */
  const opt = await pg.locator(".fi-hoja").nth(1).locator("select").nth(1).locator("option").allTextContents();
  ok(opt.some((x) => /Persona 1 · ya en la hoja 1/.test(x)) && opt.some((x) => /Persona 3 · ya en la hoja 2/.test(x)), "no marca a quien ya está en otra hoja: " + opt.slice(0, 5).join(" | "));
  const dis = await pg.locator(".fi-hoja").nth(1).locator("select").nth(1).locator("option[disabled]").count();
  ok(dis === 3, "quien ya está en otra hoja no sale deshabilitado (3 personas ya puestas): " + dis);
  ok(await pg.locator(".fi-hoja").nth(1).locator("select").nth(0).locator("option:not([disabled])", { hasText: "Persona 3" }).count() === 1, "la persona de una hoja no puede volver a escogerse en su propia casilla");
  /* Sin número fijo: se agregan varias, se quita una, y la que se agrega toma el hueco. */
  await pg.fill('.fi-agregar input', "3");
  await pg.click('.fi-agregar button');
  ok(await hojas().count() === 5, "agregar 3 hojas: no quedaron 5");
  await pg.locator(".fi-hoja").nth(1).locator('button:has-text("Quitar")').click();
  const nums = async () => (await pg.locator(".fi-hoja-cab b").allTextContents()).join(",");
  ok(await nums() === "Hoja 1,Hoja 3,Hoja 4,Hoja 5", "quitar la 2 renumera las demás: " + await nums());
  await pg.fill('.fi-agregar input', "1"); await pg.click('.fi-agregar button');
  ok(await nums() === "Hoja 1,Hoja 2,Hoja 3,Hoja 4,Hoja 5", "la hoja agregada no toma el hueco de la 2: " + await nums());
  /* La hoja quitada se lleva a su gente: p3 vuelve a estar libre. */
  ok(await pg.locator(".fi-hoja").nth(0).locator("select").nth(0).locator("option[disabled]").count() === 1, "quitar la hoja 2 no libera a la gente que tenía");
  await eleg(3, "ol", "p7");
  await guardar().click();
  await pg.waitForFunction(() => window.__rpc.length === 1);
  const llamada = (await rpcs())[0];
  ok(llamada.n === "inv_fiscal_guardar", "no llamó a inv_fiscal_guardar");
  const a = llamada.a;
  ok(a.p_id === null && a.p_bodega === "bod1" && a.p_nombre === "Fiscal octubre" && a.p_fecha === "2026-10-02", "cabecera de lo que se manda: " + JSON.stringify({ ...a, p_hojas: undefined }));
  ok(JSON.stringify(a.p_hojas) === JSON.stringify([
    { numero: 1, ol: "p1", bavaria: "p2" }, { numero: 2, ol: null, bavaria: null }, { numero: 3, ol: null, bavaria: null },
    { numero: 4, ol: "p7", bavaria: null }, { numero: 5, ol: null, bavaria: null }]), "las hojas que se mandan: " + JSON.stringify(a.p_hojas));
  ok(/Inventario fiscal guardado/.test(await txt()) && await pg.evaluate(() => window.__refresh) === 1, "después de guardar no avisa ni refresca");
  ok(await pg.locator(".fi-form").count() === 0, "después de guardar el formulario sigue abierto");
}

/* A las 9 de la noche en Colombia ya es «mañana» en UTC: la fecha es la de Colombia. */
await monta({ ahora: "2026-10-03T02:00:00.000Z" });
await pg.click('button:has-text("Nuevo inventario fiscal")');
ok((await pg.inputValue('.fi-form input[type="date"]')) === "2026-10-02", "de noche la fecha sale en UTC y no en hora de Colombia");

/* ---------- 3 · EDITAR ---------- */
await monta({ fiscales: [sep, cer, dup] });
await pg.locator(".fi-fila").first().locator('button:has-text("Editar")').click();
{
  ok(/Editar inventario fiscal/.test(await txt()) && await hojas().count() === 3, "editar no abre el inventario con sus 3 hojas");
  ok((await pg.inputValue('.fi-form input:not([type="date"])')) === "Fiscal septiembre" && (await pg.inputValue('.fi-form input[type="date"]')) === "2026-09-18", "editar no trae el nombre y la fecha");
  ok((await pg.locator(".fi-hoja").nth(1).locator("select").nth(0).inputValue()) === "p3", "editar no trae a la persona de la hoja 2");
  ok(/1 hoja tiene una sola persona/.test(await txt()) && /1 hoja no tiene a nadie/.test(await txt()), "no avisa de la hoja a medias y de la vacía: " + (await txt()).slice(-260));
  await eleg(1, "bavaria", "p9");
  await guardar().click();
  await pg.waitForFunction(() => window.__rpc.length === 1);
  const a = (await rpcs())[0].a;
  ok(a.p_id === "fs" && a.p_nombre === "Fiscal septiembre" && a.p_hojas[1].bavaria === "p9" && a.p_hojas[0].ol === "p1", "editar manda el id y lo cambiado: " + JSON.stringify(a));
}
/* Un inventario que ya trae a una persona repetida: lo dice y no deja guardar. */
await monta({ fiscales: [dup] });
await pg.locator('button:has-text("Editar")').click();
{
  ok(/está en las hojas 1, 2: solo puede estar en una/.test(await txt()), "no avisa de la persona repetida: " + (await txt()).slice(-300));
  ok(await guardar().isDisabled(), "deja guardar con una persona en dos hojas");
  ok(await pg.locator(".fi-hoja.mal").count() === 2, "no marca las dos hojas con el repetido");
  await eleg(1, "ol", "p10");
  ok(!(await guardar().isDisabled()) && await pg.locator(".fi-hoja.mal").count() === 0, "al arreglarlo no se puede guardar");
}

/* ---------- 4 · SI LA BASE RECHAZA, EL FORMULARIO SE QUEDA ---------- */
await monta({ fiscales: [sep] });
await pg.locator('button:has-text("Editar")').click();
await pg.evaluate(() => { window.__rpcFalla = "function public.inv_fiscal_guardar(uuid, uuid, text, date, jsonb) does not exist" });
await guardar().click();
await pg.waitForSelector(".cl-mal");
ok(/2026-10-inventario-fiscal\.sql/.test(await txt()), "si falta el SQL no dice cuál correr: " + (await txt()).slice(-200));
ok(await pg.locator(".fi-form").count() === 1, "un rechazo cierra el formulario y pierde lo armado");

/* ---------- 5 · ELIMINAR: solo quien administra, con confirmación ---------- */
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

/* ---------- 6 · NADA SE SALE, y el dedo alcanza, en cuatro anchos ---------- */
for (const w of [360, 390, 820, 1440]) {
  for (const modo of ["lista", "form"]) {
    await monta({ manda: true, fiscales: [sep, cer, dup] }, w);
    if (modo === "form") { await pg.locator(".fi-fila").first().locator('button:has-text("Editar")').click(); await pg.fill('.fi-agregar input', "4"); await pg.click(".fi-agregar button") }
    const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
      fuera: [...document.querySelectorAll("#r *")].filter((e) => e.getBoundingClientRect().width && e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className || e.tagName).slice(0, 4) }));
    ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px (${modo}) se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
    const chico = await pg.evaluate(() => [...document.querySelectorAll("#r select, #r input, #r .btn, #r .cl-quitar")].filter((e) => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43).map((e) => e.className || e.tagName));
    ok(chico.length === 0, `a ${w} px (${modo}) hay ${chico.length} controles de menos de 44 px: ${chico.slice(0, 4).join(",")}`);
  }
}
if (process.env.FOTO) {
  for (const [w, n] of [[390, "m"], [1440, "d"]]) {
    await monta({ fiscales: [sep, cer, dup] }, w);
    await pg.screenshot({ path: process.env.FOTO + `/fiscal-lista-${n}.png`, fullPage: true });
    await pg.locator(".fi-fila").first().locator('button:has-text("Editar")').click();
    await pg.screenshot({ path: process.env.FOTO + `/fiscal-form-${n}.png`, fullPage: true });
  }
}
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Inventario fiscal en pantalla: la lista con sus parejas, las hojas sin número fijo (se agregan, se quitan y la nueva toma el hueco), nadie en dos hojas, lo que se manda a la base, editar, eliminar solo quien administra, y nada se sale en 4 anchos.");
