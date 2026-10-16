"use client";

import { useEffect, useRef } from "react";
import "./filas.css";

/**
 * FILAS DINÁMICAS PARA TODO EL MÓDULO BALANCE — en cualquier tabla de cualquier pantalla de Balance:
 *   · La fila bajo el cursor se resalta (así no te pierdes al leer de lado a lado).
 *   · ↑ ↓ mueven la fila activa; Inicio / Fin saltan a la primera / última; Esc la suelta.
 *   · Clic o Espacio / Enter marcan la fila (verde y tachada); otra vez, la desmarca.
 * Funciona por delegación de eventos sobre el DOM (atributos data-fa = activa, data-fm = marcada), así que no hay que tocar cada tabla.
 * No se mete con lo que ya hace algo: clics en botones / enlaces / campos, ni teclas mientras escribes. Una tabla se salta con data-sin-filas.
 * Las marcas son solo de pantalla.
 */
export function FilasDinamicas({ children }: { children: React.ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    let activa: HTMLTableRowElement | null = null;
    let x = -1, y = -1;

    const esFila = (tr: HTMLTableRowElement) =>
      tr.parentElement?.tagName === "TBODY" && !tr.classList.contains("g") && tr.cells.length > 1 && !tr.closest("[data-sin-filas]");
    const filasDe = (t: HTMLTableElement) => Array.from(t.tBodies).flatMap((b) => Array.from(b.rows)).filter(esFila);
    const poner = (tr: HTMLTableRowElement | null) => {
      if (activa && activa !== tr) activa.removeAttribute("data-fa");
      activa = tr;
      if (tr) tr.setAttribute("data-fa", "1");
    };
    const interactivo = (t: EventTarget | null) => (t as Element | null)?.closest?.("a, button, input, select, textarea, label, summary, [role=button], [contenteditable=true]");

    /* mousemove (no mouseover): al desplazar con el teclado el cursor queda quieto y no debe robar la fila activa. */
    const mueve = (e: MouseEvent) => {
      if (e.clientX === x && e.clientY === y) return;
      x = e.clientX; y = e.clientY;
      const tr = (e.target as Element).closest?.("tr");
      if (tr && esFila(tr as HTMLTableRowElement)) poner(tr as HTMLTableRowElement);
    };
    const clic = (e: MouseEvent) => {
      const tr = (e.target as Element).closest?.("tr") as HTMLTableRowElement | null;
      if (!tr || !esFila(tr) || interactivo(e.target)) return;
      if (window.getSelection()?.toString()) return; /* estás copiando texto */
      poner(tr);
      if (tr.hasAttribute("data-fm")) tr.removeAttribute("data-fm"); else tr.setAttribute("data-fm", "1");
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!activa || !activa.isConnected) { activa = null; return; }
      const t = e.target as Element | null;
      if (t?.closest?.("input, textarea, select, [contenteditable=true]")) return;
      const tabla = activa.closest("table");
      if (!tabla) return;
      const filas = filasDe(tabla);
      const i = filas.indexOf(activa);
      if (i < 0) return;
      const ir = (j: number) => {
        e.preventDefault();
        const f = filas[Math.max(0, Math.min(filas.length - 1, j))];
        poner(f);
        f.scrollIntoView({ block: "nearest" });
      };
      if (e.key === "ArrowDown") ir(i + 1);
      else if (e.key === "ArrowUp") ir(i - 1);
      else if (e.key === "Home") ir(0);
      else if (e.key === "End") ir(filas.length - 1);
      else if ((e.key === " " || e.key === "Enter") && !t?.closest?.("a, button, summary, [role=button]")) {
        e.preventDefault();
        if (activa.hasAttribute("data-fm")) activa.removeAttribute("data-fm"); else activa.setAttribute("data-fm", "1");
      } else if (e.key === "Escape") poner(null);
    };

    el.addEventListener("mousemove", mueve);
    el.addEventListener("click", clic);
    document.addEventListener("keydown", tecla);
    return () => {
      el.removeEventListener("mousemove", mueve);
      el.removeEventListener("click", clic);
      document.removeEventListener("keydown", tecla);
    };
  }, []);

  /* display: contents → el contenedor no afecta el diseño de ninguna pantalla. */
  return <div ref={raiz} data-filas style={{ display: "contents" }}>{children}</div>;
}
