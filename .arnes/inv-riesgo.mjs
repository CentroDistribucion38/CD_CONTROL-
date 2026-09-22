/* =====================================================================
   INVENTARIO · RIESGO DE VENCIMIENTO
   1. Las cuentas (riesgo.ts): la foto toma el ÚLTIMO recorrido de cada
      ubicación (no suma dos recorridos), franjas, unidades, envases fuera.
   2. La pantalla (Riesgo.tsx): alertas que filtran, buscar, panel con las
      ubicaciones, PDF general y de un material, 1300/820/390/360, 7 temas.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

const js0 = buildSync({ entryPoints: [R("src/modulos/inventario/riesgo.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_riesgo.mjs"), js0);
const { medirRiesgo, franja } = await import(R(".arnes/_riesgo.mjs") + "?" + Date.now());

let n = 0;
const L = (o) => ({ id: "l" + ++n, conteo_id: o.c ?? "c2", conteo: o.c === "c1" ? "INV-001" : "INV-002", estado: "cerrado", codigo: o.sku ?? "P1",
  material: o.nom ?? "Águila Light 330 ml x 30", tipo_material: o.tipo ?? "PRODUCTO", familia: "Cerveza", factor_estibado: 80,
  ubicacion: o.u, calle: o.u?.[0] ?? null, modulo: o.u?.slice(1, 3) ?? null, lado: o.u?.endsWith("DER") ? "DER" : "IZQ",
  estibas: o.e ?? 1, cajas: o.cj ?? 0, saldo: 0, total_cajas: o.t ?? 80, total_estibas: 1, capacidad: 10,
  venc_dia: null, venc_mes: null, venc_anio: null, fab_dia: null, fab_mes: null, fab_anio: null, fabricacion: "2026-06-01",
  vencimiento: o.dv == null ? null : new Date(Date.now() + o.dv * 864e5).toISOString().slice(0, 10),
  dias_para_vencer: o.dv ?? null, dias_para_salir: o.ds ?? null, rotacion: null, averia: !!o.av, pnc: false, estado_envase: null,
  nota: o.nota ?? null, ubicacion_combinada: o.u, conto: "Génesis Visbal", contado_en: "2026-09-21T14:00:00Z", producto_id: "p", ubicacion_id: o.u ? "u-" + o.u : null });
const CONT = [
  { id: "c1", codigo: "INV-001", estado: "cerrado", bodega: "AG01", responsable: "A", fecha_analisis: "2026-09-15", enviado_en: "2026-09-15T20:00:00Z", envio_nombre: null, renglones: 3, ubicaciones: 3, total_cajas: 1 },
  { id: "c2", codigo: "INV-002", estado: "cerrado", bodega: "AG01", responsable: "B", fecha_analisis: "2026-09-21", enviado_en: "2026-09-21T20:00:00Z", envio_nombre: null, renglones: 9, ubicaciones: 9, total_cajas: 1 },
];
const LIN = [
  L({ c: "c1", u: "A01DER", ds: -3, dv: 5, t: 500 }),          // VIEJO: A01DER se volvió a contar en c2 → no cuenta
  L({ c: "c1", u: "Z09IZQ", ds: 40, dv: 70, t: 100, sku: "P3", nom: "Póker 330" }), // solo en c1 → sí cuenta
  L({ u: "A01DER", ds: -3, dv: 5, t: 80 }),
  L({ u: "A02DER", ds: -1, dv: -2, t: 40, av: true, nota: "Cartón mojado" }),   // vencido
  L({ u: "B01IZQ", ds: 4, dv: 12, t: 160 }),
  L({ u: "B02IZQ", ds: 10, dv: 18, t: 80, sku: "P2", nom: "Club Colombia Dorada 330" }),
  L({ u: "C01DER", ds: 22, dv: 30, t: 80, sku: "P2", nom: "Club Colombia Dorada 330" }),
  L({ u: "C02DER", ds: null, dv: null, t: 20, sku: "P4", nom: "Costeña 750" }),
  L({ u: "D01IZQ", tipo: "ENVASE", t: 999, sku: "E1", nom: "Canasta 30" }),
];
const UXC = { P1: 30, P2: 24, P3: 30 }; // P4 sin unidades por caja
const r = medirRiesgo(LIN, CONT, UXC);
ok(r.foto.length === 8, `foto: ${r.foto.length} renglones (8: el A01DER viejo fuera, Z09 dentro)`);
ok(r.totalCajas === 80 + 40 + 160 + 80 + 80 + 20 + 100, `total cajas ${r.totalCajas} (560, sin envases)`);
ok(r.franjas.vencido.cajas === 40 && r.franjas.pasado.cajas === 80 && r.franjas.semana.cajas === 160 && r.franjas.quince.cajas === 80 && r.franjas.mes.cajas === 80 && r.franjas.ok.cajas === 100 && r.franjas.sinfecha.cajas === 20, `franjas: ${JSON.stringify(Object.fromEntries(Object.entries(r.franjas).map(([k, v]) => [k, v.cajas])))}`);
ok(r.franjas.semana.unidades === 160 * 30 && r.franjas.sinfecha.sinUxc === 1, "unidades por caja mal");
const p1 = r.materiales.find((m) => m.codigo === "P1");
ok(r.materiales[0].codigo === "P1" && p1.franja === "vencido" && p1.sitios.length === 3 && p1.sitios[0].ubicacion === "A02DER", `P1: ${p1.franja} ${p1.sitios.map((s) => s.ubicacion)}`);
ok(p1.enRiesgoCajas === 280 && p1.enRiesgoUnidades === 280 * 30, `P1 en riesgo ${p1.enRiesgoCajas}`);
ok(r.semanas[0].cajas === 120 && r.semanas[1].cajas === 160 && r.semanas[2].cajas === 80, `semanas: ${r.semanas.map((s) => s.cajas)}`);
ok(r.recorridos === 2 && r.desde === "2026-09-15" && r.hasta === "2026-09-21", "recorridos/fechas");
ok(franja({ dias_para_vencer: 0, dias_para_salir: -5 }) === "pasado" && franja({ dias_para_vencer: 3, dias_para_salir: 7 }) === "semana", "franja límites");

/* ---------- PANTALLA ---------- */
writeFileSync(R(".arnes/_ir-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Riesgo } from "../src/app/(app)/inventario/Riesgo";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Riesgo r={w.RR} bodega="AG01" sinContar={w.SC} ultimo="INV-002" />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ir-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8") + readFileSync(R("src/app/(app)/inventario/riesgo.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
/* Una bodega más grande para ver la pantalla llena. */
let s = 5; const az = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const NOMS = ["Águila Original 330 ml x 30", "Águila Light 330 ml x 30", "Club Colombia Dorada 330", "Póker 330 ml x 30", "Costeña 750 ml x 12", "Pony Malta 1.5 L x 12", "BBC Cajicá Miel 330", "Corona Extra 355 ml x 24", "Stella Artois 330", "Budweiser 269 lata x 24", "Pony Malta 330 x 30", "Águila Cero 330"];
const GR = [];
NOMS.forEach((nom, i) => { const k = 2 + Math.floor(az() * 5); for (let j = 0; j < k; j++) { const ds = Math.round(az() * 70 - 12);
  GR.push(L({ sku: "M" + (100 + i), nom, u: "ABCDEFGH"[Math.floor(az() * 8)] + String(1 + Math.floor(az() * 30)).padStart(2, "0") + (az() < .5 ? "IZQ" : "DER"), ds, dv: ds + 8, t: 20 + Math.floor(az() * 300), av: az() < .08 })) } });
const RR = (() => { const { foto, ...x } = medirRiesgo(GR, CONT, Object.fromEntries(NOMS.map((_, i) => ["M" + (100 + i), i === 4 ? null : 24]))); return x })();

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ acceptDownloads: true });
const pg = await ctx.newPage();
await pg.route("https://control.prueba/**", (q) => q.request().url().endsWith(".png")
  ? q.fulfill({ status: 200, contentType: "image/png", body: readFileSync(R("public" + new URL(q.request().url()).pathname)) })
  : q.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }));
const monta = async (ancho, tema, rr = RR, sc = 7) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/inventario");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe" id="r"></div></main></div></div>
    <script>window.RR=${JSON.stringify(rr)};window.SC=${sc};</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".ir-duo");
};

await monta(1300);
ok((await pg.$$(".ir-frb")).length === 4, `no salen las 4 franjas de contexto: ${(await pg.$$(".ir-frb")).length}`);
ok(/VENCIDO|Vencido/.test(await pg.textContent(".ir-hero")), "el peor material no sale arriba, grande");
ok(/sin contar/.test(await pg.textContent(".ir-aviso")), "no avisa de lo que quedó sin contar");
const enRiesgo = (await pg.$$(".ir-m")).length;
await pg.click(".ir-frb.semana");
const soloV = await pg.$$eval(".ir-m", (x) => x.length);
ok(soloV > 0 && soloV <= enRiesgo && (await pg.$eval(".ir-frb.semana", (b) => b.getAttribute("aria-pressed"))) === "true", `la franja no filtra (${soloV} de ${enRiesgo})`);
await pg.click(".ir-chips button:has-text('Todos')");
ok((await pg.$$(".ir-m")).length === NOMS.length, `todos: ${(await pg.$$(".ir-m")).length}`);
await pg.fill(".ir-th input", "club");
ok((await pg.$$(".ir-m")).length === 1, "buscar no filtra");
await pg.fill(".ir-th input", "");
const u1 = await pg.textContent(".ir-frb.semana .v");
await pg.click(".ir-seg button:has-text('Unidades')");
ok((await pg.textContent(".ir-frb.semana .v")) !== u1 && /sin «unidades por caja»/.test(await pg.textContent(".ir")), "el cambio a unidades no cambia las cifras o no avisa de lo que falta");
await pg.click(".ir-seg button:has-text('Cajas')");
await pg.click(".ir-m >> nth=0");
const sitiosPanel = await pg.$$(".ir-s");
ok(sitiosPanel.length >= 2 && /Contó Génesis/.test(await pg.textContent(".ir-s")), "el panel no muestra las ubicaciones con quién contó");
if (process.env.FOTO) { await pg.waitForTimeout(400); await pg.screenshot({ path: `${process.env.FOTO}/ir-panel.png` }) }
const [d1] = await Promise.all([pg.waitForEvent("download", { timeout: 20000 }), pg.click(".ir-pp .ir-btn")]);
ok(/^riesgo-M\d+-\d{4}-\d{2}-\d{2}\.pdf$/.test(d1.suggestedFilename()), `PDF material: ${d1.suggestedFilename()}`);
await pg.keyboard.press("Escape");
ok(!(await pg.$(".ir-panel")), "Escape no cierra el panel");
const [d2] = await Promise.all([pg.waitForEvent("download", { timeout: 20000 }), pg.click(".ir-top .ir-btn")]);
const b2 = readFileSync(await d2.path());
ok(d2.suggestedFilename().startsWith("riesgo-vencimiento-AG01-") && b2.subarray(0, 4).toString() === "%PDF" && b2.length > 6000, `PDF general ${d2.suggestedFilename()} ${b2.length}`);
if (process.env.FOTO) {
  await monta(1300, "ambar");
  const [d3] = await Promise.all([pg.waitForEvent("download", { timeout: 20000 }), pg.click(".ir-top .ir-btn")]);
  writeFileSync(`${process.env.FOTO}/riesgo-ambar.pdf`, readFileSync(await d3.path()));
  await monta(1300);
  writeFileSync(`${process.env.FOTO}/riesgo.pdf`, b2); await pg.screenshot({ path: `${process.env.FOTO}/ir-1300.png`, fullPage: true }) }

for (const ancho of [1300, 820, 390, 360]) {
  await monta(ancho);
  for (const paso of ["lista", "panel"]) {
    if (paso === "panel") await pg.click(".ir-m >> nth=0");
    const g = await pg.evaluate((p) => {
      const raiz = document.querySelector(p === "panel" ? ".ir-panel" : ".ir").getBoundingClientRect();
      const fuera = [...document.querySelectorAll(p === "panel" ? ".ir-panel *" : ".ir *")].filter((e) => { const r = e.getBoundingClientRect();
        return r.width && !e.closest("svg") && (r.right > raiz.right + 1 || r.left < raiz.left - 1) }).map((e) => (e.className?.baseVal ?? e.className) + "").slice(0, 5);
      const chicos = [...document.querySelectorAll(".ir button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.height < 40 }).map((b) => b.className + ":" + b.textContent.slice(0, 20));
      return { lado: document.documentElement.scrollWidth - innerWidth, fuera, chicos };
    }, paso);
    ok(g.lado <= 0, `${ancho} ${paso}: la página se arrastra ${g.lado} px`);
    ok(!g.fuera.length, `${ancho} ${paso}: se sale ${g.fuera.join(", ")}`);
    ok(!g.chicos.length, `${ancho} ${paso}: botones chicos ${g.chicos}`);
  }
  if (process.env.FOTO && ancho === 390) { await pg.waitForTimeout(400); await pg.screenshot({ path: `${process.env.FOTO}/ir-390-panel.png` }); await pg.keyboard.press("Escape"); await pg.screenshot({ path: `${process.env.FOTO}/ir-390.png`, fullPage: true }) }
}

const lum = (c) => { const k = c.startsWith("color(srgb") ? 1 : 255; const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= k; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2] };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1300, t);
  await pg.click(".ir-m >> nth=0");
  const p = await pg.evaluate(() => {
    const fondo = (e) => { for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255,255,255)" };
    const par = (s) => { const e = document.querySelector(s); if (!e) return null; return [getComputedStyle(e).color, fondo(e)] };
    const o = {};
    for (const s of [".ir-o", ".ir-frase", ".ir-frase b.mal", ".ir-top h1", ".ir-seg button:not(.on)", ".ir-seg button.on", ".ir-btn", ".ir-ojo",
      ".ir-aviso b", ".ir-aviso span", ".ir-aviso .prog .t", ".ir-frb .k", ".ir-frb .s", ".ir-frb.pasado .v", ".ir-frb.semana .v", ".ir-frb.quince .v", ".ir-frb.mes .v",
      ".ir-hero-1 > span:not(.ir-pill)", ".ir-hero-2 .n", ".ir-hero-2 .meta", ".ir-hero-3 .k", ".ir-hero-3 .v", ".ir-hero-3 .v.mal", ".ir-hero-3 .ver",
      ".ir-bod .sub", ".ir-bod .l", ".ir-bod .l span",
      ".ir-h > span", ".ir-sem .x", ".ir-dice", ".ir-m .que small", ".ir-m .dato small", ".ir-m .dato b",
      ".ir-pill.vencido", ".ir-pill.pasado", ".ir-pill.semana", ".ir-pill.quince", ".ir-pill.mes", ".ir-pill.ok",
      ".ir-pc p", ".ir-pk small", ".ir-pk span", ".ir-s .donde", ".ir-s dt", ".ir-s dd", ".ir-s .quien", ".ir-s .t", ".ir-chips button:not(.on)"]) o[s] = par(s);
    return o;
  });
  for (const [k, v] of Object.entries(p)) if (v) ok(razon(v[0], v[1]) >= 4.5, `tema ${t ?? "oficial"}: «${k}» ${razon(v[0], v[1]).toFixed(2)} (${v[0]} / ${v[1]})`);
}
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Riesgo de vencimiento: el peor arriba con su ubicación, el aro de la bodega, las franjas que filtran, unidades, panel con ubicaciones, 2 PDF, 4 anchos y 7 temas.");
