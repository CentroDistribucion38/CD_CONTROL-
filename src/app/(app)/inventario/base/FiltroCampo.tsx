"use client";

/**
 * FILTRO POR CAMPO, COMO EL DE EXCEL: «necesito poder filtrar por todos los campos».
 *
 * Cada encabezado lleva su embudo; se abre la lista de valores que hay en esa columna (con cuántos
 * renglones tiene cada uno, contando los demás filtros puestos), se marcan los que se quieren ver y
 * se aplica. Igual que el autofiltro de la hoja de donde viene esta pantalla.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export const VACIAS = "(Vacías)";
const nf = new Intl.NumberFormat("es-CO");
const TOPE = 600;

export function FiltroCampo({ titulo, valores, elegidos, pos, aplicar, cerrar, ordenar }: {
  titulo: string;
  valores: { v: string; n: number }[];
  /** null = todos (sin filtro). */
  elegidos: ReadonlySet<string> | null;
  pos: { x: number; y: number };
  aplicar: (s: ReadonlySet<string> | null) => void;
  cerrar: () => void;
  ordenar?: (asc: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState<Set<string>>(() => new Set(elegidos ?? valores.map((x) => x.v)));
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) cerrar() };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    const t = setTimeout(() => document.addEventListener("mousedown", fuera), 0);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", cerrar);
    window.addEventListener("resize", cerrar);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", cerrar); window.removeEventListener("resize", cerrar);
    };
  }, [cerrar]);

  const vistos = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? valores.filter((x) => x.v.toLowerCase().includes(t)) : valores;
  }, [valores, q]);
  const todosVistos = vistos.length > 0 && vistos.every((x) => marca.has(x.v));
  const alterna = (v: string) => setMarca((m) => { const n = new Set(m); if (n.has(v)) n.delete(v); else n.add(v); return n });
  const alternaVistos = () => setMarca((m) => {
    const n = new Set(m);
    if (todosVistos) vistos.forEach((x) => n.delete(x.v)); else vistos.forEach((x) => n.add(x.v));
    return n;
  });

  function listo() {
    /* Con búsqueda escrita, como en Excel: queda SOLO lo que se buscó y está marcado. */
    const s = q.trim() ? new Set(vistos.filter((x) => marca.has(x.v)).map((x) => x.v)) : marca;
    aplicar(s.size === valores.length && valores.every((x) => s.has(x.v)) ? null : s);
  }

  const ancho = 300;
  const left = Math.max(8, Math.min(pos.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - ancho - 8));

  return (
    <div className="ba-fc" ref={caja} role="dialog" aria-label={`Filtrar ${titulo}`} style={{ left, top: pos.y, width: ancho }}>
      <div className="ba-fc-t">Filtrar · <b>{titulo}</b></div>
      {ordenar && (
        <div className="ba-fc-ord">
          <button type="button" onClick={() => { ordenar(true); cerrar() }}>Ordenar A → Z</button>
          <button type="button" onClick={() => { ordenar(false); cerrar() }}>Z → A</button>
        </div>
      )}
      <input className="ba-fc-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
             onKeyDown={(e) => { if (e.key === "Enter") listo() }} />
      <div className="ba-fc-l">
        <label className="ba-fc-todo">
          <input type="checkbox" checked={todosVistos} onChange={alternaVistos} />
          <span>(Seleccionar todo{q.trim() ? " lo buscado" : ""})</span>
        </label>
        {vistos.slice(0, TOPE).map((x) => (
          <label key={x.v}>
            <input type="checkbox" checked={marca.has(x.v)} onChange={() => alterna(x.v)} />
            <span className={x.v === VACIAS ? "vac" : undefined}>{x.v}</span>
            <i>{nf.format(x.n)}</i>
          </label>
        ))}
        {vistos.length > TOPE && <p className="ba-fc-mas">Hay {nf.format(vistos.length - TOPE)} valores más: escribe en Buscar para encontrarlos.</p>}
        {vistos.length === 0 && <p className="ba-fc-mas">Nada con «{q}».</p>}
      </div>
      <div className="ba-fc-b">
        <button type="button" className="ba-fc-limpia" onClick={() => aplicar(null)} disabled={!elegidos}>Quitar filtro</button>
        <span>
          <button type="button" className="ba-sec" onClick={cerrar}>Cancelar</button>
          <button type="button" className="ba-prim" onClick={listo} disabled={!q.trim() && marca.size === 0}>Aplicar</button>
        </span>
      </div>
    </div>
  );
}
