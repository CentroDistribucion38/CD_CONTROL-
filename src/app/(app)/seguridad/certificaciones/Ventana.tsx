"use client";

import { useEffect } from "react";

/* ============================ VENTANA (marco común) ============================ */
export function Ventana({ ojo, titulo, chica, cerrar, children, pie }: { ojo: string; titulo: string; chica?: boolean; cerrar: () => void; children: React.ReactNode; pie: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [cerrar]);
  return (
    <div className="sg-velo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <div className={"sg-mo" + (chica ? " chica" : "")} role="dialog" aria-modal="true" aria-label={titulo}>
        <header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-b.png" alt="" /><span className="sep" aria-hidden />
          <div><p>{ojo}</p><h3>{titulo}</h3></div>
          <button type="button" className="sg-x" onClick={cerrar} aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </header>
        {children}
        <footer className="sg-mo-f">{pie}</footer>
      </div>
    </div>
  );
}

