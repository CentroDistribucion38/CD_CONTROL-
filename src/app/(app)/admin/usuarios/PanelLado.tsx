"use client";

import { useEffect, type ReactNode } from "react";

/**
 * EL PANEL DE LADO — Cambiar rol, Nueva clave, Eliminar.
 *
 * Sale por la derecha y deja la lista a la vista: lo que se está
 * cambiando es a quienes se acaban de marcar, y taparlos con una ventana
 * en el medio obliga a acordarse de a quién se escogió. En el celular
 * ocupa la pantalla entera, con los botones pegados abajo.
 *
 * `fijo`: el panel de las claves no se cierra tocando fuera ni con Esc.
 * Las claves se muestran UNA vez; perderlas por un toque de más obliga a
 * generar otras.
 */
export function PanelLado({ titulo, sub, cerrar, pie, fijo, children }: {
  titulo: string;
  sub?: ReactNode;
  cerrar: () => void;
  pie: ReactNode;
  fijo?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (fijo) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [cerrar, fijo]);

  return (
    <>
      <div className="us-pnl-velo" onClick={fijo ? undefined : cerrar} aria-hidden />
      <aside className="us-pnl" role="dialog" aria-modal="true" aria-label={titulo}>
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
