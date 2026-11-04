"use client";

import { useEffect, useRef } from "react";

export const Ico = {
  atras: <svg viewBox="0 0 24 24" aria-hidden><path d="M19 12H5M11 6l-6 6 6 6" /></svg>,
  ojo: <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /></svg>,
  x: <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>,
};

export function Pill({ tipo, children }: { tipo: string; children: React.ReactNode }) {
  return <span className={"plr-pill plr-p-" + tipo}>{children}</span>;
}

/** LA VENTANA (toolbox): banda negra con el sello, cuerpo claro y la X. Escape la cierra. */
export function Ventana({ ojo, titulo, sub, cerrar, ancho = 1120, children }: {
  ojo: string; titulo: string; sub?: React.ReactNode; cerrar: () => void; ancho?: number; children: React.ReactNode;
}) {
  const cierra = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    cierra.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    document.addEventListener("keydown", tecla);
    const x = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", tecla); document.body.style.overflow = x; previo?.focus?.() };
  }, [cerrar]);
  return (
    <div className="rt-modal plr-velo" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <div className="plr-ven" role="dialog" aria-modal="true" aria-label={titulo} style={{ width: `min(${ancho}px, 100%)` }}>
        <header className="plr-cab plr-cab-v">
          <div className="plr-sello" aria-hidden>B</div>
          <div className="plr-tit"><div className="plr-ojo">{ojo}</div><h2>{titulo}</h2>{sub && <div className="plr-sub">{sub}</div>}</div>
          <div className="plr-der">
            <button ref={cierra} type="button" className="plr-bt plr-ico" onClick={cerrar} aria-label="Cerrar" title="Cerrar (Esc)">{Ico.x}</button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
