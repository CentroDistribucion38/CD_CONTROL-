/* =====================================================================
   TABLERO FEFO · EL DÍA DE LA FOTO
   1. elegirConteos: por defecto lo ENVIADO (el último inventario); con una
      fecha, lo enviado hasta ese día; con borradores, también lo que se
      está contando (si ya tiene renglones). La lista de días sale completa.
   2. La pantalla: si la foto no trae producto, lo dice (y no dice «con
      margen»); la barra para escoger el día se pinta.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

const b = (p, o) => buildSync({ entryPoints: [R(p)], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_ft.mjs"), b("src/modulos/inventario/fecha-tablero.ts"));
const { elegirConteos } = await import(R(".arnes/_ft.mjs") + "?" + Date.now());
writeFileSync(R(".arnes/_riesgo.mjs"), b("src/modulos/inventario/riesgo.ts"));
const { medirRiesgo } = await import(R(".arnes/_riesgo.mjs") + "?" + Date.now());

const C = (id, estado, dia, env, ren = 5) => ({ id, estado, fecha_analisis: dia, enviado_en: env, renglones: ren, codigo: id });
const todos = [
  C("a", "cerrado", "2026-09-28", "2026-09-28T20:00:00Z"),
  C("b", "cerrado", "2026-10-01", "2026-10-01T14:34:00Z"),
  C("c", "cerrado", "2026-10-01", "2026-10-01T22:00:00Z"),
  C("d", "borrador", "2026-10-02", null, 126),
  C("e", "en_proceso", "2026-10-02", null, 0),
];
let r = elegirConteos(todos);
ok(r.elegidos.map((x) => x.id).join() === "c,b,a" && r.ultimo.id === "c", "por defecto: solo lo enviado, el último primero: " + r.elegidos.map((x) => x.id));
ok(r.dias.map((d) => d.dia + ":" + d.n).join() === "2026-10-01:2,2026-09-28:1", "los días a escoger: " + JSON.stringify(r.dias));
r = elegirConteos(todos, { hasta: "2026-09-30" });
ok(r.elegidos.map((x) => x.id).join() === "a" && r.ultimo.id === "a", "con una fecha: lo enviado hasta ese día: " + r.elegidos.map((x) => x.id));
ok(r.dias.length === 2, "la lista de días sigue completa aunque se mire un día viejo");
r = elegirConteos(todos, { hasta: "2026-10-01" });
ok(r.elegidos.map((x) => x.id).join() === "c,b,a", "el día escogido entra completo");
r = elegirConteos(todos, { borradores: true });
ok(r.elegidos.map((x) => x.id).join() === "d,c,b,a" && r.ultimo.id === "d", "con borradores entra el de hoy, pero no el que no tiene renglones: " + r.elegidos.map((x) => x.id));
ok(r.dias[0].dia === "2026-10-02", "y su día aparece para escoger");
r = elegirConteos(todos, { hasta: "basura" });
ok(r.elegidos.length === 3, "una fecha mal escrita se ignora");
r = elegirConteos(todos, { hasta: "2026-1-1" });
ok(r.elegidos.length === 3, "una fecha a medias («2026-1-1») también se ignora y no recorta la lista: " + r.elegidos.length);
ok(elegirConteos([]).ultimo === null, "sin conteos no hay último");

/* ---------- PANTALLA ---------- */
let n = 0;
const L = (o) => ({ id: "l" + ++n, conteo_id: "c", conteo: "INV", estado: "cerrado", codigo: o.sku ?? "E1", material: o.nom ?? "Botella Flint 1000R", tipo_material: o.tipo ?? "ENVASE", familia: "Envase", factor_estibado: 80,
  ubicacion: o.u, calle: "A", modulo: "01", lado: "DER", estibas: 1, cajas: 0, saldo: 0, total_cajas: o.t ?? 80, total_estibas: 1, capacidad: 10,
  fabricacion: null, vencimiento: null, dias_para_vencer: null, dias_para_salir: null, rotacion: null, averia: false, pnc: false, estado_envase: null,
  nota: null, ubicacion_combinada: o.u, conto: "X", contado_en: "2026-10-01T14:00:00Z", producto_id: "p", ubicacion_id: "u-" + o.u });
const CONT = [{ id: "c", codigo: "INV", estado: "cerrado", bodega: "AG01", responsable: "A", fecha_analisis: "2026-10-01", enviado_en: "2026-10-01T14:34:00Z", envio_nombre: null, renglones: 3, ubicaciones: 3, total_cajas: 1 }];
const soloEnvase = (() => { const { foto, ...x } = medirRiesgo([L({ u: "A01DER" }), L({ u: "A02DER" }), L({ u: "A03DER" })], CONT, {}); return x })();
const vacio = (() => { const { foto, ...x } = medirRiesgo([], CONT, {}); return x })();

writeFileSync(R(".arnes/_ft-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Riesgo } from "../src/app/(app)/inventario/Riesgo";
const w = window as any;
const barra = <form className="fe-fecha"><label><span>FEFO al día</span><select name="fecha"><option>Último inventario (01/10/2026)</option></select></label></form>;
createRoot(document.getElementById("r")!).render(<Riesgo r={w.RR} bodega="AG01" sinContar={0} ultimo="INV" barra={barra} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ft-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic", alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/inventario/fefo.css"), "utf8") + readFileSync(R("src/app/(app)/inventario/riesgo.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await (await nav.newContext()).newPage();
const monta = async (rr, ancho = 1300) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe" id="r"></div></main></div></div>
    <script>window.RR=${JSON.stringify(rr)};</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".ir-top");
};
await monta(soloEnvase);
const t = (await pg.textContent(".ir")).replace(/\s+/g, " ");
ok(/Esta foto no trae producto terminado/.test(t) && /Solo hay 3 renglones de envase en 3 ubicaciones/.test(t), "avisa que la foto es solo de envase: " + t.slice(0, 400));
ok(!/La bodega está con margen/.test(t) && /no hay vencimientos que medir/.test(t), "no dice «con margen» cuando no hay producto");
ok(await pg.locator(".fe-fecha select").count() === 1 && /FEFO al día/.test(t), "la barra para escoger el día se pinta");
await monta(vacio);
ok(/No hay renglones en esta foto/.test(await pg.textContent(".ir")), "foto sin renglones: lo dice");
for (const w of [1300, 820, 390]) {
  await monta(soloEnvase, w);
  const dentro = await pg.evaluate(() => { const a = document.querySelector(".ir").getBoundingClientRect(); return [...document.querySelectorAll(".ir *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > a.right + 1 || r.left < a.left - 1) }).length });
  ok(dentro === 0, `nada se sale a ${w}px (${dentro})`);
}
await nav.close();
if (fallas.length) { console.log("✗ " + fallas.join("\n✗ ")); process.exit(1) }
console.log("✓ Tablero FEFO por fecha: el último inventario por defecto, un día anterior a escoger, borradores solo si se piden, y avisa cuando la foto no trae producto.");
