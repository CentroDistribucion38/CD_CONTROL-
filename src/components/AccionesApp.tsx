"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";

/**
 * Dos botones chiquitos en la barra superior:
 *
 *  · Instalar — SIEMPRE está, mientras la app no esté instalada.
 *  · Actualizar — aparece SOLO cuando hay una versión nueva publicada. Se
 *    sabe comparando la versión horneada en este paquete con la que responde
 *    /api/version, que siempre viene del despliegue vivo.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ «SIEMPRE ESTÁ» Y NO «CUANDO EL NAVEGADOR OFREZCA»
 * ---------------------------------------------------------------------
 * «No me sale para descargar.»
 *
 * El botón colgaba de `beforeinstallprompt`, el evento con el que Chrome
 * avisa que puede instalar. Si ese evento no llega, el botón NO SE
 * PINTABA: ni el botón, ni una explicación, ni un motivo. La persona se
 * queda mirando una pantalla que no menciona la palabra instalar.
 *
 * Y ese evento no llega en un montón de casos normales:
 *   · Safari —iPhone, iPad y Mac— no lo tiene, y nunca lo va a tener.
 *   · Chrome en iPhone/iPad tampoco: en iOS todos los navegadores son
 *     Safari por dentro.
 *   · Chrome lo dispara UNA vez por visita, y no lo vuelve a disparar si
 *     ya lo descartaron hace poco.
 *   · Firefox y algunos navegadores de fábrica no lo implementan.
 *
 * Y EL IPAD ADEMÁS MIENTE: desde iPadOS 13 dice ser un Mac en su
 * identificación. Mirar «ipad» en el texto da falso en el aparato en el
 * que más se usa esto en la bodega. Se distingue por otro lado: un Mac
 * de verdad no tiene pantalla táctil.
 *
 * ASÍ QUE EL BOTÓN NO PREGUNTA SI SE PUEDE: se pinta mientras la app no
 * esté instalada. Si el navegador ofrece el instalador, se usa; si no,
 * se explica el camino DE ESE NAVEGADOR, con el nombre del menú que esa
 * persona tiene enfrente. «Instálala desde el menú» no sirve cuando hay
 * tres menús.
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

/** Dónde está parada la persona, para poder decirle el camino de SU navegador. */
type Donde = "ios-safari" | "ios-otro" | "android" | "escritorio" | "otro";

function donde(): Donde {
  if (typeof window === "undefined") return "otro";
  const ua = window.navigator.userAgent;
  const nav = window.navigator as Navigator & { standalone?: boolean };

  /* EL IPAD DICE SER UN MAC desde iPadOS 13, así que «ipad» en el texto
     no aparece. Lo que lo delata es el tacto: un Mac de verdad no
     reporta puntos táctiles. Es el aparato en el que más se usa esto en
     la bodega, y mirarlo mal lo dejaba sin instrucciones. */
  const esIPadDisfrazado = /Macintosh/.test(ua) && nav.maxTouchPoints > 1;
  const esIOS = /iPhone|iPad|iPod/i.test(ua) || esIPadDisfrazado;

  if (esIOS) {
    /* EN iOS TODOS LOS NAVEGADORES SON SAFARI POR DENTRO, pero solo
       Safari tiene «Añadir a pantalla de inicio». Chrome y Edge ahí no
       pueden, y decirle a alguien que busque un botón que no existe es
       peor que no decirle nada. */
    const enSafari = !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    return enSafari ? "ios-safari" : "ios-otro";
  }
  if (/Android/i.test(ua)) return "android";
  /* Sin tacto y sin Android: un computador. */
  if (nav.maxTouchPoints <= 1) return "escritorio";
  return "otro";
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
  const [sitio, setSitio] = useState<Donde>("otro");
  /* ARRANCA EN «instalada» Y NO EN «no instalada» a propósito: hasta que
     el navegador no conteste, no se sabe, y pintar un botón de instalar
     dentro de la app ya instalada —medio segundo, en cada carga— es un
     parpadeo que se ve mal y confunde. */
  const [instalada, setInstalada] = useState(true);
  const [verPasos, setVerPasos] = useState(false);
  const [hayNueva, setHayNueva] = useState(false);
  const [recargando, setRecargando] = useState(false);

  // ---- ¿se puede instalar? -------------------------------------------
  useEffect(() => {
    setInstalada(yaInstalada());
    setSitio(donde());

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
    /* SI EL NAVEGADOR OFRECE EL INSTALADOR, se usa: es un toque y ya.
       Si no —Safari, Chrome en iPhone, o Chrome que ya preguntó hoy—
       NO SE DEJA A NADIE SIN RESPUESTA: se explica el camino de ese
       navegador. Antes, en ese caso, el botón ni se pintaba. */
    if (!evento) { setVerPasos(true); return }
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

  /* MIENTRAS NO ESTÉ INSTALADA, EL BOTÓN ESTÁ. No se pregunta si el
     navegador puede: si puede, instala; si no, explica. Ver la nota de
     arriba — colgarlo de `beforeinstallprompt` es lo que dejaba a la
     gente sin botón y sin motivo. */
  const puedeInstalar = !instalada;

  // ---- variante de la pantalla de acceso ------------------------------
  if (variante === "enlace") {
    if (!puedeInstalar) return null;
    return (
      <>
        <button type="button" className="pedir" onClick={instalar}>
          Instalar app
        </button>
        {verPasos && <PasosInstalar sitio={sitio} cerrar={() => setVerPasos(false)} />}
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

      {verPasos && <PasosInstalar sitio={sitio} cerrar={() => setVerPasos(false)} />}
    </>
  );
}

/* =====================================================================
   EL CAMINO A MANO, POR NAVEGADOR

   Un solo texto que diga «instálala desde el menú» no sirve: hay tres
   menús distintos y en uno de ellos la opción no existe. Cada sitio
   tiene el nombre EXACTO de lo que esa persona va a ver.
   ===================================================================== */
const PASOS: Record<Donde, { titulo: string; pasos: React.ReactNode[]; nota?: React.ReactNode }> = {
  "ios-safari": {
    titulo: "Instalar en iPhone o iPad",
    pasos: [
      <>Toca el botón <b>Compartir</b> de Safari — el cuadrito con la flecha hacia arriba.</>,
      <>Baja en la lista y elige <b>Añadir a pantalla de inicio</b>.</>,
      <>Confirma con <b>Añadir</b>, arriba a la derecha.</>,
    ],
    nota: <>Queda como una app más, con su ícono, y abre sin la barra del navegador.</>,
  },
  "ios-otro": {
    titulo: "Ábrela en Safari para instalarla",
    pasos: [
      <>En el iPhone y el iPad, <b>solo Safari</b> puede instalar aplicaciones. Chrome, Edge y
        Firefox no tienen esa opción, aunque se vean iguales.</>,
      <>Copia la dirección de arriba y ábrela en <b>Safari</b>.</>,
      <>Ahí: <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>.</>,
    ],
  },
  android: {
    titulo: "Instalar en Android",
    pasos: [
      <>Toca los <b>tres puntos</b> de arriba a la derecha del navegador.</>,
      <>Busca <b>Instalar aplicación</b>. Si no aparece con ese nombre, es
        <b> Añadir a pantalla de inicio</b>.</>,
      <>Confirma con <b>Instalar</b>.</>,
    ],
    nota: <>Si no ves ninguna de las dos, cierra el navegador y vuelve a entrar: Chrome solo
      ofrece instalar una vez por visita.</>,
  },
  escritorio: {
    titulo: "Instalar en el computador",
    pasos: [
      <>Mira el <b>final de la barra de direcciones</b>, donde está la dirección de la página:
        ahí sale un ícono de instalar — una pantallita con una flecha.</>,
      <>Si no está, abre los <b>tres puntos</b> del navegador y busca
        <b> Instalar CD38</b> o <b>Guardar y compartir → Instalar página como aplicación</b>.</>,
    ],
    nota: <>Funciona en Chrome, Edge y Opera. Firefox en computador no instala aplicaciones.</>,
  },
  otro: {
    titulo: "Instalar CD38",
    pasos: [
      <>Abre el <b>menú del navegador</b> — casi siempre los tres puntos o las tres rayas.</>,
      <>Busca <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</>,
    ],
    nota: <>Si tu navegador no tiene ninguna de las dos, ábrela en <b>Chrome</b> —o en
      <b> Safari</b>, si es un iPhone o un iPad— y vuelve a intentarlo.</>,
  },
};

function PasosInstalar({ sitio, cerrar }: { sitio: Donde; cerrar: () => void }) {
  const { titulo, pasos, nota } = PASOS[sitio];
  return (
    <div
      role="dialog"
      aria-label={titulo}
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
          <h2 className="text-[16px] font-medium">{titulo}</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <ol className="mt-3 space-y-2 text-[13px] leading-[1.6] text-slate-600">
          {pasos.map((p, i) => <li key={i}>{i + 1}. {p}</li>)}
        </ol>
        {nota && <p className="mt-3 text-[12px] text-slate-500">{nota}</p>}
      </div>
    </div>
  );
}
