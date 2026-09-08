"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";

/**
 * Dos botones chiquitos en la barra superior:
 *
 *  · Instalar — aparece cuando el navegador ofrece instalar CONTROL como app.
 *    En iPhone no existe ese ofrecimiento, así que ahí se explica el camino
 *    a mano (Compartir → Agregar a pantalla de inicio).
 *
 *  · Actualizar — aparece SOLO cuando hay una versión nueva publicada. Se
 *    sabe comparando la versión horneada en este paquete con la que responde
 *    /api/version, que siempre viene del despliegue vivo.
 */

type EventoInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/** Cada cuánto se pregunta si hay versión nueva. */
const CADA = 5 * 60 * 1000;

const MIA = process.env.NEXT_PUBLIC_VERSION ?? "local";

function yaInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari en iOS usa su propia bandera
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * "barra"  → botones redondos, para la barra superior de la app.
 * "enlace" → un enlace discreto, para el pie de la pantalla de acceso
 *            (ahí todavía no hay barra superior y es donde la gente
 *            llega por primera vez desde el celular).
 */
export function AccionesApp({
  variante = "barra",
}: {
  variante?: "barra" | "enlace";
}) {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [enIOS, setEnIOS] = useState(false);
  const [instalada, setInstalada] = useState(true);
  const [verPasos, setVerPasos] = useState(false);
  const [hayNueva, setHayNueva] = useState(false);
  const [recargando, setRecargando] = useState(false);

  // ---- ¿se puede instalar? -------------------------------------------
  useEffect(() => {
    setInstalada(yaInstalada());
    setEnIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    const alOfrecer = (e: Event) => {
      // Sin esto el navegador muestra su propia barra y perdemos el control
      // de dónde aparece el botón.
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const alInstalar = () => {
      setEvento(null);
      setInstalada(true);
    };

    window.addEventListener("beforeinstallprompt", alOfrecer);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alOfrecer);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  // ---- ¿hay versión nueva? -------------------------------------------
  useEffect(() => {
    // En local no hay despliegues, no tiene sentido preguntar.
    if (MIA === "local") return;
    let vivo = true;

    async function mirar() {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { version } = (await r.json()) as { version?: string };
        if (vivo && version && version !== "local" && version !== MIA) {
          setHayNueva(true);
        }
      } catch {
        // Sin señal: no se avisa nada. Se reintenta en la siguiente vuelta.
      }
    }

    mirar();
    const reloj = setInterval(mirar, CADA);
    // Al volver a la app (muy común en el celular) se revisa de una.
    const alVolver = () => {
      if (document.visibilityState === "visible") mirar();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      vivo = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  async function instalar() {
    if (enIOS && !evento) {
      setVerPasos(true);
      return;
    }
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    setEvento(null);
  }

  async function actualizar() {
    setRecargando(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update()));
      }
      if ("caches" in window) {
        const nombres = await caches.keys();
        await Promise.all(nombres.map((n) => caches.delete(n)));
      }
    } catch {
      // Si algo de esto falla, la recarga sola ya trae la versión nueva.
    }
    window.location.reload();
  }

  const puedeInstalar = !instalada && (evento !== null || enIOS);

  // ---- variante de la pantalla de acceso ------------------------------
  if (variante === "enlace") {
    if (!puedeInstalar) return null;
    return (
      <>
        <button type="button" className="pedir" onClick={instalar}>
          Instalar app
        </button>
        {verPasos && <PasosIOS cerrar={() => setVerPasos(false)} />}
      </>
    );
  }

  return (
    <>
      {hayNueva && (
        <button
          type="button"
          onClick={actualizar}
          disabled={recargando}
          title="Hay una versión nueva. Toca para actualizar."
          aria-label="Actualizar a la versión nueva"
          className="sh-boton nuevo"
        >
          <RefreshCw size={14} className={recargando ? "sh-gira" : ""} />
        </button>
      )}

      {puedeInstalar && (
        <button
          type="button"
          onClick={instalar}
          title="Instalar CONTROL en este dispositivo"
          aria-label="Instalar CONTROL"
          className="sh-boton"
        >
          <Download size={14} />
        </button>
      )}

      {verPasos && <PasosIOS cerrar={() => setVerPasos(false)} />}
    </>
  );
}

/** iOS no tiene beforeinstallprompt: el camino toca explicarlo. */
function PasosIOS({ cerrar }: { cerrar: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Cómo instalar en iPhone"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{ background: "rgba(4,32,63,.45)" }}
      onClick={cerrar}
    >
      <div
        className="w-full max-w-sm rounded-[12px] bg-white p-5"
        style={{ color: "#0b1f35" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[16px] font-medium">Instalar en iPhone</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <ol className="mt-3 space-y-2 text-[13px] leading-[1.6] text-slate-600">
          <li>1. Toca el botón <b>Compartir</b> de Safari (el cuadro con la flecha).</li>
          <li>2. Baja y elige <b>Agregar a pantalla de inicio</b>.</li>
          <li>3. Confirma con <b>Agregar</b>.</li>
        </ol>
        <p className="mt-3 text-[12px] text-slate-500">
          Safari es el único navegador del iPhone que puede hacerlo.
        </p>
      </div>
    </div>
  );
}
