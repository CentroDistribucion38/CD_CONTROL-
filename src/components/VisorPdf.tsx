"use client";

import { useEffect, useRef } from "react";

/**
 * EL PDF DENTRO DE LA PANTALLA.
 *
 * Abrir el PDF en una pestaña nueva falla justo donde más se usa: la app
 * instalada (ventana «CD38») y el celular bloquean las pestañas que se abren
 * después de esperar, y quedaban los folios gastados sin papel. Aquí el PDF
 * se ve y se imprime sin salir de la pantalla: visor, «Imprimir» y
 * «Descargar». Los estilos (`.vp-*`) viven en plan-envase.css y la pantalla
 * que lo use tiene que colgar de `.fe`.
 */
export function VisorPdf({ url, titulo, cantidad, onCerrar }: { url: string; titulo: string; cantidad: number; onCerrar: () => void }) {
  const marco = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar() };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);

  const imprimir = () => {
    try {
      const w = marco.current?.contentWindow;
      if (!w) throw new Error("sin visor");
      w.focus(); w.print();
    } catch { window.open(url, "_blank") }
  };

  return (
    <div className="vp" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="vp-barra">
        <span className="vp-titulo"><b>{new Intl.NumberFormat("es-CO").format(cantidad)} {cantidad === 1 ? "rótulo" : "rótulos"}</b> · {titulo}</span>
        <span className="vp-acciones">
          <button type="button" className="btn" onClick={imprimir}>Imprimir</button>
          <a className="btn plano" href={url} download={`${titulo}.pdf`}>Descargar PDF</a>
          <button type="button" className="btn plano" onClick={onCerrar} autoFocus>Cerrar</button>
        </span>
      </div>
      <iframe ref={marco} className="vp-marco" src={url} title={titulo} />
    </div>
  );
}
