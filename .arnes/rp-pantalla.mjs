/* RÓTULOS DEL PLAN — la pantalla con la semana 34 real y una base de mentira.
   Mide: cuánto se planea por bloque (= la tabla del plan), imprimir anota y cuenta, lo de más es ADICIONAL,
   reimprimir pide motivo y no cambia lo impreso, filtros, sin permiso, sin SQL, desborde y contraste.
     node .arnes/rp-pantalla.mjs */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const require = createRequire(import.meta.url);
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => { fallas.forEach((x) => console.log("✗ " + x)); console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e)); process.exit(1) };
process.on("uncaughtException", caerse); process.on("unhandledRejection", caerse);
mkdirSync(R(".arnes/tmp"), { recursive: true });

const XLSX = require("xlsx");
writeFileSync(R(".arnes/tmp/_plan-envase.cjs"), buildSync({ entryPoints: [R("src/modulos/inventario/plan-envase.ts")], bundle: true, write: false, format: "cjs", logLevel: "silent" }).outputFiles[0].text);
const PL = require(R(".arnes/tmp/_plan-envase.cjs"));
const semanas = PL.leerPlanEnvase(XLSX.readFile(R(".arnes/datos/instructivo-envase-2026-08-21.xlsx")));
const fac = []; const mats = [];
for (const ln of readFileSync(R("supabase/datos/inventario-maestro-cd38.sql"), "utf8").split("\n")) {
  const m = /^\s*\('([^']+)', '([^']*)', '[^']*', (\d+|null), (\d+|null)/.exec(ln);
  if (m) { fac.push([m[1], { nombre: m[2], cajas_por_estiba: m[4] === "null" ? null : Number(m[4]) }]);
    mats.push({ sku: m[1], nombre: m[2], unidades_por_caja: 30, cajas_por_estiba: m[4] === "null" ? null : Number(m[4]), unidades_por_estiba: null, vida_util: 180, dias_minimo: 30, pat_largo: null, pat_ancho: null, pat_nivel: null }) }
}
const guardadas = semanas.filter((s) => [34, 35].includes(s.semana)).sort((a, b) => b.semana - a.semana).map((s, i) => ({ id: "id" + i, anio: s.anio, semana: s.semana, fecha_ini: s.fecha_ini, fecha_fin: s.fecha_fin, escenario: s.escenario, generado: s.generado, archivo: "I.xlsx", cargado_en: "2026-08-21T10:00:00Z", pendientes: s.pendientes, bloques: s.bloques }));
const v34 = PL.vistaSemana(semanas.find((s) => s.semana === 34), new Map(fac));

writeFileSync(R(".arnes/_rp-pant.tsx"), `
import { createRoot } from "react-dom/client";
import { RotulosPlan } from "../src/app/(app)/inventario/recibir/RotulosPlan";
const q = new URLSearchParams(location.hash.slice(1));
createRoot(document.getElementById("r")!).render(<RotulosPlan guardadas={(q.get("vacio") ? [] : ${JSON.stringify(guardadas)}) as any} factores={${JSON.stringify(fac)} as any} materiales={${JSON.stringify(mats)} as any} puedeImprimir={!q.get("solover")} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_rp-pant.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_supa-rp.ts"), "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text.replace(/<!--/g, "<\\!--").replace(/<\/script/gi, "<\\/script");
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css", "src/app/(app)/inventario/recibir/plan-envase.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const rotos = []; pg.on("pageerror", (e) => rotos.push(e.message));
const monta = async (ancho = 1440, tema = "", hash = "", espera = ".fe .pe") => {
  await pg.goto("about:blank"); await pg.setViewportSize({ width: ancho, height: 1100 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${P}${css}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div><script>history.replaceState(null,"","#${hash}");window.__abiertas=0;window.open=()=>{window.__abiertas++;return null};new MutationObserver(()=>{const f=document.querySelector('.vp-marco');if(f&&f.src&&f.src!==window.__ultimo){window.__ultimo=f.src;fetch(f.src).then(r=>r.arrayBuffer()).then(b=>{const t=new TextDecoder('latin1').decode(b);(window.__pag||(window.__pag=[])).push((t.match(/\\/Type\\s*\\/Page[^s]/g)||[]).length);(window.__pdfs||(window.__pdfs=[])).push(f.src)})}}).observe(document.documentElement,{childList:true,subtree:true,attributes:true})</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(espera, { timeout: 8000 }).catch(async () => { throw new Error("no montó: " + rotos.join(" | ")) });
};
const num = (t) => Number(String(t).replace(/\./g, "").replace(",", "."));
const paginas = async () => pg.evaluate(() => window.__pag.at(-1));
const cerrarVisor = async () => { await pg.click(".vp button:has-text('Cerrar')"); await pg.waitForSelector(".vp", { state: "detached" }) };
const fila = (txt) => pg.locator(".pe-tabla").first().locator("tbody tr", { hasText: txt });
const celdas = async (loc) => (await loc.first().locator("td, th").allTextContents()).map((t) => t.trim());
const kpi = async (t) => num(await pg.locator(".pe-kpi", { hasText: t }).locator("b").textContent());

console.log("paso 1");
/* 1 · LO QUE SE PLANEA ES LO QUE MUESTRA LA TABLA DEL PLAN */
await monta();
ok(rotos.length === 0, "error de página: " + rotos[0]);
ok(/Semana 35/.test(await pg.textContent(".pe-semanas")) && /Semana 34/.test(await pg.textContent(".pe-semanas")), "faltan las semanas");
await pg.click(".pe-sem:has-text(\"Semana 34\")");
const vie = "2026-08-21";
const filas0 = await pg.locator(".pe-tabla").first().locator("tbody tr").count();
const planVie = v34.skus.reduce((a, f) => a + (f.porDia[vie]?.total ?? 0), 0);
ok(await pg.getAttribute(".pe-medida[aria-checked=true] >> nth=0", "aria-checked") === "true", "");
ok(await kpi("Estibas planeadas") === planVie, `plan del viernes en pantalla ${await kpi("Estibas planeadas")}, en el plan ${planVie}`);
ok(filas0 === v34.skus.reduce((a, f) => a + [0, 1, 2].filter((k) => (f.porDia[vie]?.t[k] ?? 0) > 0).length, 0), "filas del viernes: " + filas0);
const c1 = await celdas(fila("Costeñita").nth(0));
ok(c1.join(" ").includes("T1") && c1.includes("181") && c1.includes("Imprimir"), "Costeñita T1 plan 181: " + c1.join("|"));
ok(await kpi("Rótulos impresos") === 0 && await kpi("Adicionales") === 0, "empieza con algo impreso");

console.log("paso 2");
/* 2 · IMPRIMIR UN BLOQUE ANOTA Y CUENTA */
await pg.locator(".pe-tabla").first().locator("tbody tr", { hasText: "Costeñita" }).nth(0).locator("button:has-text('Imprimir')").click();
await pg.waitForFunction(() => (window.__pdfs || []).length >= 1, null, { timeout: 60000 });
await pg.waitForSelector(".vp"); await pg.waitForFunction(() => (window.__pag || []).length >= (window.__pdfs || []).length);
await cerrarVisor();
let r1 = await pg.evaluate(() => window.__rpc.find((x) => x.n === "rotulos_plan_imprimir").a);
ok(r1.p_cantidad === 181 && r1.p_planeadas === 181 && r1.p_cajas === 54 && r1.p_sap === "3617" && r1.p_turno === 1 && r1.p_fecha === vie && r1.p_tren === "TREN-1", "lo que se mandó a la base: " + JSON.stringify(r1));
ok(await paginas() === 181, "el PDF trae " + await paginas() + " páginas y eran 181");
await pg.waitForFunction(() => document.querySelector(".pe-kpi:nth-child(2) b")?.textContent !== "0");
ok(await kpi("Rótulos impresos") === 181, "impresos: " + await kpi("Rótulos impresos"));
ok((await celdas(fila("Costeñita").nth(0))).includes("Listo"), "el bloque no queda en «Listo»");
ok(await kpi("Faltan por imprimir") === planVie - 181, "faltan: " + await kpi("Faltan por imprimir"));
ok(/Impresión/.test(await pg.textContent(".pe-t ~ .pe-tabla")), "no sale en «Lo que se imprimió»");

console.log("paso 3");
/* VOLVER A ABRIR: la misma impresión otra vez, sin anotar nada nuevo */
{
  const antes = await pg.evaluate(() => window.__rpc.filter((x) => x.n === "rotulos_plan_imprimir").length);
  await pg.locator(".pe-t ~ .pe-tabla tbody tr", { hasText: "Costeñita" }).first().locator("button:has-text('Volver a abrir')").click();
  await pg.waitForFunction(() => (window.__pdfs || []).length >= 2 && (window.__pag || []).length >= 2);
  ok(await paginas() === 181, "«Volver a abrir» trae " + await paginas() + " páginas y eran 181");
  await cerrarVisor();
  ok(await pg.evaluate(() => window.__rpc.filter((x) => x.n === "rotulos_plan_imprimir").length) === antes, "«Volver a abrir» anotó impresiones nuevas");
  ok(await kpi("Rótulos impresos") === 181, "«Volver a abrir» cambió los impresos");
}

/* 3 · UNA TANDA A MEDIAS: la siguiente sigue la numeración */
const aguila = pg.locator(".pe-tabla").first().locator("tbody tr", { hasText: "BACANA BR" }).nth(0);
const planA = num((await celdas(aguila))[3]);
await aguila.locator("input").fill("5");
await aguila.locator("button:has-text('Imprimir')").click();
await pg.waitForFunction(() => (window.__pdfs || []).length >= 3);
await pg.waitForSelector(".vp"); await pg.waitForFunction(() => (window.__pag || []).length >= (window.__pdfs || []).length);
ok(await paginas() === 5, "PDF de 5: " + await paginas());
await cerrarVisor();
await pg.waitForFunction((n) => [...document.querySelectorAll(".pe-tabla tbody tr")].some((t) => /BACANA BR/.test(t.textContent) && t.textContent.includes(String(n))), planA - 5);
const ca = await celdas(pg.locator(".pe-tabla").first().locator("tbody tr", { hasText: "BACANA BR" }).nth(0));
ok(num(ca[4]) === 5 && num(ca[5]) === planA - 5, `BACANA BR impresos/faltan: ${ca.join("|")}`);
const resto = planA - 5;
await pg.locator(".pe-tabla").first().locator("tbody tr", { hasText: "BACANA BR" }).nth(0).locator("button:has-text('Imprimir')").click();
await pg.waitForFunction(() => (window.__pdfs || []).length >= 4, null, { timeout: 60000 });
await pg.waitForSelector(".vp"); await pg.waitForFunction(() => (window.__pag || []).length >= (window.__pdfs || []).length);
await cerrarVisor();
const r3 = await pg.evaluate(() => window.__rpc.filter((x) => x.n === "rotulos_plan_imprimir").at(-1).a);
ok(r3.p_cantidad === resto, "la tanda siguiente imprime el resto: " + r3.p_cantidad + " vs " + resto);
const fol = await pg.evaluate(() => window.__filas.filter((r) => r.sap === "13451" && r.fecha === "2026-08-21").map((r) => r.numero));
ok(fol.length > 0 && Math.min(...fol) === 1 && Math.max(...fol) === fol.length && new Set(fol).size === fol.length, "numeración continua sin repetidos: " + fol.length);

console.log("paso 4");
/* 4 · LO DE MÁS ES ADICIONAL */
const costT2 = pg.locator(".pe-tabla").first().locator("tbody tr", { hasText: "Costeñita" }).nth(1);
await costT2.locator("button:has-text('Imprimir')").click();
console.log("  4.3 ok");
await pg.waitForFunction(() => (window.__pdfs || []).length >= 5, null, { timeout: 60000 });
await pg.waitForSelector(".vp"); await pg.waitForFunction(() => (window.__pag || []).length >= (window.__pdfs || []).length);
await cerrarVisor();
console.log("  4.4 ok");
await pg.waitForFunction(() => [...document.querySelectorAll(".pe-tabla tbody tr")].filter((t) => /Costeñita/.test(t.textContent) && t.textContent.includes("Listo")).length >= 2);
console.log("  4.5 ok");
const t1 = pg.locator(".pe-tabla").first().locator("tbody tr", { hasText: "Costeñita" }).nth(0);
await t1.locator("input").fill("3");
console.log("  4.7 ok");
await t1.locator("button:has-text('Imprimir')").click();
console.log("  4.8 ok");
await pg.waitForFunction(() => (window.__pdfs || []).length >= 6);
await pg.waitForSelector(".vp"); await pg.waitForFunction(() => (window.__pag || []).length >= (window.__pdfs || []).length);
await cerrarVisor();
console.log("  4.9 ok");
const ad = await pg.evaluate(() => window.__filas.filter((r) => r.sap === "3617" && r.turno === 1 && r.tipo === "adicional").map((r) => r.numero));
ok(ad.join() === "182,183,184", "adicionales: " + ad);
await pg.waitForFunction(() => /Adicionales\s*3$/.test([...document.querySelectorAll(".pe-kpi")].find((k) => /Adicionales/.test(k.textContent))?.textContent ?? ""));
console.log("  4.12 ok");
ok(await kpi("Adicionales") === 3, "KPI adicionales");

console.log("paso 5");
/* 5 · REIMPRIMIR: pide motivo, no cambia lo impreso, el PDF trae solo esos */
const antes = await kpi("Rótulos impresos");
await pg.locator(".pe-t ~ .pe-tabla tbody tr", { hasText: "BACANA BR" }).first().locator("button:has-text('Reimprimir')").click();
ok(await pg.isVisible(".rp-reimp select"), "no abre el formulario de reimpresión");
await pg.locator(".rp-reimp input").nth(0).fill("1"); await pg.locator(".rp-reimp input").nth(1).fill("2");
await pg.selectOption(".rp-reimp select", "Perdido");
await pg.click(".rp-reimp button:has-text('Reimprimir')");
await pg.waitForFunction(() => (window.__pdfs || []).length >= 7);
await pg.waitForSelector(".vp"); await pg.waitForFunction(() => (window.__pag || []).length >= (window.__pdfs || []).length);
ok(await paginas() === 2, "reimpresión de 2: " + await paginas());
await cerrarVisor();
const rr = await pg.evaluate(() => window.__rpc.find((x) => x.n === "rotulos_plan_reimprimir_rango").a);
ok(rr.p_motivo === "Perdido" && rr.p_desde === 1 && rr.p_hasta === 2 && rr.p_sap === "13451", "reimpresión mandada: " + JSON.stringify(rr));
await pg.waitForFunction(() => /Reimpresión · Perdido/.test(document.body.textContent));
ok(await kpi("Rótulos impresos") === antes, "reimprimir cambió los impresos");
ok(await kpi("Reimpresos") === 2, "KPI reimpresos: " + await kpi("Reimpresos"));
await pg.locator(".pe-t ~ .pe-tabla tbody tr", { hasText: "BACANA BR" }).first().locator("button:has-text('Reimprimir')").click();
await pg.locator(".rp-reimp input").nth(0).fill("9"); await pg.locator(".rp-reimp input").nth(1).fill("3");
await pg.click(".rp-reimp button:has-text('Reimprimir')");
await pg.waitForSelector("text=final no puede ser menor");

console.log("paso 6");
/* 6 · FILTROS */
await pg.click(".pe-medida:has-text('T2')");
const rowsT2 = await pg.locator(".pe-tabla").first().locator("tbody tr").allTextContents();
ok(rowsT2.length > 0 && rowsT2.every((t) => /T2/.test(t)), "el filtro de turno deja pasar otros turnos");
await pg.click(".pe-medida:has-text('Todos')");
await pg.click(".pe-medida:has-text('Tren 2')");
const rowsL = await pg.locator(".pe-tabla").first().locator("tbody th[scope=row]").allTextContents();
ok(rowsL.filter(Boolean).every((t) => t === "TREN-2"), "el filtro de línea deja pasar otras líneas: " + rowsL);
await pg.click(".pe-medida:has-text('Todas')");
/* día sin envase está apagado */
ok(await pg.isDisabled(".pe-medida:has-text('Lun 17')"), "un día sin envase se puede escoger");

console.log("paso 7");
/* 7 · «IMPRIMIR LO QUE FALTA» saca lo pendiente del filtro, con tope */
await monta(1440, "", "");
await pg.click(".pe-sem:has-text('Semana 34')");
const btn = await pg.textContent(".pe-fila .btn");
ok(/Imprimir lo que falta \(400\)/.test(btn), "con 3.194 pendientes el tope es 400: " + btn);
await pg.click(".pe-medida:has-text('T1')"); await pg.click(".pe-medida:has-text('Tren 2')");
const btn2 = await pg.textContent(".pe-fila .btn");
const pend2 = v34.skus.filter((f) => f.tren === "TREN-2").reduce((a, f) => a + (f.porDia[vie]?.t[0] ?? 0), 0);
ok(new RegExp(`\\(${pend2}\\)`).test(btn2.replace(/\./g, "")), `el botón dice «${btn2}» y faltan ${pend2}`);
await pg.click(".pe-fila .btn");
await pg.waitForFunction(() => (window.__pdfs || []).length >= 1, null, { timeout: 90000 });
await pg.waitForSelector(".vp"); await pg.waitForFunction(() => (window.__pag || []).length >= (window.__pdfs || []).length);
ok(await paginas() === pend2, `PDF de todo lo que falta: ${await paginas()} y eran ${pend2}`);
await cerrarVisor();

console.log("paso 8");
/* EL PDF SE VE DENTRO DE LA PANTALLA: sin pestañas nuevas (la app instalada y el celular las bloquean), con vista previa, imprimir y descargar. */
ok(await pg.evaluate(() => window.__abiertas) === 0, "abrió una pestaña nueva en vez de mostrar el PDF dentro de la pantalla");
await monta(1440, "", "");
await pg.click(".pe-sem:has-text('Semana 34')");
await pg.locator(".pe-tabla").first().locator("tbody tr", { hasText: "Poker" }).first().locator("button:has-text('Imprimir')").click();
await pg.waitForSelector(".vp iframe[src^='blob:']", { timeout: 90000 });
ok(await pg.isVisible(".vp button:has-text('Imprimir')") && await pg.isVisible(".vp a:has-text('Descargar PDF')") && await pg.isVisible(".vp button:has-text('Cerrar')"), "el visor no trae Imprimir, Descargar y Cerrar");
const [desc] = await Promise.all([pg.waitForEvent("download", { timeout: 15000 }).catch(() => null), pg.click(".vp a:has-text('Descargar PDF')")]);
/* El nombre del archivo lo ignora una página en about:blank; en la app real lo pone el atributo download. */
ok(!!desc, "Descargar PDF no baja nada");
await pg.keyboard.press("Escape");
await pg.waitForSelector(".vp", { state: "detached" });

/* 8 · SIN PERMISO, SIN SQL, SIN PLAN */
await monta(1440, "", "solover=1");
ok((await pg.locator(".pe-tabla button:has-text('Imprimir')").count()) > 0 && await pg.locator(".pe-tabla button:has-text('Imprimir')").evaluateAll((b) => b.every((x) => x.disabled)), "sin permiso se puede imprimir");
ok(!(await pg.$(".pe-fila .btn")), "sin permiso sale el botón de imprimir todo");
await monta(1440, "", "sinsql=1", ".fe .sin-tablas");
await pg.waitForSelector("text=Falta preparar los rótulos del plan");
await monta(1440, "", "vacio=1");
ok(/Todavía no hay ningún plan guardado/.test(await pg.textContent(".pe")), "sin plan no lo dice");

console.log("paso 9");
/* 9 · NADA SE SALE */
for (const w of [1440, 1024, 768, 390, 360]) {
  await monta(w);
  const m = await pg.evaluate(() => ({ doc: document.documentElement.scrollWidth, ven: innerWidth }));
  ok(m.doc <= m.ven + 1, `${w}px: la página se desborda (${m.doc} > ${m.ven})`);
}
await monta(390); await pg.screenshot({ path: R(".arnes/_rp-390.png"), fullPage: true });
await monta(1440); await pg.screenshot({ path: R(".arnes/_rp-1440.png"), fullPage: true });

console.log("paso 10");
/* 10 · CONTRASTE */
const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number); return c.startsWith("color(") ? n.map((v) => v * 255) : n };
const lum = (c) => { const [r, g, b] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) };
for (const t of ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1440, t);
  const items = await pg.evaluate(() => {
    const fondo = (e) => { for (; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255,255,255)" };
    const out = [];
    for (const e of document.querySelectorAll(".pe *")) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cs = getComputedStyle(e);
      out.push({ txt: e.textContent.trim().slice(0, 30), cls: e.className || e.tagName, c: cs.color, f: fondo(e), op: Number(cs.opacity), dis: e.closest("button,input")?.disabled });
    }
    return out;
  });
  const mal = items.filter((i) => i.op >= 1 && !i.dis && razon(i.c, i.f) < 4.5);
  const dedup = [...new Map(mal.map((i) => [i.cls + i.c + i.f, i])).values()];
  ok(dedup.length === 0, `tema «${t || "oficial"}»: contraste bajo → ` + dedup.slice(0, 4).map((i) => `${i.cls} «${i.txt}» ${razon(i.c, i.f).toFixed(2)}`).join(" | "));
}

if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); await nav.close(); process.exit(1) }
await nav.close();
console.log("✓ Rótulos del plan: lo planeado es lo de la tabla del plan, imprimir anota y cuenta, lo de más queda adicional, reimprimir pide motivo, filtros, permisos, sin desborde y contraste en los 7 temas.");
