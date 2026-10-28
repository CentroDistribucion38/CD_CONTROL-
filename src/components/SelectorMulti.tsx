"use client";

/**
 * SELECTOR DE SELECCIÓN MÚLTIPLE (mismo estilo del filtro de La base): un botón abre la lista de valores con
 * cuántos renglones tiene cada uno; se escribe para buscar (varios códigos pegados juntos también valen), se marca
 * uno por uno o «todo lo buscado», y lo marcado sale como chips que se quitan con «×». Todo recto, amarillo de marca.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export type OpcionMulti = { clave: string; detalle?: string; n?: number };

const sinTilde = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function SelectorMulti({ titulo, todos, unidad, opciones, elegidos, cambiar, conChips = true }: {
  titulo: string; todos: string; unidad: string;
  opciones: OpcionMulti[]; elegidos: ReadonlySet<string>; cambiar: (s: ReadonlySet<string>) => void;
  /** Dibuja al lado los chips de lo marcado (se pueden quitar de uno en uno). */
  conChips?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) };
    document.addEventListener("mousedown", fuera); document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla) };
  }, [abierto]);

  const vistos = useMemo(() => {
    const ts = sinTilde(q).split(/[\s,;]+/).filter(Boolean);
    if (!ts.length) return opciones;
    const soloCodigos = ts.every((x) => /^\d+$/.test(x));
    return opciones.filter((o) => soloCodigos ? ts.some((x) => o.clave.includes(x)) : ts.every((x) => sinTilde(o.clave).includes(x) || sinTilde(o.detalle ?? "").includes(x)));
  }, [opciones, q]);
  const todosVistos = vistos.length > 0 && vistos.every((o) => elegidos.has(o.clave));
  const alterna = (c: string) => { const n = new Set(elegidos); if (n.has(c)) n.delete(c); else n.add(c); cambiar(n) };
  const alternaVistos = () => { const n = new Set(elegidos); if (todosVistos) vistos.forEach((o) => n.delete(o.clave)); else vistos.forEach((o) => n.add(o.clave)); cambiar(n) };
  const lista = [...elegidos].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const detalleDe = (c: string) => opciones.find((o) => o.clave === c)?.detalle ?? "";
  const conDetalle = opciones.some((o) => o.detalle);

  return (
    <>
      <style>{`
        .smx{position:relative;display:inline-flex;align-items:center}
        .smx-b{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 12px;border:1px solid rgba(127,127,127,.45);background:#fff;color:#111;border-radius:0;font:700 .8rem Arial,sans-serif;cursor:pointer}
        .smx-b[data-activo]{border-color:#ffc20e;box-shadow:inset 0 -3px 0 #ffc20e}
        .smx-pop{position:absolute;z-index:30;top:calc(100% + 6px);left:0;width:min(430px,calc(100vw - 32px));background:#fff;color:#111;border:1px solid rgba(127,127,127,.45);box-shadow:0 14px 40px rgba(0,0,0,.28);display:flex;flex-direction:column;text-align:left}
        .smx-t{display:flex;justify-content:space-between;align-items:baseline;padding:10px 12px 6px;font:600 .72rem Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#666}
        .smx-t b{color:#111;margin:0 auto 0 4px}
        .smx-t span{text-transform:none;letter-spacing:0}
        .smx-cs{display:flex;flex-wrap:wrap;gap:4px;padding:0 12px 8px}
        .smx-c{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;border:0;background:#ffc20e;color:#111;font:700 .74rem Arial,sans-serif;cursor:pointer;border-radius:0;font-variant-numeric:tabular-nums}
        .smx-c i{font-style:normal;font-size:.9rem;line-height:1;opacity:.7}
        .smx-c.mas{background:#e6e6e6;cursor:default}
        .smx-q{margin:0 12px 8px;height:36px;padding:0 10px;border:1px solid rgba(127,127,127,.45);border-radius:0;font:500 .8rem Arial,sans-serif;color:#111;background:#fff}
        .smx-q:focus{outline:none;border-color:#ffc20e}
        .smx-l{max-height:320px;overflow:auto;border-top:1px solid rgba(127,127,127,.3);border-bottom:1px solid rgba(127,127,127,.3)}
        .smx-l label{display:grid;grid-template-columns:22px 82px 1fr auto;align-items:center;gap:6px;padding:7px 12px;font:500 .78rem Arial,sans-serif;cursor:pointer;border-bottom:1px solid rgba(127,127,127,.12)}
        .smx-l label.corto{grid-template-columns:22px 1fr auto}
        .smx-l label:hover{background:rgba(255,194,14,.14)}
        .smx-l label[data-on]{background:rgba(255,194,14,.28)}
        .smx-l label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .smx-l label i{font-style:normal;font-size:.7rem;color:#777;font-variant-numeric:tabular-nums}
        .smx-l .smx-todo{position:sticky;top:0;background:#f4f4f4;font-weight:700;grid-template-columns:22px 1fr}
        .smx-vacio{margin:0;padding:14px 12px;font-size:.78rem;color:#666}
        .smx-p{display:flex;justify-content:space-between;align-items:center;padding:8px 12px}
        .smx-lim{border:0;background:transparent;padding:4px 6px;font:600 .74rem Arial,sans-serif;color:#666;text-decoration:underline;cursor:pointer}
        .smx-lim:disabled{opacity:.4;cursor:default;text-decoration:none}
        .smx-ok{min-height:34px;padding:0 22px;border:0;background:#ffc20e;color:#111;font:800 .8rem Arial,sans-serif;cursor:pointer;border-radius:0}
      `}</style>
      <div className="smx" ref={caja}>
        <button type="button" className="smx-b" data-activo={elegidos.size ? "1" : undefined} aria-expanded={abierto} aria-haspopup="dialog" onClick={() => setAbierto(!abierto)}>
          {elegidos.size === 0 ? todos : elegidos.size === 1 ? `${titulo}: ${lista[0]}` : `${titulo}: ${elegidos.size} ${unidad}`}
          <span aria-hidden="true" style={{ fontSize: ".65rem", color: "#666" }}>▾</span>
        </button>
        {abierto && (
          <div className="smx-pop" role="dialog" aria-label={`Escoger ${titulo}`}>
            <div className="smx-t">Filtrar · <b>{titulo}</b><span>{elegidos.size ? `${elegidos.size} marcados` : "sin filtro"}</span></div>
            {elegidos.size > 0 && (
              <div className="smx-cs">
                {lista.slice(0, 6).map((c) => (
                  <button key={c} type="button" className="smx-c" title={detalleDe(c) || c} onClick={() => alterna(c)} aria-label={`Quitar ${c}`}>{c}<i aria-hidden="true">×</i></button>
                ))}
                {lista.length > 6 && <span className="smx-c mas">+{lista.length - 6}</span>}
              </div>
            )}
            <input className="smx-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Buscar ${titulo}`}
                   placeholder={conDetalle ? "Código o nombre… (puedes pegar varios códigos)" : "Buscar…"} onKeyDown={(e) => { if (e.key === "Enter") setAbierto(false) }} />
            <div className="smx-l">
              <label className="smx-todo">
                <input type="checkbox" checked={todosVistos} onChange={alternaVistos} />
                <span>(Seleccionar todo{q.trim() ? " lo buscado" : ""})</span>
              </label>
              {vistos.map((o) => (
                <label key={o.clave} data-on={elegidos.has(o.clave) ? "1" : undefined} className={conDetalle ? undefined : "corto"}>
                  <input type="checkbox" checked={elegidos.has(o.clave)} onChange={() => alterna(o.clave)} />
                  <b>{o.clave}</b>
                  {conDetalle && <span>{o.detalle}</span>}
                  <i>{o.n ?? ""}</i>
                </label>
              ))}
              {vistos.length === 0 && <p className="smx-vacio">{opciones.length === 0 ? "No hay nada para marcar." : `Nada con «${q}».`}</p>}
            </div>
            <div className="smx-p">
              <button type="button" className="smx-lim" onClick={() => cambiar(new Set())} disabled={elegidos.size === 0}>Quitar filtro</button>
              <button type="button" className="smx-ok" onClick={() => setAbierto(false)}>Listo</button>
            </div>
          </div>
        )}
      </div>
      {conChips && elegidos.size > 0 && !abierto && (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {lista.slice(0, 5).map((c) => (
            <button key={c} type="button" className="smx-c" title={detalleDe(c) || c} onClick={() => alterna(c)} aria-label={`Quitar ${c}`}>{c}<i aria-hidden="true">×</i></button>
          ))}
          {lista.length > 5 && <span className="smx-c mas">+{lista.length - 5}</span>}
        </span>
      )}
    </>
  );
}
