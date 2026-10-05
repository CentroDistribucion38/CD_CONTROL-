/* La franja «esto es una copia» y el botón de actualizar sin internet. node .arnes/aviso-copia.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_ac-nav.ts"), `export function useRouter() { return { refresh: () => { (window as any).__refresh++ }, push() {}, replace() {}, back() {} } }
export function usePathname() { return "/inventario/tablero" }`);
writeFileSync(R(".arnes/_ac-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { AvisoCopia } from "../src/components/AvisoCopia";
import { Actualizar } from "../src/components/Actualizar";
(window as any).__refresh = 0;
createRoot(document.getElementById("r")!).render(<><AvisoCopia /><main style={{ padding: 20 }}>Tablero</main><Actualizar /></>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ac-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_ac-nav.ts"), "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = ["src/app/globals.css", "src/app/(app)/shell.css"].map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ viewport: { width: 1000, height: 400 } });
const pg = await ctx.newPage();
let estado = { copia: false, hayCopia: true, fecha: "2026-09-29T19:05:00.000Z" };
await pg.route("http://arnes.local/__sw/estado**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(estado) }));
await pg.route("http://arnes.local/", (r) => r.fulfill({ contentType: "text/html; charset=utf-8",
  body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head><body><div class="sh"><div id="r"></div></div><script>${js}<\/script></body></html>` }));
const franja = () => pg.locator(".sh-copia");

await pg.goto("http://arnes.local/"); await pg.waitForSelector("main");
ok(await franja().count() === 0, "con internet y pantalla de la red no hay franja");

estado = { copia: true, hayCopia: true, fecha: "2026-09-29T19:05:00.000Z" };
await pg.goto("http://arnes.local/"); await pg.waitForSelector(".sh-copia");
ok(/Esta pantalla es una copia/.test(await franja().innerText()) && /29 de sept/.test(await franja().innerText()) && /14:05/.test(await franja().innerText()), "red lenta: dice que es copia y de cuándo (hora de Colombia): " + await franja().innerText());
ok(await pg.locator(".sh-copia button").count() === 1, "con internet y copia ofrece «Ver lo de ahora»");

await ctx.setOffline(true);
await pg.waitForFunction(() => /Sin internet/.test(document.querySelector(".sh-copia")?.textContent ?? ""));
ok(/Se puede mirar lo guardado/.test(await franja().innerText()), "sin internet lo dice con palabras de bodega: " + await franja().innerText());
ok(await pg.locator(".sh-copia button").count() === 0, "sin internet no ofrece recargar (no serviría)");
await pg.screenshot({ path: R(".arnes/_ac-sin-internet.png") });

/* El botón de actualizar no hace nada sin internet (si no, recargaría la copia en bucle). */
await pg.click(".sh-refrescar");
ok(await pg.evaluate(() => window.__refresh) === 0, "sin internet el botón de actualizar no refresca");

await ctx.setOffline(false);
await pg.waitForSelector(".sh-copia button");
ok(true, "ok");
await pg.click(".sh-refrescar");
ok(await pg.evaluate(() => window.__refresh) === 1, "con internet otra vez sí refresca");
const alto = await franja().evaluate((e) => e.getBoundingClientRect().height);
ok(alto < 70, "la franja ocupa poco alto: " + alto);
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Franja de copia: aparece sin internet o con pantalla de copia, dice de cuándo es, ofrece ver lo de ahora al volver la señal, y el botón de actualizar no recarga sin internet.");
