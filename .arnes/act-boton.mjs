/* El botón flotante de actualizar, en pantalla. node .arnes/act-boton.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_act-nav.ts"), `

export function useRouter() { return { refresh: () => { (window as any).__refresh++ }, push() {}, replace() {}, back() {} } }
export function usePathname() { return new URLSearchParams(location.search).get("p") || "/inventario/tablero" }`);
writeFileSync(R(".arnes/_act-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Actualizar } from "../src/components/Actualizar";
(window as any).__refresh = 0;
const q = new URLSearchParams(location.search);
createRoot(document.getElementById("r")!).render(<>
  <main style={{ padding: 20 }}><input id="f" placeholder="digitando" />{q.get("dlg") ? <div role="dialog">cuadro</div> : null}{q.get("falso") ? <button className="mas">Ver más</button> : null}{q.get("mas") ? <button className="mas" style={{ position: "fixed", right: 20, bottom: 20, width: 58, height: 58 }}>+</button> : null}</main>
  <Actualizar /></>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_act-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_act-nav.ts"), "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = []; pg.on("pageerror", (e) => roto.push(e.message));
await pg.clock.install();
const monta = async (qs, ancho = 1440) => {
  await pg.unrouteAll(); await pg.setViewportSize({ width: ancho, height: 700 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({ contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${P}${css}</style></head><body><div class="sh"><div id="r"></div></div><script>${js}<\/script></body></html>` }));
  await pg.goto("http://arnes.local/?" + qs); await pg.waitForSelector(".sh-refrescar");
};
const n = () => pg.evaluate(() => window.__refresh);

/* Tablero: el botón actualiza al tocarlo y sola cada minuto. */
await monta("p=/inventario/tablero");
ok(await n() === 0, "no actualiza al abrir");
await pg.click(".sh-refrescar");
ok(await n() === 1, "al tocar actualiza una vez: " + await n());
await pg.clock.runFor(61000);
ok(await n() === 2, "sola, a los 60 s: " + await n());
await pg.clock.runFor(61000);
ok(await n() === 3, "y otra vez al siguiente minuto: " + await n());
/* Escribiendo: se salta. */
await pg.focus("#f"); await pg.clock.runFor(61000);
ok(await n() === 3, "no actualiza mientras se escribe: " + await n());
await pg.evaluate(() => document.getElementById("f").blur()); await pg.clock.runFor(61000);
ok(await n() === 4, "al salir del campo vuelve a actualizar: " + await n());
/* Pestaña oculta. */
await pg.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }) });
await pg.clock.runFor(61000);
ok(await n() === 4, "con la pestaña oculta no actualiza: " + await n());
await pg.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")) });
ok(await n() === 5, "al volver a la pestaña (pasó más de un minuto) actualiza: " + await n());

/* Una pantalla de digitar: solo con el botón. */
await monta("p=/inventario/conteo");
await pg.clock.runFor(130000);
ok(await n() === 0, "en una pantalla de digitar no se actualiza sola: " + await n());
await pg.click(".sh-refrescar");
ok(await n() === 1, "pero el botón sí funciona");
/* Con un cuadro abierto. */
await monta("p=/inventario/tablero&dlg=1");
await pg.clock.runFor(130000);
ok(await n() === 0, "con un cuadro abierto no se actualiza sola: " + await n());

/* Dónde queda, y que no tape el «+». */
for (const w of [360, 1440]) {
  await monta("p=/inventario/tablero", w);
  const a = await pg.evaluate(() => { const b = document.querySelector(".sh-refrescar").getBoundingClientRect(); return { r: window.innerWidth - b.right, b: window.innerHeight - b.bottom, w: b.width, h: b.height, rad: getComputedStyle(document.querySelector(".sh-refrescar")).borderRadius } });
  ok(a.r <= 20 && a.b <= 20 && a.w <= 44 && a.rad === "0px", `a ${w}px abajo a la derecha, pequeño y rectangular: ${JSON.stringify(a)}`);
  await monta("p=/inventario/tablero&mas=1", w);
  await pg.clock.runFor(300);
  const t = await pg.evaluate(() => { const a = document.querySelector(".sh-refrescar").getBoundingClientRect(), m = document.querySelector(".mas").getBoundingClientRect(); return a.bottom <= m.top || a.right <= m.left || a.left >= m.right });
  ok(t, `a ${w}px el botón de actualizar tapa el «+»`);
}
/* Un «mas» que NO es flotante (ej. «Ver más») no sube el botón: queda pegado abajo. */
await monta("p=/inventario/tablero&falso=1", 1440);
await pg.clock.runFor(300);
const pegado = await pg.evaluate(() => window.innerHeight - document.querySelector(".sh-refrescar").getBoundingClientRect().bottom);
ok(pegado <= 20, "con un «mas» que no es flotante el botón debe ir pegado abajo, está a " + pegado + " px");
await monta("p=/inventario/tablero&mas=1", 1440);
await pg.clock.runFor(300);
const alto = await pg.evaluate(() => window.innerHeight - document.querySelector(".sh-refrescar").getBoundingClientRect().bottom);
ok(alto > 60, "con un «+» flotante a la vista sí sube: " + alto);
await pg.screenshot({ path: R(".arnes/act-pc.png"), clip: { x: 1140, y: 480, width: 300, height: 220 } });
ok(roto.length === 0, "errores de la página: " + roto.join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Botón de actualizar: flotante abajo a la derecha, pequeño y rectangular; actualiza al tocarlo y cada minuto en consulta; se salta si escribes, hay un cuadro o la pestaña está oculta; no tapa el «+».");
