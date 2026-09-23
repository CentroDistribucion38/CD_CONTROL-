/* =====================================================================
   EN TRÁNSITO · VARIAS PLACAS PEGADAS DE UNA VEZ — medido.

   «Que yo pueda copiar y pegar en un campo varias placas de una, que
   vengan de Excel, con el fin de filtrar y que me muestre cuáles vienen
   en camino y cuáles no.»

   1. LEER LO PEGADO: una columna de Excel (\r\n), una fila (\t), un chat
      con comas, «ABC 123» con espacio, repetidas, el encabezado «PLACA».
   2. LA PANTALLA DE VERDAD —el componente, empaquetado con React y
      pintado en Chromium—: se pega como se pega, con un evento de
      pegar, y se mira qué tarjetas quedan, qué dice la respuesta y que
      las que no vienen se puedan copiar una por renglón.
   3. SIETE TEMAS Y 360 px.

     node .arnes/sd-placas.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
const R = (p) => U("../" + p).pathname;
const fallas = [];
const ok = (c, msg) => { if (!c) fallas.push(msg) };

/* ======================= 1 · LEER LO PEGADO ======================= */
writeFileSync(U("./_placas.mjs"), buildSync({
  entryPoints: [R("src/modulos/sider/placas.ts")], bundle: true, format: "esm", write: false,
}).outputFiles[0].text);
const P = await import(U("./_placas.mjs").href + "?v=" + Date.now());
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok(igual(P.leerPlacas("PLACA\r\nJGY577\r\nABC123\r\n\r\nxyz98a\r\n"), ["JGY577", "ABC123", "XYZ98A"]),
   "una columna de Excel no se lee: con el encabezado «PLACA» y una celda vacía tienen que quedar 3");
ok(igual(P.leerPlacas("JGY577\tABC123\tXYZ98A"), ["JGY577", "ABC123", "XYZ98A"]), "una fila de Excel no se lee");
ok(igual(P.leerPlacas("JGY577, abc-123 y XYZ 98A"), ["JGY577", "ABC123", "XYZ98A"]),
   "un chat no se lee: «abc-123» y «XYZ 98A» son placas, la «y» no");
ok(igual(P.leerPlacas("JGY577\nJGY 577\njgy-577"), ["JGY577"]), "una placa repetida cuenta más de una vez");
ok(igual(P.leerPlacas("JGY577 ABC123 XYZ98A"), ["JGY577", "ABC123", "XYZ98A"]),
   "varias en un renglón, separadas por espacios, no se leen");
ok(P.leerPlacas("TOTAL\n12\nNOTA").length === 0, "cuenta como placas lo que no tiene forma de placa");
/* DOS CELDAS DISTINTAS NO SE JUNTAN: «ABC» en un renglón y «123» en el
   otro no son la placa ABC123. Solo se juntan palabras del MISMO renglón. */
ok(P.leerPlacas("ABC\r\n123").length === 0, "junta dos celdas distintas en una placa");

/* ======================= 2 · LA PANTALLA DE VERDAD ======================= */
writeFileSync(U("./_nav.mjs"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(U("./_supa.mjs"), `export const createClient = () => ({ rpc: async () => ({ error: null }), from() { return this } });`);
writeFileSync(U("./_tr-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Transito } from "@/app/(app)/sider/transito/Transito";
const ahora = Date.now();
const v = (id, placa, cd, horas) => ({
  id, placa, planta: "Barranquilla", cd_origen: cd, cd_destino: "Barranquilla", sku: "3500887",
  descripcion: "BOTELLA FLINT 1000R", tipo_envase: "EER", estibas: 30, factura: null, lote: null,
  estado: "en_transito", importado: false, observacion: null, motivo_anulacion: null, anulado_en: null,
  anulado_por: null, creado_por: null, creado_en: new Date(ahora - horas * 3600e3).toISOString(),
  fecha: "2026-09-20", num_mes: 9, semana: 38, anio: 2026, sider: 0.83, cajas: 1080, unidades: null, hl: 140.4,
  faltan_factores: false, cert_salida_id: "c" + id, salida_en: new Date(ahora - horas * 3600e3).toISOString(),
  salida_lat: null, salida_lng: null, salida_precision: null, salida_direccion: "Avenida Carrera 38",
  cert_llegada_id: null, llegada_en: null, llegada_lat: null, llegada_lng: null, llegada_precision: null,
  llegada_direccion: null, fotos_salida: 3, fotos_llegada: 0, en_camino: horas + " hours",
  requiere_ai: false, ai_pendiente: false,
});
window.VIAJES = [v("1", "JGY577", "CD Unión Apartado", 5), v("2", "ABC123", "CD La Arenosa", 30),
                 v("3", "KLM456", "CD Galapa", 2), v("4", "XYZ98A", "CD Galapa", 8)];
createRoot(document.getElementById("r")).render(
  <Transito viajes={window.VIAJES} nombres={{}} esEditor={true} esAdmin={false} maestrosAi={null}
            trabados={1} sinEvidencia={0} cabeza={<h1>En tránsito</h1>} />);
`);
const b = buildSync({
  entryPoints: [R(".arnes/_tr-entrada.tsx")], bundle: true, format: "iife", platform: "browser",
  jsx: "automatic", write: false, define: { "process.env.NODE_ENV": '"production"' },
  alias: { "next/navigation": R(".arnes/_nav.mjs"), "@/lib/supabase/client": R(".arnes/_supa.mjs"), "@": R("src") },
  logLevel: "silent",
});
const js = b.outputFiles[0].text;

const { chromium } = await import("playwright");
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/sider/sider.css"]
  .map((f) => readFileSync(R(f), "utf8")).join("\n");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext();
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://control.prueba" });
const pg = await ctx.newPage();
const errores = [];
pg.on("pageerror", (e) => errores.push(e.message));
const monta = async (tema, ancho) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  /* EN HTTPS Y NO EN about:blank: el portapapeles solo existe en una
     página segura, como la de verdad. */
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${css}
    html,body{margin:0}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
    <main class="sh-main"><div class="sd"><div id="r"></div></div></main></div>
    <script>${js.replace(/<\/script/g, "<\\/script")}</script></body></html>`;
  await pg.unroute("**/*").catch(() => {});
  await pg.route("**/*", (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  await pg.goto("https://control.prueba/sider/transito");
  await pg.waitForSelector(".tr-vh");
  const abrir = await pg.$(".tr-abrir");
  if (abrir && await abrir.isVisible()) await abrir.click();
};
const pegar = (texto) => pg.evaluate((t) => {
  const dt = new DataTransfer(); dt.setData("text/plain", t);
  const el = document.querySelector(".tr-placa input");
  if (!el) return false;
  el.focus();
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, texto);
const tarjetas = () => pg.$$eval(".tr-vh .placa", (xs) => xs.map((x) => x.textContent));

await monta(null, 1200);
ok((await tarjetas()).length === 4, "la prueba no arrancó con los 4 vehículos en camino");
/* UNA COLUMNA DE EXCEL: dos que vienen, dos que no, el encabezado y una con guion. */
await pegar("PLACA\r\nJGY577\r\nqwe321\r\nabc-123\r\nZZZ999\r\n");
await pg.waitForTimeout(100);
const quedan = (await tarjetas()).sort();
ok(igual(quedan, ["ABC123", "JGY577"]), `pegando la lista quedan ${JSON.stringify(quedan)} y deben quedar ABC123 y JGY577`);
/* QUE LO PEGADO SE HAYA VUELTO LISTA, DICHO AQUÍ Y NO MÁS ABAJO.
   Es lo primero que se pidió —«que yo pueda copiar y pegar varias
   placas de una»— y si no pasa no hay nada más que medir: la prueba
   seguía haciendo clic en botones que no existen y se caía con un error
   de Playwright, que no dice qué está mal sino dónde se tropezó. */
const hayTabla = !!(await pg.$(".tr-pl tbody tr"));
ok(hayTabla, "pegar varias placas de una vez no arma la lista: el campo se quedó como estaba y " +
             "no salió la tabla de las placas pegadas");
if (!hayTabla) { fallas.forEach((x) => console.log("✗ " + x)); await nav.close(); process.exit(1) }
const frase = await pg.$eval(".tr-lista-frase", (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
ok(/De 4 placas, 2 vienen en camino y 2 no\./.test(frase), `la respuesta no dice cuántas vienen y cuántas no: «${frase}»`);
/* LA TABLITA: una fila por placa pegada, en el orden pegado. */
const filasT = await pg.$$eval(".tr-pl tbody tr", (xs) => xs.map((x) => [x.querySelector(".placa").textContent, x.className]));
ok(JSON.stringify(filasT) === JSON.stringify([["JGY577", "si"], ["QWE321", "no"], ["ABC123", "si"], ["ZZZ999", "no"]]),
   `la tabla sale ${JSON.stringify(filasT)}: una fila por placa en el orden pegado, sí/no`);
ok(/CD /.test(await pg.$eval(".tr-pl tr.si td:nth-child(4)", (e) => e.textContent).catch(() => "")), "la que viene no dice su CD origen");
if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/sd-placas.png` });
await pg.click(".tr-pl-seg button.no");
ok((await pg.$$(".tr-pl tbody tr")).length === 2, "«No vienen» no filtra la tabla");
await pg.click(".tr-pl-seg button.todas");
await pg.click(".tr-pl tr.si .tr-pl-ir >> nth=0");
await pg.waitForTimeout(200);
ok(await pg.$eval("#tr-vh-JGY577", (e) => e.classList.contains("resalta")).catch(() => false), "«Ver tarjeta» no lleva a su tarjeta");
ok(await pg.$eval(".tr-placa input", () => false).catch(() => true),
   "con la lista puesta sigue el campo de una placa: la lista no se ve en su sitio");
ok(/4 pegadas/.test(await pg.$eval(".tr-lista-on", (e) => e.textContent).catch(() => "")),
   "en el sitio del campo no dice cuántas se pegaron");
await pg.click(".tr-pl-bar .btn.plano >> text=Copiar la tabla");
await pg.waitForTimeout(100);
const tablaCop = await pg.evaluate(() => navigator.clipboard.readText());
ok(tablaCop.split("\n").length === 5 && tablaCop.startsWith("Placa\tViene") && /QWE321\tNo/.test(tablaCop), `la tabla copiada no sirve para Excel: ${JSON.stringify(tablaCop.slice(0, 80))}`);
/* COPIAR LAS QUE NO VIENEN, una por renglón, para pegarlas en Excel. */
const botonCopiar = await pg.$(".tr-pl-bar .btn.plano >> text=Copiar las que no vienen");
if (botonCopiar) { await botonCopiar.click(); await pg.waitForTimeout(100) }
const copiado = botonCopiar ? await pg.evaluate(() => navigator.clipboard.readText()) : "";
ok(copiado === "QWE321\nZZZ999", `al copiar las que no vienen sale ${JSON.stringify(copiado)} y debe ser una por renglón`);
/* EL ORIGEN FILTRA LAS TARJETAS, PERO NO CAMBIA CUÁLES VIENEN. */
await pg.selectOption(".tr-filtros select", "CD Galapa");
await pg.waitForTimeout(100);
const frase2 = await pg.$eval(".tr-lista-frase", (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
ok(/2 vienen en camino y 2 no/.test(frase2),
   `con el filtro de origen puesto, la respuesta cambió a «${frase2}»: que un filtro esconda un camión no quiere decir que no venga`);
/* LIMPIAR QUITA LA LISTA. */
await pg.click(".tr-filtros .btn.plano >> text=Limpiar").catch(() => {});
await pg.waitForTimeout(100);
ok((await tarjetas()).length === 4 && !(await pg.$(".tr-lista")), "Limpiar no quita la lista de placas");
/* UNA SOLA PLACA PEGADA SE QUEDA EN EL CAMPO, como si se hubiera escrito. */
await pegar("KLM456");
await pg.waitForTimeout(100);
ok(!(await pg.$(".tr-lista")), "una sola placa pegada se volvió lista");

/* ======================= 3 · SIETE TEMAS Y 360 ======================= */
const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0,0,0]).slice(0,3).map(Number);
                         return c.startsWith("color(") ? n.map((v) => v * 255) : n };
const razon = (a, b) => {
  const lum = (c) => { const [r,g,bl] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4 });
                       return 0.2126*r + 0.7152*g + 0.0722*bl };
  const L1 = lum(a), L2 = lum(b);
  return +((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2);
};
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(t, 1200);
  await pegar("JGY577\nQWE321\nZZZ999");
  await pg.waitForTimeout(80);
  const m = await pg.evaluate(() => {
    const fondo = (e) => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s); return e ? { txt: getComputedStyle(e).color, fondo: fondo(e) } : { falta: s } };
    return { "la frase": par(".tr-lista-frase"), "las que vienen": par(".tr-lista-frase b.si"),
             "las que no": par(".tr-lista-frase b.no"),
             "sí viene": par(".tr-pl-pill.si"), "no viene": par(".tr-pl-pill.no"), "celda": par(".tr-pl tr.si td:nth-child(4)"), "nada": par(".tr-pl td.nada"), "encabezado": par(".tr-pl th"), "copiar": par(".tr-pl-bar .btn.plano"), "ver tarjeta": par(".tr-pl-ir"),
             "cuántas pegadas": par(".tr-lista-on p"), "quitar la lista": par(".tr-lista-on .tr-enlace") };
  });
  for (const [k, v] of Object.entries(m)) {
    if (v.falta) { ok(false, `tema ${t ?? "oficial"}: no está «${k}»`); continue }
    const x = razon(v.txt, v.fondo);
    ok(x >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${x} (mínimo 4.5)`);
  }
}
for (const ancho of [390, 360]) {
  await monta(null, ancho);
  await pegar(Array.from({ length: 14 }, (_, i) => "QQQ" + String(100 + i)).join("\n") + "\nJGY577");
  await pg.waitForTimeout(80);
  const g = await pg.evaluate(() => {
    /* LA TABLA SE DESLIZA DENTRO DE SU MARCO, NO LA PANTALLA. La tabla
       mide 860 px y el celular 390: algo se tiene que ir de lado. Si el
       que rueda es el marco, se mira la columna de la derecha con los
       filtros y las tarjetas quietos en su sitio; si el que rueda es lo
       de afuera, mirar la última columna se lleva la pantalla entera y
       hay que volver a buscar dónde quedó todo. Se EMPUJA de verdad y
       se mira si se movió: «overflow: auto» escrito no prueba nada
       cuando quien lo atrapa es una caja de más arriba. */
    const m = document.querySelector(".tr-pl-marco");
    let rueda = null;
    if (m) {
      m.scrollLeft = 300;
      rueda = { sobra: Math.round(m.scrollWidth - m.clientWidth), movio: Math.round(m.scrollLeft) };
      m.scrollLeft = 0;
    }
    return {
      lado: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      boton: Math.round(document.querySelector(".tr-pl-bar .btn.plano")?.getBoundingClientRect().height ?? 0),
      fuera: [...document.querySelectorAll(".tr-pl-bar button, .tr-pl-marco")]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length,
      rueda,
    };
  });
  ok(g.lado <= 0, `${ancho} px: la lista arrastra la página ${g.lado} px de lado`);
  ok(g.fuera === 0, `${ancho} px: ${g.fuera} placa(s) o el botón se salen de la pantalla`);
  ok(g.boton >= 40, `${ancho} px: «Copiar las que no vienen» mide ${g.boton} px`);
  ok(g.rueda != null && g.rueda.sobra > 0 && g.rueda.movio > 0,
     `${ancho} px: la tabla de las placas pegadas no se desliza dentro de su marco ` +
     `(le sobran ${g.rueda?.sobra ?? 0} px y al empujarla se movió ${g.rueda?.movio ?? 0}): ` +
     "la que se va de lado es la pantalla entera, y mirar la última columna deja los filtros " +
     "y las tarjetas fuera de la vista");
}
ok(errores.length === 0, `la pantalla tiró errores: ${errores.slice(0, 2).join(" | ")}`);
await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Placas pegadas: se leen de Excel o de un chat, filtran las tarjetas, dicen cuáles no vienen " +
            "y se copian de vuelta una por renglón; siete temas y 360 px.");
