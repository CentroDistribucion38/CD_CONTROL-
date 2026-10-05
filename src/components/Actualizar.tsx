"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CADA_MS, esDeConsulta, haceCuanto, puedeActualizarSola, sinBoton } from "@/modulos/actualizar";

/**
 * EL BOTÓN FLOTANTE DE ACTUALIZAR (abajo a la derecha, pequeño).
 *
 * Al tocarlo se vuelven a pedir los datos de la pantalla —sin recargar la
 * página ni perder lo que hay escrito— y las flechas giran mientras tanto.
 * En las pantallas de consulta (tableros, tránsito, seguimiento…) además
 * se actualiza solo cada minuto, pero se salta ese turno si la persona
 * está escribiendo, hay un cuadro abierto o la pestaña está oculta: ver
 * src/modulos/actualizar.ts.
 */
export function Actualizar() {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, empezar] = useTransition();
  const ultima = useRef(Date.now());
  const [, pulso] = useState(0);
  const [hecho, setHecho] = useState(false);
  const aviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vivo = useRef({ pathname, pendiente });
  vivo.current = { pathname, pendiente };

  /* El router va por una referencia: el reloj de abajo no se reinicia aunque el router cambie. */
  const rr = useRef(router);
  rr.current = router;
  const corteEn = useRef(0);
  useEffect(() => {
    const cortado = () => { corteEn.current = Date.now() };
    window.addEventListener("offline", cortado);
    return () => window.removeEventListener("offline", cortado);
  }, []);
  const actualizar = useCallback(() => {
    /* Sin internet no hay nada que pedir: refrescar recargaría la página desde la copia en bucle. */
    if (!navigator.onLine) return;
    /* Con un internet que parpadea, pedir datos a medias hace que Next recargue toda la página desde la copia: se espera a que lleve un rato firme. */
    if (Date.now() - corteEn.current < 8000) return;
    empezar(() => { rr.current.refresh(); });
    ultima.current = Date.now();
    pulso((n) => n + 1);
  }, []);

  /* El «listo» corto cuando termina. */
  const eraPendiente = useRef(false);
  useEffect(() => {
    if (eraPendiente.current && !pendiente) {
      setHecho(true);
      if (aviso.current) clearTimeout(aviso.current);
      aviso.current = setTimeout(() => setHecho(false), 1400);
    }
    eraPendiente.current = pendiente;
  }, [pendiente]);

  /* Cada minuto, si toca; y al volver a la pestaña si ya pasó el minuto. */
  useEffect(() => {
    const estado = () => {
      const a = document.activeElement as HTMLElement | null;
      return {
        pathname: vivo.current.pathname,
        visible: document.visibilityState === "visible",
        escribiendo: !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable),
        dialogo: !!document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]'),
        ocupado: vivo.current.pendiente,
      };
    };
    const hora = setInterval(() => { if (puedeActualizarSola(estado())) actualizar(); }, CADA_MS);
    const alVolver = () => {
      if (Date.now() - ultima.current >= CADA_MS && puedeActualizarSola(estado())) actualizar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(hora); document.removeEventListener("visibilitychange", alVolver); };
  }, [actualizar]);

  /* SOLO SE SUBE SI DE VERDAD HAY UN «+» FLOTANTE A LA VISTA (Roturas, Acciones, Vh Interno): un
     elemento con esa clase que no es flotante, o que está oculto, no cuenta. Si no, va pegado abajo. */
  const [sube, setSube] = useState(false);
  useEffect(() => {
    const hay = () => [...document.querySelectorAll<HTMLElement>(".mas, .tr-mas")].some((e) => {
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return c.position === "fixed" && c.visibility !== "hidden" && c.display !== "none" && r.width > 0 && r.height > 0;
    });
    let t: ReturnType<typeof setTimeout> | null = null;
    const mirar = () => { if (t) clearTimeout(t); t = setTimeout(() => setSube(hay()), 80); };
    mirar();
    const o = new MutationObserver(mirar);
    o.observe(document.body, { childList: true, subtree: true });
    return () => { o.disconnect(); if (t) clearTimeout(t); };
  }, [pathname]);

  /* Al cambiar de pantalla, el reloj de «hace cuánto» arranca de nuevo. */
  useEffect(() => { ultima.current = Date.now(); }, [pathname]);

  const auto = esDeConsulta(pathname);
  const titulo = `Actualizar · última vez ${haceCuanto(Date.now() - ultima.current)}${auto ? " · se actualiza sola cada minuto" : ""}`;

  /* En la portada y el perfil no hay botón: ahí abajo a la derecha va «Cerrar sesión». */
  if (sinBoton(pathname)) return null;

  return (
    <button type="button" className={"sh-refrescar" + (pendiente ? " gira" : "") + (hecho ? " hecho" : "")}
            onClick={actualizar} disabled={pendiente} title={titulo} data-sube={sube ? "si" : undefined}
            aria-label="Actualizar los datos de esta pantalla" onMouseEnter={() => pulso((n) => n + 1)}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M20 11a8 8 0 0 0-14.3-4.6M4 4v4h4" />
        <path d="M4 13a8 8 0 0 0 14.3 4.6M20 20v-4h-4" />
      </svg>
      <span className="sh-refrescar-ok" role="status" aria-live="polite">{hecho ? "Actualizado" : ""}</span>
    </button>
  );
}
