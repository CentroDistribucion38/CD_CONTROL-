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
let cargas = 0;
await pg.clock.install({ time: new Date("2026-10-05T18:00:00Z") });
await pg.route("http://arnes.local/", (r) => { cargas++; return r.fulfill({ contentType: "text/html; charset=utf-8",
  body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head><body><div class="sh"><div id="r"></div></div><script>${js}<\/script></body></html>` }) });
const franja = () => pg.locator(".sh-copia");

await pg.goto("http://arnes.local/"); await pg.waitForSelector("main");
ok(await franja().count() === 0, "con internet y pantalla de la red no hay franja");

/* CON INTERNET y la pantalla salió de la copia: NO se asusta a nadie y NO hay que tocar nada. */
estado = { copia: true, hayCopia: true, fecha: "2026-09-29T19:05:00.000Z" };
await pg.evaluate(() => sessionStorage.clear());
await pg.goto("http://arnes.local/"); await pg.waitForSelector("main");
await pg.clock.runFor(1500); await pg.waitForTimeout(100);
ok(await franja().count() === 0, "con internet y copia no sale la franja de entrada");
/* llega lo nuevo: se recarga sola, una vez, y queda al día */
let antes = cargas;
estado = { copia: false, hayCopia: true, fecha: "2026-10-05T18:00:00.000Z" };
await pg.clock.runFor(1600); await pg.waitForTimeout(400);
ok(cargas === antes + 1, "al llegar lo nuevo se recarga sola, sin tocar nada (cargas " + antes + " → " + cargas + ")");
await pg.waitForSelector("main"); await pg.clock.runFor(1600); await pg.waitForTimeout(200);
ok(await franja().count() === 0 && cargas === antes + 1, "y queda sin franja ni más recargas");
ok(await pg.evaluate(() => sessionStorage.getItem("cd38.autoactualizo")) === null, "los intentos se olvidan al estar al día");

/* la red no firme: sigue saliendo la copia → reintenta sola cada pocos segundos, y solo al final avisa */
estado = { copia: true, hayCopia: true, fecha: "2026-09-29T19:05:00.000Z" };
await pg.evaluate(() => sessionStorage.clear());
await pg.goto("http://arnes.local/"); await pg.waitForSelector("main");
antes = cargas;
for (let i = 0; i < 5; i++) {
  await pg.waitForTimeout(300);                       // que la pantalla termine de preguntar «¿soy copia?»
  await pg.clock.runFor(7600); await pg.waitForTimeout(300);
  await pg.waitForSelector("main");
}
ok(cargas === antes + 5, "reintenta sola 5 veces sin que nadie toque nada (" + (cargas - antes) + ")");
ok(await franja().count() === 0, "mientras reintenta no asusta con la franja");
await pg.waitForTimeout(300); await pg.clock.runFor(7600); await pg.waitForSelector(".sh-copia");
ok(cargas === antes + 5, "y no recarga más de 5 veces");
ok(/Esta pantalla es una copia/.test(await franja().innerText()) && /29 de sept/.test(await franja().innerText()) && /14:05/.test(await franja().innerText()), "agotados los intentos: dice que es copia y de cuándo (hora de Colombia): " + await franja().innerText());
ok(await pg.locator(".sh-copia button").count() === 1, "y solo ahí ofrece «Ver lo de ahora»");

/* no se recarga encima de lo que la persona está escribiendo */
await pg.evaluate(() => sessionStorage.clear());
await pg.goto("http://arnes.local/"); await pg.waitForSelector("main");
await pg.evaluate(() => { const i = document.createElement("input"); i.id = "nota"; document.querySelector("main").appendChild(i); i.focus(); i.value = "pallet mojado" });
antes = cargas;
await pg.clock.runFor(9000); await pg.waitForTimeout(300);
ok(cargas === antes, "con algo escrito a medias no se recarga (" + (cargas - antes) + ")");

await ctx.setOffline(true);
await pg.waitForFunction(() => /Sin internet/.test(document.querySelector(".sh-copia")?.textContent ?? ""));
ok(/ver lo guardado hasta tu última conexión; no puedes realizar cambios/.test(await franja().innerText()), "sin internet lo dice con palabras de bodega: " + await franja().innerText());
ok(await pg.locator(".sh-copia button").count() === 0, "sin internet no ofrece recargar (no serviría)");
await pg.screenshot({ path: R(".arnes/_ac-sin-internet.png") });

/* El botón de actualizar no hace nada sin internet (si no, recargaría la copia en bucle). */
await pg.click(".sh-refrescar");
ok(await pg.evaluate(() => window.__refresh) === 0, "sin internet el botón de actualizar no refresca");

/* Cada cambio de red: se deja llegar el evento (tiempo real) y luego corre el reloj de mentira. */
const red = async (sin, ms) => { await ctx.setOffline(sin); await pg.waitForTimeout(150); await pg.clock.runFor(ms) };
/* VUELVE EL INTERNET: sin tocar nada, la pantalla carga lo de ahora. */
await pg.evaluate(() => sessionStorage.clear());
await pg.goto("http://arnes.local/"); await pg.waitForSelector("main");
estado = { copia: false, hayCopia: true, fecha: "2026-10-05T18:00:00.000Z" };
await ctx.setOffline(true);
await pg.waitForFunction(() => /Sin internet/.test(document.querySelector(".sh-copia")?.textContent ?? ""));
antes = cargas;
await ctx.setOffline(false);
await pg.clock.runFor(5200); await pg.waitForTimeout(400);
ok(cargas === antes + 1, "al volver el internet la pantalla se recarga SOLA, sin botón (" + antes + " → " + cargas + ")");
await pg.waitForSelector("main");
ok(await franja().count() === 0, "y ya no hay franja");
await pg.click(".sh-refrescar");
ok(await pg.evaluate(() => window.__refresh) === 1, "con internet otra vez sí refresca");
/* UN INTERNET QUE PARPADEA: ni franja que titila, ni recargas en cadena. */
estado = { copia: false, hayCopia: true, fecha: "2026-10-05T18:00:00.000Z" };
await pg.evaluate(() => sessionStorage.clear());
await pg.goto("http://arnes.local/"); await pg.waitForSelector("main"); await pg.waitForTimeout(300);
antes = cargas;
for (let i = 0; i < 6; i++) {
  await red(true, 1_000);
  await red(false, 1_000);
}
await pg.clock.runFor(8_000); await pg.waitForTimeout(300);
ok(await franja().count() === 0, "cortes de 1 s seguidos no muestran la franja (no titila)");
ok(cargas === antes, "y no recarga nada (" + (cargas - antes) + ")");
/* un corte de verdad con parpadeos adentro: la franja sale y se queda quieta; al volver FIRME recarga UNA vez */
await red(true, 3_000); await pg.waitForSelector(".sh-copia");
let vistas = 0;
for (let i = 0; i < 5; i++) {
  await red(false, 1_500);
  await red(true, 1_500);
  if (await franja().count() === 1) vistas++;
}
ok(vistas === 5 && cargas === antes, "con parpadeos adentro la franja no desaparece ni se recarga (" + vistas + " / " + (cargas - antes) + ")");
await red(false, 4_000); await pg.waitForTimeout(200);
ok(cargas === antes, "con 4 s de internet todavía no recarga (espera a que sea firme)");
await pg.clock.runFor(1_600); await pg.waitForTimeout(500);
ok(cargas === antes + 1, "con 5 s firmes recarga UNA sola vez (" + (cargas - antes) + ")");
await pg.waitForSelector("main");

await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Franja de copia: aparece sin internet o con pantalla de copia, dice de cuándo es, ofrece ver lo de ahora al volver la señal, y el botón de actualizar no recarga sin internet.");
