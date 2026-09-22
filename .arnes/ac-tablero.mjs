/* =====================================================================
   ACCIONES · TABLERO — el del arranque de turno, en Chromium.
   13 vencidas (3 sin dueño) y áreas: frase de arriba, cifras, filtros por
   dueño, histograma por días, «Reportar» lanza el evento; 1300 · 820 ·
   390 · 360 sin salirse; contraste ≥ 4.5 en los siete temas.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_at-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Tablero } from "../src/app/(app)/acciones/tablero/Tablero";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Tablero acciones={w.ACC} areas={w.AR} nombres={w.NOM} meta={90} puedeReportar />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_at-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/acciones/acciones.css"), "utf8") + readFileSync(R("src/app/(app)/acciones/tablero/tablero.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const D = 86_400_000, ahora = Date.now();
let n = 0;
const A = (o) => {
  const vence = ahora - (o.d ?? -1) * D - 3_600_000;
  const viva = o.estado ? ["abierta", "reabierta"].includes(o.estado) : true;
  return { id: "a" + ++n, codigo: "AC-" + String(100 + n), tipo: "correctiva", titulo: o.t ?? "Derrame de producto en pasillo " + n, descripcion: null,
    motivo: "m", motivo_nombre: "m", motivo_critico: false, area: o.area ?? "alm", area_nombre: o.an ?? "Almacén", zona: null, zona_nombre: null,
    zona_proceso: null, ubicacion: null, lat: null, lng: null, precision_m: null, prioridad: o.p ?? "media", plazo: null,
    vence_en: new Date(vence).toISOString(), estado: o.estado ?? "abierta", viva, vencida: viva && vence < ahora,
    horas_restantes: (vence - ahora) / 3_600_000, dias: 0, equipo: o.eq ?? null, equipo_nombre: o.eq ?? null, responsable: o.r ?? null,
    sin_dueno: !o.r && !o.eq, asignada_por: null, asignada_en: null, reportada_por: null, reportada_en: new Date(ahora - 20 * D).toISOString(),
    que_se_hizo: null, cerrada_por: null, cerrada_en: null, efectiva: o.ef ?? null, nota_verificacion: null, verificada_por: null,
    verificada_en: null, auto_verificada: false, causa_raiz: null };
};
const ACC = [
  A({ d: 16, r: "p1", p: "alta" }), A({ d: 12, t: "Estiba mal armada, riesgo de caída de canastas en la calle 4 del patio", r: "p2" }), A({ d: 11 }),
  A({ d: 9, r: "p1" }), A({ d: 8, eq: "Easy Logística" }), A({ d: 7 }), A({ d: 7, r: "p3", p: "alta" }), A({ d: 5, r: "p2" }),
  A({ d: 3, r: "p1" }), A({ d: 2, eq: "Easy Logística" }), A({ d: 2 }), A({ d: 1, r: "p3" }), A({ d: 0.2, r: "p2" }),
  A({ d: -0.06, r: "p1" }), A({ d: -5 }),
  A({ estado: "verificada", ef: true }), A({ estado: "verificada", ef: true }), A({ estado: "verificada", ef: false }),
  A({ estado: "verificada", ef: true }), A({ estado: "verificada", ef: true }), A({ estado: "cerrada" }), A({ estado: "cerrada" }),
];
const sinDueno = ACC.filter((a) => a.vencida && !a.responsable && !a.equipo_nombre).length;
const venc = ACC.filter((a) => a.vencida).length;
const NOM = { p1: "Génesis Visbal", p2: "Santiago Leal", p3: "Ana María Pérez" };
const AR = [
  { area: "alm", area_nombre: "Almacén", orden: 1, total: 20, abiertas: 5, vencidas: 3, verificadas: 10, efectivas: 9, pct: 90 },
  { area: "dis", area_nombre: "Distribución", orden: 2, total: 9, abiertas: 2, vencidas: 1, verificadas: 6, efectivas: 4, pct: 67 },
  { area: "seg", area_nombre: "Seguridad", orden: 3, total: 2, abiertas: 1, vencidas: 0, verificadas: 0, efectivas: 0, pct: null },
  { area: "tra", area_nombre: "Transporte", orden: 4, total: 2, abiertas: 0, vencidas: 0, verificadas: 1, efectivas: 1, pct: 100 },
];

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.route("https://control.prueba/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }));
const monta = async (ancho, tema, acc = ACC) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/acciones/tablero");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="ac" id="r"></div></main></div></div>
    <script>window.ACC=${JSON.stringify(acc)};window.AR=${JSON.stringify(AR)};window.NOM=${JSON.stringify(NOM)};</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".at-kpis");
};

await monta(1300);
const frase = await pg.textContent(".at-frase");
ok(frase.includes(`${venc} vencidas`) && frase.includes(`${sinDueno} no tienen responsable`) && /lleva 16 días/.test(frase), `frase: «${frase}»`);
ok((await pg.$$(".at-v")).length === venc, `lista: ${(await pg.$$(".at-v")).length} (van ${venc})`);
ok((await pg.$$eval(".at-v .cod", (c) => c.map((x) => x.textContent)))[0] === "AC-101", "la más vieja no va arriba");
ok((await pg.textContent(".at-k:nth-child(4) .n")).trim() === "80%", `efectividad: ${await pg.textContent(".at-k:nth-child(4) .n")} (4 de 5)`);
ok(/2 cerradas sin verificar/.test(await pg.textContent(".at-k:nth-child(4)")), "no dice cuántas cerradas faltan por verificar");
ok((await pg.textContent(".at-k:nth-child(3) .n")).trim() === "1", `vencen hoy: ${await pg.textContent(".at-k:nth-child(3) .n")} (1)`);
await pg.click(".at-chips button.sin");
ok((await pg.$$(".at-v")).length === sinDueno && (await pg.$$(".at-v .at-quien.sin")).length === sinDueno, "«Sin asignar» no filtra");
await pg.click(".at-chips button:has-text('Génesis')");
ok((await pg.$$(".at-v")).length === 3, `Génesis: ${(await pg.$$(".at-v")).length} (3)`);
ok((await pg.$$(".at-chips button")).length === 6, `chips: ${(await pg.$$(".at-chips button")).length} (todas, sin, 4 dueños)`);
await pg.click(".at-chips button.todas");
const hist = await pg.$$eval(".at-hist .col", (c) => c.map((x) => [x.querySelector(".x").textContent, x.querySelector("b")?.textContent ?? "0"]));
ok(hist.length === 14 && hist.at(-1)[0] === "14+" && hist.at(-1)[1] === "1", `histograma: ${JSON.stringify(hist)}`);
ok(hist.reduce((s, h) => s + +h[1], 0) === venc, "el histograma no suma las vencidas");
ok(/de las 13/.test(await pg.textContent(".at-dice")), "no dice el resumen del histograma");
ok((await pg.$$(".at-ar")).length === 4 && (await pg.$$(".at-ar.bien")).length === 1 && (await pg.$$(".at-ar.mal")).length === 1 && (await pg.$$(".at-ar.nd")).length === 2 && /1 de 5 para medir/.test(await pg.textContent(".at-areas")), "áreas: bien / mal / sin verificar / pocas (1 de 1 no es 100 %)");
await pg.evaluate(() => { window.__rep = 0; addEventListener("ac:reportar", () => window.__rep++) });
await pg.click(".at-btn:has-text('Reportar')");
ok((await pg.evaluate(() => window.__rep)) === 1, "«Reportar» no avisa a la barra");
if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/at-1300.png`, fullPage: true });

await monta(1300, null, ACC.filter((a) => !(a.estado === "verificada" && a.efectiva === false)).filter((a, i, l) => a.estado !== "verificada" || l.filter((x) => x.estado === "verificada").indexOf(a) < 1));
ok((await pg.textContent(".at-k:nth-child(4) .n")).trim() === "—" && /1 verificada · faltan 4 para medir/.test(await pg.textContent(".at-k:nth-child(4)")), `con 1 verificada sale ${await pg.textContent(".at-k:nth-child(4)")}`);
await monta(1300, null, ACC.filter((a) => !a.vencida));
ok(/Ninguna vencida/.test(await pg.textContent(".at-frase")) && !(await pg.$(".at-chips")), "sin vencidas no queda limpio");

for (const ancho of [1300, 820, 390, 360]) {
  await monta(ancho);
  const g = await pg.evaluate(() => {
    const cont = document.querySelector(".at").getBoundingClientRect();
    const fuera = [...document.querySelectorAll(".at *")].filter((e) => { const r = e.getBoundingClientRect();
      return r.width && !e.closest("svg") && (r.right > cont.right + 1 || r.left < cont.left - 1) }).map((e) => (e.className?.baseVal ?? e.className) + "").slice(0, 5);
    const chicos = [...document.querySelectorAll(".at button")].filter((b) => b.getBoundingClientRect().height < 36).map((b) => b.textContent);
    return { lado: document.documentElement.scrollWidth - innerWidth, fuera, chicos };
  });
  ok(g.lado <= 0, `${ancho} px: la página se arrastra ${g.lado} px`);
  ok(!g.fuera.length, `${ancho} px: se sale ${g.fuera.join(", ")}`);
  ok(!g.chicos.length, `${ancho} px: botones chicos: ${g.chicos}`);
  if (process.env.FOTO && ancho === 390) await pg.screenshot({ path: `${process.env.FOTO}/at-390.png`, fullPage: true });
}

const lum = (c) => { const k = c.startsWith("color(srgb") ? 1 : 255; const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= k; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2] };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1300, t);
  const p = await pg.evaluate(() => {
    const fondo = (e) => { for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255,255,255)" };
    const par = (s) => { const e = document.querySelector(s); if (!e) return null; return [getComputedStyle(e).color, fondo(e)] };
    return { "rótulo": par(".at-o"), "frase": par(".at-frase"), "roja": par(".at-frase b.mal"), "título": par(".at-top h1"), "reloj": par(".at-reloj span"),
      "botón": par(".at-btn:not(.sec)"), "botón sec": par(".at-btn.sec"), "cifra roja": par(".at-k.mal .n"), "pie kpi": par(".at-k .s"), "sin verificar": par(".at-k .s.pend"),
      "chip": par(".at-chips button:not(.on):not(.sin)"), "chip sin": par(".at-chips button.sin"), "chip on": par(".at-chips button.on"),
      "código": par(".at-v .cod"), "área": par(".at-v .que small"), "sin asignar": par(".at-v .at-quien.sin"), "días r": par(".at-v .dd.r b"),
      "días n": par(".at-v .dd.n b"), "días a": par(".at-v .dd.a b"), "eje": par(".at-hist .x"), "dice": par(".at-dice"),
      "área pct bien": par(".at-ar.bien .at-fila span"), "área pct mal": par(".at-ar.mal .at-fila span"), "nd": par(".at-ar.nd .at-fila span"), "pie área": par(".at-ar small") };
  });
  for (const [k, v] of Object.entries(p)) if (v) ok(razon(v[0], v[1]) >= 4.5, `tema ${t ?? "oficial"}: «${k}» ${razon(v[0], v[1]).toFixed(2)} (${v[0]} / ${v[1]})`);
}
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Tablero de acciones: frase, cifras, filtros por dueño, histograma, Reportar, 4 anchos y 7 temas.");
