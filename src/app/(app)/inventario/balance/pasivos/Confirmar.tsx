"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * LA CONFIRMACIÓN DE LA APP — en lugar del cuadro del navegador («¿Borrar…?»), una ventana con la
 * misma cara de las demás: cabecera amarilla, todo recto, qué se va a hacer y los dos botones.
 */
export function Confirmar({ cabecera, titulo, children, textoConfirmar, peligro = true, ocupado = false, alConfirmar, alCancelar }: {
  cabecera: string; titulo: string; children?: ReactNode; textoConfirmar: string; peligro?: boolean; ocupado?: boolean;
  alConfirmar: () => void; alCancelar: () => void;
}) {
  const cancelar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelar.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") alCancelar() };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alCancelar]);
  return (
    <div className="bal-modal-fondo" onClick={alCancelar}>
      <div className="bal-modal bal-mx pas-conf" role="alertdialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <header className="bal-mx-cab">
          <span>{cabecera}</span>
          <button type="button" onClick={alCancelar} aria-label="Cerrar">×</button>
        </header>
        <div className="bal-mx-cuerpo">
          <p className="pas-conf-t">{titulo}</p>
          {children}
        </div>
        <footer className="bal-mx-pie">
          <span />
          <div className="bal-modal-acciones">
            <button type="button" ref={cancelar} className="bal-btn cancelar" onClick={alCancelar}>Cancelar</button>
            <button type="button" className={"bal-btn confirmar" + (peligro ? " peligro" : "")} disabled={ocupado} onClick={alConfirmar}>{ocupado ? "Un momento…" : textoConfirmar}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
