/* =====================================================================
   FACTURACIÓN · DEPURAR (solo quien administra) y el CÓDIGO del viaje.
   Sin permiso no hay casillas; con permiso: marcar, «seleccionar todos»,
   la barra de abajo, motivo obligatorio, eliminar pregunta otra vez y
   llama a traspaso_depurar con los ids y la acción. 1200/390/360, 7 temas.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
ok(/puedeDepurar=\{permisos\.manda\}/.test(readFileSync(R("src/app/(app)/traspasos/facturacion/page.tsx"), "utf8")), "depurar no queda solo para quien administra");
ok(/if not public\.manda\(\)/.test(readFileSync(R("supabase/migraciones/2026-09-traspasos-depurar.sql"), "utf8")), "la base no pone el candado de manda()");

writeFileSync(R(".arnes/_fd-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Bandeja } from "../src/app/(app)/traspasos/facturacion/Bandeja";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Bandeja pendientes={w.P} salieron={w.S} nombres={{ u1: "Santiago Leal" }} puedeConfirmar puedeReabrir={w.D} puedeDepurar={w.D} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_fd-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_sb-graba.js"), "next/navigation": R(".arnes/stub-nav.js"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/traspasos/traspasos.css", "src/app/(app)/traspasos/facturacion/facturacion.css"].map((f) => readFileSync(R(f), "utf8")).join("\n");
const viaje = (id, extra) => ({ id, codigo: "TP-00" + id, fecha: "2026-09-21", turno: "A", turno_orden: 1, tipo: "pet", tipo_nombre: "Plástico",
  placa: "NLW42" + id, documento: null, origen_nombre: "BODEGA 38", destino_nombre: "CARNAVAL", viajes: 1, vacio: false, carga: null, unidad: null,
  hora: "2026-09-21T11:00:00Z", registrado_por: "u1", estado: "registrado", factura_documento: null, salida_en: null, salida_nombre: null, por_facturar: true, ...extra });
const P = [1, 2, 3, 4].map((i) => viaje(String(i)));
const S = [viaje("9", { factura_documento: "7687019429", salida_en: "2026-09-21T16:00:00Z", salida_nombre: "Fanny" })];

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ancho, depura = true, tema = null) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div id="r"></div></main></div></div>
    <script>window.P=${JSON.stringify(P)};window.S=${JSON.stringify(S)};window.D=${depura};</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".fc-viaje");
};

await monta(1200, false);
ok(!(await pg.$(".fc-check")), "sin permiso salen casillas para depurar");
ok((await pg.$$eval(".fc-viaje .fc-cod", (x) => x.map((e) => e.textContent))).join() === "TP-001,TP-002,TP-003,TP-004", "las tarjetas no muestran el código del viaje");
ok(/TP-009/.test(await pg.textContent(".fc-salido")), "lo que salió no muestra el código");

await monta(1200);
ok((await pg.$$(".fc-viaje .fc-check input")).length === 4, "no hay una casilla por viaje");
await pg.click(".fc-viaje >> nth=0 >> .fc-check input");
await pg.click(".fc-viaje >> nth=2 >> .fc-check input");
ok(/2\s*seleccionados/.test(await pg.textContent(".fc-dep-n")), "la barra no dice cuántos");
const btn = ".fc-dep-bot .btn.si";
ok(await pg.$eval(btn, (b) => b.disabled), "se puede depurar sin motivo");
await pg.click(".fc-dep-seg button:has-text('Eliminar')");
await pg.fill(".fc-dep-motivo", "Duplicado del patio");
await pg.click(btn);
await pg.waitForSelector(".cf-velo", { timeout: 3000 }).catch(() => null);
ok(!(await pg.evaluate(() => window.__rpc?.length)), "eliminar no pregunta otra vez antes de borrar");
if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/fd-confirma.png` });
await pg.click(".cf-botones button:not(.plano)");
await pg.waitForFunction(() => window.__rpc?.length === 1, null, { timeout: 3000 }).catch(() => null);
const llamada = await pg.evaluate(() => window.__rpc?.[0]);
ok(llamada?.fn === "traspaso_depurar" && llamada.args.p_accion === "eliminar" && llamada.args.p_ids.join() === "1,3" && llamada.args.p_motivo === "Duplicado del patio",
   `llamada: ${JSON.stringify(llamada)}`);
await monta(1200);
await pg.click(".fc-dep-todos input");
ok(/4\s*seleccionados/.test(await pg.textContent(".fc-dep-n")), "seleccionar todos no marca todos");
if (process.env.FOTO) await pg.screenshot({ path: `${process.env.FOTO}/fd-1200.png`, fullPage: true });

for (const ancho of [1200, 390, 360]) {
  await monta(ancho);
  await pg.click(".fc-viaje >> nth=0 >> .fc-check input");
  const g = await pg.evaluate(() => {
    const fuera = [...document.querySelectorAll(".fc *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) }).map((e) => e.className + "").slice(0, 5);
    const chicos = [...document.querySelectorAll(".fc-dep button, .fc-check")].filter((b) => b.getBoundingClientRect().height < 40).map((b) => b.textContent);
    return { lado: document.documentElement.scrollWidth - innerWidth, fuera, chicos };
  });
  ok(g.lado <= 0, `${ancho}: la página se arrastra ${g.lado}`); ok(!g.fuera.length, `${ancho}: se sale ${g.fuera}`); ok(!g.chicos.length, `${ancho}: chicos ${g.chicos}`);
  if (process.env.FOTO && ancho === 390) await pg.screenshot({ path: `${process.env.FOTO}/fd-390.png`, fullPage: true });
}

/* ---------- CONTROL DEL DÍA: los FACTURADOS también se depuran ---------- */
writeFileSync(R(".arnes/_fd2-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Diferencias } from "../src/app/(app)/traspasos/control/Diferencias";
const w = window as any;
createRoot(document.getElementById("r")!).render(<div className="tp"><Diferencias lineas={[]} hayCorte={false} rotulo="martes, 22 de septiembre de 2026" desde="2026-09-16" hasta="2026-09-17"
  tope={false} sinDocumento={[]} conDocumento={w.F} nombres={{}} puedeDepurar={w.D} /></div>);
`);
const js2 = buildSync({ entryPoints: [R(".arnes/_fd2-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_sb-graba.js"), "next/navigation": R(".arnes/stub-nav.js"), "next/link": R(".arnes/ad-inicio-stub/link.tsx"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css2 = css + readFileSync(R("src/app/(app)/traspasos/cruce/cruce.css"), "utf8");
const F = [1, 2, 3].map((i) => viaje("f" + i, { codigo: "TR-014" + i, factura_documento: "768784021" + i, salida_en: "2026-09-22T14:00:00Z", por_facturar: false }));
const monta2 = async (ancho, depura = true) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${css2}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div id="r"></div></main></div></div>
    <script>window.F=${JSON.stringify(F)};window.D=${depura};</script><script>${js2}</script></body></html>`);
  await pg.waitForSelector(".tp-rz-tapa");
  await pg.click(".tp-rz-tapa >> nth=0");
};
await monta2(1200, false);
ok(!(await pg.$(".cr-sel")), "control: sin permiso salen casillas");
await monta2(1200);
ok((await pg.$$("tbody .cr-sel input")).length === 3, "control: no hay casilla por facturado");
await pg.click("thead .cr-sel input");
ok(/3\s*seleccionados/.test(await pg.textContent(".fc-dep-n")), "control: seleccionar todos no marca los facturados");
await pg.fill(".fc-dep-motivo", "Facturado por error");
await pg.evaluate(() => { window.__rpc = [] });
await pg.click(".fc-dep-bot .btn.si");
await pg.waitForFunction(() => window.__rpc?.length === 1, null, { timeout: 3000 }).catch(() => null);
const ll2 = await pg.evaluate(() => window.__rpc?.[0]);
ok(ll2?.fn === "traspaso_depurar" && ll2.args.p_accion === "anular" && ll2.args.p_ids.length === 3, `control: llamada ${JSON.stringify(ll2)}`);
if (process.env.FOTO) { await monta2(1200); await pg.click("tbody .cr-sel input >> nth=0"); await pg.screenshot({ path: `${process.env.FOTO}/fd-control.png`, fullPage: true }) }
for (const ancho of [390, 360]) {
  await monta2(ancho); await pg.click("tbody .cr-sel input >> nth=0");
  const lado = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(lado <= 0, `control ${ancho}: la página se arrastra ${lado}`);
}

const lum = (c) => { const k = c.startsWith("color(srgb") ? 1 : 255; const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= k; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2] };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1200, true, t);
  await pg.click(".fc-viaje >> nth=0 >> .fc-check input");
  const p = await pg.evaluate(() => {
    const fondo = (e) => { for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255,255,255)" };
    const o = {}; for (const s of [".fc-cod", ".fc-dep-nota", ".fc-check span", ".fc-dep-n", ".fc-dep-seg button:not(.on)", ".fc-dep-seg button.on", ".fc-dep-dice", ".fc-dep-bot .btn:not(.si)"]) {
      const e = document.querySelector(s); if (e) o[s] = [getComputedStyle(e).color, fondo(e)] } return o });
  for (const [k, v] of Object.entries(p)) ok(razon(v[0], v[1]) >= 4.5, `tema ${t ?? "oficial"}: «${k}» ${razon(v[0], v[1]).toFixed(2)}`);
}
await nav.close();
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Facturación · depurar: solo quien administra, código visible, marcar y todos, motivo, eliminar pregunta, 3 anchos y 7 temas.");
