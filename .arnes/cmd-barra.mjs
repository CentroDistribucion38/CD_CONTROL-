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
  await pg.waitForSelector(".sh-barra");
};
const push = () => pg.evaluate(() => window.__push), abre = () => pg.evaluate(() => window.__open);
const campo = pg.locator(".sh-cmd-in");

await monta("todo");
/* A LA VISTA NO HAY NADA: la barra solo aparece con Ctrl+K. */
ok(await pg.locator(".sh-cmd, .sh-cmd-in").count() === 0, "la barra no debe verse en la cabecera");
await pg.keyboard.press("Control+k");
ok(await pg.locator(".sh-cmd").count() === 1 && await pg.evaluate(() => document.activeElement?.classList.contains("sh-cmd-in")), "Ctrl+K abre el cuadro con el cursor listo");
/* Esc cierra. */
await pg.keyboard.press("Escape");
ok(await pg.locator(".sh-cmd").count() === 0, "Esc cierra");
const abrir = async () => { await pg.keyboard.press("Control+k"); await campo.waitFor(); };
/* Escribir sugiere. */
await abrir(); await campo.fill("inv-co");
ok(await pg.locator(".sh-cmd-op").count() >= 2 && /^INV-CO/.test(await pg.locator(".sh-cmd-op").first().textContent()), "sugerencias: " + await pg.locator(".sh-cmd-op code").allTextContents());
/* Flechas + Enter: abre OTRA PESTAÑA (por defecto), sin navegar aquí. */
await pg.keyboard.press("ArrowDown");
await pg.keyboard.press("Enter");
ok(JSON.stringify(await abre()) === JSON.stringify([["/inventario/conteo", "_blank"]]) && (await push()).length === 0, "↓ + Enter abre INV-CONTEO en otra pestaña: " + JSON.stringify(await abre()));
ok(await pg.locator(".sh-cmd").count() === 0, "el cuadro se cierra al ejecutar");
/* Código exacto. */
await abrir(); await campo.fill("INV-CORTE"); await pg.keyboard.press("Enter");
ok((await abre())[1]?.[0] === "/inventario/corte" && (await push()).length === 0, "INV-CORTE + Enter → otra pestaña: " + JSON.stringify(await abre()));
/* Shift+Enter: esta pestaña. */
await abrir(); await campo.fill("sid-transito"); await pg.keyboard.press("Shift+Enter");
ok((await push())[0] === "/sider/transito" && (await abre()).length === 2, "Shift+Enter abre en esta pestaña: " + JSON.stringify(await push()));
/* /n: esta; /o: otra. */
await abrir(); await campo.fill("/n INV-CORTE"); await pg.keyboard.press("Enter");
ok((await push())[1] === "/inventario/corte", "/n abre aquí: " + JSON.stringify(await push()));
await abrir(); await campo.fill("/o INV-BASE"); await pg.keyboard.press("Enter");
ok((await abre())[2]?.[0] === "/inventario/base", "/o abre otra: " + JSON.stringify(await abre()));
/* Por nombre. */
await abrir(); await campo.fill("corte de lineas"); await pg.keyboard.press("Enter");
ok((await abre())[3]?.[0] === "/inventario/corte", "por nombre: " + JSON.stringify(await abre()));
/* Clic en una sugerencia: en esta pestaña no; igual que Enter → por defecto otra. */
await abrir(); await campo.fill("tolvas"); await pg.locator(".sh-cmd-op").first().click();
ok((await abre())[4]?.[0] === "/roturas/salida/tolvas", "clic en la sugerencia: " + JSON.stringify(await abre()));
/* No existe: avisa, no abre. */
await abrir(); await campo.fill("zzzz"); await pg.keyboard.press("Enter");
ok(/No hay una pantalla/.test(await pg.locator(".sh-cmd-mal").first().textContent()) && (await abre()).length === 5, "no existe debía avisar");
/* Clic fuera cierra. */
await pg.mouse.click(10, 650);
ok(await pg.locator(".sh-cmd").count() === 0, "clic fuera cierra");

/* Sin permiso: el código no abre ni se sugiere. */
await monta("poco");
await abrir(); await campo.fill("sid-transito"); await pg.keyboard.press("Enter");
ok((await abre()).length === 0 && (await push()).length === 0 && /No hay una pantalla/.test(await pg.locator(".sh-cmd-mal").first().textContent()), "una pantalla sin permiso no se abre por código");
await campo.fill("inv-");
ok((await pg.locator(".sh-cmd-op code").count()) === 2, "solo sugiere lo permitido: " + await pg.locator(".sh-cmd-op code").allTextContents());

/* Que quepa y se vea rectangular, en 4 anchos y 2 temas. */
for (const [w, tema] of [[360, ""], [390, ""], [820, ""], [1440, ""], [1440, "negro"]]) {
  await monta("todo", w, tema);
  await abrir(); await campo.fill("inv");
  const d = await pg.evaluate(() => {
    const c = document.querySelector(".sh-cmd").getBoundingClientRect(), e = document.querySelector(".sh-cmd-in").getBoundingClientRect();
    return { scroll: document.documentElement.scrollWidth, vista: window.innerWidth, l: c.left, r: c.right, alto: e.height, radio: getComputedStyle(document.querySelector(".sh-cmd")).borderRadius };
  });
  ok(d.scroll <= d.vista && d.l >= 0 && d.r <= d.vista && d.alto >= 44 && d.radio === "0px", `a ${w}px${tema ? " " + tema : ""}: ${JSON.stringify(d)}`);
  if (process.env.SHOT && w === 1440 && !tema) await pg.screenshot({ path: R(".arnes/cmd-pc.png") });
}
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Barra de comandos en pantalla: no se ve hasta Ctrl+K, Enter abre otra pestaña, Shift+Enter y /n esta, /o otra, por nombre, errores, solo lo permitido, rectangular y dentro en 4 anchos.");
