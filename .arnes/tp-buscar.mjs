/* =====================================================================
   TRASPASOS · CONTROL · EL BUSCADOR DEL RESUMEN DEL DÍA

   Montando el componente REAL (Diferencias): escribes un documento, un
   código de viaje o una placa y los cuatro montones se filtran a la vez;
   se abre el que tiene el resultado; sin resultados lo dice; «Quitar»
   devuelve todo; la frase de arriba NO cambia (es la del día completo);
   y nada se sale a 1440/820/390/360.

     node .arnes/tp-buscar.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_tb-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Diferencias } from "../src/app/(app)/traspasos/control/Diferencias";
const w = window as any;
createRoot(document.getElementById("r")!).render(<div className="tp"><Diferencias lineas={w.L} hayCorte rotulo="miércoles, 30 de septiembre de 2026" desde="2026-09-16" hasta="2026-09-30"
  tope={false} sinDocumento={w.SD} conDocumento={w.CD} nombres={{ u1: "supervisorol" }} /></div>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_tb-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_sb-graba.js"), "next/navigation": R(".arnes/stub-nav.js"), "next/link": R(".arnes/_so-link.tsx"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/traspasos/traspasos.css", "src/app/(app)/traspasos/cruce/cruce.css"].map((f) => readFileSync(R(f), "utf8")).join("\n");
const viaje = (n, doc, placa, extra = {}) => ({ id: "v" + n, codigo: "TR-03" + n, fecha: "2026-09-30", turno: "C", turno_orden: 3, tipo: "pet", tipo_nombre: "PET",
  placa, origen_nombre: "FABRICA", destino_nombre: "BODEGA 38", carga: 36, unidad: null, hora: "2026-09-30T12:32:00Z", registrado_por: "u1",
  factura_documento: doc, ...extra });
const CD = [viaje(19, "7689234028", "NLW428"), viaje(20, "7689234022", "NLW428"), viaje(21, "7689239853", "FSV898"), viaje(22, "7689000001", "SNR719")];
const SD = [viaje(30, null, "ABC123"), viaje(31, null, "NLW428")];
const L = [
  { documento: "7689234028", estado: "cuadra", dia_distinto: false }, { documento: "7689234022", estado: "cuadra", dia_distinto: false },
  { documento: "7689239853", estado: "cuadra", dia_distinto: false },
  { documento: "7689555555", estado: "falta", sap_fecha: "2026-09-30", sap_hora: "08:00:00", sap_neto: 120, sap_movimientos: 2, sap_descripcion: "Estibas plásticas", dia_distinto: false },
];
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ancho, tema = null) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div id="r"></div></main></div></div>
    <script>window.CD=${JSON.stringify(CD)};window.SD=${JSON.stringify(SD)};window.L=${JSON.stringify(L)};</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".tp-rz-buscar");
};
const tapas = () => pg.$$eval(".tp-rz-tapa", (t) => t.map((x) => x.querySelector(".n").textContent + "|" + x.getAttribute("aria-expanded")));
const filas = () => pg.$$eval(".tp-rz-monton.on .cr-tabla tbody tr", (r) => r.map((x) => x.innerText.replace(/\s+/g, " ")));
const buscar = async (t) => { await pg.fill(".tp-rz-buscar input", t); await pg.waitForTimeout(80) };

await monta(1440);
const frase0 = await pg.textContent(".tp-rz-frase");
ok(await pg.$(".tp-rz-buscar input") != null, "no hay buscador");
const antes = await tapas();
ok(antes.map((x) => x.split("|")[0]).join() === "3,1,2,1", "conteos iniciales: " + antes.join());

/* por documento */
await buscar("7689234028");
let t = await tapas();
ok(t.map((x) => x.split("|")[0]).join() === "1,0,0,0", "buscar un documento: " + t.join());
ok(t[0].endsWith("true"), "no abre el montón donde está el documento: " + t.join());
ok((await filas()).length === 1 && /7689234028/.test((await filas())[0]), "la fila no es la del documento");
ok(/1 resultado /.test(await pg.textContent(".tp-rz-hallado")), "no cuenta «1 resultado»");
ok((await pg.textContent(".tp-rz-frase")) === frase0, "la frase del día cambió al buscar");
/* con espacios y guiones y por parte */
await buscar(" 76892340-22 ");
t = await tapas(); ok(t[0].startsWith("1|") && (await filas()).length === 1 && /7689234022/.test((await filas())[0]), "no ignora guiones/espacios");
/* por código de viaje, minúsculas */
await buscar("tr-0321");
t = await tapas(); ok(t[0].startsWith("1|"), "no busca por código de viaje: " + t.join());
/* por placa: aparece en varios montones; abre el más urgente (sin documento) */
await buscar("nlw428");
t = await tapas();
ok(t.map((x) => x.split("|")[0]).join() === "2,0,1,0", "placa NLW428: " + t.join());
ok(t[2].endsWith("true"), "con resultados en dos montones debería abrir el de «por facturar» (más urgente): " + t.join());
ok((await filas()).length === 1 && /TR-0331/.test((await filas())[0]), "la tabla abierta no muestra SOLO la coincidencia: " + (await filas()).join(" / "));
/* el que está solo en SAP */
await buscar("7689555555");
t = await tapas();
ok(t.map((x) => x.split("|")[0]).join() === "0,0,0,1" && t[3].endsWith("true"), "documento que solo tiene SAP: " + t.join());
ok(/Estibas plásticas/.test((await filas()).join()), "no muestra la fila de SAP");
/* VARIOS A LA VEZ (lo que se copia de Excel) */
await buscar("7689234028 7689234022 7689239853");
t = await tapas(); ok(t[0].startsWith("3|") && (await filas()).length === 3, "pegar tres documentos: " + t.join());
ok(/3<\/b> búsquedas|3 búsquedas/.test(await pg.textContent(".tp-rz-hallado")) || /búsquedas/.test(await pg.textContent(".tp-rz-hallado")), "no dice cuántas búsquedas");
ok(!(await pg.$(".tp-rz-faltan")), "dice que falta uno cuando están todos");
await buscar("7689234028, 7689555555;7689111111 7689222222");
t = await tapas();
ok(t.map((x) => x.split("|")[0]).join() === "1,0,0,1", "mezcla ok+SAP con comas y punto y coma: " + t.join());
ok(/7689111111, 7689222222/.test(await pg.textContent(".tp-rz-faltan")) && !/7689234028/.test(await pg.textContent(".tp-rz-faltan")), "no nombra exactamente los que no aparecen: " + await pg.textContent(".tp-rz-hallado"));
/* PEGAR con saltos de línea (una columna de Excel): no se pegan los números */
await buscar("");
await pg.focus(".tp-rz-buscar input");
await pg.evaluate(() => {
  const i = document.querySelector(".tp-rz-buscar input");
  const dt = new DataTransfer(); dt.setData("text", "7689234028\r\n7689234022\r\n");
  i.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
});
await pg.waitForTimeout(100);
ok(await pg.inputValue(".tp-rz-buscar input") === "7689234028 7689234022", "el pegado con saltos de línea no queda separado por espacios: «" + await pg.inputValue(".tp-rz-buscar input") + "»");
t = await tapas(); ok(t[0].startsWith("2|"), "la columna pegada no encuentra los dos: " + t.join());
/* nada */
await buscar("999999");
ok(/Nada coincide/.test(await pg.textContent(".tp-rz-hallado")), "no dice que nada coincide");
/* quitar */
await pg.click(".tp-rz-limpiar");
ok(!(await pg.$(".tp-rz-hallado")), "«Quitar» no limpia");
ok((await tapas()).map((x) => x.split("|")[0]).join() === "3,1,2,1", "quitar no devuelve los conteos");
ok(await pg.inputValue(".tp-rz-buscar input") === "", "el campo no se vacía");

/* medidas */
for (const [w, tema] of [[1440, null], [820, null], [390, null], [360, null], [390, "negro"], [390, "ambar"]]) {
  await monta(w, tema); await buscar("nlw");
  const o = await pg.evaluate(() => ({ d: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  ok(o.d <= 0, `a ${w}px${tema ? " " + tema : ""} la página se sale ${o.d}px`);
  const h = await pg.$eval(".tp-rz-buscar input", (i) => i.getBoundingClientRect().height);
  ok(h >= 44, `el campo mide ${h}px`);
}
await nav.close();
if (fallas.filter(Boolean).length) { fallas.filter(Boolean).forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Control: el buscador filtra los cuatro montones por documento, viaje o placa, abre el que tiene el resultado, dice cuando no hay nada y no toca la frase del día.");
