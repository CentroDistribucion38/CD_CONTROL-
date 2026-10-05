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
let cargas = 0, pings = 0, ping = "ok";
await pg.clock.install({ time: new Date("2026-10-05T18:00:00Z") });
await pg.route("http://arnes.local/api/version**", (r) => { pings++; return ping === "ok" ? r.fulfill({ contentType: "application/json", body: '{"version":"x"}' }) : r.abort("internetdisconnected") });
await pg.route("http://arnes.local/", (r) => { cargas++; return r.fulfill({ contentType: "text/html; charset=utf-8",
  body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head><body><div class="sh"><div id="r"></div></div><script>${js}<\/script></body></html>` }) });
const franja = () => pg.locator(".sh-copia");
const COPIA = { copia: true, hayCopia: true, fecha: "2026-09-29T19:05:00.000Z" }, AL_DIA = { copia: false, hayCopia: true, fecha: "2026-10-05T18:00:00.000Z" };
/* El reloj de mentira corre de a poco (así la pantalla alcanza a preguntar entre un tic y otro). */
const corre = async (ms) => { for (let t = 0; t < ms; t += 500) { await pg.clock.runFor(500); await pg.waitForTimeout(25) } await pg.waitForTimeout(150) };
const abre = async (e) => { estado = e; if (pg.url() === "about:blank") await pg.goto("http://arnes.local/"); await pg.evaluate(() => sessionStorage.clear()); await pg.goto("http://arnes.local/"); await pg.waitForSelector("main"); await pg.waitForTimeout(250) };

/* 1 · TODO NORMAL: ni franja ni un solo pedido de más */
await abre(AL_DIA); pings = 0;
await corre(15_000);
ok(await franja().count() === 0 && pings === 0, "con internet y la pantalla al día no hay franja y no se gasta ni un pedido de medición (" + pings + ")");

/* 2 · CON INTERNET y la pantalla salió de la copia: la sonda responde, se recarga sola, una vez, SIN botón */
ping = "ok"; await abre(COPIA); let antes = cargas;
await corre(2_500);
ok(await franja().count() === 0 && cargas === antes, "con copia e internet no sale franja ni recarga de entrada");
estado = AL_DIA;                                   // lo que mostrará la recarga
await corre(5_000);
ok(cargas === antes + 1, "con la sonda buena dos veces seguidas se recarga SOLA, una vez (" + (cargas - antes) + ")");
await pg.waitForSelector("main"); await corre(10_000);
ok(await franja().count() === 0 && cargas === antes + 1, "y queda al día, sin franja ni más recargas");

/* 3 · EL WIFI PRENDIDO SIN SALIDA («conectado» y mudo): navigator.onLine dice que sí; la sonda dice que no */
ping = "caido"; await abre(COPIA); antes = cargas;
await corre(9_000);
ok(await franja().count() === 1 && /Sin internet/.test(await franja().innerText()), "sin salida real: dice «Sin internet» (no «copia»): " + await franja().innerText());
ok(cargas === antes, "y NO recarga nada mientras no haya internet de verdad (" + (cargas - antes) + " recargas)");
await corre(60_000);
ok(cargas === antes && await franja().count() === 1, "un minuto después sigue igual: franja quieta y ninguna recarga (no parpadea)");
ok(await pg.locator(".sh-copia button").count() === 0, "sin internet no ofrece botón que no serviría");
/* vuelve la salida: 2 sondas buenas y recarga UNA vez */
ping = "ok"; estado = AL_DIA;
await corre(7_000);
ok(cargas === antes + 1, "al volver la salida real se recarga SOLA, una vez (" + (cargas - antes) + ")");
await pg.waitForSelector("main");

/* 4 · SIN RED DEL TODO (el navegador lo sabe): franja, ningún pedido, y al volver recarga sola */
ping = "ok"; await abre(AL_DIA); antes = cargas; pings = 0;
await ctx.setOffline(true); await pg.waitForTimeout(150);
await corre(7_000);
ok(await franja().count() === 1 && /Sin internet/.test(await franja().innerText()), "sin red: dice «Sin internet»");
ok(/ver lo guardado hasta tu última conexión; no puedes realizar cambios/.test(await franja().innerText()), "con palabras de bodega: " + await franja().innerText());
ok(pings === 0, "sin red no se hace ningún pedido de medición (" + pings + ")");
await pg.screenshot({ path: R(".arnes/_ac-sin-internet.png") });
await pg.click(".sh-refrescar");
ok(await pg.evaluate(() => window.__refresh) === 0, "sin internet el botón de actualizar no refresca");
await ctx.setOffline(false); await pg.waitForTimeout(150);
await corre(7_000);
ok(cargas === antes + 1, "al volver la red se recarga SOLA, sin botón (" + (cargas - antes) + ")");
await pg.waitForSelector("main"); await pg.waitForTimeout(250);
await pg.click(".sh-refrescar"); await pg.waitForTimeout(400);
ok(await pg.evaluate(() => window.__refresh) === 1, "con internet otra vez sí refresca");

/* 5 · UN INTERNET QUE PARPADEA: un corte corto no mueve nada */
await abre(AL_DIA); antes = cargas;
for (let i = 0; i < 3; i++) { await corre(4_700); await ctx.setOffline(true); await pg.waitForTimeout(100); await corre(900); await ctx.setOffline(false); await pg.waitForTimeout(100) }
await corre(9_000);
ok(await franja().count() === 0 && cargas === antes, "tres cortes de menos de 1 s no muestran franja ni recargan (" + (cargas - antes) + ")");
/* y si parpadea en serio y luego se estabiliza: la franja se queda quieta y recarga UNA sola vez al final */
let vistas = [];
for (let i = 0; i < 8; i++) { await ctx.setOffline(true); await pg.waitForTimeout(100); await corre(2_300); await ctx.setOffline(false); await pg.waitForTimeout(100); await corre(1_700); vistas.push(await franja().count()) }
const cambios = vistas.filter((v, i) => i > 0 && v !== vistas[i - 1]).length;
ok(cambios <= 1, "con parpadeo fuerte la franja no titila (" + vistas + ")");
const antesFin = cargas;
await corre(14_000);
ok(cargas - antesFin <= 1 && cargas - antes <= 1, "al estabilizarse recarga como mucho UNA vez (" + (cargas - antes) + ")");
await pg.waitForSelector("main");

/* 6 · NO SE RECARGA ENCIMA DE LO QUE LA PERSONA ESTÁ ESCRIBIENDO */
await abre(COPIA);
await pg.evaluate(() => { const i = document.createElement("input"); document.querySelector("main").appendChild(i); i.focus(); i.value = "pallet mojado" });
antes = cargas; await corre(12_000);
ok(cargas === antes, "con algo escrito a medias no se recarga (" + (cargas - antes) + ")");

/* 7 · CON INTERNET FIRME PERO LA RECARGA SIGUE SALIENDO DE LA COPIA: reintenta 5 veces y solo entonces avisa */
ping = "ok"; await abre(COPIA); antes = cargas;
for (let i = 0; i < 5; i++) { await corre(6_500); await pg.waitForSelector("main"); await pg.waitForTimeout(250) }
ok(cargas === antes + 5, "reintenta sola 5 veces (" + (cargas - antes) + ")");
ok(await franja().count() === 0, "mientras reintenta no asusta con la franja");
await corre(8_000); await pg.waitForSelector(".sh-copia");
ok(cargas === antes + 5 && /Esta pantalla es una copia/.test(await franja().innerText()) && /29 de sept/.test(await franja().innerText()) && /14:05/.test(await franja().innerText()), "agotados los intentos: dice que es copia y de cuándo (hora de Colombia): " + await franja().innerText());
ok(await pg.locator(".sh-copia button").count() === 1, "y solo ahí ofrece «Ver lo de ahora»");

await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Franja de copia: se mide el internet de verdad (el wifi prendido sin salida cuenta como corte), la franja queda quieta sin recargar en bucle, al volver la señal recarga sola sin botón, y los parpadeos no la mueven.");
