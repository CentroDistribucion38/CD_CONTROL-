/* La copia se prepara sola con internet y no se repite si es reciente. node .arnes/preparar-sola.mjs */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_ps-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { PrepararSola } from "../src/components/PrepararSola";
createRoot(document.getElementById("r")!).render(<PrepararSola rutas={["/inventario/tablero", "/inventario/fiscal"]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ps-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext();
const pg = await ctx.newPage(); 
await pg.clock.install();
let pedidas = [];
await pg.route("http://localhost:4398/**", (r) => {
  const u = new URL(r.request().url());
  if (u.pathname === "/") return r.fulfill({ contentType: "text/html", body: `<!doctype html><body><div id="r"></div><script>${js}<\/script></body>` });
  if (r.request().headers()["x-preparar"]) pedidas.push(u.pathname);
  return r.fulfill({ contentType: "text/html", body: "<html>pantalla</html>" });
});
const arranca = async (antes) => { pedidas = []; await pg.goto("http://localhost:4398/"); if (antes) await antes(); await pg.waitForSelector("#r", { state: "attached" }) };

await arranca(); await pg.clock.runFor(10_000);
ok(pedidas.length === 0, "no arranca de golpe: espera unos segundos");
await pg.clock.runFor(15_000); await pg.waitForTimeout(300);
ok(pedidas.sort().join() === "/inicio,/inventario/fiscal,/inventario/tablero,/perfil", "a los 20 s prepara las pantallas del menú: " + pedidas);
for (let i = 0; i < 50 && !(await pg.evaluate(() => localStorage.getItem("cd38.copia.preparada"))); i++) await pg.waitForTimeout(100);
const anotada = await pg.evaluate(() => JSON.parse(localStorage.getItem("cd38.copia.preparada")));
ok(anotada && anotada.fallidas === 0 && !!anotada.fecha, "queda anotada la preparación: " + JSON.stringify(anotada));

const guardarEnCache = (rutas) => pg.evaluate(async (rs) => { const c = await caches.open("control-paginas"); for (const r of rs) await c.put(location.origin + r, new Response("x")) }, rutas);
const TODAS = ["/inicio", "/perfil", "/inventario/tablero", "/inventario/fiscal"];
await arranca(); await guardarEnCache(TODAS); await pg.clock.runFor(30_000); await pg.waitForTimeout(200);
ok(pedidas.length === 0, "con todas guardadas y la copia reciente no vuelve a pedir nada: " + pedidas);

/* Falta una (la preparación de antes falló en esa): reciente o no, se pide solo la que falta. */
await pg.evaluate(async () => { await (await caches.open("control-paginas")).delete(location.origin + "/perfil") });
await arranca(); await pg.clock.runFor(30_000); await pg.waitForTimeout(300);
ok(pedidas.join() === "/perfil", "si falta una se pide solo esa, aunque la copia sea reciente: " + pedidas);

await pg.evaluate(() => localStorage.setItem("cd38.copia.preparada", JSON.stringify({ fecha: new Date(Date.now() - 7 * 3600_000).toISOString(), n: 4, fallidas: 0 })));
await ctx.setOffline(true);
await arranca(); await pg.clock.runFor(30_000); await pg.waitForTimeout(200);
ok(pedidas.length === 0, "sin internet no intenta");
await ctx.setOffline(false);
await arranca(); await pg.clock.runFor(30_000); await pg.waitForTimeout(300);
ok(pedidas.length === 4, "copia de más de 6 h y con internet: se renueva sola: " + pedidas.length);

/* Una pasada en la que todo falló no se anota como «preparada» (si no, frenaría el siguiente intento 6 horas). */
await pg.evaluate(() => { localStorage.clear(); return caches.delete("control-paginas") });
await pg.unroute("http://localhost:4398/**");
await pg.route("http://localhost:4398/**", (r) => { const u = new URL(r.request().url()); if (u.pathname === "/") return r.fulfill({ contentType: "text/html", body: `<!doctype html><body><div id="r"></div><script>${js}<\/script></body>` }); return r.fulfill({ status: 500, body: "no" }) });
await arranca(); await pg.clock.runFor(30_000); await pg.waitForTimeout(500);
ok(await pg.evaluate(() => localStorage.getItem("cd38.copia.preparada")) === null, "si todo falla no queda anotada una preparación");
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ La copia se prepara sola al abrir con internet (tras unos segundos), no se repite si es reciente y no corre sin internet.");
