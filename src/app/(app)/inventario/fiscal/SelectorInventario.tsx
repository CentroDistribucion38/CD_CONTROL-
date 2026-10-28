"use client";

/**
 * EL SELECTOR DE INVENTARIOS FISCALES: una barra negra con el inventario actual; al abrirla sale la lista con buscador
 * (no ocupa espacio aunque haya muchos inventarios). El actual va resaltado en amarillo de marca.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export type ItemInventario = { id: string; nombre: string; fecha: string; cuando: string; abierto: boolean };

const sinTilde = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function SelectorInventario({ items, actual, escoger }: { items: ItemInventario[]; actual: string | null; escoger: (id: string) => void }) {
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

  const sel = items.find((i) => i.id === actual) ?? items[0];
  const vistos = useMemo(() => {
    const ts = sinTilde(q).split(/\s+/).filter(Boolean);
    return ts.length ? items.filter((i) => ts.every((t) => sinTilde(`${i.nombre} ${i.fecha}`).includes(t))) : items;
  }, [items, q]);
  if (!sel) return null;

  return (
    <div className="si" ref={caja}>
      <style>{`
        .si{position:relative;margin-top:12px;max-width:560px}
        .si-b{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#111;color:#fff;border:0;border-bottom:3px solid #ffc20e;border-radius:0;text-align:left;cursor:pointer}
        .si-b small{display:block;font:400 .68rem var(--fe-texto,Arial,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:#bbb}
        .si-b b{display:block;font:700 1rem var(--fe-texto,Arial,sans-serif)}
        .si-b i{font-style:normal;color:#ffc20e;font-size:1.1rem}
        .si-n{margin-left:8px;font:800 .62rem Arial,sans-serif;letter-spacing:.08em;padding:3px 7px;vertical-align:middle}
        .si-n.abierto{background:#ffc20e;color:#111}.si-n.cerrado{background:#444;color:#fff}
        .si-m{position:absolute;z-index:40;left:0;right:0;top:100%;background:#fff;color:#111;border:1px solid #cfcfcf;box-shadow:0 14px 40px rgba(0,0,0,.28)}
        .si-q{width:100%;height:40px;padding:0 14px;border:0;border-bottom:1px solid #ddd;border-radius:0;font:500 .85rem var(--fe-texto,Arial,sans-serif);background:#fff;color:#111}
        .si-q:focus{outline:none;box-shadow:inset 0 -2px 0 #ffc20e}
        .si-l{max-height:340px;overflow:auto;list-style:none;margin:0;padding:0}
        .si-it{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;border:0;border-bottom:1px solid #eee;background:#fff;color:#111;font:500 .85rem var(--fe-texto,Arial,sans-serif);text-align:left;cursor:pointer;border-radius:0}
        .si-it:hover{background:rgba(255,194,14,.16)}
        .si-it[aria-current="true"]{background:rgba(255,194,14,.3);font-weight:700}
        .si-it span{color:#666;font-size:.75rem;white-space:nowrap}
        .si-vacio{padding:14px;font-size:.82rem;color:#666}
      `}</style>
      <button type="button" className="si-b" aria-expanded={abierto} aria-haspopup="listbox" onClick={() => { setAbierto(!abierto); setQ("") }}>
        <span>
          <small>Inventario fiscal · {items.length} en total</small>
          <b>{sel.nombre} · {sel.fecha}<span className={"si-n " + (sel.abierto ? "abierto" : "cerrado")}>{sel.abierto ? "ABIERTO" : "CERRADO"}</span></b>
        </span>
        <i aria-hidden="true">▾</i>
      </button>
      {abierto && (
        <div className="si-m">
          <input className="si-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="⌕  Buscar inventario…" aria-label="Buscar inventario fiscal" />
          <ul className="si-l" role="listbox" aria-label="Inventarios fiscales">
            {vistos.map((i) => (
              <li key={i.id}>
                <button type="button" role="option" aria-selected={i.id === sel.id} aria-current={i.id === sel.id ? "true" : undefined} className="si-it"
                        onClick={() => { escoger(i.id); setAbierto(false) }}>
                  <b style={{ fontWeight: "inherit" }}>{i.nombre} · {i.fecha}</b>
                  <span>{i.abierto ? "abierto" : "cerrado"} · {i.cuando}</span>
                </button>
              </li>
            ))}
            {vistos.length === 0 && <li className="si-vacio">Ningún inventario con «{q}».</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
