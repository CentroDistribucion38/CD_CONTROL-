/* La barra de comandos en pantalla: Ctrl+K, lista, /o, Shift+Enter, errores y que quepa en 4 anchos.
   node .arnes/cmd-barra.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_cmd-nav.ts"), `
export function useRouter() { return { push: (r: string) => { (window as any).__push.push(r) }, refresh() {}, replace() {}, back() {} } }
export function usePathname() { return "/inventario/corte" }`);
writeFileSync(R(".arnes/_cmd-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Comandos } from "../src/components/Comandos";
import { armarComandos } from "../src/modulos/comandos";
import { MODULOS, rutasRegistradas } from "../src/modulos/registro";
const w = window as any; w.__push = []; w.__open = [];
w.open = (u: string, t: string) => { w.__open.push([u, t]); return null };
const q = new URLSearchParams(location.search).get("c");
const todas = rutasRegistradas();
const permitidas = q === "poco" ? ["/inventario/corte", "/inventario/conteo"] : todas;
createRoot(document.getElementById("r")!).render(
  <header className="sh-barra"><div className="esquina"></div><div className="ruta"><span className="wm">CONTROL</span></div>
    <div className="der"><Comandos comandos={armarComandos(MODULOS, permitidas)} /><span className="turno">Turno 1 · 08:00</span><span className="sh-avatar">CP</span></div></header>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_cmd-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_cmd-nav.ts"), "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = [];
pg.on("pageerror", (e) => roto.push(e.message));
const monta = async (c, ancho = 1440, tema = "") => {
  await pg.unrouteAll();
  await pg.setViewportSize({ width: ancho, height: 700 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({ contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${P}${css}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div id="r"></div></div><script>${js}<\/script></body></html>` }));
  await pg.goto(`http://arnes.local/?c=${c}`);
  await pg.waitForSelector(".sh-cmd");
};
const push = () => pg.evaluate(() => window.__push), abre = () => pg.evaluate(() => window.__open);
const campo = pg.locator(".sh-cmd-in");

await monta("todo");
/* Ctrl+K lleva el cursor al campo. */
await pg.keyboard.press("Control+k");
ok(await pg.evaluate(() => document.activeElement?.classList.contains("sh-cmd-in")), "Ctrl+K no enfocó la barra");
/* Escribir sugiere. */
await campo.fill("inv-co");
ok(await pg.locator(".sh-cmd-op").count() >= 2 && /^INV-CO/.test(await pg.locator(".sh-cmd-op").first().textContent()), "sugerencias: " + await pg.locator(".sh-cmd-op code").allTextContents());
/* Flechas + Enter: abre en esta ventana. */
await campo.fill("inv-co");
await pg.keyboard.press("ArrowDown");
const segundo = (await pg.locator(".sh-cmd-op.on code").textContent());
await pg.keyboard.press("Enter");
ok((await push())[0] === "/inventario/conteo" && (await abre()).length === 0, "↓ + Enter debía abrir el segundo (INV-CONTEO) aquí: " + JSON.stringify(await push()) + " (escogido " + segundo + ")");
ok(await campo.inputValue() === "", "la barra se limpia al ejecutar");
/* Código exacto. */
await campo.fill("INV-CORTE"); await pg.keyboard.press("Enter");
ok((await push())[1] === "/inventario/corte", "INV-CORTE: " + JSON.stringify(await push()));
/* /o abre otra ventana y NO navega aquí. */
await campo.fill("/o INV-CORTE"); await pg.keyboard.press("Enter");
ok(JSON.stringify(await abre()) === JSON.stringify([["/inventario/corte", "_blank"]]) && (await push()).length === 2, "/o: " + JSON.stringify(await abre()));
/* Shift+Enter, igual. */
await campo.fill("sid-transito"); await pg.keyboard.press("Shift+Enter");
ok((await abre())[1]?.[0] === "/sider/transito", "Shift+Enter abre otra ventana: " + JSON.stringify(await abre()));
/* Por nombre. */
await campo.fill("corte de lineas"); await pg.keyboard.press("Enter");
ok((await push())[2] === "/inventario/corte", "por nombre: " + JSON.stringify(await push()));
/* Clic en una sugerencia. */
await campo.fill("tolvas"); await pg.locator(".sh-cmd-op").first().click();
ok((await push())[3] === "/roturas/salida/tolvas", "clic en la sugerencia: " + JSON.stringify(await push()));
/* No existe: avisa, no navega. */
await campo.fill("zzzz"); await pg.keyboard.press("Enter");
ok(/No hay una pantalla/.test(await pg.locator(".sh-cmd-mal").first().textContent()) && (await push()).length === 4, "no existe debía avisar");
await pg.keyboard.press("Escape");
ok(await campo.inputValue() === "", "Esc limpia");

/* Sin permiso: el código no abre ni se sugiere. */
await monta("poco");
await campo.fill("sid-transito"); await pg.keyboard.press("Enter");
ok((await push()).length === 0 && /No hay una pantalla/.test(await pg.locator(".sh-cmd-mal").first().textContent()), "una pantalla sin permiso no se abre por código");
await campo.fill("inv-"); 
ok((await pg.locator(".sh-cmd-op code").allTextContents()).join() === "INV-CORTE,INV-CONTEO" || (await pg.locator(".sh-cmd-op code").count()) === 2, "solo sugiere lo permitido: " + await pg.locator(".sh-cmd-op code").allTextContents());

/* Que quepa y se vea rectangular, en 4 anchos y 2 temas. */
for (const [w, tema] of [[360, ""], [390, ""], [820, ""], [1440, ""], [1440, "negro"]]) {
  await monta("todo", w, tema);
  const d = await pg.evaluate(() => {
    const e = document.querySelector(".sh-cmd-in"), b = e.getBoundingClientRect();
    return { scroll: document.documentElement.scrollWidth, vista: window.innerWidth, alto: b.height, ancho: b.width, radio: getComputedStyle(e).borderRadius };
  });
  ok(d.scroll <= d.vista && d.alto >= 36 && d.radio === "0px", `a ${w}px${tema ? " " + tema : ""}: ${JSON.stringify(d)}`);
  if (w <= 390) {
    await pg.locator(".sh-cmd-in").click(); await pg.locator(".sh-cmd-in").fill("inv");
    const d2 = await pg.evaluate(() => { const p = document.querySelector(".sh-cmd-panel").getBoundingClientRect(); return { r: p.right, l: p.left, v: window.innerWidth } });
    ok(d2.r <= d2.v + 1 && d2.l >= -1, `a ${w}px el panel se sale: ${JSON.stringify(d2)}`);
  }
  if (process.env.SHOT && w === 1440 && !tema) { await pg.locator(".sh-cmd-in").fill("inv-c"); await pg.screenshot({ path: R(".arnes/cmd-pc.png"), clip: { x: 700, y: 0, width: 740, height: 420 } }) }
}
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Barra de comandos en pantalla: Ctrl+K, lista con flechas, Enter aquí, /o y Shift+Enter otra ventana, por nombre, errores, solo lo permitido, rectangular y dentro en 4 anchos.");
