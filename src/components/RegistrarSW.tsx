"use client";

import { useEffect } from "react";

/** Registra el service worker: es lo que habilita "Instalar app". */
export function RegistrarSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Si falla no pasa nada: la app funciona igual, solo no ofrece instalarse.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
