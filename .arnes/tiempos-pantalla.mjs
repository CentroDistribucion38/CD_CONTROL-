/* TIEMPOS DEL CONTEO — la pantalla con datos de mentira.
   Mide: ranking por renglones/hora activa, «En curso» fuera del ranking, filtros de periodo y persona,
   sin SQL, vacío, sin desborde de página en 360/390 px, objetivos táctiles y esquinas rectas.
     node .arnes/tiempos-pantalla.mjs */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => { fallas.forEach((x) => console.log("✗ " + x)); console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e)); process.exit(1) };
process.on("uncaughtException", caerse); process.on("unhandledRejection", caerse);
mkdirSync(R(".arnes/tmp"), { recursive: true });

const hoy = new Date().toLocaleDateString("sv", { timeZone: "America/Bogota" });
const mas = (iso, d) => { const f = new Date(iso + "T12:00:00Z"); f.setUTCDate(f.getUTCDate() + d); return f.toISOString().slice(0, 10) };
/* horas de Bogotá = UTC-5 */
const t = (dia, hhmm) => `${dia}T${String(Number(hhmm.slice(0, 2)) + 5).padStart(2, "0")}:${hhmm.slice(3)}:00Z`;
const f = (id, per, pid, dia, ini, fin, env, ren, ubi, bru, act, pau) => ({ conteo_id: id, codigo: id, responsable_id: pid, persona: per, dia, primer_renglon: t(dia, ini), fin: fin ? t(dia, fin) : null, enviado: env, ultimo_renglon: fin ? t(dia, fin) : t(dia, ini), renglones: ren, ubicaciones: ubi, total_cajas: ren * 10, bruto_min: bru, activo_min: act, pausas_min: pau });
const filas = [
  f("a1", "Ana Ríos", "A", hoy, "07:00", "09:05", true, 100, 20, 125, 125, 0),     // 48 /h
  f("a2", "Ana Ríos", "A", mas(hoy, -1), "07:30", "08:30", true, 60, 12, 60, 60, 0),  // 60 /h → ana 160/185 = 51,9
  f("b1", "Beto Díaz", "B", hoy, "06:00", "10:00", true, 120, 30, 240, 180, 60),   // 40 /h
  f("c1", "Carla Gómez", "C", hoy, "08:10", null, false, 25, 5, 0, 30, 0),          // en curso
  f("e1", "Esteban Mora", "E", mas(hoy, -1), "09:00", null, false, 1, 1, 0, 0, 0),    // abierto y abandonado
  f("d1", "Dani Pérez", "D", mas(hoy, -20), "07:00", "08:00", true, 90, 15, 60, 60, 0) // fuera de 7 días: 90 /h
];
filas.find((x) => x.conteo_id === 'c1').ultimo_renglon = new Date().toISOString(); // movimiento ahora mismo
filas.push({ ...f('g1', 'Gabo Ruiz', 'G', hoy, '05:00', null, false, 3, 1, 0, 0, 0), ultimo_renglon: new Date(Date.now() - 2 * 3600e3).toISOString() }); // hace 2 h: sin enviar, aún no se cierra
const ubis = [
  { conteo_id: "a1", lat: 10.9685, lng: -74.7813, precision_m: 9.4, tomada_en: t(hoy, "07:00"), estado: "ok" },
  { conteo_id: "b1", lat: null, lng: null, precision_m: null, tomada_en: t(hoy, "06:00"), estado: "denegada" },
];
const rec = (n, seg, ubi, cod, mat, est, caj, cor = false) => ({ n, registrado_en: t(hoy, "07:00"), seg_desde_anterior: seg, ubicacion: ubi, codigo: cod, material: mat, estibas: est, cajas: caj, saldo: null, corregido: cor });
const recorridos = { a1: [rec(1, 1200, "A01_DER", "3128", "AGUILA LATA", 2, 0), rec(2, 40, "A01_DER", "3129", "POKER", 1, 0), rec(3, 6, "A02_IZQ", "3130", "COSTENA", 3, 0, true), rec(4, 300, "A02_IZQ", "3131", "CLUB", 0, 12)] };
writeFileSync(R(".arnes/_tp-pant.tsx"), `
import { createRoot } from "react-dom/client";
import { Tiempos } from "../src/app/(app)/inventario/conteo/Tiempos";
(window as any).__filas = ${JSON.stringify(filas)};
(window as any).__ubis = ${JSON.stringify(ubis)};
(window as any).__recorridos = ${JSON.stringify(recorridos)};
createRoot(document.getElementById("r")!).render(<Tiempos />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_tp-pant.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_supa-tp.ts"), "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text.replace(/<!--/g, "<\\!--").replace(/<\/script/gi, "<\\/script");
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/conteo/tiempos.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = []; pg.on("pageerror", (e) => rotos.push(e.message));
const monta = async (ancho = 1440, hash = "", espera = ".tp-kpis") => {
  await pg.goto("about:blank"); await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${P}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><nav class="tp-tabs" aria-label="Hojas del tablero"><a class="" href="#">Qué se vence</a><a class="on" aria-current="page" href="#">Tiempos de conteo</a></nav><div id="r"></div></div></main></div></div><script>history.replaceState(null,"","#${hash}")</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(espera, { timeout: 8000 }).catch(() => { throw new Error("no montó: " + rotos.join(" | ")) });
  await pg.waitForTimeout(250);
};
const nom = async () => (await pg.locator(".tp-tabla").first().locator("tbody tr th").allTextContents()).map((x) => x.trim());
const kpi = async (tx, exacto) => (await pg.locator(".tp-kpi", { has: pg.locator("span", { hasText: exacto ? new RegExp("^" + tx + "$") : tx }) }).locator("b").textContent()).trim();

console.log("paso 1 · 7 días");
await monta();
ok(rotos.length === 0, "error de página: " + rotos[0]);
let n = await nom();
ok(n.join() === "Ana Ríos,Beto Díaz", "ranking 7 días: " + n.join() + " (esperaba Ana, Beto; Carla en curso no entra; Dani fuera de rango)");
const filaAna = (await pg.locator(".tp-tabla").first().locator("tbody tr").first().locator("td").allTextContents()).map((x) => x.trim());
ok(filaAna[0] === "1" && filaAna[1] === "2" && filaAna[2] === "160" && /51,9/.test(filaAna.join("|")), "fila de Ana: " + filaAna.join("|"));
ok(await kpi("Conteos enviados") === "3", "KPI enviados: " + await kpi("Conteos enviados"));
ok(await kpi("Renglones", true) === "280", "KPI renglones");
const detalle = (await pg.locator(".tp-tabla").nth(1).locator("tbody tr").allTextContents()).join("|");
ok(/En curso/.test(detalle), "falta «En curso»");
ok(/Cerrado sin enviar · 09:00/.test(detalle), "el de más de 8 h debía salir «Cerrado sin enviar · 09:00»: " + detalle);
ok(/Sin enviar · \d\d:\d\d/.test(detalle.replace(/Cerrado sin enviar/g, "")), "el de hace 2 h debía salir «Sin enviar · hh:mm»: " + detalle);
ok((detalle.match(/En curso/g) || []).length === 1, "«En curso» solo para Carla");
ok(/08:10/.test(detalle) && /09:05/.test(detalle) && /2 h 05 min/.test(detalle), "horas/duración de Ana hoy: " + detalle);
ok(/1 h 00 min/.test(detalle) && /4 h 00 min/.test(detalle), "pausas de Beto: " + detalle);
ok(await pg.locator(".tp-tabla").nth(1).locator("tbody tr").count() === 6, "conteo por conteo debía tener 6 filas");

console.log("paso 2 · filtros");
await pg.click(".tp-seg button:has-text('Hoy')"); await pg.waitForTimeout(150);
n = await nom();
ok(n[0] === "Ana Ríos", "hoy: Ana debe ir primero (48 > 40), salió " + n.join());
await pg.click(".tp-seg button:has-text('30 días')"); await pg.waitForTimeout(150);
n = await nom(); ok(n[0] === "Dani Pérez", "30 días: Dani (90/h) primero, salió " + n.join());
await pg.selectOption("select[aria-label=Persona]", "B"); await pg.waitForTimeout(100);
n = await nom(); ok(n.join() === "Beto Díaz", "filtro persona: " + n.join());
await pg.selectOption("select[aria-label=Persona]", ""); 
await pg.click(".tp-seg button:has-text('Fechas')"); await pg.waitForTimeout(100);
ok(await pg.locator(".tp-fechas input").count() === 2, "faltan los campos de fecha");
const ll = await pg.evaluate(() => window.__rpc.at(-1).a);
ok(ll.p_desde === mas(hoy, -29) && ll.p_hasta === hoy, "rango enviado: " + JSON.stringify(ll));

console.log("paso 2b · ubicación y recorrido");
await pg.click(".tp-seg button:has-text('7 días')"); await pg.waitForTimeout(150);
const celdaUbi = await pg.locator(".tp-tabla").nth(1).locator("tbody tr", { hasText: "Ana Ríos" }).first().locator("td").nth(9).textContent();
ok(/Ver mapa · ±9 m/.test(celdaUbi), "ubicación de Ana: " + celdaUbi);
ok((await pg.locator(".tp-mapa").first().getAttribute("href")).includes("mlat=10.9685&mlon=-74.7813"), "el enlace del mapa no lleva las coordenadas");
const detBeto = await pg.locator(".tp-tabla").nth(1).locator("tbody tr", { hasText: "Beto Díaz" }).first().textContent();
ok(/Sin ubicación · dijo que no/.test(detBeto), "Beto debía salir «Sin ubicación · dijo que no»: " + detBeto);
await pg.locator(".tp-tabla").nth(1).locator("tbody tr", { hasText: "Ana Ríos" }).first().locator(".tp-ver").click(); await pg.waitForTimeout(150);
const filasRec = await pg.locator(".tp-rec tbody tr").count();
ok(filasRec === 4, "el recorrido debía tener 4 renglones: " + filasRec);
const resumen = await pg.locator(".tp-rec-res").textContent();
ok(/Mediana entre renglones 40 s/.test(resumen) && /El más corto 6 s/.test(resumen) && /1\s*con menos de 15 s/.test(resumen) && /1\s*corregidos/.test(resumen), "resumen del recorrido: " + resumen);
ok((await pg.locator(".tp-rec tbody tr").nth(0).textContent()).includes("20 min") && (await pg.locator(".tp-rec tbody tr").nth(0).textContent()).includes("desde que abrió"), "el primero se mide desde que abrió");
ok(/Muy seguido/.test(await pg.locator(".tp-rec tbody tr").nth(2).textContent()), "el de 6 s debía salir «Muy seguido»");
ok(!/Muy seguido/.test(await pg.locator(".tp-rec tbody tr").nth(1).textContent()), "el de 40 s no debía salir «Muy seguido»");
const anchoRec = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
ok(anchoRec.sw <= anchoRec.cw, "con el recorrido abierto la página se desborda");
await pg.screenshot({ path: R(".arnes/_tp-recorrido.png"), fullPage: true });
await pg.locator(".tp-tabla").nth(1).locator("tbody tr", { hasText: "Ana Ríos" }).first().locator(".tp-ver").click();
ok(await pg.locator(".tp-rec").count() === 0, "«Ocultar» debía cerrar el recorrido");

console.log("paso 3 · sin SQL / vacío");
await monta(1440, "sinsql=1", ".sin-tablas");
ok(/2026-10-conteo-tiempos\.sql/.test(await pg.textContent(".sin-tablas")), "no avisa qué SQL correr");
await monta(1440, "sinubi=1");
ok(await pg.locator(".tp-tabla").nth(1).locator("tbody tr").first().locator("td").nth(9).textContent() === "—", "sin el SQL de ubicación debía salir «—»");
await monta(1440, "vacio=1", ".fe-vacio");
ok(/Todavía no hay conteos enviados/.test(await pg.textContent(".tp")), "falta el mensaje de vacío");

console.log("paso 4 · anchos y forma");
for (const w of [360, 390, 820, 1440]) {
  await monta(w);
  const d = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok(d.sw <= d.cw, `a ${w}px la página se desborda (${d.sw} > ${d.cw})`);
  const chicos = await pg.evaluate(() => [...document.querySelectorAll(".tp button, .tp select, .tp input, .tp-tabs a")].filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => e.tagName + ":" + e.textContent.slice(0, 10)));
  ok(chicos.length === 0, `a ${w}px hay controles de menos de 44 px: ` + chicos.join(","));
  const redondos = await pg.evaluate(() => [...document.querySelectorAll(".tp *, .tp-tabs, .tp-tabs a")].filter((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius) > 3).length);
  ok(redondos === 0, `a ${w}px hay ${redondos} elementos con esquinas redondeadas`);
  if (w === 390 || w === 1440) await pg.screenshot({ path: R(`.arnes/_tp-${w}.png`), fullPage: true });
}
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ tiempos: ranking, en curso, filtros, sin SQL, anchos y forma");
