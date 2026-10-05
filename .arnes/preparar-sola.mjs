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
const fecha = await pg.evaluate(() => JSON.parse(localStorage.getItem("cd38.copia.preparada")).n);
ok(fecha === 4, "queda anotada la preparación: " + fecha);

await arranca(); await pg.clock.runFor(30_000); await pg.waitForTimeout(200);
ok(pedidas.length === 0, "con la copia reciente no vuelve a pedir nada");

await pg.evaluate(() => localStorage.setItem("cd38.copia.preparada", JSON.stringify({ fecha: new Date(Date.now() - 7 * 3600_000).toISOString(), n: 4, fallidas: 0 })));
await ctx.setOffline(true);
await arranca(); await pg.clock.runFor(30_000); await pg.waitForTimeout(200);
ok(pedidas.length === 0, "sin internet no intenta");
await ctx.setOffline(false);
await arranca(); await pg.clock.runFor(30_000); await pg.waitForTimeout(300);
ok(pedidas.length === 4, "copia de más de 6 h y con internet: se renueva sola: " + pedidas.length);
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ La copia se prepara sola al abrir con internet (tras unos segundos), no se repite si es reciente y no corre sin internet.");
