/* La copia de TODO la hace el service worker: abres solo el inicio y quedan guardadas todas las pantallas enlazadas. node .arnes/sw-rastreo.mjs */
import http from "node:http";
import { readFileSync } from "node:fs";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
let sesion = true; const golpes = {};
const pg = (t, links = [], extra = "") => `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title></head><body><h1 id="t">${t}</h1>${links.map((l) => `<a href="${l}">x</a>`).join("")}${extra}<script src="/_next/static/chunks/c-${t}.js"></script><script>navigator.serviceWorker.register("/sw.js")</script></body></html>`;
const paginas = {
  "/inicio": pg("INICIO", ["/a", "/b", "/perfil", "/api/x", "/logo.png", "/modulo/6f1c2d3e-aaaa-bbbb-cccc-111122223333"]),
  "/a": pg("A", ["/a/x", "/inicio"]), "/b": pg("B"), "/a/x": pg("AX"), "/perfil": pg("PERFIL"),
};
const servidor = http.createServer((q, s) => {
  const u = new URL(q.url, "http://x"); golpes[u.pathname] = (golpes[u.pathname] || 0) + 1;
  const h = (c, st = 200) => { s.writeHead(st, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); s.end(c) };
  if (u.pathname === "/sw.js") { s.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-cache" }); return s.end(readFileSync(R("public/sw.js"))) }
  if (u.pathname.startsWith("/_next/static/")) { s.writeHead(200, { "content-type": "text/javascript" }); return s.end("1") }
  if (u.pathname === "/sin-conexion.html") return h(readFileSync(R("public/sin-conexion.html"), "utf8"));
  if (u.pathname === "/api/version") { s.writeHead(200, { "content-type": "application/json" }); return s.end('{"v":1}') }
  if (u.pathname === "/login") return h("LOGIN");
  if (!sesion) { s.writeHead(307, { location: "/login" }); return s.end() }
  if (paginas[u.pathname]) return h(paginas[u.pathname]);
  h("no", 404);
});
await new Promise((r) => servidor.listen(4396, r));
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const B = "http://localhost:4396";
const claves = (p, n) => p.evaluate(async (n) => (await (await caches.open(n)).keys()).map((k) => new URL(k.url).pathname), n);

/* Con sesión: se abre SOLO el inicio y el service worker recorre lo demás. */
{ const ctx = await nav.newContext({ serviceWorkers: "allow" }); const p = await ctx.newPage();
  await p.goto(B + "/inicio"); await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForTimeout(2500);
  const g = await claves(p, "control-paginas");
  ok(["/inicio", "/a", "/b", "/perfil", "/a/x"].every((r) => g.includes(r)), "con solo abrir el inicio quedan guardadas todas las enlazadas (también las de segundo nivel): " + g);
  ok(!g.some((r) => /api|logo|6f1c2d3e/.test(r)), "sin API, archivos ni ids sueltos: " + g);
  const e = await claves(p, "control-estatico");
  ok(["c-A", "c-AX", "c-B", "c-PERFIL"].every((n) => e.some((x) => x.includes(n))), "y los archivos que cada pantalla necesita para arrancar: " + e);
  /* Sin internet abre una pantalla que nunca se visitó. */
  await ctx.setOffline(true);
  await p.goto(B + "/a/x"); ok(await p.locator("#t").textContent() === "AX", "sin internet abre /a/x, que nunca se visitó");
  await ctx.setOffline(false);
  /* No insiste: dentro de los 10 minutos no vuelve a recorrer todo. */
  const antes = golpes["/b"]; await p.reload(); await p.waitForTimeout(1200);
  ok(golpes["/b"] === antes, "no vuelve a recorrer a cada pantalla (solo cada 10 min): " + antes + " → " + golpes["/b"]);
  await ctx.close() }

/* Sin sesión: no guarda nada de nadie. */
{ sesion = false; for (const k in golpes) delete golpes[k];
  const ctx = await nav.newContext({ serviceWorkers: "allow" }); const p = await ctx.newPage();
  await p.goto(B + "/inicio"); await p.waitForTimeout(1500);
  const g = await claves(p, "control-paginas").catch(() => []);
  ok(!g.some((r) => ["/a", "/b", "/perfil"].includes(r)), "sin sesión no se recorre ni se guarda nada: " + g);
  ok(!golpes["/a"], "ni siquiera se piden las pantallas");
  await ctx.close() }

await nav.close(); servidor.close(); servidor.closeAllConnections();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Copia de TODO por el service worker: con abrir el inicio guarda todas las pantallas enlazadas y lo que necesitan, abre sin internet lo que nunca se visitó, no insiste y sin sesión no guarda nada.");
