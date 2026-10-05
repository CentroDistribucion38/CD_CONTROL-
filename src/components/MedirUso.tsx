"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { moduloDeRuta, normalizarRuta } from "@/modulos/uso/uso";

/**
 * ANOTA DÓNDE ESTÁ CADA PERSONA, para el «Uso» de Administración.
 *
 * Una fila por pantalla que se abre y, mientras la persona está de verdad
 * ahí (pestaña a la vista y moviéndose en el último minuto), suma 30
 * segundos cada 30. No anota qué escribió ni qué vio: solo la ruta.
 *
 * Es mudo: sin internet no hace nada, y si la base no tiene todavía el
 * archivo de uso o falla, no se nota. Nunca estorba el trabajo.
 */
const LATIDO_S = 30;
const QUIETO_MS = 60_000;

export function MedirUso() {
  const pathname = usePathname();
  const visita = useRef<number | null>(null);
  const ultimoToque = useRef(Date.now());
  const apagado = useRef(false);

  /* una visita por pantalla */
  useEffect(() => {
    if (apagado.current || !navigator.onLine) { visita.current = null; return }
    let vivo = true;
    visita.current = null;
    ultimoToque.current = Date.now();
    void (async () => {
      try {
        const { data, error } = await createClient().rpc("uso_visita", { p_ruta: normalizarRuta(pathname), p_modulo: moduloDeRuta(pathname) });
        if (error) { apagado.current = true; return }   // falta el archivo de la base: no se insiste
        if (vivo && typeof data === "number") visita.current = data;
        else if (vivo && typeof data === "string") visita.current = Number(data) || null;
      } catch { /* mudo */ }
    })();
    return () => { vivo = false };
  }, [pathname]);

  /* el latido: solo si la persona está ahí */
  useEffect(() => {
    const toque = () => { ultimoToque.current = Date.now() };
    const eventos = ["pointerdown", "keydown", "touchstart", "scroll", "wheel"] as const;
    eventos.forEach((e) => window.addEventListener(e, toque, { passive: true, capture: true }));
    let ultMov = 0;
    const mov = () => { const t = Date.now(); if (t - ultMov > 1000) { ultMov = t; toque() } };
    window.addEventListener("pointermove", mov, { passive: true });
    const reloj = setInterval(() => {
      const id = visita.current;
      if (id == null || apagado.current) return;
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (Date.now() - ultimoToque.current > QUIETO_MS) return;
      void createClient().rpc("uso_latido", { p_id: id, p_seg: LATIDO_S }).then(({ error }) => { if (error) apagado.current = true }, () => {});
    }, LATIDO_S * 1000);
    return () => {
      clearInterval(reloj);
      eventos.forEach((e) => window.removeEventListener(e, toque, { capture: true } as EventListenerOptions));
      window.removeEventListener("pointermove", mov);
    };
  }, []);

  return null;
}
