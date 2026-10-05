/* La copia se va haciendo sola: qué pide, cuándo, y que no corre sin internet. node .arnes/preparar-sola.mjs */
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
let pedidas = [], falla = false;
await pg.route("http://localhost:4398/**", (r) => {
  const u = new URL(r.request().url());
  if (u.pathname === "/") return r.fulfill({ contentType: "text/html", body: `<!doctype html><body><div id="r"></div><script>${js}<\/script></body>` });
  if (r.request().headers()["x-preparar"]) pedidas.push(u.pathname);
  /* El inicio trae el menú: enlaces a otras pantallas (una nueva, un archivo, un id suelto, la API). */
  const enlaces = u.pathname === "/inicio" ? '<a href="/quiebra">Quiebra</a><a href="/quiebra/tablero/">T</a><a href="/api/x">api</a><a href="/logo.png">l</a><a href="/roturas/salida/6f1c2d3e-aaaa-bbbb-cccc-111122223333">id</a><a href="/inventario/tablero">ya</a>' : "";
  return falla ? r.fulfill({ status: 500, body: "no" }) : r.fulfill({ contentType: "text/html", body: "<html>pantalla" + enlaces + "</html>" });
});
const TODAS = ["/inicio", "/perfil", "/inventario/tablero", "/inventario/fiscal"];
const arranca = async () => { pedidas = []; await pg.goto("http://localhost:4398/"); await pg.waitForSelector("#r", { state: "attached" }) };
const guardar = (rutas, haceMin) => pg.evaluate(async ([rs, m]) => { const c = await caches.open("control-paginas");
  for (const r of rs) await c.put(location.origin + r, new Response("x", { headers: { "x-copia-fecha": new Date(Date.now() - m * 60000).toISOString() } })) }, [rutas, haceMin]);
const vaciar = () => pg.evaluate(() => caches.delete("control-paginas"));
const esperaFin = async () => { for (let i = 0; i < 30; i++) await pg.waitForTimeout(50) };

/* Equipo nuevo: no espera mucho y guarda todo. */
await arranca(); await vaciar(); await pg.clock.runFor(2_000);
ok(pedidas.length === 0, "no arranca de golpe");
await pg.clock.runFor(4_000); await esperaFin();
ok([...pedidas].sort().join() === [...TODAS].sort().join(), "a los pocos segundos pide todas las del menú: " + pedidas);

ok(/Copia lista/.test(await pg.locator(".sh-chipcopia").innerText()), "al terminar la primera pasada avisa «Copia lista»: " + await pg.locator(".sh-chipcopia").count());
await pg.clock.runFor(7_000);
ok(await pg.locator(".sh-chipcopia").count() === 0, "y el aviso se quita solo");

/* Descubre pantallas siguiendo los enlaces de las guardadas, y las pide en el siguiente ciclo. */
await pg.clock.runFor(5 * 60_000 + 1000); await esperaFin();
await pg.evaluate(async (rs) => { const c = await caches.open("control-paginas"); for (const r of rs) await c.put(location.origin + r, new Response("x", { headers: { "x-copia-fecha": new Date().toISOString() } })) }, TODAS);
pedidas = []; await pg.clock.runFor(5 * 60_000 + 1000); await esperaFin();
ok([...pedidas].sort().join() === "/quiebra,/quiebra/tablero", "siguiendo los enlaces del inicio descubre /quiebra y /quiebra/tablero, y no la API, ni archivos, ni ids: " + pedidas);
ok(JSON.parse(await pg.evaluate(() => localStorage.getItem("cd38.copia.rutas"))).includes("/quiebra"), "las descubiertas quedan anotadas");
await pg.evaluate(() => localStorage.removeItem("cd38.copia.rutas"));   // para los demás casos

/* Todo guardado y reciente: no vuelve a pedir nada, ni pasados los minutos. */
await arranca(); await vaciar(); await guardar(TODAS, 1); await pg.clock.runFor(60_000); await esperaFin();
ok(pedidas.length === 0, "con todo reciente no pide nada: " + pedidas);

/* Falta una: se pide solo esa. */
await arranca(); await vaciar(); await guardar(TODAS.filter((r) => r !== "/perfil"), 1); await pg.clock.runFor(10_000); await esperaFin();
ok(pedidas.join() === "/perfil", "si falta una pide solo esa: " + pedidas);

/* Copias viejas: en cada ciclo (5 min) se renuevan de a tres, las más viejas. */
await arranca(); await vaciar();
await pg.evaluate(async () => { const c = await caches.open("control-paginas"); const mk = (r, m) => c.put(location.origin + r, new Response("x", { headers: { "x-copia-fecha": new Date(Date.now() - m * 60000).toISOString() } }));
  await mk("/inicio", 100); await mk("/perfil", 90); await mk("/inventario/tablero", 80); await mk("/inventario/fiscal", 70) });
await pg.clock.runFor(6_000); await esperaFin();
ok(pedidas.join() === "/inicio,/perfil,/inventario/tablero", "con copias de más de 30 min renueva las 3 más viejas por ciclo: " + pedidas);

/* Sin internet no intenta; al volver, retoma. */
pedidas = []; await ctx.setOffline(true); await pg.clock.runFor(5 * 60_000 + 1000); await esperaFin();
ok(pedidas.length === 0, "sin internet no intenta");
await ctx.setOffline(false); await pg.evaluate(() => window.dispatchEvent(new Event("online"))); await pg.clock.runFor(4_000); await esperaFin();
ok(pedidas.length > 0, "al volver el internet retoma sola: " + pedidas);

/* Si todo falla no queda anotada una preparación. */
falla = true; await pg.evaluate(() => { localStorage.clear(); return caches.delete("control-paginas") });
await arranca(); await pg.clock.runFor(6_000); await esperaFin();
ok(await pg.evaluate(() => localStorage.getItem("cd38.copia.preparada")) === null, "si todo falla no queda anotada una preparación");

await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ La copia se va haciendo sola: guarda lo que falta, renueva de a poco lo viejo (primero la pantalla que se mira), no corre sin internet y retoma al volver.");
