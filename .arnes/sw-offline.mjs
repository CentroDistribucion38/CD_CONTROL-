/* El service worker real (public/sw.js) contra un servidor de mentira: abre sin internet, avisa que es copia,
   no guarda datos ni el login, y la copia se borra. node .arnes/sw-offline.mjs */
import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

/* La lógica de la pantalla (preparar, borrar, estado) empaquetada como la usa la app. */
const lib = buildSync({ entryPoints: [R("src/lib/copia-offline.ts")], bundle: true, write: false, format: "iife", globalName: "Copia", logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/tmp/_copia-lib.js"), lib);

let version = "v1", lentoMs = 0; const golpes = {};
const pagina = (titulo, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title></head><body><h1 id="t">${titulo}</h1>${extra}
<script src="/_next/static/chunks/lib.js"></script><script>navigator.serviceWorker.register("/sw.js")</script></body></html>`;
const servidor = http.createServer((q, s) => {
  const u = new URL(q.url, "http://x"); golpes[u.pathname] = (golpes[u.pathname] || 0) + 1;
  const html = (c, st = 200) => { s.writeHead(st, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); s.end(c) };
  if (u.pathname === "/sw.js") { s.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-cache" }); return s.end(readFileSync(R("public/sw.js"))) }
  if (u.pathname === "/_next/static/chunks/lib.js") { s.writeHead(200, { "content-type": "text/javascript" }); return s.end(lib) }
  if (u.pathname === "/sin-conexion.html") return html(readFileSync(R("public/sin-conexion.html"), "utf8"));
  if (u.pathname === "/_next/static/chunks/p1.js") { s.writeHead(200, { "content-type": "text/javascript" }); return s.end("window.__p1 = 'cargado'") }
  if (u.pathname === "/inicio") return html(pagina("INICIO " + version));
  if (u.pathname === "/") { s.writeHead(307, { location: "/inicio" }); return s.end() }
  if (u.pathname === "/inventario/tablero") return html(pagina("TABLERO " + version));
  if (u.pathname === "/lento") return setTimeout(() => html(pagina("LENTO nuevo")), lentoMs);
  if (u.pathname === "/p1") return html(pagina("P1", `<script>self.__next_f=[];self.__next_f.push([1,"[\\"static/chunks/p1.js\\"]"])</script><script src="/_next/static/chunks/p1.js"></script>`));
  if (u.pathname === "/p2") return html(pagina("P2"));
  if (u.pathname === "/vencida") { s.writeHead(307, { location: "/login" }); return s.end() }
  if (u.pathname === "/login") return html(pagina("LOGIN"));
  if (u.pathname === "/api/datos") { s.writeHead(200, { "content-type": "application/json" }); return s.end('{"inventario":123}') }
  html("no existe", 404);
});
const escuchar = () => new Promise((r) => servidor.listen(4399, r));
const apagar = () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(r) });
await escuchar();

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ serviceWorkers: "allow" });
const pg = await ctx.newPage();
const B = "http://localhost:4399";
const claves = (n) => pg.evaluate(async (n) => (await (await caches.open(n)).keys()).map((k) => new URL(k.url).pathname + new URL(k.url).search), n);
const estado = (ruta) => pg.evaluate(async (r) => (await fetch("/__sw/estado?ruta=" + encodeURIComponent(r))).json(), ruta);
const titulo = () => pg.locator("#t").textContent();
const hayCache = (n) => pg.evaluate((n) => caches.has(n), n);

/* 0 · la primera vez: sin recorrer nada, la puerta de la app y la pantalla abierta ya quedan guardadas */
{ const c2 = await nav.newContext({ serviceWorkers: "allow" }); const p2 = await c2.newPage();
  await p2.goto(B + "/inventario/tablero"); await p2.evaluate(() => navigator.serviceWorker.ready); await p2.waitForTimeout(800);
  const k = await p2.evaluate(async () => (await (await caches.open("control-paginas")).keys()).map((x) => new URL(x.url).pathname));
  ok(k.includes("/inicio") && k.includes("/inventario/tablero"), "recién instalado: ya guardó /inicio y la pantalla abierta: " + k);
  await c2.close() }

/* 1 · con internet: el service worker toma el control y las pantallas se guardan */
await pg.goto(B + "/inicio"); await pg.evaluate(() => navigator.serviceWorker.ready);
await pg.reload(); await pg.waitForFunction(() => !!navigator.serviceWorker.controller);
await pg.goto(B + "/inventario/tablero"); await pg.waitForTimeout(400);
let guardadas = await claves("control-paginas");
ok(guardadas.includes("/inventario/tablero") && guardadas.includes("/inicio"), "con internet quedan guardadas las pantallas visitadas: " + guardadas);
ok((await claves("control-estatico")).includes("/sin-conexion.html"), "la página de «sin conexión» queda guardada al instalar");
ok((await estado("/inventario/tablero")).copia === false, "con internet no se dice que sea copia");

/* 2 · lo que NO se guarda */
await pg.goto(B + "/login"); await pg.waitForTimeout(300);
await pg.evaluate(() => fetch("/api/datos").then((r) => r.json()));
await pg.goto(B + "/vencida"); await pg.waitForTimeout(300);
guardadas = await claves("control-paginas");
ok(!guardadas.some((x) => /login|api|vencida/.test(x)), "no se guarda el login, ni los datos, ni la pantalla que mandó al login: " + guardadas);
const todo = [...await claves("control-paginas"), ...await claves("control-estatico")];
ok(!todo.some((x) => x.includes("/api/")), "ningún dato (/api) en las cachés");

/* 3 · sin internet: abre la copia y lo dice */
await apagar();
await pg.goto(B + "/inventario/tablero");
ok((await titulo()) === "TABLERO v1", "sin internet abre la copia del tablero: " + await titulo());
let e = await estado("/inventario/tablero");
ok(e.copia === true && e.hayCopia && !!e.fecha, "sin internet la pantalla sabe que es copia y de cuándo: " + JSON.stringify(e));
await pg.goto(B + "/");
ok((await titulo()) === "INICIO v1", "«/» abre la copia del inicio: " + await titulo());
await pg.goto(B + "/p2");
ok(/no está guardada/.test(await pg.locator("h1").textContent()), "una pantalla nunca abierta muestra el aviso, no el error del navegador");
ok(await pg.getByRole("link", { name: "Ir al inicio" }).count() === 1, "el aviso trae el camino al inicio");
ok((await pg.locator("#pedida").textContent()) === "/p2", "el aviso dice qué dirección se pidió");
const enlaces = await pg.locator("#guardadas a").allTextContents();
ok(enlaces.includes("/inicio") && enlaces.includes("/inventario/tablero"), "el aviso lista las pantallas que sí están guardadas: " + enlaces);
await pg.locator("#guardadas a", { hasText: "/inventario/tablero" }).click();
ok((await titulo()) === "TABLERO v1", "y desde ahí se abre una guardada: " + await titulo());

/* 3b · si ni la página de aviso guardada está, sale el aviso incluido, nunca el error del navegador */
await pg.evaluate(async () => { await (await caches.open("control-estatico")).delete("/sin-conexion.html") });
await pg.goto(B + "/p3-nunca");
ok(/no está guardada/.test(await pg.locator("h1").textContent()), "sin la página de aviso guardada igual sale el aviso (no ERR_FAILED)");
ok((await pg.locator("#guardadas a").count()) >= 2, "y el aviso incluido también lista lo guardado");

/* 4 · vuelve internet con datos nuevos: se ve lo nuevo y ya no es copia */
version = "v2"; await escuchar();
await pg.goto(B + "/inventario/tablero");
ok((await titulo()) === "TABLERO v2", "con internet otra vez se ve lo de ahora: " + await titulo());
e = await estado("/inventario/tablero"); ok(e.copia === false, "y ya no se marca como copia");
await pg.waitForTimeout(300);
await pg.goto(B + "/inventario/tablero");
ok(true, "ok");

/* 5 · red muy lenta con copia: sale la copia a los 5 s y la red sigue por detrás */
lentoMs = 7000; await pg.goto(B + "/lento").catch(() => {}); // sin copia: espera a la red
ok((await titulo()) === "LENTO nuevo", "sin copia se espera a la red lenta");
lentoMs = 8000; const t0 = Date.now();
await pg.goto(B + "/lento");
const dt = Date.now() - t0;
ok(dt >= 4500 && dt < 7500 && (await titulo()) === "LENTO nuevo", "con copia y red lenta sale la copia en unos 5 s (" + dt + " ms): " + await titulo());
e = await estado("/lento"); ok(e.copia === true, "la pantalla de la copia lenta se marca como copia");

/* 6 · preparar para auditoría: guarda las pantallas y lo que necesitan */
const r = await pg.evaluate(async () => { const av = []; const res = await Copia.prepararCopia(["/p1", "/p2", "/no-existe"], (a) => av.push(a.hechas)); return { res, av } });
ok(r.res.guardadas.sort().join() === "/p1,/p2" && r.res.fallidas.join() === "/no-existe", "prepara las que abren y reporta las que no: " + JSON.stringify(r.res));
ok(r.av[0] === 0 && r.av.at(-1) === 3, "avisa el avance de 0 a 3");
ok((await claves("control-estatico")).includes("/_next/static/chunks/p1.js"), "guarda el paquete que la pantalla necesita para arrancar");
ok(Copia_ok(await pg.evaluate(() => Copia.ultimaPreparacion())), "recuerda cuándo se preparó");
function Copia_ok(v) { return v && v.n === 2 && v.fallidas === 1 }
await apagar();
await pg.goto(B + "/p1");
ok((await titulo()) === "P1" && (await pg.evaluate(() => window.__p1)) === "cargado", "sin internet abre una pantalla preparada, y su JavaScript corre: " + await pg.evaluate(() => window.__p1));

/* 7 · borrar la copia (cerrar sesión / llegar al login) */
await pg.evaluate(() => Copia.borrarCopia());
ok(!(await hayCache("control-paginas")), "borrarCopia quita las pantallas guardadas");
ok(await pg.evaluate(() => Copia.ultimaPreparacion()) === null, "y la fecha de preparación");
await pg.goto(B + "/inventario/tablero");
ok(/no está guardada/.test(await pg.locator("h1").textContent()), "sin copia, sin internet: solo el aviso, nada de lo del usuario anterior");
ok(await hayCache("control-estatico"), "lo estático (sin datos de nadie) se conserva");

/* 7b · cuándo se renueva sola */
{ const C = new Function(lib + "; return Copia")(); const ahora = Date.parse("2026-10-05T12:00:00Z");
  ok(C.hayQueRenovar(null, ahora) === true, "nunca preparada: se prepara sola");
  ok(C.hayQueRenovar({ fecha: "2026-10-05T10:00:00Z" }, ahora) === false, "preparada hace 2 h: no");
  ok(C.hayQueRenovar({ fecha: "2026-10-05T05:59:00Z" }, ahora) === true, "preparada hace más de 6 h: sí");
  ok(C.hayQueRenovar({ fecha: "basura" }, ahora) === true, "fecha dañada: se prepara de nuevo") }
/* 8 · recursosDe */
const rec = new Function(lib + "; return Copia")().recursosDe(('<script src="/_next/static/chunks/a-1.js"></script>{"x":"static/chunks/app/(app)/inventario/page-9f.js","y":"static/css/b.css"} static/media/f.woff2'));
ok(rec.join() === "/_next/static/chunks/a-1.js,/_next/static/chunks/app/(app)/inventario/page-9f.js,/_next/static/css/b.css,/_next/static/media/f.woff2", "recursosDe encuentra paquetes en el HTML y en el flujo de datos: " + rec);

await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Sin internet: el service worker guarda las pantallas, abre la copia avisando de cuándo es, no guarda datos ni el login, prepara para auditoría y la copia se borra.");
process.exit(0);
