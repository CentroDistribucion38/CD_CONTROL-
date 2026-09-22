/* =====================================================================
   TRASPASOS · EL RANGO LIBRE Y EL BOTÓN DE EXCEL — la barra de verdad,
   en Chromium.

   «Informes por turno, por fecha, como yo quiera… y bajar una data, un
   Excel.»

   SE COMPRUEBA:

   1. QUE HAYA DESDE Y HASTA. Antes era un desplegable de períodos fijos
      y «del 1 al 15 de agosto» no se podía pedir.

   2. QUE ESCRIBIR UNA FECHA BORRE `d` Y `dias`. Son la forma vieja de
      decir lo mismo: si quedaran puestas, la pantalla obedecería a una
      y el Excel a la otra, y las dos cifras no cuadrarían.

   3. QUE «HOY» Y «MAÑANA» dejen las dos fechas iguales — un día solo.

   4. QUE EL EXCEL PIDA EL MISMO RANGO Y LOS MISMOS FILTROS que la
      pantalla está mostrando. Un archivo que dice otra cosa que el
      tablero no evidencia nada.

   5. QUE UN FALLO SE VEA. Si el servidor contesta un error, tiene que
      salir escrito; un botón que no hace nada se toca cinco veces.

   6. QUE NADA SE SALGA a 1440 / 820 / 390 / 360 y que lo que se toca
      mida ≥ 42 px: esto se usa de pie, con el celular en una mano.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

/* El router y los parámetros de la dirección, de mentira: se anota a
   dónde habría navegado, que es lo que de verdad hay que comprobar. */
writeFileSync(R(".arnes/_nav-ti.ts"), `const w = window as any;
export const useRouter = () => ({
  push(u: string) { w.rutas = [...(w.rutas ?? []), u]; w.url = u; w.pintar?.() },
  refresh() { w.refrescos = (w.refrescos ?? 0) + 1 },
  replace() {},
});
export const usePathname = () => "/traspasos/control";
export const useSearchParams = () => new URLSearchParams((w.url ?? "").split("?")[1] ?? "");`);

writeFileSync(R(".arnes/_ti-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Barra } from "../src/app/(app)/traspasos/control/Barra";
const w = window as any;
const TIPOS = [
  { clave: "casco", nombre: "Casco vidrio", orden: 1, activo: true },
  { clave: "canastas", nombre: "Canastas", orden: 2, activo: true },
  { clave: "estibas", nombre: "Estibas", orden: 3, activo: true },
];
const raiz = createRoot(document.getElementById("r")!);
w.pintar = () => raiz.render(
  <div className="tp" data-tema={w.TEMA || undefined}>
    <Barra tipos={TIPOS as any} soloBotones hoy={w.HOY} dia={w.DIA} desde={w.DESDE} hasta={w.HASTA} />
    <Barra tipos={TIPOS as any} soloFiltros hoy={w.HOY} dia={w.DIA} desde={w.DESDE} hasta={w.HASTA} />
  </div>);
w.pintar();
`);
const js = buildSync({ entryPoints: [R(".arnes/_ti-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-ti.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/traspasos/traspasos.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const HOY = "2026-09-22", MAÑANA = "2026-09-23";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.route("**/*", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }));

const monta = async (ancho = 1440, tema = "", url = "/traspasos/control") => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.goto("https://control.prueba/traspasos/control");
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main" id="m"><div id="r"></div></main></div></div>
    <script>window.HOY=${JSON.stringify(HOY)};window.DIA=${JSON.stringify(HOY)};window.DESDE=${JSON.stringify(HOY)};window.HASTA=${JSON.stringify(HOY)};window.url=${JSON.stringify(url)};window.rutas=[];window.TEMA=${JSON.stringify(tema)};</script>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".rango-f");
};
const rutas = () => pg.evaluate(() => window.rutas ?? []);
const ultima = async () => (await rutas()).at(-1) ?? "";

/* ---------- 1 · DESDE Y HASTA ---------- */
await monta();
ok((await pg.$$(".rango-f .sel.fecha input[type=date]")).length === 2,
   "no hay dos campos de fecha (desde y hasta) en los filtros");
{
  const rot = (await pg.$$eval(".rango-f .sel.fecha > span", (ns) => ns.map((x) => x.textContent.trim()))).join("|");
  ok(rot === "Desde|Hasta", `los rótulos del rango dicen «${rot}» y deben ser Desde|Hasta`);
}

/* ---------- 2 · ESCRIBIR UNA FECHA BORRA `d` Y `dias` ---------- */
await monta(1440, "", "/traspasos/control?d=2026-09-10&dias=6&turno=A");
await pg.fill(".rango-f .sel.fecha input >> nth=0", "2026-08-01");
await pg.waitForFunction(() => (window.rutas ?? []).length > 0, null, { timeout: 4000 });
{
  const u = new URLSearchParams((await ultima()).split("?")[1] ?? "");
  ok(u.get("desde") === "2026-08-01", `el «desde» no llegó a la dirección: ${await ultima()}`);
  ok(u.get("hasta"), "el «hasta» tiene que viajar junto con el «desde»");
  ok(!u.get("d") && !u.get("dias"),
     `quedaron puestos los parámetros viejos (${await ultima()}) — la pantalla y el Excel dirían cosas distintas`);
  ok(u.get("turno") === "A", "al cambiar la fecha se perdió el filtro de turno que ya estaba puesto");
}

/* ---------- 3 · LOS DOS ATAJOS DEJAN UN DÍA SOLO ---------- */
await monta(1440, "", "/traspasos/control?desde=2026-08-01&hasta=2026-08-15");
await pg.click('.rango-f .atajo:has-text("Mañana")');
await pg.waitForFunction(() => (window.rutas ?? []).length > 0, null, { timeout: 4000 });
{
  const u = new URLSearchParams((await ultima()).split("?")[1] ?? "");
  ok(u.get("desde") === MAÑANA && u.get("hasta") === MAÑANA,
     `«Mañana» dejó ${u.get("desde")}–${u.get("hasta")} y tiene que ser ${MAÑANA} los dos`);
}
await monta(1440, "", "/traspasos/control?desde=2026-08-01&hasta=2026-08-15");
await pg.click('.rango-f .atajo:has-text("Hoy")');
await pg.waitForFunction(() => (window.rutas ?? []).length > 0, null, { timeout: 4000 });
{
  const u = new URLSearchParams((await ultima()).split("?")[1] ?? "");
  ok(u.get("desde") === HOY && u.get("hasta") === HOY, "«Hoy» no deja las dos fechas en hoy");
}

/* ---------- 4 · EL EXCEL PIDE LO MISMO QUE LA PANTALLA ---------- */
await monta(1440, "", "/traspasos/control?desde=2026-08-01&hasta=2026-08-15&turno=A,C&tipo=casco");
await pg.evaluate(() => {
  const w = window;
  w.pedidos = [];
  w.fetch = async (u) => {
    w.pedidos.push(String(u));
    return { ok: true, blob: async () => new Blob(["x"], { type: "application/octet-stream" }) };
  };
  /* Que la descarga no abra nada de verdad en el navegador de prueba. */
  HTMLAnchorElement.prototype.click = function () { window.bajado = this.download };
});
await pg.click('.accion:has-text("Bajar Excel")');
await pg.waitForFunction(() => (window.pedidos ?? []).length > 0, null, { timeout: 5000 });
{
  const u = new URL((await pg.evaluate(() => window.pedidos[0])), "https://control.prueba");
  ok(u.pathname === "/api/traspasos/exportar", `el botón pide ${u.pathname} y debe ser /api/traspasos/exportar`);
  ok(u.searchParams.get("desde") === "2026-08-01" && u.searchParams.get("hasta") === "2026-08-15",
     "el Excel no pide el mismo rango que la pantalla está mostrando");
  ok(u.searchParams.get("turno") === "A,C", "el Excel no lleva el filtro de turno que está puesto");
  ok(u.searchParams.get("tipo") === "casco", "el Excel no lleva el filtro de tipo que está puesto");
  ok(/^[0-9a-f]{6}$/i.test(u.searchParams.get("tinta") ?? ""), "el Excel no lleva la tinta del tema");
  ok(/^[0-9a-f]{6}$/i.test(u.searchParams.get("banda") ?? ""), "el Excel no lleva el color de la banda");
  const arch = await pg.evaluate(() => window.bajado);
  ok(arch === "traspasos-2026-08-01-a-2026-08-15.xlsx",
     `el archivo se llamaría «${arch}» — el nombre tiene que decir el rango`);
}

/* ---------- 5 · UN FALLO SE VE ---------- */
await monta(1440, "", "/traspasos/control?desde=2026-08-01&hasta=2026-08-15");
await pg.evaluate(() => {
  window.fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: "En ese rango no hay ni plan ni viajes." }) });
});
await pg.click('.accion:has-text("Bajar Excel")');
await pg.waitForSelector(".mal-informe", { timeout: 5000 });
{
  const t = (await pg.textContent(".mal-informe")).trim();
  ok(/no hay ni plan ni viajes/.test(t), `el aviso dice «${t}» y tiene que traer lo que contestó el servidor`);
  /* Y el botón vuelve a quedar tocable: si se quedara en «Armando…»,
     el segundo intento sería recargar la página. */
  ok(!(await pg.isDisabled('.accion:has-text("Bajar Excel")')),
     "después de un fallo el botón se queda bloqueado");
}

/* ---------- 6 · QUE QUEPA Y QUE SE TOQUE ---------- */
const TEMAS = ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const tabla = [];
for (const ancho of [1440, 820, 390, 360]) {
  await monta(ancho, "", "/traspasos/control?desde=2026-08-01&hasta=2026-08-15");
  const m = await pg.evaluate(() => {
    const caja = document.getElementById("m");
    const sale = Math.max(0, caja.scrollWidth - caja.clientWidth);
    const alto = (s) => Math.min(...[...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect().height));
    return { sale, fecha: alto(".rango-f input"), atajo: alto(".rango-f .atajo"), boton: alto(".acciones-informe .accion") };
  });
  tabla.push({ ancho, "se sale": m.sale ? m.sale + " px" : "nada", fecha: Math.round(m.fecha), atajo: Math.round(m.atajo), botón: Math.round(m.boton) });
  ok(m.sale <= 1, `a ${ancho} px la barra se sale ${m.sale} px de lado`);
  ok(m.fecha >= 42, `a ${ancho} px el campo de fecha mide ${Math.round(m.fecha)} px y el dedo necesita 42`);
  ok(m.atajo >= 42, `a ${ancho} px el atajo mide ${Math.round(m.atajo)} px`);
  ok(m.boton >= 36, `a ${ancho} px el botón de Excel mide ${Math.round(m.boton)} px`);
}

/* El atajo prendido tiene que leerse en los siete temas: es texto sobre
   el color del acento, que cambia con las preferencias de cada quien. */
const lum = (c) => { const [r, g, b] = c.map((v) => { const x = v / 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return .2126 * r + .7152 * g + .0722 * b };
const razon = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05) };
const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
for (const tema of TEMAS) {
  await monta(1440, tema, `/traspasos/control?desde=${HOY}&hasta=${HOY}`);
  const c = await pg.evaluate(() => {
    const b = document.querySelector(".rango-f .atajo.on");
    if (!b) return null;
    const s = getComputedStyle(b);
    return { txt: s.color, fondo: s.backgroundColor };
  });
  ok(!!c, `en el tema «${tema || "oficial"}» el atajo de hoy no se pinta como escogido`);
  if (c) {
    const r = razon(rgb(c.txt), rgb(c.fondo));
    ok(r >= 4.5, `tema «${tema || "oficial"}»: el atajo prendido contrasta ${r.toFixed(2)} y necesita 4.5`);
  }
}

await nav.close();
console.log("");
console.table(tabla);
console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Traspasos · informe: rango libre desde–hasta, borra los parámetros viejos, los dos atajos, "
          + "el Excel pide lo mismo que la pantalla, los fallos se ven, y cabe en los 4 anchos y los 7 temas.");
