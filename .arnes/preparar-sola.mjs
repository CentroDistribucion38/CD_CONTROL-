/* La copia se va haciendo sola: qué pide, cuándo, y que no corre sin internet. node .arnes/preparar-sola.mjs */
import { writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_ps-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { PrepararSola } from "../src/components/PrepararSola";
createRoot(document.getElementById("r")!).render(<PrepararSola rutas={["/inventario/tablero", "/inventario/fiscal"]} dueno={new URLSearchParams(location.search).get("dueno") ?? undefined} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ps-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@": R("src") }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext();
const pg = await ctx.newPage();
await pg.clock.install();
let pedidas = [], falla = false, sinSalida = false, sondas = 0;
await pg.route("http://localhost:4398/**", (r) => {
  const u = new URL(r.request().url());
  if (u.pathname === "/") return r.fulfill({ contentType: "text/html", body: `<!doctype html><body><div id="r"></div><script>${js}<\/script></body>` });
  /* La medición de internet: responde bien, o (conectado sin salida) no responde. */
  if (u.pathname === "/api/version") { sondas++; return sinSalida ? r.abort("failed") : r.fulfill({ contentType: "application/json", body: '{"version":"t"}' }) }
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
/* El reloj de mentira avanza de a poco: así la medición de internet (un pedido real) alcanza a responder antes de que «pasen» sus 3 s. */
const avanza = async (ms) => { for (let t = 0; t < ms; t += 1000) { await pg.clock.runFor(Math.min(1000, ms - t)); await pg.waitForTimeout(8) } await pg.waitForTimeout(40) };
const esperaFin = async () => { for (let i = 0; i < 30; i++) await pg.waitForTimeout(50) };

/* Equipo nuevo: no espera mucho y guarda todo. */
await arranca(); await vaciar(); await avanza(1_000);
ok(pedidas.length === 0, "no arranca de golpe");
await avanza(4_000); await esperaFin();
ok([...pedidas].sort().join() === [...TODAS].sort().join(), "a los pocos segundos pide todas las del menú: " + pedidas);

ok(await pg.locator(".sh-chipcopia").count() === 0, "la copia no muestra ningún mensaje");
await avanza(7_000);
ok(await pg.locator(".sh-chipcopia").count() === 0, "ni después");

/* Descubre pantallas siguiendo los enlaces de las guardadas, y las pide en el siguiente ciclo. */
await avanza(5 * 60_000 + 1000); await esperaFin();
await pg.evaluate(async (rs) => { const c = await caches.open("control-paginas"); for (const r of rs) await c.put(location.origin + r, new Response("x", { headers: { "x-copia-fecha": new Date().toISOString() } })) }, TODAS);
pedidas = []; await avanza(5 * 60_000 + 1000); await esperaFin();
ok([...pedidas].sort().join() === "/quiebra,/quiebra/tablero", "siguiendo los enlaces del inicio descubre /quiebra y /quiebra/tablero, y no la API, ni archivos, ni ids: " + pedidas);
ok(JSON.parse(await pg.evaluate(() => localStorage.getItem("cd38.copia.rutas"))).includes("/quiebra"), "las descubiertas quedan anotadas");
await pg.evaluate(() => localStorage.removeItem("cd38.copia.rutas"));   // para los demás casos

/* Todo guardado y reciente: no vuelve a pedir nada, ni pasados los minutos. */
await arranca(); await vaciar(); await guardar(TODAS, 1); await avanza(60_000); await esperaFin();
ok(pedidas.length === 0, "con todo reciente no pide nada: " + pedidas);

/* Falta una: se pide solo esa. */
await arranca(); await vaciar(); await guardar(TODAS.filter((r) => r !== "/perfil"), 1); await avanza(10_000); await esperaFin();
ok(pedidas.join() === "/perfil", "si falta una pide solo esa: " + pedidas);

/* Copias viejas: en cada ciclo (5 min) se renuevan de a tres, las más viejas. */
await arranca(); await vaciar();
await pg.evaluate(async () => { const c = await caches.open("control-paginas"); const mk = (r, m) => c.put(location.origin + r, new Response("x", { headers: { "x-copia-fecha": new Date(Date.now() - m * 60000).toISOString() } }));
  await mk("/inicio", 100); await mk("/perfil", 90); await mk("/inventario/tablero", 80); await mk("/inventario/fiscal", 70) });
await avanza(6_000); await esperaFin();
ok(pedidas.join() === "/inicio,/perfil,/inventario/tablero", "con copias de más de 30 min renueva las 3 más viejas por ciclo: " + pedidas);

/* «Conectado» pero sin salida a internet: mide, ve que no hay, y no pide nada. */
await arranca(); await vaciar(); sinSalida = true; sondas = 0; await avanza(10_000); await esperaFin();
ok(sondas > 0 && pedidas.length === 0, `con wifi pero sin salida a internet mide (${sondas}) y no pide nada: ${pedidas}`);
sinSalida = false;

/* Sin internet no intenta; al volver, retoma. */
pedidas = []; await ctx.setOffline(true); await avanza(5 * 60_000 + 1000); await esperaFin();
ok(pedidas.length === 0, "sin internet no intenta");
await ctx.setOffline(false); await pg.evaluate(() => window.dispatchEvent(new Event("online"))); await avanza(4_000); await esperaFin();
ok(pedidas.length === 0, "recién vuelve el internet espera a que sea firme (no arranca a los 4 s): " + pedidas);
await avanza(8_000); await esperaFin();
ok(pedidas.length > 0, "al llevar un rato firme el internet retoma sola: " + pedidas);

/* Un internet que PARPADEA: no arranca a cada «online», solo cuando lleva un rato seguido. */
await pg.evaluate(async () => { const c = await caches.open("control-paginas"); for (const k of await c.keys()) await c.delete(k) });
pedidas = []; await avanza(60_000); await esperaFin(); pedidas = [];
for (let i = 0; i < 6; i++) {
  await ctx.setOffline(true); await pg.evaluate(() => window.dispatchEvent(new Event("offline"))); await avanza(1_500);
  await ctx.setOffline(false); await pg.evaluate(() => window.dispatchEvent(new Event("online"))); await avanza(2_000);
}
await esperaFin();
ok(pedidas.length === 0, "parpadeando 6 veces no pide nada: " + pedidas);
await avanza(12_000); await esperaFin();
ok(pedidas.length > 0, "ya firme, pide lo que falta: " + pedidas);

/* La copia se queda con su dueño: la misma persona que vuelve a entrar la conserva; otra, no. */
const marca = () => pg.evaluate(async () => { const c = await caches.open("control-paginas"); await c.put(location.origin + "/viejo", new Response("x")) });
const hay = () => pg.evaluate(async () => !!(await (await caches.open("control-paginas")).match(location.origin + "/viejo")));
await pg.goto("http://localhost:4398/?dueno=A"); await avanza(500);
await marca(); await pg.goto("http://localhost:4398/?dueno=A"); await avanza(500);
ok(await hay(), "la misma persona que vuelve a entrar conserva su copia");
await pg.goto("http://localhost:4398/?dueno=B"); await avanza(500);
ok(!(await hay()), "si entra otra persona, la copia de la anterior se borra");

/* Si todo falla no queda anotada una preparación. */
falla = true; await pg.evaluate(() => { localStorage.clear(); return caches.delete("control-paginas") });
await arranca(); await avanza(6_000); await esperaFin();
ok(await pg.evaluate(() => localStorage.getItem("cd38.copia.preparada")) === null, "si todo falla no queda anotada una preparación");

await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ La copia se va haciendo sola: guarda lo que falta, renueva de a poco lo viejo (primero la pantalla que se mira), no corre sin internet y retoma al volver.");
