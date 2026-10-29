"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Producto } from "@/modulos/carnaval/datos";

/**
 * EL SELECTOR DE CÓDIGO de Carnaval: se escribe para filtrar (por código o por nombre) y cada renglón dice
 * cuántos pallets hay hoy de ese código. Si el movimiento es un trasiego (que solo resta), los códigos sin
 * pallets salen apagados y no se pueden elegir. Teclado: ↑ ↓ para moverse, Enter elige, Esc cierra.
 */
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export function SelectorCodigo({ productos, saldos, value, onChange, soloConSaldo, disabled }: {
  productos: Producto[]; saldos: Record<string, number>; value: string; onChange: (codigo: string) => void; soloConSaldo: boolean; disabled?: boolean;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState(0);

  const elegido = productos.find((p) => p.codigo === value);
  const lista = useMemo(() => {
    const partes = norm(q).split(/\s+/).filter(Boolean);
    return productos.filter((p) => {
      const t = norm(`${p.codigo} ${p.descripcion}`);
      return partes.every((x) => t.includes(x));
    });
  }, [productos, q]);
  const libre = (p: Producto) => !soloConSaldo || (saldos[p.codigo] ?? 0) > 0;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) cerrar() };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);
  useEffect(() => { setPos(0) }, [q, abierto]);

  function cerrar() { setAbierto(false); setQ("") }
  function elegir(p: Producto) { if (!libre(p)) return; onChange(p.codigo); cerrar(); caja.current?.blur() }
  function tecla(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setPos((i) => Math.min(i + 1, lista.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setPos((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Enter" && abierto) { e.preventDefault(); if (lista[pos]) elegir(lista[pos]) }
    else if (e.key === "Escape") { cerrar(); caja.current?.blur() }
  }

  return (
    <div className="cv-sel" ref={raiz}>
      <input ref={caja} className="cv-sel-in" role="combobox" aria-expanded={abierto} aria-controls="cv-sel-lista" autoComplete="off" disabled={disabled}
             placeholder={elegido ? `${elegido.codigo} · ${elegido.descripcion}` : "Escribe el código o el nombre…"}
             value={abierto ? q : elegido ? `${elegido.codigo} · ${elegido.descripcion}` : ""}
             onFocus={() => setAbierto(true)} onChange={(e) => { setQ(e.target.value); setAbierto(true) }} onKeyDown={tecla} />
      {value && !abierto && !disabled && <button type="button" className="cv-sel-x" aria-label="Quitar el código" onClick={() => { onChange(""); caja.current?.focus() }}>×</button>}
      {abierto && (
        <div className="cv-sel-panel" id="cv-sel-lista" role="listbox">
          <div className="cv-sel-cab"><span>{lista.length} de {productos.length} códigos</span><span>{soloConSaldo ? "Un trasiego solo sale de los que tienen pallets" : "Pallets hoy"}</span></div>
          {lista.length === 0 && <p className="cv-sel-vacio">Ningún código coincide con «{q}».</p>}
          <ul>
            {lista.map((p, i) => {
              const s = saldos[p.codigo] ?? 0;
              return (
                <li key={p.codigo} role="option" aria-selected={p.codigo === value} aria-disabled={!libre(p)}
                    className={`${i === pos ? "pos" : ""} ${p.codigo === value ? "sel" : ""} ${!libre(p) ? "off" : ""}`}
                    onMouseEnter={() => setPos(i)} onMouseDown={(e) => { e.preventDefault(); elegir(p) }}>
                  <code>{p.codigo}</code><span className="cv-sel-d">{p.descripcion}</span><b className={s < 0 ? "neg" : ""}>{nf.format(s)}</b>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
