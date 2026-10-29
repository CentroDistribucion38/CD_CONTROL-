"use client";

import { useEffect, useMemo, useRef, useState } from "react";
type Opcion = { codigo: string; descripcion: string };

/**
 * EL SELECTOR DE CÓDIGO de Carnaval: se escribe para filtrar (por código o por nombre) y cada renglón dice
 * cuántos pallets hay hoy de ese código. Si el movimiento es un trasiego (que solo resta), los códigos sin
 * pallets salen apagados y no se pueden elegir. Teclado: ↑ ↓ para moverse, Enter elige, Esc cierra.
 */
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export function SelectorCodigo({ productos, saldos, value, onChange, soloConSaldo, disabled, compacto, ayuda }: {
  productos: Opcion[]; saldos?: Record<string, number>; value: string; onChange: (codigo: string) => void; soloConSaldo?: boolean; disabled?: boolean;
  /** dentro de una tabla: solo se ve el código, el panel flota sobre la pantalla y se cierra al mover la hoja; `saldos` no se muestra */
  compacto?: boolean; ayuda?: string;
}) {
  saldos = saldos ?? {};
  const raiz = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState(0);
  const [sitio, setSitio] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  const elegido = productos.find((p) => p.codigo === value);
  const lista = useMemo(() => {
    const partes = norm(q).split(/\s+/).filter(Boolean);
    return productos.filter((p) => {
      const t = norm(`${p.codigo} ${p.descripcion}`);
      return partes.every((x) => t.includes(x));
    });
  }, [productos, q]);
  const libre = (p: Opcion) => !soloConSaldo || (saldos[p.codigo] ?? 0) > 0;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) cerrar() };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);
  useEffect(() => { setPos(0) }, [q, abierto]);
  /* en una tabla el panel se saca del flujo (position: fixed) para que ni la columna ni el scroll del diálogo lo corten */
  useEffect(() => {
    if (!compacto || !abierto || !caja.current) { setSitio(null); return }
    const r = caja.current.getBoundingClientRect();
    const ancho = Math.min(560, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
    setSitio(window.innerHeight - r.bottom < 340 && r.top > 340 ? { bottom: window.innerHeight - r.top + 2, left } : { top: r.bottom + 2, left });
    const mover = (e: Event) => { if (!(e.target instanceof Node) || !raiz.current?.contains(e.target)) cerrar() };
    window.addEventListener("scroll", mover, true); window.addEventListener("resize", cerrar);
    return () => { window.removeEventListener("scroll", mover, true); window.removeEventListener("resize", cerrar) };
  }, [abierto, compacto]);

  function cerrar() { setAbierto(false); setQ("") }
  function elegir(p: Opcion) { if (!libre(p)) return; onChange(p.codigo); cerrar(); caja.current?.blur() }
  function tecla(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setPos((i) => Math.min(i + 1, lista.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setPos((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Enter" && abierto) { e.preventDefault(); if (lista[pos]) elegir(lista[pos]) }
    else if (e.key === "Escape") { cerrar(); caja.current?.blur() }
  }

  return (
    <div className={`cv-sel ${compacto ? "cmp" : ""}`} ref={raiz}>
      <input ref={caja} className={`cv-sel-in ${compacto && !value ? "sin" : ""}`} role="combobox" aria-expanded={abierto} aria-controls="cv-sel-lista" autoComplete="off" disabled={disabled}
             title={ayuda ?? (elegido ? elegido.descripcion : undefined)}
             placeholder={compacto ? (value || "Elegir código") : elegido ? `${elegido.codigo} · ${elegido.descripcion}` : "Escribe el código o el nombre…"}
             value={abierto ? q : compacto ? (value === "-" ? "—" : value) : elegido ? `${elegido.codigo} · ${elegido.descripcion}` : ""}
             onFocus={() => setAbierto(true)} onChange={(e) => { setQ(e.target.value); setAbierto(true) }} onKeyDown={tecla} />
      {value && !compacto && !abierto && !disabled && <button type="button" className="cv-sel-x" aria-label="Quitar el código" onClick={() => { onChange(""); caja.current?.focus() }}>×</button>}
      {abierto && (
        <div className="cv-sel-panel" id="cv-sel-lista" role="listbox" style={sitio ? { position: "fixed", ...sitio, width: Math.min(560, window.innerWidth - 16) } : undefined}>
          <div className="cv-sel-cab"><span>{lista.length} de {productos.length} códigos</span><span>{compacto ? "Maestro de SKU" : soloConSaldo ? "Un trasiego solo sale de los que tienen pallets" : "Pallets hoy"}</span></div>
          {lista.length > 120 && <p className="cv-sel-vacio">Se muestran los primeros 120: escribe más para afinar.</p>}
          {lista.length === 0 && <p className="cv-sel-vacio">Ningún código coincide con «{q}».</p>}
          <ul>
            {lista.slice(0, 120).map((p, i) => {
              const s = saldos[p.codigo] ?? 0;
              return (
                <li key={p.codigo} role="option" aria-selected={p.codigo === value} aria-disabled={!libre(p)}
                    className={`${i === pos ? "pos" : ""} ${p.codigo === value ? "sel" : ""} ${!libre(p) ? "off" : ""}`}
                    onMouseEnter={() => setPos(i)} onMouseDown={(e) => { e.preventDefault(); elegir(p) }}>
                  <code>{p.codigo}</code><span className="cv-sel-d">{p.descripcion}</span>{!compacto && <b className={s < 0 ? "neg" : ""}>{nf.format(s)}</b>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
