/* Ctrl+K abre CONTROL en otra pestaña (la portada), sin escribir nada. node .arnes/nueva-pestana.mjs */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_np-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { NuevaPestana } from "../src/components/NuevaPestana";
const w = window as any; w.__open = []; w.__prev = 0;
w.open = (u: string, t: string) => { w.__open.push([u, t]); return null };
addEventListener("keydown", (e) => { if (e.defaultPrevented) w.__prev++ }, { once: false });
createRoot(document.getElementById("r")!).render(<><NuevaPestana /><input id="f" /></>);`);
const js = buildSync({ entryPoints: [R(".arnes/_np-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
await pg.route("http://arnes.local/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><div id="r"></div><script>${js}<\/script>` }));
await pg.goto("http://arnes.local/"); await pg.waitForSelector("#f");
const abre = () => pg.evaluate(() => window.__open);
await pg.keyboard.press("Control+k");
ok(JSON.stringify(await abre()) === JSON.stringify([["/inicio", "_blank"]]), "Ctrl+K debía abrir /inicio en otra pestaña: " + JSON.stringify(await abre()));
await pg.focus("#f"); await pg.keyboard.press("Control+k");
ok((await abre()).length === 2, "también con el cursor en un campo: " + (await abre()).length);
await pg.keyboard.press("Meta+k");
ok((await abre()).length === 3, "Cmd+K en Mac");
await pg.keyboard.press("k"); await pg.keyboard.press("Control+Shift+k"); await pg.keyboard.press("Control+j");
ok((await abre()).length === 3, "otras teclas no abren nada");
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Ctrl+K abre CONTROL en otra pestaña (la portada), sin escribir nada; otras teclas no.");
