"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Cierra la sesión cuando nadie toca la app durante 30 minutos (antes eran 10: «que no se cierre a los 10, sino a la media hora»).
 *
 * · Cuenta el último toque (clic, tecla, toque, scroll) y lo comparte entre
 *   pestañas del mismo equipo: si trabajas en una, la otra no te saca.
 * · En el celular los relojes se duermen con la pantalla apagada; por eso,
 *   al volver a la app, se mira cuánto tiempo pasó y se cierra si van 30 min.
 * · Cierra solo en ESTE equipo (scope "local"), no en los demás de la persona.
 * · No borra la copia sin internet: si vuelve a entrar la misma persona, no
 *   hay que volver a descargarla toda. Si entra otra, PrepararSola la cambia.
 */
const QUIETO_MS = 30 * 60_000;
const LLAVE = "cd38-ultimo-toque";
const MIRAR_CADA_MS = 30_000;

function ultimoToque(): number {
  try {
    const v = Number(localStorage.getItem(LLAVE));
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}
  return Date.now();
}

function anotarToque() {
  try { localStorage.setItem(LLAVE, String(Date.now())) } catch {}
}

/** Si Supabase no contesta, igual se borran las cookies de la sesión. */
function borrarCookiesSesion() {
  document.cookie.split(";").forEach((c) => {
    const nombre = c.split("=")[0]?.trim();
    if (nombre?.startsWith("sb-")) {
      document.cookie = `${nombre}=; Max-Age=0; path=/`;
    }
  });
}

export function CerrarSiQuieto() {
  useEffect(() => {
    let cerrando = false;
    /* Al montar NO se cuenta como toque: la copia se recarga sola cada 30 s
       y eso no es que alguien esté usando la app. Solo si no hay registro
       (primera vez en este equipo) se arranca el reloj. El login lo reinicia. */
    try { if (!localStorage.getItem(LLAVE)) anotarToque() } catch {}

    let ultimo = 0;
    const toque = () => {
      const t = Date.now();
      if (t - ultimo < 5_000) return;   // no escribir en cada movimiento
      ultimo = t;
      anotarToque();
    };
    const eventos = ["pointerdown", "keydown", "touchstart", "scroll", "wheel"] as const;
    eventos.forEach((e) => window.addEventListener(e, toque, { passive: true, capture: true }));

    async function mirar() {
      if (cerrando) return;
      if (Date.now() - ultimoToque() < QUIETO_MS) return;
      cerrando = true;
      try {
        const salida = createClient().auth.signOut({ scope: "local" });
        const tope = new Promise((r) => setTimeout(r, 3_000));
        await Promise.race([salida, tope]);
      } catch {}
      borrarCookiesSesion();
      try { localStorage.removeItem(LLAVE) } catch {}
      const vuelta = encodeURIComponent(location.pathname + location.search);
      location.replace(`/login?next=${vuelta}&motivo=inactividad`);
    }

    const reloj = setInterval(() => void mirar(), MIRAR_CADA_MS);
    const alVolver = () => { if (document.visibilityState === "visible") void mirar() };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      clearInterval(reloj);
      eventos.forEach((e) => window.removeEventListener(e, toque, { capture: true } as EventListenerOptions));
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, []);

  return null;
}
