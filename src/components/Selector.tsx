"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import "./selector.css";

/**
 * LISTA DESPLEGABLE PROPIA — reemplaza al <select> del navegador (la lista azul que cambia con cada
 * sistema y no deja buscar). Se usa en toda la plataforma: misma apariencia, mismo teclado.
 *
 *   · Con más de 7 opciones sale un buscador arriba (sin tildes, sin importar mayúsculas).
 *   · ↑ ↓ para moverse, Enter para escoger, Esc para cerrar.
 *   · `codigo` (opcional) va a la izquierda en letra de máquina: un SKU, una placa.
 *   · Si no cabe debajo, se abre hacia arriba.
 */
export type OpcionSel = { valor: string; etiqueta: string; codigo?: string };

const limpio = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Selector({
  valor, onCambiar, opciones, vacio = "Escoge…", buscar, ariaLabel, className = "", style,
}: {
  valor: string;
  onCambiar: (v: string) => void;
  opciones: OpcionSel[];
  /** Lo que se ve mientras no hay nada escogido. */
  vacio?: string;
  /** Fuerza el buscador (o lo quita con false). Por omisión sale con más de 7 opciones. */
  buscar?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [activa, setActiva] = useState(0);
  const [arriba, setArriba] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const id = useId();

  const conBuscador = buscar ?? opciones.length > 7;
  const escogida = opciones.find((o) => o.valor === valor);
  const hayVacia = opciones.some((o) => o.valor === "");

  const visibles = useMemo(() => {
    const t = limpio(q.trim());
    if (!t) return opciones;
    return opciones.filter((o) => o.valor !== "" && limpio(`${o.codigo ?? ""} ${o.etiqueta}`).includes(t));
  }, [opciones, q]);

  function abrir() {
    const r = raiz.current?.getBoundingClientRect();
    if (r) {
      const abajo = window.innerHeight - r.bottom;
      setArriba(abajo < 330 && r.top > abajo);
    }
    setQ("");
    const i = opciones.findIndex((o) => o.valor === valor);
    setActiva(i >= 0 ? i : 0);
    setAbierto(true);
  }
  function cerrar() { setAbierto(false); setQ("") }
  function escoger(o: OpcionSel) { onCambiar(o.valor); cerrar() }

  /* Clic fuera: se cierra. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) cerrar() };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  /* Al abrir, el cursor va al buscador; la opción activa siempre queda a la vista. */
  useEffect(() => { if (abierto && conBuscador) campo.current?.focus() }, [abierto, conBuscador]);
  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLElement>(`[data-i="${activa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activa, abierto]);

  function tecla(e: React.KeyboardEvent) {
    if (!abierto) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir() }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiva((a) => Math.min(a + 1, visibles.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiva((a) => Math.max(a - 1, 0)) }
    else if (e.key === "Enter") { e.preventDefault(); const o = visibles[activa]; if (o) escoger(o) }
    else if (e.key === "Escape") { e.preventDefault(); cerrar(); raiz.current?.querySelector<HTMLElement>(".selx-btn")?.focus() }
    else if (e.key === "Tab") cerrar();
  }

  return (
    <div ref={raiz} className={`selx ${abierto ? "abierto" : ""} ${className}`} style={style} onKeyDown={tecla}>
      <button type="button" className="selx-btn" aria-haspopup="listbox" aria-expanded={abierto}
              aria-label={ariaLabel} onClick={() => (abierto ? cerrar() : abrir())}>
        <strong className={`selx-val${escogida && (escogida.valor !== "" || hayVacia) ? "" : " vacio"}`}>
          {escogida && (escogida.valor !== "" || hayVacia)
            ? <>{escogida.codigo && <i>{escogida.codigo}</i>}{escogida.etiqueta}</>
            : vacio}
        </strong>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {abierto && (
        /* El clic dentro de la lista no se propaga como clic a la etiqueta que la envuelve (si no, la volvería a abrir). */
        <div className={`selx-pop${arriba ? " arriba" : ""}`} onClick={(e) => e.preventDefault()}>
          {conBuscador && (
            <div className="selx-bus">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
              <input ref={campo} className="selx-in" value={q} placeholder="Buscar…" aria-controls={id} autoComplete="off"
                     onChange={(e) => { setQ(e.target.value); setActiva(0) }} />
            </div>
          )}
          <div className="selx-lista" id={id} role="listbox" ref={lista}>
            {visibles.length === 0 && <div className="selx-nada">Nada con «{q}»</div>}
            {visibles.map((o, i) => (
              <div key={o.valor || "__vacio"} data-i={i} role="option" aria-selected={o.valor === valor}
                   className={`selx-op${i === activa ? " act" : ""}${o.valor === valor ? " on" : ""}${o.valor === "" ? " ninguno" : ""}`}
                   onMouseEnter={() => setActiva(i)}
                   onMouseDown={(e) => e.preventDefault()}
                   onClick={() => escoger(o)}>
                {o.codigo && <i>{o.codigo}</i>}
                <b>{o.etiqueta}</b>
                {o.valor === valor && <u aria-hidden="true">✓</u>}
              </div>
            ))}
          </div>
          {conBuscador && (
            <div className="selx-pie">
              <b>{visibles.length === opciones.length ? `${opciones.length} opciones` : `${visibles.length} de ${opciones.length}`}</b>
              <b>↑ ↓ moverse · Enter escoger</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
