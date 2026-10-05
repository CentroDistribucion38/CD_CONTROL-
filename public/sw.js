/**
 * Service worker de CONTROL: que la app ABRA sin internet.
 *
 * QUÉ HACE
 *  · Las pantallas (el HTML) se piden siempre a la red primero. Si la red
 *    responde, se muestra lo de la red y se deja una COPIA fechada. Si no
 *    responde (sin señal, o más de 5 s en responder habiendo copia), se
 *    muestra la copia. Con internet, el que ve datos viejos es solo quien
 *    tiene una red tan mala que no contesta: y se le avisa.
 *  · Lo que no cambia (los paquetes de JavaScript y CSS con huella en el
 *    nombre, íconos, logos, tipografías) se guarda y se sirve de ahí.
 *  · Los DATOS NO se guardan aquí: nada de /api, ni de Supabase, ni de
 *    /auth, ni de las peticiones que no son GET. Sin internet esas fallan
 *    como antes, y la pantalla lo dice.
 *
 * POR QUÉ LAS PETICIONES «RSC» NO SE TOCAN
 *  Al navegar dentro de la app, Next pide un fragmento de la pantalla (RSC)
 *  que depende de la pantalla donde ya estás: servirlo de una copia puede
 *  armar una pantalla incompleta. Si esa petición falla (sin internet),
 *  Next recarga la página completa, y esa sí sale de la copia. Funciona,
 *  solo que sin la transición suave.
 *
 * LAS COPIAS SON DE QUIEN ENTRÓ: se borran al cerrar sesión y al llegar al
 * login (src/lib/copia-offline.ts). Aquí no se borra nada solo.
 */

const PAGINAS = "control-paginas";
const ESTATICO = "control-estatico";
const META = "control-meta";
const SIN_CONEXION = "/sin-conexion.html";
const ESPERA_MS = 5000;
const MAX_ESTATICO = 900;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      try {
        const c = await caches.open(ESTATICO);
        const r = await fetch(SIN_CONEXION, { cache: "reload" });
        if (r.ok && !r.redirected) await c.put(SIN_CONEXION, r);
      } catch {
        /* sin internet al instalar: la página de aviso se guarda en la próxima */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      /* Versiones viejas dejaron cachés con otros nombres: se borran. Las
         nuestras NO se tocan, porque son la copia de la persona. */
      for (const n of await caches.keys()) {
        if (n !== PAGINAS && n !== ESTATICO && n !== META) await caches.delete(n);
      }
      /* Lo estático se acumula con cada despliegue: se quita lo más viejo. */
      const c = await caches.open(ESTATICO);
      const llaves = await c.keys();
      if (llaves.length > MAX_ESTATICO) {
        for (const k of llaves.slice(0, llaves.length - MAX_ESTATICO)) {
          if (!k.url.endsWith(SIN_CONEXION)) await c.delete(k);
        }
      }
      await self.clients.claim();
    })()
  );
});

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** La llave de una pantalla: su dirección sin el # (el origen va incluido). */
function llaveDe(url) {
  return new URL(url.pathname + url.search, self.location.origin).href;
}

/** ¿Es una pantalla que se puede guardar? Solo HTML bueno, y nunca el login. */
function guardable(r) {
  if (!r || r.type === "opaqueredirect" || r.status !== 200) return false;
  const tipo = r.headers.get("content-type") || "";
  if (!tipo.includes("text/html")) return false;
  try {
    const p = new URL(r.url).pathname;
    if (p.startsWith("/login") || p.startsWith("/auth")) return false;
  } catch { /* sin url: se deja pasar */ }
  return true;
}

async function guardarPagina(llave, r) {
  const cuerpo = await r.clone().blob();
  const cab = new Headers();
  cab.set("content-type", r.headers.get("content-type") || "text/html; charset=utf-8");
  cab.set("x-copia-fecha", new Date().toISOString());
  /* Una respuesta «redirigida» no se puede entregar a una navegación: se guarda como una limpia. */
  const limpia = new Response(cuerpo, { status: 200, headers: cab });
  const c = await caches.open(PAGINAS);
  await c.put(llave, limpia);
}

async function marcar(llave, origen) {
  try {
    const c = await caches.open(META);
    await c.put(new Request(new URL("/__meta/" + encodeURIComponent(llave), self.location.origin).href), new Response(origen));
  } catch { /* el aviso es de cortesía: si no se puede anotar, la pantalla igual sale */ }
}

async function copiaDe(llave, url) {
  const c = await caches.open(PAGINAS);
  const r = await c.match(llave);
  if (r) return r;
  /* «/» solo redirige a /inicio: si no hay copia de «/», sirve la de /inicio. */
  if (url.pathname === "/" && !url.search) return c.match(llaveDe(new URL("/inicio", self.location.origin)));
  return null;
}

async function pagina(evento) {
  const req = evento.request;
  const url = new URL(req.url);
  const llave = llaveDe(url);

  /* «Preparar para auditoría»: va a la red sí o sí, guarda, y no recibe copias ni avisos. */
  if (req.headers.get("x-preparar")) {
    const r = await fetch(req);
    if (guardable(r)) await guardarPagina(llave, r);
    return r;
  }

  const hay = await copiaDe(llave, url);
  const red = fetch(req).then((r) => {
    /* Guardar la copia no retrasa la pantalla: se hace por detrás. */
    if (guardable(r)) evento.waitUntil(guardarPagina(llave, r).then(() => marcar(llave, "red")));
    else if (r.type !== "opaqueredirect") evento.waitUntil(marcar(llave, "red"));
    return r;
  });

  if (!hay) {
    try { return await red; }
    catch {
      const c = await caches.open(ESTATICO);
      return (await c.match(SIN_CONEXION)) || Response.error();
    }
  }

  /* Hay copia: se espera a la red un rato; si no llega, se muestra la copia y la red sigue por detrás. */
  evento.waitUntil(red.catch(() => {}));
  const r = await Promise.race([red.catch(() => null), esperar(ESPERA_MS).then(() => null)]);
  if (r) return r;
  await marcar(llave, "copia");
  return hay;
}

/** Lo que no cambia: primero lo guardado; si no está, se pide y se guarda. */
async function primeroCopia(req) {
  const c = await caches.open(ESTATICO);
  const g = await c.match(req);
  if (g) return g;
  const r = await fetch(req);
  if (r.ok && r.type !== "opaqueredirect") await c.put(req, r.clone());
  return r;
}

/** Tipografías e imágenes optimizadas: lo guardado sale al instante y se refresca por detrás. */
async function guardadoYRefresca(evento) {
  const req = evento.request;
  const c = await caches.open(ESTATICO);
  const g = await c.match(req);
  const red = fetch(req).then(async (r) => {
    if (r.ok || r.type === "opaque") await c.put(req, r.clone());
    return r;
  });
  if (g) { evento.waitUntil(red.catch(() => {})); return g; }
  return red;
}

/** Lo que la pantalla pregunta: «¿lo que estoy viendo es una copia?». Nunca sale a la red. */
async function estado(url) {
  const ruta = url.searchParams.get("ruta") || "/";
  const llave = llaveDe(new URL(ruta, self.location.origin));
  let origen = "red", fecha = null, hayCopia = false;
  try {
    const m = await (await caches.open(META)).match(new Request(new URL("/__meta/" + encodeURIComponent(llave), self.location.origin).href));
    if (m) origen = await m.text();
    const p = await (await caches.open(PAGINAS)).match(llave);
    if (p) { hayCopia = true; fecha = p.headers.get("x-copia-fecha") }
  } catch { /* se responde con lo que se tenga */ }
  return new Response(JSON.stringify({ copia: origen === "copia", hayCopia, fecha }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") evento.respondWith(guardadoYRefresca(evento));
    return;                               // Supabase y el resto: derecho a la red, sin tocar
  }

  const p = url.pathname;
  if (p === "/__sw/estado") { evento.respondWith(estado(url)); return }
  if (p.startsWith("/api/") || p.startsWith("/auth") || p === "/sw.js" || p === "/manifest.webmanifest") return;

  if (p.startsWith("/_next/image")) { evento.respondWith(guardadoYRefresca(evento)); return }
  if (p.startsWith("/_next/static/") || p.startsWith("/icons/") || p.startsWith("/marca/") || /\.(?:png|jpe?g|svg|gif|webp|ico|woff2?)$/i.test(p)) {
    evento.respondWith(primeroCopia(req));
    return;
  }

  if (req.headers.get("RSC") || p.startsWith("/login")) return;   // fragmentos de Next y el login: a la red

  const acepta = req.headers.get("accept") || "";
  if (req.mode === "navigate" || acepta.includes("text/html")) evento.respondWith(pagina(evento));
});
