/**
 * Service worker mínimo de CONTROL.
 *
 * Existe por una sola razón: Chrome en Android solo ofrece "Instalar app"
 * si el sitio registra un service worker que responda peticiones.
 *
 * A propósito NO guarda nada en caché. La app muestra inventario y quiebra
 * en vivo: servir una copia vieja sería peor que no abrir. Así que todo va
 * derecho a la red, igual que sin service worker.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  // Por si alguna versión anterior alcanzó a dejar cachés, se limpian.
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (evento) => {
  evento.respondWith(fetch(evento.request));
});
