/* AlDia (Traspasos) no pide datos sin internet de verdad: sin eso Next recarga la página en bucle y parpadea. node .arnes/al-dia.mjs */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_ad-nav.ts"), `export function useRouter() { return { refresh: () => { (window as any).__refresh++ }, push() {}, replace() {}, back() {} } }`);
writeFileSync(R(".arnes/_ad-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { AlDia } from "../src/app/(app)/traspasos/comunes";
(window as any).__refresh = 0;
createRoot(document.getElementById("r")!).render(<AlDia cada={1} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ad-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_ad-nav.ts"), "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext(); const pg = await ctx.newPage();
let sinSalida = false, sondas = 0;
await pg.route("http://localhost:4399/**", (r) => {
  const u = new URL(r.request().url());
  if (u.pathname === "/api/version") { sondas++; return sinSalida ? r.abort("failed") : r.fulfill({ contentType: "application/json", body: '{"version":"t"}' }) }
  return r.fulfill({ contentType: "text/html", body: `<!doctype html><body><div id="r"></div><script>${js}<\/script></body>` });
});
const abre = async () => { sinSalida = false; await pg.goto("http://localhost:4399/"); await pg.evaluate(() => sessionStorage.clear()); await pg.reload() };
const n = () => pg.evaluate(() => window.__refresh);

/* Con internet: pide al abrir y sigue cada segundo, hasta el tope de 6 por minuto. */
await abre(); await pg.waitForTimeout(700);
ok(await n() >= 1, "con internet pide al abrir: " + await n());
await pg.waitForTimeout(8000);
ok(await n() <= 6, "no más de 6 pedidos por minuto aunque el reloj sea de 1 s: " + await n());

/* Sin salida a internet (wifi prendido, nada responde): mide y no pide. */
await pg.goto("http://localhost:4399/"); await pg.evaluate(() => sessionStorage.clear());
sinSalida = true; await pg.reload(); await pg.waitForTimeout(4500);
ok(await n() === 0 && sondas > 0, `sin salida a internet no pide datos (mide ${sondas} veces): ` + await n());
await pg.evaluate(() => window.dispatchEvent(new Event("focus"))); await pg.waitForTimeout(300);
ok(await n() === 0, "ni al volver a la pestaña");

/* Navegador sin conexión: ni mide. */
await pg.goto("http://localhost:4399/"); await pg.evaluate(() => sessionStorage.clear());
await ctx.setOffline(true); sondas = 0; await pg.evaluate(() => { window.__refresh = 0 }).catch(() => {});
await pg.waitForTimeout(3000);
ok(await n() === 0, "sin conexión no pide: " + await n());
await ctx.setOffline(false);

/* Un corte reciente: no pide hasta que pasen unos segundos. */
await abre(); await pg.waitForTimeout(500);
await pg.evaluate(() => { window.__refresh = 0; window.dispatchEvent(new Event("offline")); window.dispatchEvent(new Event("online")) });
await pg.waitForTimeout(3000);
ok(await n() === 0, "justo después de un corte no pide: " + await n());
await pg.waitForTimeout(6000);
ok(await n() >= 1, "pasado un rato firme retoma: " + await n());

await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ AlDia: solo pide datos nuevos con internet de verdad (se mide antes), no después de un corte reciente y con tope por minuto: no hay bucle de recargas.");
