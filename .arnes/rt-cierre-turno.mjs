/* =====================================================================
   ROTURAS · EN SITIO · EL CIERRE DE TURNO (ficha del Tablero)

   «Quiero cierres de turno A, B y C mostrando, en el día y en el turno,
    cuántos registros hicieron, cuántos fueron reportados, cuántos fueron
    encontrados, a qué corresponde esa rotura, con exportables PDF.»

   Se mide, con la pantalla de verdad:
   1. LOS FILTROS DE DÍA Y TURNO del Tablero (C/A/B, varios a la vez) y
      que la tabla se quede con lo que se registró en ese turno.
   2. LA FICHA: registros = reportadas + encontradas + sin origen; las
      anuladas aparte; el orden C, A, B; los turnos en cero se ven.
   3. QUE EL CIERRE SEA LO FILTRADO: estado, búsqueda, día y turno.
   4. LOS EXPORTABLES: PDF que baja de verdad, texto que se copia.
   5. ESCAPE / fondo cierran; al imprimir solo queda la ficha.
   6. NADA SE SALE y todo mide ≥ 44 px, en cuatro anchos; se lee en los
      siete temas.

     node .arnes/rt-cierre-turno.mjs
   ===================================================================== */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_nav-rt.ts"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-rt.ts"), `export const createClient = () => ({
  rpc: async () => ({ data: null, error: null }),
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
});`);

/* ---------- LOS DATOS (hora de Colombia = UTC−5) ----------
   28/09 B                       r7  (opm)
   29/09 C  22:30 y 23:10 del 28 r1 opm · r2 encontrada
   29/09 A                       r3 opm (desacuerdo) · r4 SIN origen y sin causa
   29/09 B                       r5 ANULADA · r6 encontrada */
writeFileSync(R(".arnes/_rt-cierre.tsx"), `
import { createRoot } from "react-dom/client";
import { Tablero } from "../src/app/(app)/roturas/en-sitio/tablero/Tablero";
const base = {
  color: "ambar" as const, area: "bahias_t1", area_nombre: "Bahías T1",
  proceso: "lineas", proceso_nombre: "Líneas", tipo: "producto_terminado" as const,
  material: "3128", material_nombre: "Aguila RN 330cc X 30",
  exige_foto: false, descripcion: null, lat: null, lng: null, precision_m: null,
  reportada_por: "u-sup", minutos: 30, fotos: 0, le_falta_foto: false,
  ol_respuesta: null, ol_por: null, ol_en: null, ol_nota: null, nota_decision: null,
  motivo_anulacion: null, cobro_por: null, fotos_descargo: 0,
  unidades: 10, contaminadas: 0, botellas: null, unidades_liquido: 10, unidades_vidrio: 300,
  causa: "estibas_malas", causa_nombre: "Estibas en mal estado", grupo: "asumida" as const,
  estado: "esperando" as const, etapa: "espera_ol", esperando: true, cuenta: false,
  origen: "opm", opm_nombre: "Juan OPM",
};
const roturas = [
  { ...base, id: "r1", codigo: "RB-0001", reportada_en: "2026-09-29T03:30:00Z" },
  { ...base, id: "r2", codigo: "RB-0002", reportada_en: "2026-09-29T04:10:00Z", origen: "encontrada", opm_nombre: null,
    unidades: 4, estado: "cuenta" as const, etapa: "cobro", esperando: false, cuenta: true },
  { ...base, id: "r3", codigo: "RB-0003", reportada_en: "2026-09-29T11:30:00Z", unidades: 12, contaminadas: 3,
    causa: "montacarga", causa_nombre: "Montacarga", etapa: "desacuerdo" },
  { ...base, id: "r4", codigo: "RB-0004", reportada_en: "2026-09-29T12:00:00Z", origen: null, opm_nombre: null,
    causa: "", causa_nombre: "", reportada_por: "u-b" },
  { ...base, id: "r5", codigo: "RB-0005", reportada_en: "2026-09-29T19:30:00Z", estado: "anulada" as const, etapa: "anulada", esperando: false },
  { ...base, id: "r6", codigo: "RB-0006", reportada_en: "2026-09-29T20:00:00Z", origen: "encontrada", opm_nombre: null,
    tipo: "eer" as const, unidades: 6, estado: "cuenta" as const, etapa: "cobro", esperando: false, cuenta: true },
  { ...base, id: "r7", codigo: "RB-0007", reportada_en: "2026-09-28T20:00:00Z" },
];
createRoot(document.getElementById("r")!).render(
  <Tablero roturas={roturas as any} nombres={{ "u-sup": "Ana Registra", "u-b": "Beto Registra" }} manda />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_rt-cierre.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-rt.ts"), "@/lib/supabase/client": R(".arnes/_supa-rt.ts"), "@": R("src") },
  loader: { ".css": "empty" },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/roturas/roturas.css", "src/app/(app)/roturas/en-sitio/tablero/cierre.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ acceptDownloads: true, permissions: [] });
const pg = await ctx.newPage();
const rotos = [];
pg.on("pageerror", (e) => rotos.push(e.message));

const monta = async (ancho = 1440, alto = 1000, tema = "") => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <style>${P}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
    <div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>${js}<\/script></body></html>`);
  await pg.waitForSelector(".rt .tb-tabla tbody tr");
};
const codigos = () => pg.$$eval(".rt .tb-tabla tbody tr:not(.tb-detalle) td.tb-cod", (x) => x.map((e) => e.textContent.trim()));
const turno = (t) => pg.click(`.tb-turno:has(b:text-is("${t}"))`);
const fecha = async (d, h) => { await pg.fill('.tb-fecha:has(span:text-is("Desde")) input', d); await pg.fill('.tb-fecha:has(span:text-is("Hasta")) input', h) };
const abre = async () => { await pg.click(".tb-cierre"); await pg.waitForSelector(".rtc") };
const ficha = () => pg.$eval(".rtc", (e) => e.textContent.replace(/\s+/g, " "));
const tarjetas = () => pg.$$eval(".rtc-turno", (x) => x.map((e) => ({
  t: e.querySelector(".rtc-letra").textContent,
  reg: +e.querySelector(".rtc-reg b").textContent,
  vacio: e.classList.contains("vacio"),
  txt: e.innerText.replace(/\s+/g, " "),
})));
const cerrar = async () => { await pg.click('.rtc button[aria-label="Cerrar"]'); await pg.waitForSelector(".rtc", { state: "detached" }) };

await monta();
ok(rotos.length === 0, `la pantalla tiró un error: ${rotos[0]}`);

/* ===== 1 · LOS FILTROS DE DÍA Y TURNO DEL TABLERO ===== */
{
  ok((await codigos()).length === 7, "arranca con las 7 roturas: " + (await codigos()).length);
  ok(await pg.locator(".tb-turno").count() === 3 && (await pg.$$eval(".tb-turno b", (x) => x.map((e) => e.textContent))).join("") === "CAB",
     "los chips de turno van en el orden del día: C, A, B");
  ok(await pg.locator(".tb-cierre").count() === 1 && /Cierre de turno/.test(await pg.textContent(".tb-cierre")), "falta el botón «Cierre de turno» dentro del Tablero");
  await turno("A");
  ok((await codigos()).join() === "RB-0003,RB-0004", "turno A: " + (await codigos()).join());
}
{
  ok(/2 de 7/.test(await pg.textContent(".caja h2")), "el contador dice «2 de 7»: " + await pg.textContent(".caja h2"));
  await turno("C");   // se suman: C y A
  ok((await codigos()).join() === "RB-0001,RB-0002,RB-0003,RB-0004", "turnos C y A juntos: " + (await codigos()).join());
  await turno("A"); await turno("C");   // se quitan
  ok((await codigos()).length === 7, "sin turnos vuelve a todo");
  /* LAS 22:00 SON DEL C DEL DÍA SIGUIENTE: RB-0001 se registró el 28 a las 22:30 y es del C del 29. */
  await fecha("2026-09-29", "2026-09-29");
  ok((await codigos()).join() === "RB-0001,RB-0002,RB-0003,RB-0004,RB-0005,RB-0006", "el día 29 incluye el C que arrancó el 28 a las 22:00: " + (await codigos()).join());
  await fecha("2026-09-28", "2026-09-28");
  ok((await codigos()).join() === "RB-0007", "el día 28 solo trae lo del B: " + (await codigos()).join());
  const tt = await pg.$eval(".tb-tabla tbody tr td.tb-cuando .tb-t", (e) => e.textContent);
  ok(tt === "B", "cada fila lleva la letra de su turno: " + tt);
  await pg.click('button:has-text("Quitar día y turno")');
  ok((await codigos()).length === 7 && await pg.locator('button:has-text("Quitar día y turno")').count() === 0, "«Quitar día y turno» limpia y desaparece");
}

/* ===== 2 · LA FICHA: LOS TRES NÚMEROS Y LOS TURNOS ===== */
{
  await fecha("2026-09-29", "2026-09-29");
  await abre();
  ok(await pg.locator('.rtc[role="dialog"]').count() === 1, "la ficha es un diálogo");
  ok(/Cierre del día/.test(await pg.textContent(".rtc-cab h2")), "título: " + await pg.textContent(".rtc-cab h2"));
  ok(/LOS TRES TURNOS/.test(await pg.textContent(".rtc-ojo")), "dice que son los tres turnos");
  const k = (n) => pg.$eval(`.rtc-hero .rtc-k:text-is("${n}")`, (e) => e.nextElementSibling.textContent.trim());
  const tot = await pg.$eval(".rtc-total .rtc-v", (e) => e.textContent);
  ok(tot === "5", "REGISTROS del día 29: 5 vivos (la anulada no cuenta): " + tot);
  ok(await k("REPORTADAS") === "2" && await k("ENCONTRADAS") === "2" && await k("SIN ORIGEN") === "1", "reportadas 2 · encontradas 2 · sin origen 1");
  const ts = await tarjetas();
  ok(ts.map((x) => x.t).join("") === "CAB", "el orden de las tarjetas es C, A, B: " + ts.map((x) => x.t).join(""));
  ok(ts[0].reg === 2 && ts[1].reg === 2 && ts[2].reg === 1, "registros por turno 2·2·1: " + ts.map((x) => x.reg));
  ok(/Turno C 22:00 · 06:00/.test(ts[0].txt) && /REPORTADAS 1 ENCONTRADAS 1/.test(ts[0].txt), "el C trae su horario y 1 reportada + 1 encontrada: " + ts[0].txt.slice(0, 160));
  ok(/SIN ORIGEN 1/.test(ts[1].txt), "el A dice su sin origen");
  ok(/1 anulada/.test(ts[2].txt), "el B dice que hay una anulada aparte");
  /* A QUÉ CORRESPONDE: cerrado al abrir; al abrirlo, trae las cuatro listas. */
  ok(await pg.locator(".rtc-turno details[open]").count() === 0, "«A qué corresponde» llega cerrado");
  await pg.click(".rtc-turno >> nth=1 >> summary");
  const det = await pg.$eval(".rtc-turno >> nth=1 >> details", (e) => e.textContent.replace(/\s+/g, " "));
  ok(/Por causa/.test(det) && /Por proceso/.test(det) && /Por área/.test(det) && /Quién registró/.test(det), "trae causa, proceso, área y quién");
  ok(/Montacarga/.test(det) && /Sin dato/.test(det), "la causa y el «Sin dato» del turno A: " + det.slice(0, 200));
  /* LA TABLA DE ROTURAS: una por una, con su origen. */
  const filas = await pg.$$eval(".rtc-tabla tbody tr", (x) => x.map((e) => [...e.querySelectorAll("td")].map((d) => d.textContent.trim())));
  ok(filas.length === 6, "la tabla lista las 6 (5 vivas + la anulada): " + filas.length);
  const f1 = filas.find((f) => f.includes("RB-0001"));
  ok(f1 && /Reportada/.test(f1.join("|")) && /Juan OPM/.test(f1.join("|")) && /Ana Registra/.test(f1.join("|")), "RB-0001: reportada por Juan OPM, la registró Ana: " + f1?.join("|"));
  ok(filas.find((f) => f.includes("RB-0002")).join("|").includes("Encontrada"), "RB-0002 encontrada");
  ok(filas.find((f) => f.includes("RB-0004")).join("|").includes("Sin origen"), "RB-0004 sin origen");
  ok(await pg.locator(".rtc-tabla tr.anulada").count() === 1 && /ANULADA/.test(await pg.textContent(".rtc-tabla tr.anulada")), "la anulada sale tachada y dice ANULADA");
  ok(await pg.locator(".rtc-tabla thead th:text-is('Día')").count() === 0, "con un solo día no hace falta la columna Día");
  await cerrar();
}

/* ===== 3 · EL CIERRE ES LO QUE SE FILTRÓ ===== */
{
  await turno("A");
  await abre();
  ok(/Cierre del turno A/.test(await pg.textContent(".rtc-cab h2")) && /TURNO A · 06:00 · 14:00/.test(await pg.textContent(".rtc-ojo")), "título del turno A: " + await pg.textContent(".rtc-cab h2"));
  ok((await tarjetas()).length === 1 && (await tarjetas())[0].reg === 2, "solo la tarjeta del A, con 2 registros");
  ok(await pg.$eval(".rtc-total .rtc-v", (e) => e.textContent) === "2", "el total del cierre del A es 2");
  ok(/Turno A/.test(await pg.textContent(".rtc-filtros").catch(() => "")), "la franja FILTRADO lo dice");
  await cerrar();
  await turno("C");
  await abre();
  ok(/Cierre de los turnos C y A/.test(await pg.textContent(".rtc-cab h2")), "dos turnos: " + await pg.textContent(".rtc-cab h2"));
  ok((await tarjetas()).map((x) => x.t).join("") === "CA", "tarjetas C y A");
  await cerrar();
  await turno("A"); await turno("C");
  /* Estado + búsqueda alimentan el cierre. */
  await pg.click('.filtros .btn:has-text("A cobro")');
  await abre();
  ok(await pg.$eval(".rtc-total .rtc-v", (e) => e.textContent) === "2" && (await ficha()).includes("Estado: a cobro"), "con «A cobro»: 2 registros y la franja lo dice");
  const rep = await pg.$eval(".rtc-hero .rtc-k:text-is('REPORTADAS')", (e) => e.nextElementSibling.textContent);
  ok(rep === "0", "las dos a cobro son encontradas: reportadas " + rep);
  await cerrar();
  await pg.click('.filtros .btn:has-text("Todas")');
  await pg.fill(".tb-busca", "montacarga");
  await abre();
  ok(await pg.$eval(".rtc-total .rtc-v", (e) => e.textContent) === "1" && /Búsqueda «montacarga»/.test(await ficha()), "la búsqueda también entra al cierre");
  await cerrar();
  await pg.fill(".tb-busca", "");
  /* Rango corto: salen también los turnos en cero. */
  await fecha("2026-09-27", "2026-09-30");
  await abre();
  const nT = (await tarjetas()).length;
  ok(nT === 12, "4 días × 3 turnos, también los de cero: " + nT);
  ok((await tarjetas()).some((x) => x.vacio && /No se registró ninguna rotura/.test(x.txt)), "el turno sin registros lo dice");
  ok(await pg.locator(".rtc-tabla thead th:text-is('Día')").count() === 1, "con varios días sí sale la columna Día");
  ok(await pg.locator(".rtc-cuatro.grande").count() === 1, "con varios turnos hay un «A qué corresponde» de todo junto");
  await cerrar();
  await pg.click('button:has-text("Quitar día y turno")');
}

/* ===== 4 · LOS EXPORTABLES ===== */
{
  await fecha("2026-09-29", "2026-09-29");
  await abre();
  const [bajada] = await Promise.all([pg.waitForEvent("download", { timeout: 60000 }), pg.click(".rtc-bt.pdf")]);
  const ruta = R(".arnes/_cierre-prueba.pdf");
  await bajada.saveAs(ruta);
  const bytes = readFileSync(ruta);
  ok(bytes.subarray(0, 5).toString() === "%PDF-" && bytes.length > 4000, "el PDF es un PDF de verdad: " + bytes.length + " bytes");
  ok(bajada.suggestedFilename() === "cierre-roturas-sitio-2026-09-29.pdf", "el nombre dice qué es y de qué día: " + bajada.suggestedFilename());
  await pg.waitForSelector(".rtc-aviso");
  ok(/PDF listo/.test(await pg.textContent(".rtc-aviso")), "después de bajar lo dice");
  /* Texto: lo que se copia trae las mismas cifras. */
  await pg.evaluate(() => { window.__copiado = ""; Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { window.__copiado = t } }, configurable: true }) });
  await pg.click('.rtc-bt:has-text("Copiar texto")');
  await pg.waitForFunction(() => window.__copiado !== "");
  const tx = await pg.evaluate(() => window.__copiado);
  ok(/CIERRE DE ROTURAS EN SITIO/.test(tx) && /Registros 5 · reportadas 2 · encontradas 2 · sin origen 1/.test(tx) && /Turno C \(22:00 · 06:00\)/.test(tx) && /Turno B/.test(tx) && !/RB-0005/.test(tx), "el texto copiado dice lo mismo que la ficha: " + tx.slice(0, 260));
  ok(/Texto copiado/.test(await pg.textContent(".rtc-aviso")), "dice que copió");
  await cerrar();
  /* PDF filtrado: el nombre dice el turno. */
  await turno("A");
  await abre();
  const [b2] = await Promise.all([pg.waitForEvent("download", { timeout: 60000 }), pg.click(".rtc-bt.pdf")]);
  ok(b2.suggestedFilename() === "cierre-roturas-sitio-2026-09-29-turno-A.pdf", "el PDF del turno A: " + b2.suggestedFilename());
  await cerrar();
  await turno("A");
}

/* ===== 5 · CERRAR, Y LO QUE SE IMPRIME ===== */
{
  await abre();
  await pg.keyboard.press("Escape");
  ok(await pg.locator(".rtc").count() === 0, "Escape cierra la ficha");
  await abre();
  await pg.mouse.click(4, 4);
  ok(await pg.locator(".rtc").count() === 0, "tocar el fondo cierra la ficha");
  await abre();
  ok(await pg.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Cerrar", "al abrir, el foco entra a la ficha");
  /* IMPRIMIR ABRE LOS «A QUÉ CORRESPONDE» mientras dura la impresión y los deja como estaban. */
  await pg.evaluate(() => { window.print = () => { window.__cerradosAlImprimir = document.querySelectorAll(".rtc details:not([open])").length } });
  await pg.click('.rtc-bt:has-text("Imprimir")');
  ok(await pg.evaluate(() => window.__cerradosAlImprimir) === 0, "al imprimir, ningún «A qué corresponde» queda cerrado: " + await pg.evaluate(() => window.__cerradosAlImprimir));
  ok(await pg.locator(".rtc details[open]").count() === 0, "y después de imprimir vuelven a quedar cerrados");
  await pg.emulateMedia({ media: "print" });
  const vis = await pg.evaluate(() => {
    const v = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none" };
    return { cab: v(".rt .cabeza"), tabla: v(".rt .caja"), ficha: v(".rtc"), botones: v(".rtc-der"), pos: getComputedStyle(document.querySelector(".rtc-velo")).position };
  });
  ok(vis.ficha && !vis.cab && !vis.tabla && !vis.botones && vis.pos === "static", "al imprimir queda solo la ficha, sin botones: " + JSON.stringify(vis));
  await pg.emulateMedia({ media: "screen" });
  await cerrar();
  await pg.click('button:has-text("Quitar día y turno")');
}

/* ===== 6 · NADA SE SALE, TODO MIDE 44 PX, EN CUATRO ANCHOS ===== */
for (const [ancho, alto] of [[360, 780], [768, 1024], [1024, 900], [1440, 1000]]) {
  await monta(ancho, alto);
  const chico0 = await pg.evaluate(() => [...document.querySelectorAll(".tb-cuando-fila button, .tb-cuando-fila input")].filter((e) => e.getBoundingClientRect().height < 43).length);
  ok(chico0 === 0, `en ${ancho} px los filtros de día y turno miden menos de 44 px (${chico0})`);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, `en ${ancho} px la página se corre de lado con los filtros nuevos`);
  await fecha("2026-09-28", "2026-09-29");
  await abre();
  await pg.click(".rtc-turno summary >> nth=0");
  const m = await pg.evaluate(() => {
    const f = document.querySelector(".rtc"), v = document.querySelector(".rtc-velo");
    const fuera = [...f.querySelectorAll("*")].filter((e) => {
      if (e.closest(".rtc-rueda")) return false;
      const r = e.getBoundingClientRect(); return r.width && r.right > window.innerWidth + 1;
    }).map((e) => e.className || e.tagName).slice(0, 4);
    const chicos = [...f.querySelectorAll("button, summary, input, select")].filter((e) => {
      const r = e.getBoundingClientRect(); return r.width && r.height < 43;
    }).map((e) => (e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().height)).slice(0, 4);
    const rueda = f.querySelector(".rtc-rueda");
    return { fuera, chicos, ancho: v.scrollWidth - v.clientWidth, rueda: rueda ? getComputedStyle(rueda).overflowX : "" };
  });
  ok(m.fuera.length === 0, `en ${ancho} px se sale de la ficha: ${m.fuera.join(", ")}`);
  ok(m.chicos.length === 0, `en ${ancho} px hay controles de menos de 44 px: ${m.chicos.join(", ")}`);
  ok(m.ancho <= 1, `en ${ancho} px la ficha se corre de lado ${m.ancho}`);
  ok(m.rueda === "auto", `en ${ancho} px la tabla de roturas no se desplaza sola`);
  if (ancho === 360 || ancho === 1440) await pg.screenshot({ path: R(`.arnes/_rt-cierre-${ancho}.png`), fullPage: false });
  await cerrar();
}

/* ===== 7 · SE LEE EN LOS SIETE TEMAS ===== */
const CANAL = (c) => { const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number); return c.startsWith("color(") ? n : n.map((v) => v / 255) };
const LUM = (c) => { const [r, g, b] = CANAL(c).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b };
const CONTRA = (a, b) => { const [p, q] = [LUM(a), LUM(b)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05) };
console.log("");
for (const tema of ["oficial", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, 1000, tema);
  await fecha("2026-09-29", "2026-09-29");
  await abre();
  await pg.click(".rtc-turno >> nth=1 >> summary");
  const m = await pg.evaluate(() => {
    const detras = (e) => { for (let n = e; n; n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") return b } return "rgb(255, 255, 255)" };
    const t = (s) => { const e = document.querySelector(s); if (!e) return null; const g = getComputedStyle(e), b = g.backgroundColor;
      return [g.color, (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") ? b : detras(e.parentElement)] };
    return { titulo: t(".rtc-cab h2"), ojo: t(".rtc-ojo"), foto: t(".rtc-f"), pdf: t(".rtc-bt.pdf"), total: t(".rtc-total .rtc-v"),
             k: t(".rtc-hero .rtc-k"), s2: t(".rtc-s2"), letra: t(".rtc-turno .rtc-letra"), orEnc: t(".rtc-or.encontrada"),
             orSin: t(".rtc-or.sin"), cab: t(".rtc-tabla th"), gris: t(".rtc-linea.rtc-fase"), sd: t(".rtc-sd"), sec: t(".rtc-sec span") };
  });
  const pares = Object.entries(m).filter(([, v]) => v);
  /* 4,5 para texto normal; 3 para etiquetas en negrita y los rótulos sobre el acento. */
  const tope = (k) => ["orEnc", "orSin", "k", "s2", "ojo"].includes(k) ? 3 : 4.5;
  const malos = pares.filter(([k, v]) => CONTRA(v[0], v[1]) < tope(k));
  ok(malos.length === 0, `en el tema ${tema} no se lee: ${malos.map(([k, v]) => `${k} ${CONTRA(v[0], v[1]).toFixed(1)}`).join(", ")}`);
  console.log(`${tema.padEnd(8)} ` + pares.map(([k, v]) => `${k} ${CONTRA(v[0], v[1]).toFixed(1)}`).join("  "));
  if (tema === "ambar") await pg.screenshot({ path: R(".arnes/_rt-cierre-ambar.png") });
  await cerrar();
}

ok(rotos.length === 0, `errores en la página: ${rotos.slice(0, 2).join(" | ")}`);
await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("\n✓ Cierre de turno de roturas: filtros de día y turno en el Tablero, la ficha con registros = reportadas + encontradas + sin origen (C, A, B), a qué corresponde, lo filtrado es lo que cierra, PDF y texto, solo la ficha al imprimir, y nada se sale en cuatro anchos y siete temas.");
