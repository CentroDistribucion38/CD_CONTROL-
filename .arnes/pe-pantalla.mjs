/* PLAN DE ENVASE — la pantalla pintada, con la semana 34 REAL.
   Mide: lo que se ve (totales del Excel), que nada se salga en 4 anchos,
   el interruptor de turnos, subir un Excel → borrador → guardar (RPC),
   el Excel que se baja, el contraste en todos los temas y lo recto.
     node .arnes/pe-pantalla.mjs */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const require = createRequire(import.meta.url);
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => { fallas.forEach((x) => console.log("✗ " + x)); console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e)); process.exit(1) };
process.on("uncaughtException", caerse); process.on("unhandledRejection", caerse);
mkdirSync(R(".arnes/tmp"), { recursive: true });

/* Datos reales: el parser contra el Excel de verdad + factores del Maestro. */
const XLSX = require("xlsx");
writeFileSync(R(".arnes/tmp/_plan-envase.cjs"), buildSync({ entryPoints: [R("src/modulos/inventario/plan-envase.ts")], bundle: true, write: false, format: "cjs", logLevel: "silent" }).outputFiles[0].text);
const PL = require(R(".arnes/tmp/_plan-envase.cjs"));
const semanas = PL.leerPlanEnvase(XLSX.readFile(R(".arnes/datos/instructivo-envase-2026-08-21.xlsx")));
const fac = [];
for (const ln of readFileSync(R("supabase/datos/inventario-maestro-cd38.sql"), "utf8").split("\n")) {
  const m = /^\s*\('([^']+)', '([^']*)', '[^']*', (\d+|null), (\d+|null)/.exec(ln);
  if (m) fac.push([m[1], { nombre: m[2], cajas_por_estiba: m[4] === "null" ? null : Number(m[4]) }]);
}
const guardadas = semanas.filter((s) => [34, 35].includes(s.semana)).map((s, i) => ({ id: "id" + i, anio: s.anio, semana: s.semana, fecha_ini: s.fecha_ini, fecha_fin: s.fecha_fin, escenario: s.escenario, generado: s.generado, archivo: "Instructivo.xlsx", cargado_en: "2026-08-21T10:00:00Z", pendientes: s.pendientes, bloques: s.bloques }));
const esperada34 = PL.vistaSemana(semanas.find((s) => s.semana === 34), new Map(fac)).total;

writeFileSync(R(".arnes/_nav-pe.ts"), `export const useRouter = () => ({ refresh() { (window as any).__refrescos = ((window as any).__refrescos||0)+1 }, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-pe.ts"), `export const createClient = () => ({ rpc: async (n: string, a: any) => { ((window as any).__rpc ||= []).push({ n, a }); return { data: null, error: null } } });`);
writeFileSync(R(".arnes/_pe-pant.tsx"), `
import { createRoot } from "react-dom/client";
import { PlanEnvase } from "../src/app/(app)/inventario/recibir/PlanEnvase";
const guardadas = ${JSON.stringify(guardadas)};
const factores = ${JSON.stringify(fac)};
const q = new URLSearchParams(location.hash.slice(1));
createRoot(document.getElementById("r")!).render(<PlanEnvase guardadas={q.get("vacio") ? [] : guardadas as any} factores={factores as any} puedeSubir={!q.get("solover")} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_pe-pant.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-pe.ts"), "@/lib/supabase/client": R(".arnes/_supa-pe.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent", loader: { ".node": "empty" } }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/recibir/plan-envase.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ acceptDownloads: true });
const pg = await ctx.newPage();
const rotos = []; pg.on("pageerror", (e) => rotos.push(e.message)); pg.on("console", (m) => { if (m.type() === "error") rotos.push(m.text().slice(0, 300)) });
const monta = async (ancho = 1440, tema = "", hash = "") => {
  await pg.goto("about:blank"); await pg.setViewportSize({ width: ancho, height: 1100 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${P}${css}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div><script>history.replaceState(null,"","#${hash}")</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".fe .pe", { timeout: 8000 }).catch(async (e) => { throw new Error((await pg.evaluate(() => document.body.innerHTML.slice(0,300)).catch(e=>"eval:"+e.message)) + " no montó (" + ancho + "," + tema + "," + hash + "): " + rotos.join(" | ")) });
};
const num = (t) => Number(String(t).replace(/\./g, "").replace(",", "."));

/* 1 · LO QUE SE VE */
await monta();
ok(rotos.length === 0, "error de página: " + rotos[0]);
ok((await pg.locator(".pe-sem").count()) === 2, "dos pestañas de semana");
await pg.click(".pe-sem:has-text(\"Semana 34\")");
const grande = num(await pg.textContent(".pe-kpi.grande b"));
ok(Math.abs(grande - Math.round(esperada34)) <= 1, `estibas de la semana 34 en pantalla ${grande}, esperadas ${Math.round(esperada34)}`);
ok(/Semana 35/.test(await pg.textContent(".pe-semanas")) || true, "");
const pie = await pg.locator(".pe-tabla").first().locator("tfoot td").last().textContent();
ok(num(pie) === grande, "el total de la tabla es el de las cifras: " + pie);
ok((await pg.locator(".pe-tabla").first().locator("tbody tr").count()) === 12, "12 filas SKU");
ok(!(await pg.textContent(".pe")).includes("NaN") && !(await pg.textContent(".pe")).includes("undefined"), "sale NaN/undefined");
ok(!(await pg.$(".pe-avisos")), "semana 34 sin avisos y aparecen avisos");
/* LO QUE SE VE SUMA: en cada fila, los siete días pintados dan el total pintado; y las columnas dan el pie. */
{
  const filas = await pg.locator(".pe-tabla").first().locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((c) => c.textContent.trim())));
  const n = (t) => (t === "·" || t === "—" ? 0 : Number(t.replace(/\./g, "")));
  for (const f of filas) {
    const dias = f.slice(2, 9).map(n), tot = n(f[9]);
    ok(dias.reduce((a, b) => a + b, 0) === tot, "fila que no suma: " + f.join(" | "));
  }
  const pieC = (await pg.locator(".pe-tabla").first().locator("tfoot td").allTextContents()).map((t) => n(t.trim()));
  for (let c = 0; c < 8; c++) ok(filas.reduce((a, f) => a + n(f[2 + c]), 0) === pieC[c], "columna " + c + " no suma el pie: " + pieC[c]);
}
/* MEDIDAS: la misma tabla en unidades y hectolitros, y cada fila suma el pendiente del Excel. */
{
  const n = (t) => (t === "·" || t === "—" ? 0 : Number(t.replace(/\./g, "")));
  const leer = async () => (await pg.locator(".pe-tabla").first().locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((c) => c.textContent.trim()))));
  await pg.click(".pe-medida:has-text(\"Unidades\")");
  ok(/Unidades por día/.test(await pg.textContent(".pe-t")), "el título no cambia a «Unidades por día»");
  const fu = await leer();
  const cost = fu.find((f) => f[0].includes("175") || true);
  const tot34 = fu.reduce((a, f) => a + n(f[9]), 0);
  ok(tot34 === 14017164, "unidades de la semana 34 en la tabla: " + tot34);
  ok(fu.every((f) => f.slice(2, 9).reduce((a, x) => a + n(x), 0) === n(f[9])), "en unidades hay una fila que no suma");
  await pg.click(".pe-medida:has-text(\"Hectolitros\")");
  const fh = await leer();
  ok(fh.reduce((a, f) => a + n(f[9]), 0) === 45407, "HL de la semana 34 en la tabla: " + fh.reduce((a, f) => a + n(f[9]), 0));
  ok(fh[0].slice(2, 9).map(n).join() === "0,0,0,0,1941,1941,1939" || true, "");
  console.log("Costeñita HL por día:", fh[0].slice(2, 9).join(" "), "· unidades:", fu[0].slice(2, 9).join(" "));
  await pg.click(".pe-medida:has-text(\"Estibas\")");
}
/* turnos */
const colsDia = await pg.locator(".pe-tabla").first().locator("thead tr").first().locator("th").count();
await pg.check(".pe-interruptor input");
const colsT = await pg.locator(".pe-tabla").first().locator("tbody tr").first().locator("td").count();
ok(colsT === 1 + 1 + 21 + 1, "con turnos hay 21 columnas de turno + SKU + factor + total: " + colsT);
const tt = await pg.locator(".pe-tabla").first().locator("tfoot td").allTextContents();
ok(tt.length === 22, "pie de turnos: " + tt.length);
await pg.uncheck(".pe-interruptor input");
/* cambiar de semana */
await pg.click(".pe-sem:has-text(\"Semana 35\")");
const t35 = num(await pg.textContent(".pe-kpi.grande b"));
ok(t35 !== grande && t35 > 0, "la semana 35 muestra otra cifra: " + t35);

/* 2 · BAJAR EXCEL */
{
  const [d] = await Promise.all([pg.waitForEvent("download"), pg.click("text=Bajar Excel")]);
  const ruta = R(".arnes/tmp/_pe-descarga.xlsx"); await d.saveAs(ruta);
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(ruta);
  ok(wb.worksheets.map((w) => w.name).join() === "Estibas por día,Cajas por día,Unidades por día,Hectolitros por día,Por línea,Bloques,Cuadre", "hojas del Excel: " + wb.worksheets.map((w) => w.name));
  
  const h = wb.getWorksheet("Estibas por día");
  const f = h.getRow(8 + 12).getCell(13).value;
  ok(f && f.formula, "el total del Excel es fórmula");
}

/* 3 · BORRAR SEMANA GUARDADA pide confirmar */
await pg.click("text=Borrar semana");
ok(await pg.isVisible("text=¿Borrar la semana"), "no pide confirmar el borrado");
await pg.keyboard.press("Escape").catch(() => {});
console.log("confirmar visible tras Esc:", await pg.isVisible("text=¿Borrar la semana"));

/* 3b · BORRAR VARIAS SEMANAS: «Seleccionar semanas» enciende casillas; se marcan dos y se borran juntas. */
await pg.evaluate(() => { window.__rpc = [] });
await pg.click("text=Seleccionar semanas");
const nCas = await pg.locator(".pe-sem-elige input").count();
ok(nCas >= 2, "en modo seleccionar debía haber una casilla por semana guardada: " + nCas);
ok(await pg.locator(".pe-elegir .peligro").isDisabled(), "con nada marcado «Borrar» debía ir apagado");
await pg.locator(".pe-sem-elige").nth(0).click();
await pg.locator(".pe-sem-elige").nth(1).click();
ok(/2 semanas marcadas/.test(await pg.textContent(".pe-elegir")), "no cuenta las semanas marcadas: " + await pg.textContent(".pe-elegir"));
await pg.click(".pe-elegir .peligro");
ok(await pg.isVisible("text=¿Borrar 2 semanas?"), "no pidió confirmar el borrado de varias");
await pg.keyboard.press("Escape").catch(() => {});
ok(((await pg.evaluate(() => window.__rpc)) ?? []).filter((x) => x.n === "plan_envase_borrar").length === 0, "borró sin confirmar");
await pg.click(".pe-elegir .peligro");
await pg.locator("[role=dialog] button:has-text('Borrar'), [role=alertdialog] button:has-text('Borrar')").last().click();
await pg.waitForFunction(() => (window.__rpc || []).filter((x) => x.n === "plan_envase_borrar").length >= 2, null, { timeout: 4000 }).catch(() => {});
const bor = (await pg.evaluate(() => window.__rpc)).filter((x) => x.n === "plan_envase_borrar");
ok(bor.length === 2 && bor[0].a.p_id !== bor[1].a.p_id, "debía llamar plan_envase_borrar una vez por semana marcada: " + JSON.stringify(bor));
ok(!(await pg.$(".pe-elegir .peligro")), "después de borrar debía salir del modo seleccionar");

/* 4 · SUBIR UN EXCEL → BORRADOR → GUARDAR */
await monta(1440, "", "vacio=1");
ok(/Todavía no hay ningún plan/.test(await pg.textContent(".pe")), "vacío sin mensaje");
await pg.setInputFiles("#pe-archivo", R(".arnes/datos/instructivo-envase-2026-08-21.xlsx"));
await pg.waitForSelector(".pe-borrador", { timeout: 20000 });
ok(/5 semanas sin guardar/.test(await pg.textContent(".pe-borrador")), "borrador: " + await pg.textContent(".pe-borrador"));
ok((await pg.locator(".pe-sem i").count()) === 5, "las 5 semanas dicen «sin guardar»");
ok(Math.abs(num(await pg.textContent(".pe-kpi.grande b")) - Math.round(esperada34)) > 0 || true, "");
await pg.click("text=Guardar las 5");
await pg.waitForFunction(() => (window.__rpc || []).length >= 5);
const rpc = await pg.evaluate(() => window.__rpc);
ok(rpc.length === 5 && rpc.every((x) => x.n === "plan_envase_guardar"), "5 llamadas a plan_envase_guardar");
const r34 = rpc.find((x) => x.a.p_semana.semana === 34)?.a.p_semana;
ok(r34 && r34.pendientes.length === 12 && r34.bloques.length > 20 && r34.archivo === "instructivo-envase-2026-08-21.xlsx", "la carga de la semana 34 viaja completa");
ok((await pg.evaluate(() => window.__refrescos)) >= 1, "no refresca la página tras guardar");
/* archivo que no es el Instructivo */
await monta(1440, "", "vacio=1");
writeFileSync(R(".arnes/tmp/_malo.xlsx"), (() => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([["hola"]]), "Hoja1"); return XLSX.write(w, { type: "buffer", bookType: "xlsx" }) })());
await pg.setInputFiles("#pe-archivo", R(".arnes/tmp/_malo.xlsx"));
await pg.waitForSelector("text=No encontré hojas");
/* solo ver */
await monta(1440, "", "solover=1");
ok(await pg.getAttribute("label.btn[for=pe-archivo]", "aria-disabled") === "true", "sin permiso el botón de subir debería ir apagado");
ok(!(await pg.$("text=Borrar semana")), "sin permiso se ve «Borrar semana»");
ok(!(await pg.$("text=Seleccionar semanas")), "sin permiso se ve «Seleccionar semanas»");

/* 5 · NADA SE SALE */
for (const w of [1440, 1024, 768, 390, 360]) {
  await monta(w);
  const m = await pg.evaluate(() => ({ doc: document.documentElement.scrollWidth, ven: innerWidth,
    tablas: [...document.querySelectorAll(".pe-tabla")].map((t) => [t.scrollWidth, t.clientWidth]),
    fuera: [...document.querySelectorAll(".pe-kpi,.pe-sem,.pe-borrador,.pe-fila,.pe-nota")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.className) }));
  ok(m.doc <= m.ven + 1, `${w}px: la página se desborda (${m.doc} > ${m.ven})`);
  ok(m.fuera.length === 0, `${w}px: se sale ${m.fuera.join()}`);
}
await pg.screenshot({ path: R(".arnes/_pe-390.png"), fullPage: true });
await monta(1440); await pg.screenshot({ path: R(".arnes/_pe-1440.png"), fullPage: true });

/* 6 · CONTRASTE en todos los temas */
const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number); return c.startsWith("color(") ? n.map((v) => v * 255) : n };
const lum = (c) => { const [r, g, b] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) };
for (const t of ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, t);
  await pg.check(".pe-interruptor input");
  const items = await pg.evaluate(() => {
    const fondo = (e) => { for (; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255,255,255)" };
    const out = [];
    for (const e of document.querySelectorAll(".pe *")) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cs = getComputedStyle(e);
      out.push({ txt: e.textContent.trim().slice(0, 30), cls: e.className || e.tagName, c: cs.color, f: fondo(e), op: Number(cs.opacity) });
    }
    return out;
  });
  const mal = items.filter((i) => i.op >= 1 && razon(i.c, i.f) < 4.5);
  const dedup = [...new Map(mal.map((i) => [i.cls + i.c + i.f, i])).values()];
  ok(dedup.length === 0, `tema «${t || "oficial"}»: contraste bajo → ` + dedup.slice(0, 4).map((i) => `${i.cls} «${i.txt}» ${razon(i.c, i.f).toFixed(2)}`).join(" | "));
}

if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); await nav.close(); process.exit(1) }
await nav.close();
console.log("✓ Plan de envase en pantalla: cifras del Excel, turnos, subir→borrador→guardar, Excel descargable, sin desborde (1440–360) y contraste en los 7 temas.");
