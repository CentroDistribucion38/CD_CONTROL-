/**
 * Service worker de CONTROL: que la app ABRA sin internet.
 *
 * QUÉ HACE
 *  · Las pantallas (el HTML) se piden siempre a la red primero. Si la red
 *    responde, se muestra lo de la red y se deja una COPIA fechada. Si no
 *    responde (sin señal, o más de 20 s en responder habiendo copia), se
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
/* Con internet se espera de verdad al servidor (hay pantallas pesadas): la copia solo sale antes si el equipo ya sabe que no hay conexión. */
const ESPERA_MS = 20000;
const SONDA_MS = 3000;
const MAX_ESTATICO = 2500;

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
      /* La puerta de la app (start_url): si ya hay sesión, queda guardada desde la instalación. */
      await guardarSiHaySesion("/inicio");
      await self.skipWaiting();
    })()
  );
});

/** Pide una pantalla con la sesión de quien la tiene abierta y la deja guardada. Sin internet o sin sesión, no hace nada. */
async function guardarSiHaySesion(ruta) {
  try {
    const url = new URL(ruta, self.location.origin);
    const r = await fetch(url.href, { credentials: "same-origin", headers: { Accept: "text/html" } });
    if (guardable(r)) await guardarPagina(llaveDe(url), r);
  } catch { /* sin internet o sin sesión: nada que guardar */ }
}

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
      /* La pantalla que ya estaba abierta cuando el service worker tomó el control no pasó por él: se guarda ahora. */
      for (const cl of await self.clients.matchAll({ type: "window" })) {
        const u = new URL(cl.url);
        if (u.origin === self.location.origin && !u.pathname.startsWith("/login") && !u.pathname.startsWith("/auth")) await guardarSiHaySesion(u.pathname + u.search);
      }
      rastrear(false);
    })()
  );
});

/* Si ni la página de aviso guardada está (instalación sin internet, caché borrada), este es el último recurso:
   JAMÁS se entrega «Response.error()», que es lo que el navegador pinta como «No se puede acceder a este sitio» (ERR_FAILED). */
const DETALLE_AVISO = function () {
  var el = document.getElementById("detalle");
  if (!el) return;
  var ruta = location.pathname + location.search;
  if (!window.caches) { el.textContent = "Pantalla pedida: " + ruta; return }
  caches.open("control-paginas").then(function (c) { return c.keys() }).then(function (ks) {
    var t = "Pantalla pedida: " + ruta + "  ·  Guardadas en este equipo: " + ks.length;
    el.textContent = t;
    caches.open("control-meta").then(function (m) { return m.match("/__meta/fallos") }).then(function (r) { return r ? r.json() : {} }).then(function (f) {
      if (f[location.pathname]) el.textContent = t + "  ·  No se pudo guardar: " + f[location.pathname];
      else if (ks.length < 15) el.textContent = t + "  ·  La copia todavía se está armando: ábrela con internet y espera un par de minutos.";
    }).catch(function () { });
  }).catch(function () { el.textContent = "Pantalla pedida: " + ruta });
};

const AVISO_INLINE = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CD38 · Sin conexión</title>'
  + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#eef1f5;color:#04203f;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}'
  + 'main{max-width:520px;background:#fff;border:1px solid #d5dce5;border-top:4px solid #e0123b;padding:28px}h1{font-size:22px;margin:0 0 10px}p{font-size:15px;line-height:1.5;margin:0 0 12px;color:#3d4c5f}'
  + '.peq{font-size:11.5px;color:#8a96a6;margin-top:4px}'
  + 'a,button{font:inherit;font-weight:600;font-size:14px;min-height:44px;padding:0 18px;display:inline-flex;align-items:center;border-radius:0;cursor:pointer;text-decoration:none;margin:6px 10px 0 0}'
  + '.p{background:#04203f;color:#fff;border:0}.s{background:#fff;color:#04203f;border:1px solid #04203f}</style></head><body><main>'
  + '<h1>Sin conexión, y esta pantalla no está guardada</h1><p>Si pierdes la conexión puedes seguir viendo <b>lo guardado hasta tu última conexión</b>. Lo que no se puede hacer sin internet es realizar cambios.</p><p>Esta pantalla todavía no está guardada en este equipo: se guarda sola la próxima vez que la abras con internet.</p>'
  + '<p class="peq" id="detalle"></p><a class="p" href="/inicio">Ir al inicio</a><button class="s" type="button" onclick="location.reload()">Reintentar</button></main><script>(' + DETALLE_AVISO.toString() + ')()</script></body></html>';

async function avisoSinConexion() {
  try {
    const r = await (await caches.open(ESTATICO)).match(SIN_CONEXION);
    if (r) return r;
  } catch { /* se cae al aviso incluido */ }
  return new Response(AVISO_INLINE, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

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
  const r = (await c.match(llave)) || (await c.match(llave, { ignoreSearch: true }));
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
    /* El pedido va por su cuenta (sin la señal de cancelar de la pantalla): si la persona cambia de pantalla
       a mitad de la copia, lo que ya estaba pidiéndose igual termina y queda guardado. */
    const hecho = (async () => {
      const r = await fetch(url.href, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (guardable(r)) await guardarPagina(llave, r);
      return r;
    })();
    evento.waitUntil(hecho.catch(() => {}));
    return hecho;
  }

  const hay = await copiaDe(llave, url);
  const red = fetch(req).then((r) => {
    /* Guardar la copia no retrasa la pantalla: se hace por detrás. */
    if (guardable(r)) evento.waitUntil(guardarPagina(llave, r).then(() => marcar(llave, "red")).then(() => rastrear(false)));
    else if (r.type !== "opaqueredirect") evento.waitUntil(marcar(llave, "red"));
    return r;
  });

  if (!hay) {
    try { return await red; }
    catch { return avisoSinConexion(); }
  }

  /* Hay copia: se espera a la red; si no llega, se muestra la copia y la red sigue por detrás.
     Una sonda diminuta corre al mismo tiempo: con el wifi prendido pero SIN salida a internet
     («conectado» y mudo) la sonda falla en pocos segundos y la copia sale YA, sin dejar la pantalla
     en blanco esperando los 20 s. Si la sonda responde, hay internet: se espera al servidor completo. */
  evento.waitUntil(red.catch(() => {}));
  const muerta = sonda().then((viva) => (viva ? new Promise(() => {}) : null));
  const r = await Promise.race([red.catch(() => null), muerta, esperar(self.navigator.onLine === false ? 0 : ESPERA_MS).then(() => null)]);
  if (r) return r;
  await marcar(llave, "copia");
  return hay;
}

/** ¿Sale algo a internet? Pide /api/version (diminuto, público, siempre fresco) y espera poco. */
async function sonda() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), SONDA_MS);
  try { const r = await fetch("/api/version?sw=" + Date.now(), { cache: "no-store", signal: c.signal }); return r.ok }
  catch { return false }
  finally { clearTimeout(t) }
}

/** Lo que no cambia: primero lo guardado; si no está, se pide y se guarda. */
async function primeroCopia(req) {
  const c = await caches.open(ESTATICO);
  /* Los archivos de /_next/static llevan el contenido en el nombre: lo que cambie en la dirección después del «?»
     (la marca de despliegue ?dpl=…) no cambia el archivo, y no debe hacerlo «faltar» sin internet. */
  let g = await c.match(req);
  if (!g && new URL(req.url).pathname.startsWith("/_next/static/")) g = await c.match(req, { ignoreSearch: true });
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


/* ───────── LA COPIA DE TODO, HECHA POR EL SERVICE WORKER ─────────
   Antes la copia dependía de que la pantalla estuviera abierta, quieta y con el código al día: si la persona
   cambiaba de pantalla, o la pantalla era la versión vieja, la copia se quedaba a medias y nadie lo notaba.
   Ahora la hace el service worker por su cuenta: apenas una pantalla llega bien de internet, recorre la app
   desde el inicio siguiendo los enlaces (el menú, las tarjetas, las pestañas: lo que esta persona puede ver),
   guarda cada pantalla junto con los archivos que necesita para abrir, y vuelve a pasar cada 3 minutos
   renovando lo que tenga más de 2 y medio. Funciona aunque se cambie de pantalla o se cierre la ventana. */
const RASTREO_MAX = 220;
const RASTREO_CADA_MS = 3 * 60 * 1000;     // toda la app se vuelve a guardar cada 3 minutos: la copia es casi de «ahora»
const FRESCA_MS = 150 * 1000;
const RASTREO_PAR = 8;
const PEDIDO_MS = 25000;
let rastreando = false;

function esGuardable(ruta) {
  if (!ruta.startsWith("/") || ruta.startsWith("//") || ruta === "/" || ruta.length > 90) return false;
  if (/^\/(api|auth|login|_next|__sw)(\/|$)/.test(ruta) || ruta === "/sw.js" || ruta === "/manifest.webmanifest") return false;
  if (/\.[A-Za-z0-9]{2,5}$/.test(ruta) || /[[\]%?#]/.test(ruta)) return false;
  return !ruta.split("/").some((seg) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || /^\d{3,}$/.test(seg));
}
function enlacesEn(html) {
  const out = new Set();
  const re = /href="(\/[^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const r = m[1].split(/[?#]/)[0].replace(/\/$/, "") || "/";
    if (esGuardable(r)) out.add(r);
  }
  return [...out];
}
function recursosEn(html) {
  const out = new Set();
  const re = /(?:\/_next\/)?(static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./~%[\]()@$]+?\.(?:js|css|woff2?))/g;
  let m;
  while ((m = re.exec(html))) out.add("/_next/" + m[1]);
  return [...out];
}
async function pedir(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), PEDIDO_MS);
  try { return await fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" }, signal: c.signal }) }
  finally { clearTimeout(t) }
}
async function leerMeta(nombre) {
  try { const r = await (await caches.open(META)).match(new Request(new URL("/__meta/" + nombre, self.location.origin).href)); return r ? await r.text() : null } catch { return null }
}
async function ponerMeta(nombre, texto) {
  try { await (await caches.open(META)).put(new Request(new URL("/__meta/" + nombre, self.location.origin).href), new Response(texto)) } catch { /* de cortesía */ }
}

async function rastrear(forzar) {
  if (rastreando) return;
  rastreando = true;
  try {
    const ultimo = Number((await leerMeta("rastreo")) || 0);
    if (!forzar && Date.now() - ultimo < RASTREO_CADA_MS) return;
    if (!(await sonda())) return;                       // sin salida real a internet: no se intenta
    await ponerMeta("rastreo", String(Date.now()));

    const paginas = await caches.open(PAGINAS);
    const estatico = await caches.open(ESTATICO);
    const fallos = {};
    const cola = ["/inicio"], vistos = new Set(cola);
    for (const k of await paginas.keys()) {
      const u = new URL(k.url);
      if (esGuardable(u.pathname) && !vistos.has(u.pathname)) { vistos.add(u.pathname); cola.push(u.pathname) }
    }
    const recursos = new Set();
    let hechas = 0, sesionPerdida = false;

    async function una(ruta) {
      const url = new URL(ruta, self.location.origin);
      const llave = llaveDe(url);
      let html = null;
      const g = await paginas.match(llave);
      if (g && Date.now() - Date.parse(g.headers.get("x-copia-fecha") || 0) < FRESCA_MS) html = await g.clone().text();   // ya está al día: solo se leen sus enlaces
      else {
        let r;
        try { r = await pedir(url.href) } catch { fallos[ruta] = "sin respuesta del servidor"; return }
        if (!guardable(r)) { fallos[ruta] = r.status !== 200 ? "error " + r.status : "mandó al login (sesión vencida o sin permiso)"; if (ruta === "/inicio") sesionPerdida = true; return }
        await guardarPagina(llave, r.clone());
        await marcar(llave, "red");
        html = await r.text();
      }
      hechas++;
      for (const e of enlacesEn(html)) if (!vistos.has(e) && vistos.size < RASTREO_MAX) { vistos.add(e); cola.push(e) }
      for (const u of recursosEn(html)) recursos.add(u);
    }
    /* La primera sola (el inicio): si no está la sesión, no tiene sentido seguir. */
    await una(cola.shift());
    if (sesionPerdida) return;
    await Promise.all(Array.from({ length: RASTREO_PAR }, async () => {
      while (cola.length) { const r = cola.shift(); try { await una(r) } catch { fallos[r] = "falló al guardarse" } }
    }));

    /* Lo que las pantallas cargan al abrirse: sin esto el HTML estaría pero la pantalla no arrancaría. */
    const lista = [...recursos];
    let k = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (k < lista.length) {
        const u = new URL(lista[k++], self.location.origin);
        try {
          if (await estatico.match(u.href, { ignoreSearch: true })) continue;
          const r = await fetch(u.href);
          if (r.ok) await estatico.put(u.href, r);
        } catch { /* un archivo que falle no tumba al resto */ }
      }
    }));
    await ponerMeta("fallos", JSON.stringify(fallos));
    await ponerMeta("rastreo-fin", JSON.stringify({ fecha: new Date().toISOString(), hechas, fallos: Object.keys(fallos).length }));
  } catch { /* se reintenta en la siguiente pantalla que llegue bien */ }
  finally { rastreando = false }
}

/** Guarda YA la pantalla que se está mirando (la pantalla se acaba de actualizar con datos nuevos: la copia debe quedar igual). */
async function guardarAhora(ruta) {
  try {
    const url = new URL(ruta, self.location.origin);
    if (!esGuardable(url.pathname)) return;
    const r = await pedir(url.href);
    if (guardable(r)) { await guardarPagina(llaveDe(url), r); await marcar(llaveDe(url), "red") }
  } catch { /* sin internet: queda la copia anterior */ }
}

self.addEventListener("message", (evento) => {
  const d = evento.data || {};
  if (d.tipo === "rastrear") evento.waitUntil(rastrear(d.forzar === true));
  else if (d.tipo === "guardar" && typeof d.ruta === "string") evento.waitUntil(guardarAhora(d.ruta));
});

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
