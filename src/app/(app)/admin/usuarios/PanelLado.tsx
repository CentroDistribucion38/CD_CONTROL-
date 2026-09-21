"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * EL PANEL DE LADO — Cambiar rol, Nueva clave, Eliminar.
 *
 * Va AL LADO de la tabla, en la misma tarjeta, no flotando encima: la
 * versión flotante (position: fixed) no le abría en su equipo. Metido en
 * la página no depende de capas ni de lo que haga el navegador con lo
 * que flota. Al abrirse se trae a la vista.
 *
 * `fijo`: el panel de las claves no se cierra con Esc. Las claves se
 * muestran UNA vez; perderlas por una tecla obliga a generar otras.
 */
export function PanelLado({ titulo, sub, cerrar, pie, fijo, children }: {
  titulo: string;
  sub?: ReactNode;
  cerrar: () => void;
  pie: ReactNode;
  fijo?: boolean;
  children: ReactNode;
}) {
  const caja = useRef<HTMLElement>(null);
  /* Traerlo a la vista al abrir: en el celular va arriba de la tabla y,
     si se abrió desde una fila de abajo, quedaría fuera de la pantalla. */
  useEffect(() => { caja.current?.scrollIntoView({ block: "nearest" }) }, []);
  useEffect(() => {
    if (fijo) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [cerrar, fijo]);

  return (
    <>
      <aside className="us-pnl" ref={caja} role="region" aria-label={titulo}>
        <div className="us-pnl-cab">
          <button type="button" className="us-pnl-vol" onClick={cerrar} aria-label="Volver">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <div className="us-pnl-tit">
            <b>{titulo}</b>
            {sub && <span>{sub}</span>}
          </div>
          <button type="button" className="us-pnl-x" onClick={cerrar} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="us-pnl-cuerpo">{children}</div>
        <div className="us-pnl-pie">{pie}</div>
      </aside>
    </>
  );
}

/** «ARENOSA» → AR · «Génesis Visbal» → GV. */
export function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  const s = p.length >= 2 ? p[0][0] + p[1][0] : (p[0] ?? "?").slice(0, 2);
  return s.toUpperCase();
}

export function Ini({ de }: { de: string }) {
  return <i className="us-ini" aria-hidden>{iniciales(de)}</i>;
}

export function Aviso({ tono, children }: { tono: "amb" | "mal"; children: ReactNode }) {
  return (
    <div className={"us-pnl-aviso " + tono}>
      <svg viewBox="0 0 24 24" aria-hidden><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></svg>
      <span>{children}</span>
    </div>
  );
}
