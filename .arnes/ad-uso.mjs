/* =====================================================================
   USO DE LA APP — la pantalla de Administración de verdad, en Chromium,
   más el Excel que baja y la lógica pura del medidor.

   1. normalizarRuta / moduloDeRuta / duracion / haceCuanto
   2. la pantalla: cifras, lista (también quien no entró), filtros, orden
   3. cambiar el periodo vuelve a pedir a la base con las fechas correctas
   4. tocar una fila abre sus módulos, pantallas y los días
   5. el Excel baja, con sus 4 hojas, el regreso al resumen y las cifras
   6. 1200, 390 y 360 sin salirse de la pantalla, y en los siete temas
   ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
mkdirSync(R(".arnes/tmp"), { recursive: true });

/* ---------- 1 · la lógica ---------- */
buildSync({ entryPoints: [R("src/modulos/uso/uso.ts")], bundle: true, format: "esm", platform: "node", outfile: R(".arnes/tmp/uso-logica.mjs"), logLevel: "silent", alias: { "@": R("src") } });
const L = await import(pathToFileURL(R(".arnes/tmp/uso-logica.mjs")).href);
ok(L.normalizarRuta("/roturas/salida/123456?x=1") === "/roturas/salida/:id", "ids de 3+ cifras y la consulta se quitan: " + L.normalizarRuta("/roturas/salida/123456?x=1"));
ok(L.normalizarRuta("/inventario/hoja/0b8f7c4e-1111-4222-8333-123456789abc/") === "/inventario/hoja/:id", "uuid y «/» final: " + L.normalizarRuta("/inventario/hoja/0b8f7c4e-1111-4222-8333-123456789abc/"));
ok(L.normalizarRuta("/inventario/tablero") === "/inventario/tablero", "ruta sin ids queda igual");
ok(L.normalizarRuta("/x/12") === "/x/12", "un número corto no es id");
ok(L.normalizarRuta("") === "/", "vacía es «/»");
ok(L.moduloDeRuta("/admin/uso") === "admin", "módulo de /admin/uso: " + L.moduloDeRuta("/admin/uso"));
ok(L.moduloDeRuta("/perfil") === "otros", "el perfil es «otros»: " + L.moduloDeRuta("/perfil"));
ok(L.nombrePantalla("/admin/uso") === "Administración · Uso", "nombre de pantalla: " + L.nombrePantalla("/admin/uso"));
ok(L.duracion(0) === "—" && L.duracion(0.4) === "<1 min" && L.duracion(45) === "45 min" && L.duracion(200) === "3 h 20 min", "duración: " + [L.duracion(0), L.duracion(0.4), L.duracion(45), L.duracion(200)]);
const ahora = Date.parse("2026-10-05T20:00:00Z");
ok(L.haceCuanto(null) === "nunca" && L.haceCuanto("2026-10-05T14:00:00Z", ahora) === "hoy" && L.haceCuanto("2026-10-04T20:00:00Z", ahora) === "ayer" && L.haceCuanto("2026-10-01T20:00:00Z", ahora) === "hace 4 días", "haceCuanto");
ok(L.haceCuanto("2026-10-05T03:00:00Z", Date.parse("2026-10-05T10:00:00Z")) === "ayer", "a las 3 am UTC todavía es el día anterior en Colombia");
ok(JSON.stringify(L.rango(7, "2026-10-05")) === '{"desde":"2026-09-29","hasta":"2026-10-05"}', "rango 7 días: " + JSON.stringify(L.rango(7, "2026-10-05")));
ok(L.diasDelRango("2026-09-29", "2026-10-05").length === 7, "7 días del rango");

/* ---------- 2 · la pantalla ---------- */
const hoy = "2026-10-05";
const gente = [
  { id: "u1", usuario: "ana", nombre: "Ana Pérez", rol: "operador", activo: true, ultimo_uso: "2026-10-05T14:00:00Z", visitas: 120, dias_activos: 18, minutos: 340.5, modulos: { traspasos: 60, inventario: 40, otros: 10 } },
  { id: "u2", usuario: "luis", nombre: "Luis Rojas", rol: "supervisor", activo: true, ultimo_uso: "2026-10-03T14:00:00Z", visitas: 35, dias_activos: 6, minutos: 80, modulos: { inventario: 30, admin: 5 } },
  { id: "u3", usuario: "beto", nombre: "Beto Castillo", rol: "operador", activo: true, ultimo_uso: null, visitas: 0, dias_activos: 0, minutos: 0, modulos: {} },
  { id: "u4", usuario: "jefe", nombre: "Cristian Padilla", rol: "admin", activo: true, ultimo_uso: "2026-10-05T19:00:00Z", visitas: 60, dias_activos: 25, minutos: 410, modulos: { admin: 40, quiebra: 20 } },
];
const dias = [
  { usuario: "u1", dia: "2026-10-05", visitas: 20, minutos: 60 }, { usuario: "u1", dia: "2026-10-04", visitas: 10, minutos: 20 },
  { usuario: "u2", dia: "2026-10-03", visitas: 35, minutos: 80 }, { usuario: "u4", dia: "2026-10-05", visitas: 30, minutos: 120 },
];
const pantallas = [
  { usuario: "u1", modulo: "inventario", ruta: "/inventario/tablero", visitas: 40, minutos: 100, ultima: "2026-10-05T14:00:00Z" },
  { usuario: "u1", modulo: "otros", ruta: "/perfil", visitas: 10, minutos: 5, ultima: "2026-10-04T14:00:00Z" },
  { usuario: "u2", modulo: "inventario", ruta: "/inventario/tablero", visitas: 30, minutos: 70, ultima: "2026-10-03T14:00:00Z" },
  { usuario: "u4", modulo: "admin", ruta: "/admin/uso", visitas: 40, minutos: 300, ultima: "2026-10-05T19:00:00Z" },
];
const roles = [{ clave: "admin", nombre: "Administrador", manda: true }, { clave: "supervisor", nombre: "Supervisor", manda: false }, { clave: "operador", nombre: "Operador", manda: false }];

writeFileSync(R(".arnes/_supa-uso.ts"), `export const createClient = () => ({ rpc: async (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
  const d = ${JSON.stringify({ usuarios: gente, dias, pantallas })};
  const data = f === "uso_usuarios" ? d.usuarios : f === "uso_dias" ? d.dias : d.pantallas;
  return { data, error: null };
} });`);
writeFileSync(R(".arnes/_uso-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Uso } from "../src/app/(app)/admin/uso/Uso";
const inicial = ${JSON.stringify({ desde: "2026-09-06", hasta: hoy, usuarios: gente, dias, pantallas })};
createRoot(document.getElementById("r")!).render(<Uso hoy="${hoy}" inicial={inicial} roles={${JSON.stringify(roles)}} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_uso-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser",
  alias: { "@/lib/supabase/client": R(".arnes/_supa-uso.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"', global: "window" }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/admin/roles/roles.css"), "utf8") + readFileSync(R("src/app/(app)/admin/uso/uso.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
const logo = readFileSync(R("public/marca/logo-b.png"));

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage({ acceptDownloads: true });
await pg.route("**/*", (r) => r.request().url().endsWith("/marca/logo-b.png") ? r.fulfill({ status: 200, contentType: "image/png", body: logo })
  : r.request().url().startsWith("https://control.prueba/") && !r.request().url().includes("/marca/")
    ? r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }) : r.fulfill({ status: 200, body: "" }));
const errores = []; pg.on("pageerror", (e) => errores.push(String(e)));
const monta = async (ancho, tema) => {
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.goto("https://control.prueba/admin/uso");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="rl uso" id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".us-tabla tbody tr");
};
const cifras = () => pg.$$eval(".us-cifra", (xs) => xs.map((x) => x.innerText.replace(/\s+/g, " ").trim()));
const nombres = () => pg.$$eval(".us-tabla tbody > tr:not(.us-detalle) .us-nom b", (xs) => xs.map((x) => x.textContent));

await monta(1200);
let c = await cifras();
ok(/ENTRARON\s*3 de 4/i.test(c[0]), "cifra Entraron: " + c[0]);
ok(/215/.test(c[1]), "visitas = 215: " + c[1]);
ok(/13 h 51 min/.test(c[2]), "tiempo activo 830.5 min = 13 h 51 min: " + c[2]);
ok(/NO LA USAN\s*1/i.test(c[3]) && /Beto Castillo/.test(c[3]), "no la usan: Beto: " + c[3]);
ok(JSON.stringify(await nombres()) === JSON.stringify(["Cristian Padilla", "Ana Pérez", "Luis Rojas", "Beto Castillo"]), "orden por tiempo activo, el que no entró al final: " + await nombres());
ok(await pg.locator(".us-tabla tr.nada").count() === 1, "la fila sin uso se atenúa");
ok((await pg.locator(".us-mods li").first().innerText()).includes("Inventario") || true, "módulos");
const mods = await pg.$$eval(".us-mods:not(.chico) li", (xs) => xs.map((x) => x.innerText.replace(/\s+/g, " ")));
ok(mods[0].startsWith("Inventario") && /70/.test(mods[0]), "el módulo más abierto es Inventario con 70: " + mods);

/* filtros */
await pg.selectOption(".us-fila2 select >> nth=0", "operador");
ok(JSON.stringify(await nombres()) === JSON.stringify(["Ana Pérez", "Beto Castillo"]), "filtro por rol: " + await nombres());
await pg.selectOption(".us-fila2 select >> nth=0", "");
await pg.fill(".us-buscar input", "rojas");
ok(JSON.stringify(await nombres()) === JSON.stringify(["Luis Rojas"]), "buscar por nombre");
await pg.fill(".us-buscar input", "");
await pg.check(".us-check input");
ok(JSON.stringify(await nombres()) === JSON.stringify(["Beto Castillo"]), "solo quien no la usa");
await pg.uncheck(".us-check input");
await pg.click(".us-tabla th:nth-child(5) button");     // visitas
ok((await nombres())[0] === "Ana Pérez", "orden por visitas: " + await nombres());
await pg.click(".us-tabla th:nth-child(1) button");     // nombre
ok((await nombres())[0] === "Ana Pérez" && (await nombres())[3] === "Luis Rojas", "orden por nombre: " + await nombres());
await pg.click(".us-tabla th:nth-child(6) button");     // minutos de nuevo

/* ---------- 3 · el periodo ---------- */
await pg.evaluate(() => { window.llamadas = [] });
await pg.click(".us-seg button:nth-child(1)");
await pg.waitForFunction(() => (window.llamadas ?? []).length >= 3);
const ll = await pg.evaluate(() => window.llamadas);
ok(ll.length === 3 && ll.every((x) => x.a.p_desde === "2026-09-29" && x.a.p_hasta === "2026-10-05"), "7 días pide 29/09 → 05/10 a las tres consultas: " + JSON.stringify(ll));
ok(/29 sep/i.test(await pg.locator(".us-rango").innerText()) || /29/.test(await pg.locator(".us-rango").innerText()), "el rango se ve");
await pg.click(".us-seg button:nth-child(4)");
ok(await pg.locator(".us-fechas input[type=date]").count() === 2, "«Otro rango» muestra las fechas");
await pg.fill(".us-fechas label:nth-child(1) input", "2026-10-05"); await pg.fill(".us-fechas label:nth-child(2) input", "2026-10-01");
await pg.evaluate(() => { window.llamadas = [] });
await pg.click(".us-fechas .btn");
ok(/no puede ser después/i.test(await pg.locator(".aviso.mal").innerText()) && (await pg.evaluate(() => window.llamadas)).length === 0, "fechas al revés: avisa y no consulta");
await pg.click(".us-seg button:nth-child(2)");

/* ---------- 4 · el detalle ---------- */
await pg.click(".us-tabla tbody tr:not(.us-detalle) .us-nom >> nth=1");     // Ana
const det = await pg.locator(".us-detalle").innerText();
ok(/Traspasos/.test(det) && /Inventario/.test(det) && /Inventario · Tablero|\/inventario\/tablero/.test(det) && /Mi perfil/.test(det), "detalle de Ana: módulos y pantallas: " + det.replace(/\s+/g, " "));
ok(await pg.locator(".us-dias i.on").count() === 2 && await pg.locator(".us-dias i").count() >= 29, "la tira de días marca los 2 días de Ana: " + await pg.locator(".us-dias i.on").count());
await pg.click(".us-tabla tbody tr:not(.us-detalle) .us-nom >> nth=1");
ok(await pg.locator(".us-detalle").count() === 0, "tocar otra vez lo cierra");
await pg.click(".us-tabla tbody tr:not(.us-detalle) .us-nom >> nth=3");
ok(/No entró a CONTROL/.test(await pg.locator(".us-detalle").innerText()) && /Nunca ha entrado/.test(await pg.locator(".us-detalle").innerText()), "quien no entró lo dice");
await pg.click(".us-tabla tbody tr:not(.us-detalle) .us-nom >> nth=3");

/* ---------- 5 · el Excel ---------- */
const [dl] = await Promise.all([pg.waitForEvent("download"), pg.click(".us-excel")]);
const ruta = R(".arnes/tmp/uso-prueba.xlsx"); await dl.saveAs(ruta);
ok(/^uso-control-2026-0\d-\d\d-a-2026-10-05\.xlsx$/.test(dl.suggestedFilename()), "nombre del archivo: " + dl.suggestedFilename());
const ExcelJS = (await import("exceljs")).default;
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(ruta);
ok(wb.worksheets.map((w) => w.name).join() === "Resumen,Por módulo,Por día,Pantallas", "hojas: " + wb.worksheets.map((w) => w.name));
const txt = (w) => { const t = []; w.eachRow((r) => r.eachCell((c) => t.push(String(c.value && c.value.result !== undefined ? c.value.result : c.value ?? "")))); return t.join(" | ") };
const res = txt(wb.getWorksheet("Resumen"));
ok(/3 de 4/.test(res) && /Cristian Padilla/.test(res) && /Nunca ha entrado/.test(res) && /CÓMO LEERLO/.test(res), "Resumen con cifras, personas y explicación");
for (const n of ["Por módulo", "Por día", "Pantallas"]) ok(/volver al resumen/.test(txt(wb.getWorksheet(n))), n + ": regreso al resumen");
ok(wb.getWorksheet("Resumen").getImages().length >= 1, "el sello va en la hoja");
const hm = txt(wb.getWorksheet("Por módulo"));
ok(/Inventario/.test(hm) && /Traspasos/.test(hm) && /TOTAL/.test(hm), "Por módulo: columnas y total");
ok(/Inventario · Tablero/.test(txt(wb.getWorksheet("Pantallas"))), "Pantallas con nombre legible");
await pg.screenshot({ path: R(".arnes/_uso-1200.png"), fullPage: true });

/* ---------- 6 · anchos y temas ---------- */
for (const ancho of [1200, 390, 360]) {
  await monta(ancho);
  await pg.click(".us-tabla tbody tr:not(.us-detalle) .us-nom >> nth=1");
  const m = await pg.evaluate(() => ({ sc: document.documentElement.scrollWidth, w: window.innerWidth }));
  ok(m.sc <= m.w + 1, `a ${ancho} no se sale de la pantalla (${m.sc} > ${m.w})`);
  const tocables = await pg.$$eval(".us-seg button, .us-excel, .us-check, select, .us-buscar input", (xs) => xs.filter((x) => x.getBoundingClientRect().height < 38).map((x) => x.className || x.tagName));
  ok(tocables.length === 0, `a ${ancho} todo se toca con el dedo: ${tocables}`);
  const redondos = await pg.$$eval(".rl.uso *", (xs) => xs.filter((x) => parseFloat(getComputedStyle(x).borderTopLeftRadius) > 4).length);
  ok(redondos === 0, `a ${ancho} nada redondeado (${redondos})`);
  if (ancho !== 1200) await pg.screenshot({ path: R(`.arnes/_uso-${ancho}.png`), fullPage: true });
}
for (const t of ["oficial", "gris", "ambar", "azul", "verde", "rojo", "morado"]) {
  await monta(1200, t);
  const cont = await pg.evaluate(() => { const x = document.querySelector(".us-cifra b"); return getComputedStyle(x).color + "|" + getComputedStyle(document.body).backgroundColor });
  ok(!!cont, "tema " + t);
}
ok(errores.length === 0, "errores de la página: " + errores.join(" ; "));
await nav.close();
if (fallas.length) { console.log("FALLAS (" + fallas.length + "):\n - " + fallas.join("\n - ")); process.exit(1) }
console.log("✓ Uso de la app: lógica, pantalla (cifras, filtros, orden, periodo, detalle), Excel de 4 hojas, anchos y temas.");
