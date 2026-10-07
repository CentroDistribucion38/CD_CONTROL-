/* EVIDENCIAS — la hoja con datos de mentira y los informes (PDF y Word) generados de verdad.
   Mide: KPIs, mapa de calor (celdas por estado), tendencias, filtros de periodo y tipo, fotos,
   sin SQL, vacío, anchos y forma; y baja el PDF y el Word y los revisa (páginas, módulos, abre en Word/LibreOffice).
     node .arnes/inv-evidencias-pantalla.mjs */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => { fallas.forEach((x) => console.log("✗ " + x)); console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e)); process.exit(1) };
process.on("uncaughtException", caerse); process.on("unhandledRejection", caerse);
mkdirSync(R(".arnes/tmp"), { recursive: true });

const hoy = new Date().toLocaleDateString("sv", { timeZone: "America/Bogota" });
const mas = (iso, d) => { const f = new Date(iso + "T12:00:00Z"); f.setUTCDate(f.getUTCDate() + d); return f.toISOString().slice(0, 10) };
const D = (k) => mas(hoy, -6 + k);            // k = 0..6 (el 6 es hoy)
const UB = ["A01_DER", "A01_IZQ", "A02_DER", "B03_IZQ", "B04_DER", "C05_DER", "C06_IZQ", "D07_DER", "D08_IZQ", "E09_DER", "E10_IZQ", "F11_DER", "F12_IZQ", "G13_DER"];
const meta = (u) => ({ ubicacion_id: "id-" + u, ubicacion: u, calle: u[0], modulo: u.slice(1, 3), lado: u.slice(4) });
let linea = 0;
const nov = (k, u, tipo, extra = {}) => ({ dia: D(k), conteo_id: "c" + k, conteo: "FEFO-" + D(k).slice(5), ...meta(u), tipo, linea_id: tipo === "mezclado" || tipo === "sin_acceso" ? null : "l" + (++linea),
  codigo: tipo === "mezclado" || tipo === "sin_acceso" ? null : "31" + (20 + linea), material: tipo === "mezclado" || tipo === "sin_acceso" ? null : ["AGUILA LATA 330", "POKER BOTELLA 330", "COSTEÑA 750", "CLUB COLOMBIA 330"][linea % 4], cajas: tipo === "mezclado" || tipo === "sin_acceso" ? null : 10 + linea * 3,
  persona: ["Ana Ríos", "Beto Díaz", "Carla Gómez"][k % 3], hora: `${D(k)}T${String(13 + (linea % 5)).padStart(2, "0")}:${String((linea * 7) % 60).padStart(2, "0")}:00Z`,
  ruta: null, pnc_rotulo: null, pnc_bloqueo_mecanico: null, cumple: null, ...extra });
const pnc = (k, u, r, b, ruta) => nov(k, u, "pnc", { pnc_rotulo: r, pnc_bloqueo_mecanico: b, cumple: r == null ? null : r && b, ruta: ruta ?? null });
const novs = [
  /* A01_DER: persiste (averías), salvo el día 2 que no se contó; con foto el último */
  ...[0, 1, 3, 4, 5].map((k) => nov(k, "A01_DER", "averia")), nov(6, "A01_DER", "averia", { ruta: "c6/avA01der.jpg" }), nov(6, "A01_DER", "pnc", { pnc_rotulo: true, pnc_bloqueo_mecanico: true, cumple: true, ruta: "c6/pncA01der.jpg" }),
  /* A01_IZQ: avería ayer (5), hoy ya no */
  nov(4, "A01_IZQ", "averia"), nov(5, "A01_IZQ", "averia", { ruta: "c5/avA01izq.jpg" }),
  /* A02_DER: intermitente: d1, d3, d6 */
  nov(1, "A02_DER", "mezclado"), nov(3, "A02_DER", "mezclado", { ruta: "c3/modA02.jpg" }), nov(6, "A02_DER", "mezclado", { ruta: "c6/modA02.jpg" }),
  /* B03_IZQ: nueva hoy PNC sin cumplir */
  pnc(6, "B03_IZQ", true, false, "c6/pncB03.jpg"),
  /* B04_DER: sin acceso d3 y ya no */
  nov(3, "B04_DER", "sin_acceso", { ruta: "c3/saB04.jpg" }),
  /* C05_DER: PNC sin responder (renglón viejo) d0 */
  pnc(0, "C05_DER", null, null), 
  /* C06_IZQ: avería d5 y d6, otra foto rota */
  nov(5, "C06_IZQ", "averia"), nov(6, "C06_IZQ", "averia", { ruta: "c6/rota.jpg" }),
  /* D07_DER: PNC d3 no cumple, d4 cumple */
  pnc(3, "D07_DER", false, false, "c3/pncD07.jpg"), pnc(4, "D07_DER", true, true),
  /* resto: una cada una */
  nov(3, "D08_IZQ", "averia"), nov(6, "E09_DER", "averia"), nov(5, "E10_IZQ", "mezclado"), nov(6, "F11_DER", "pnc", { pnc_rotulo: false, pnc_bloqueo_mecanico: true, cumple: false }),
];
/* Cobertura: todas las ubicaciones se cuentan todos los días, salvo el día 2 (no se contó nada: domingo) y B04_DER solo hasta el día 4 */
const cob = [];
for (let k = 0; k < 7; k++) { if (k === 2) continue; for (const u of UB) { if (u === "B04_DER" && k > 4) continue; cob.push({ dia: D(k), ...meta(u), renglones: 5, conteos: 1 }) } }
/* El día 2 solo hay lo que trae novedad: ahí «novedad» prueba que se miró. */

writeFileSync(R(".arnes/_ev-pant.tsx"), `
import { createRoot } from "react-dom/client";
import { Evidencias } from "../src/app/(app)/inventario/conteo/Evidencias";
(window as any).__novs = ${JSON.stringify(novs)};
(window as any).__cob = ${JSON.stringify(cob)};
createRoot(document.getElementById("r")!).render(<Evidencias />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ev-pant.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic", splitting: false,
  alias: { "@/lib/supabase/client": R(".arnes/_supa-ev.ts"), "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text.replace(/<!--/g, "<\\!--").replace(/<\/script/gi, "<\\/script");
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/conteo/tiempos.css", "src/app/(app)/inventario/conteo/evidencias.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
const logo = (f) => readFileSync(R("public/marca/" + f)).toString("base64");
/* En el arnés no hay servidor: los logos salen del disco. */
const parche = `const __L={"/marca/logo-bavaria.png":"${logo("logo-bavaria.png")}","/marca/logo-b.png":"${logo("logo-b.png")}"};const __f=window.fetch;window.fetch=(u,o)=>{if(__L[u]){const b=atob(__L[u]);const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return Promise.resolve(new Response(new Blob([a],{type:"image/png"})))}return __f(u,o)};`;

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ acceptDownloads: true });
const pg = await ctx.newPage();
const rotos = []; pg.on("pageerror", (e) => rotos.push(e.message)); pg.on("console", (m) => { if (m.type() === "error") rotos.push("console: " + m.text()) });
const monta = async (ancho = 1440, hash = "", espera = ".ev-kpis") => {
  await pg.goto("about:blank"); await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${P}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><nav class="tp-tabs"><a href="#">Qué se vence</a><a href="#">Tiempos de conteo</a><a class="on" aria-current="page" href="#">Evidencias</a></nav><div id="r"></div></div></main></div></div><script>history.replaceState(null,"","#${hash}")</script><script>${parche}</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(espera, { timeout: 8000 }).catch(() => { throw new Error("no montó: " + rotos.join(" | ")) });
  await pg.waitForTimeout(500);
};
const kpi = async (tx) => (await pg.locator(".tp-kpi", { has: pg.locator("span", { hasText: tx }) }).locator("b").textContent()).trim();
const fila = (u) => pg.locator(".ev-mapa tbody tr", { has: pg.locator("th", { hasText: new RegExp("^" + u + "$") }) });
const estados = async (u) => (await fila(u).locator("td.ev-c").evaluateAll((els) => els.map((e) => e.classList.contains("nov") ? "N" + [...e.classList].find((c) => /^n\d$/.test(c))?.[1] : e.classList.contains("limpia") ? "L" : "S"))).join(",");
const chip = async (u) => (await fila(u).locator(".ev-chip").first().textContent()).trim();

console.log("paso 1 · 7 días, todos los tipos");
await monta();
ok(rotos.length === 0, "error de página: " + rotos[0]);
ok(await kpi("Novedades") === String(novs.length), "KPI novedades " + await kpi("Novedades") + " ≠ " + novs.length);
ok(await kpi("Ubicaciones afectadas") === "12", "ubicaciones afectadas: " + await kpi("Ubicaciones afectadas"));
ok(await estados("A01_DER") === "N1,N1,S,N1,N1,N1,N2", "A01_DER: " + await estados("A01_DER"));
ok(await chip("A01_DER") === "Persiste", "A01_DER debía persistir aunque un día no se contó: " + await chip("A01_DER"));
ok(/lleva 6 días contados seguidos/.test(await pg.locator(".ev-lectura").textContent()), "la racha de A01_DER cuenta solo días contados: " + await pg.locator(".ev-lectura").textContent());
ok(await estados("A01_IZQ") === "L,L,S,L,N1,N1,L", "A01_IZQ: " + await estados("A01_IZQ"));
ok(await chip("A01_IZQ") === "Ya no", "A01_IZQ ya no: " + await chip("A01_IZQ"));
ok(await chip("A02_DER") === "Persiste" || await chip("A02_DER") === "Reincide", "A02_DER (d1,d3,d6): " + await chip("A02_DER"));
ok(await chip("A02_DER") === "Reincide", "A02_DER debía reincidir (d5 limpia, d6 vuelve): " + await chip("A02_DER"));
ok(await chip("B03_IZQ") === "Nueva", "B03_IZQ nueva: " + await chip("B03_IZQ"));
ok(await chip("B04_DER") === "Ya no", "B04_DER ya no (d4 limpio): " + await chip("B04_DER"));
ok(await chip("C06_IZQ") === "Persiste", "C06_IZQ persiste (d5,d6)");
const celdaS = await pg.locator(".ev-mapa td.ev-c.sin").count();
ok(celdaS > 0, "debía haber celdas «no se contó»");
/* el día 2 nadie contó: las celdas de ese día que no tienen novedad deben ser «sin», no «limpia» */
ok((await estados("A01_IZQ")).split(",")[2] === "S", "A01_IZQ día 2 debía ser «no se contó»: " + await estados("A01_IZQ"));
const t3 = await pg.locator("table").nth(0).locator("tbody tr").count(); ok(t3 === 7, "tabla por día debía tener 7 filas: " + t3);
ok(/No se contó/.test(await pg.locator("table").nth(0).locator("tbody tr").nth(2).textContent()), "el día 2 debía decir «No se contó»");
const imgs = await pg.locator("img.ev-img").evaluateAll((l) => l.map((i) => ({ ok: i.naturalWidth > 100 && i.src.startsWith("data:image/png"), w: i.naturalWidth })));
ok(imgs.length === 4 && imgs.every((i) => i.ok), "las 4 gráficas deben dibujarse: " + JSON.stringify(imgs));
ok((await pg.locator(".ev-lectura li").count()) >= 4, "faltan las lecturas");
ok(/novedades en 12 ubicaciones/.test(await pg.locator(".ev-lectura").textContent()), "lectura: " + await pg.locator(".ev-lectura").textContent());
await pg.screenshot({ path: R(".arnes/_ev-1440.png"), fullPage: true });

console.log("paso 2 · filtros");
const rpc = () => pg.evaluate(() => window.__rpc.filter((x) => x.n === "conteo_evidencias").at(-1).a);
let ll = await rpc(); ok(ll.p_desde === D(0) && ll.p_hasta === D(6), "rango inicial: " + JSON.stringify(ll));
await pg.click(".tp-seg button:has-text('Hoy')"); await pg.waitForTimeout(400);
ll = await rpc(); ok(ll.p_desde === hoy && ll.p_hasta === hoy, "hoy: " + JSON.stringify(ll));
ok(await kpi("Novedades") === String(novs.filter((n) => n.dia === hoy).length), "novedades hoy: " + await kpi("Novedades"));
await pg.click(".tp-seg button:has-text('7 días')"); await pg.waitForTimeout(400);
/* tipos: quitar PNC */
await pg.click(".ev-tipos button:has-text('PNC')"); await pg.waitForTimeout(300);
const sinPnc = novs.filter((n) => n.tipo !== "pnc").length;
ok(await kpi("Novedades") === String(sinPnc), "sin PNC: " + await kpi("Novedades") + " ≠ " + sinPnc);
ok(await pg.locator(".ev-tipos button[aria-checked=true]").count() === 3, "debían quedar 3 tipos");
await pg.click(".ev-tipos button:has-text('PNC')"); await pg.waitForTimeout(200);
/* no se puede quitar el último */
for (const t of ["Módulo mezclado", "Módulo sin acceso", "PNC"]) await pg.click(`.ev-tipos button:has-text('${t}')`);
await pg.waitForTimeout(200);
ok(await pg.locator(".ev-tipos button[aria-checked=true]").count() === 1, "siempre debe quedar al menos un tipo");
ok((await pg.locator(".ev-tipos button[aria-checked=true]").textContent()).includes("Avería"), "debía quedar Avería");
for (const t of ["Módulo mezclado", "Módulo sin acceso", "PNC"]) await pg.click(`.ev-tipos button:has-text('${t}')`);
await pg.click(".tp-seg button:has-text('Fechas')"); await pg.waitForTimeout(100);
ok(await pg.locator(".tp-fechas input").count() === 2, "faltan los campos de fecha");

console.log("paso 3 · fotos y PNC");
const filasPnc = await pg.locator("table[aria-label], .tp-tabla[aria-label='PNC y política de bloqueo'] tbody tr").count();
const txtPnc = await pg.locator(".tp-tabla[aria-label='PNC y política de bloqueo']").textContent();
ok(/Cumple/.test(txtPnc) && /No cumple/.test(txtPnc) && /Sin responder/.test(txtPnc), "el módulo PNC debía mostrar Cumple, No cumple y Sin responder: " + txtPnc.slice(0, 200));
const verFotos = pg.locator(".tp-tabla[aria-label='Detalle de las novedades'] .tp-ver");
const nFotos = await verFotos.count(); ok(nFotos === novs.filter((n) => n.ruta).length, "botones «Ver foto»: " + nFotos);
await verFotos.first().click(); await pg.waitForSelector(".ev-foto img", { timeout: 4000 });
ok(await pg.locator(".ev-foto img").evaluate((i) => i.naturalWidth > 50), "la foto no abrió");
await verFotos.first().click(); ok(await pg.locator(".ev-foto").count() === 0, "«Ocultar» debía cerrar la foto");

console.log("paso 4 · bajar PDF y Word");
const bajar = async (texto, archivo) => {
  const [d] = await Promise.all([pg.waitForEvent("download", { timeout: 30000 }), pg.click(`.ev-bt:has-text('${texto}')`)]);
  await d.saveAs(R(".arnes/tmp/" + archivo));
  return d.suggestedFilename();
};
const nPdf = await bajar("Bajar PDF", "ev.pdf");
ok(nPdf === `evidencias-inventario-${D(0)}_${D(6)}.pdf`, "nombre del PDF: " + nPdf);
await pg.waitForSelector(".ev-ok", { timeout: 4000 }).catch(() => ok(false, "no avisó «PDF listo»"));
const nDoc = await bajar("Bajar Word", "ev.docx");
ok(nDoc === `evidencias-inventario-${D(0)}_${D(6)}.docx`, "nombre del Word: " + nDoc);
const descargadas = await pg.evaluate(() => window.__desc.length);
ok(descargadas >= 8, "debía bajar las fotos para el informe: " + descargadas);
ok(rotos.filter((x) => !/Failed to load resource/.test(x)).length === 0, "errores de página: " + rotos.join(" | "));

console.log("paso 5 · sin SQL / vacío");
await monta(1440, "sinsql=1", ".sin-tablas");
ok(/2026-10-conteo-evidencias\.sql/.test(await pg.textContent(".sin-tablas")), "no avisa qué SQL correr");
await monta(1440, "vacio=1", ".fe-vacio");
ok(/Sin novedades en este periodo/.test(await pg.textContent(".ev")), "falta el mensaje de vacío");
ok(/ninguna novedad/.test(await pg.textContent(".ev-lectura")), "la lectura del vacío");

console.log("paso 6 · anchos y forma");
for (const w of [360, 390, 820, 1440]) {
  await monta(w);
  const d = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok(d.sw <= d.cw, `a ${w}px la página se desborda (${d.sw} > ${d.cw}) por: ` + (d.sw > d.cw ? await pg.evaluate((cw) => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > cw + 1 && !e.closest(".tp-tabla, .ev-scroll")).slice(0, 6).map((e) => e.tagName + "." + e.className + ":" + Math.round(e.getBoundingClientRect().right)).join(" | ") + " || anchos: " + [".sh-main", ".fe", ".tp-tabs", ".ev", ".tp-panel", ".ev-kpis"].map((q) => q + "=" + Math.round((document.querySelector(q)?.getBoundingClientRect().width) ?? -1)).join(" "), d.cw) : ""));
  const chicos = await pg.evaluate(() => [...document.querySelectorAll(".ev button, .ev select, .ev input, .tp-tabs a")].filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => e.tagName + ":" + e.textContent.slice(0, 10)));
  ok(chicos.length === 0, `a ${w}px hay controles de menos de 44 px: ` + chicos.join(","));
  const redondos = await pg.evaluate(() => [...document.querySelectorAll(".ev *")].filter((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius) > 3).length);
  ok(redondos === 0, `a ${w}px hay ${redondos} elementos con esquinas redondeadas`);
  if (w === 390) await pg.screenshot({ path: R(`.arnes/_ev-${w}.png`), fullPage: true });
}
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ evidencias: hoja, filtros, mapa de calor y tendencias, fotos, PDF y Word generados, sin SQL, anchos y forma");
