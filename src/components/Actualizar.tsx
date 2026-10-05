"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CADA_MS, esDeConsulta, haceCuanto, puedeActualizarSola } from "@/modulos/actualizar";

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

  const actualizar = useCallback(() => {
    empezar(() => { router.refresh(); });
    ultima.current = Date.now();
    pulso((n) => n + 1);
  }, [router]);

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

  /* Al cambiar de pantalla, el reloj de «hace cuánto» arranca de nuevo. */
  useEffect(() => { ultima.current = Date.now(); }, [pathname]);

  const auto = esDeConsulta(pathname);
  const titulo = `Actualizar · última vez ${haceCuanto(Date.now() - ultima.current)}${auto ? " · se actualiza sola cada minuto" : ""}`;

  return (
    <button type="button" className={"sh-refrescar" + (pendiente ? " gira" : "") + (hecho ? " hecho" : "")}
            onClick={actualizar} disabled={pendiente} title={titulo}
            aria-label="Actualizar los datos de esta pantalla" onMouseEnter={() => pulso((n) => n + 1)}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M20 11a8 8 0 0 0-14.3-4.6M4 4v4h4" />
        <path d="M4 13a8 8 0 0 0 14.3 4.6M20 20v-4h-4" />
      </svg>
      <span className="sh-refrescar-ok" role="status" aria-live="polite">{hecho ? "Actualizado" : ""}</span>
    </button>
  );
}
