"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/**
 * LA CELDA DE LA CUENTA, COMO EN EXCEL.
 *
 * Cerrada es una celda normal que muestra SOLO EL RESULTADO (48). Al seleccionarla se abre,
 * flotando encima de la tabla, la cuenta completa (24+15-36+…) en varias líneas, con el resultado
 * en vivo abajo; ahí se sigue sumando. Al salir (clic afuera, Enter, Esc o Tab) se cierra y la
 * celda vuelve a mostrar el resultado.
 *
 * La celda de la tabla NUNCA cambia de forma: lo que se abre es otra pieza, colgada del <body>,
 * así ninguna regla de la tabla la puede deformar ni dejarla "abierta" por error.
 */
export function CampoCuenta({ valor, resultado, cambiar, deshabilitado, mal, rotulo, negativo = false }: {
  valor: string; resultado: number | null; cambiar: (v: string) => void; deshabilitado: boolean; mal: boolean; rotulo: string;
  /** Saldo negativo: se permite, pero en rojo para que se vea. */
  negativo?: boolean;
}) {
  const celda = useRef<HTMLInputElement>(null);
  const flota = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const callar = useRef(false);               // al devolver el foco a la celda no se vuelve a abrir
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const abierto = pos !== null;

  const medir = useCallback(() => {
    const r = celda.current?.getBoundingClientRect();
    if (!r) return;
    const alto = flota.current?.offsetHeight ?? 0;
    const top = Math.max(8, Math.min(r.top, window.innerHeight - alto - 8));
    setPos({ top, right: Math.max(8, window.innerWidth - r.right) });
  }, []);

  const cerrar = useCallback(() => setPos(null), []);

  // el cuadro crece con la cuenta; al abrir, el cursor va al final
  useLayoutEffect(() => {
    const t = area.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.max(t.scrollHeight, 40) + "px";
    medir();
  }, [valor, abierto, medir]);
  useLayoutEffect(() => {
    if (abierto && area.current) {
      const n = area.current.value.length;
      area.current.focus({ preventScroll: true });
      area.current.setSelectionRange(n, n);
    }
  }, [abierto]);
  useEffect(() => {
    if (!abierto) return;
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => { window.removeEventListener("scroll", medir, true); window.removeEventListener("resize", medir); };
  }, [abierto, medir]);

  const siguiente = (atras: boolean) => {
    const tabla = celda.current?.closest("table");
    const lista = tabla ? Array.from(tabla.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled])")) : [];
    const i = celda.current ? lista.indexOf(celda.current) : -1;
    const sig = lista[i + (atras ? -1 : 1)];
    if (sig) sig.focus(); else { callar.current = true; celda.current?.focus(); }
  };

  return (
    <>
      <input ref={celda} readOnly className={"cas-res" + (mal ? " mal" : "") + (negativo ? " neg" : "")} disabled={deshabilitado}
             value={resultado == null ? valor : nf0.format(resultado)} aria-label={rotulo}
             title="Toca para ver o seguir la cuenta"
             onFocus={() => { if (callar.current) { callar.current = false; return; } medir(); }}
             onClick={() => { if (!abierto) medir(); }} />
      {abierto && typeof document !== "undefined" && createPortal(
        <div ref={flota} className="cas-pop" role="dialog" aria-label={rotulo} style={{ top: pos.top, right: pos.right }}>
          <textarea ref={area} rows={1} spellCheck={false} value={valor} aria-label={rotulo}
                    onChange={(e) => cambiar(e.target.value.replace(/[\r\n]+/g, ""))}
                    onBlur={cerrar}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { e.preventDefault(); callar.current = true; cerrar(); celda.current?.focus(); }
                      else if (e.key === "Enter") { e.preventDefault(); callar.current = true; cerrar(); celda.current?.focus(); }
                      else if (e.key === "Tab") { e.preventDefault(); cerrar(); siguiente(e.shiftKey); }
                    }} />
          <footer><span>Se suma o se resta con + y −</span><b className={resultado == null || (resultado ?? 0) < 0 ? "mal" : ""}>{resultado == null ? "revisa la cuenta" : "= " + nf0.format(resultado)}</b></footer>
        </div>, document.body)}
    </>
  );
}
