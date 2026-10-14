"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PanelExcluidos, SkuExcluible } from "@/modulos/pasivos/excluidos";
import { guardarExcluidos } from "./actions";

/**
 * EL TOOLBOX DE LOS SKU FUERA DEL CUADRE.
 * «Que yo pueda seleccionar y se me abra un toolbox profesional con filtro de código para ver a cuál le
 *  voy a aplicar. Siempre van a estar seleccionados los que dijimos, pero que no me amarre solo a esos.»
 *
 * La franja dice qué quedó fuera hoy; «Elegir SKU» abre el panel: filtro por código o nombre, vistas
 * (todos · fuera · de hoy · los de siempre) y una casilla por SKU. Se guarda solo lo distinto a lo de siempre.
 */
type Vista = "todos" | "fuera" | "hoy" | "siempre";
const TOPE = 250;

export function Excluidos({ panel }: { panel: PanelExcluidos }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const buscar = useRef<HTMLInputElement>(null);
  const [fuera, setFuera] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<Vista>("fuera");
  const [msg, setMsg] = useState<{ t: string; mal?: boolean } | null>(null);
  const [pend, start] = useTransition();

  const base = useMemo(() => Object.fromEntries(panel.skus.map((s) => [s.codigo, s.fuera])), [panel.skus]);
  useEffect(() => { setFuera(base) }, [base]);

  const esFuera = (s: SkuExcluible) => fuera[s.codigo] ?? s.fuera;
  const totalFuera = panel.skus.filter(esFuera).length;
  const cambiadosVsSiempre = panel.skus.filter((s) => esFuera(s) !== s.porDefecto).length;
  const sinGuardar = panel.skus.filter((s) => esFuera(s) !== s.fuera).length;
  const cuentas = {
    todos: panel.skus.length,
    fuera: totalFuera,
    hoy: panel.skus.filter((s) => s.hoy).length,
    siempre: panel.skus.filter((s) => s.porDefecto).length,
  };

  const visibles = useMemo(() => {
    const t = q.trim().toUpperCase();
    const partes = t.split(/[\s,;]+/).filter(Boolean);
    return panel.skus.filter((s) => {
      if (vista === "fuera" && !(fuera[s.codigo] ?? s.fuera)) return false;
      if (vista === "hoy" && !s.hoy) return false;
      if (vista === "siempre" && !s.porDefecto) return false;
      if (!partes.length) return true;
      const txt = `${s.codigo} ${s.nombre}`.toUpperCase();
      /* Varios códigos separados por coma o espacio: basta con que coincida uno. */
      return partes.length > 1 ? partes.some((p) => s.codigo.startsWith(p)) : txt.includes(t);
    });
  }, [panel.skus, q, vista, fuera]);

  const abrir = () => { setMsg(null); setFuera(base); setQ(""); setVista("fuera"); dlg.current?.showModal(); setTimeout(() => buscar.current?.focus(), 30) };
  const cerrar = () => dlg.current?.close();
  const poner = (codigos: string[], v: boolean) => setFuera((f) => { const n = { ...f }; for (const c of codigos) n[c] = v; return n });
  const deSiempre = () => setFuera(Object.fromEntries(panel.skus.map((s) => [s.codigo, s.porDefecto])));

  const guardar = () => start(async () => {
    const elecciones = panel.skus.filter((s) => esFuera(s) !== s.porDefecto).map((s) => ({ codigo: s.codigo, nombre: s.nombre, fuera: esFuera(s) }));
    const r = await guardarExcluidos(panel.ambito, JSON.stringify(elecciones));
    if ("error" in r && r.error) { setMsg({ t: r.error, mal: true }); return }
    cerrar();
    router.refresh();
  });

  const nombreAmbito = panel.ambito === "AG18" ? "Cuadre SAP AG18" : "Cuadre SAP AG22 y base de Pasivos";
  const vistos = visibles.slice(0, TOPE);

  return (
    <>
      <div className="cs-exc-franja">
        <span className="cs-exc-et">Fuera del cuadre · {panel.ambito}</span>
        <span className="cs-exc-hoy">
          {panel.hoy.length
            ? <>Hoy no entran: {panel.hoy.map((c) => <code key={c}>{c}</code>)}</>
            : <>Hoy no quedó nada por fuera.</>}
          <small>{totalFuera} SKU fuera en total{cambiadosVsSiempre ? ` · ${cambiadosVsSiempre} escogidos por ti` : " · solo los de siempre"}</small>
        </span>
        <button type="button" className="cs-bt alt" onClick={abrir}>Elegir SKU</button>
      </div>

      <dialog ref={dlg} className="cs-exc" aria-labelledby="cs-exc-t" onClick={(e) => { if (e.target === dlg.current) cerrar() }}>
        <div className="cs-exc-caja">
          <header className="cs-exc-cab">
            <div>
              <p className="cs-exc-ojo">{nombreAmbito}</p>
              <h2 id="cs-exc-t">SKU que no entran</h2>
            </div>
            <button type="button" className="cs-exc-x" onClick={cerrar} aria-label="Cerrar">×</button>
          </header>

          <div className="cs-exc-herr">
            <input ref={buscar} type="search" className="cs-exc-q" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar por código o nombre (varios códigos: sepáralos con coma)" aria-label="Filtrar SKU" />
            <div className="cs-exc-vistas" role="tablist" aria-label="Qué mostrar">
              {([["fuera", "Fuera"], ["hoy", "De hoy"], ["siempre", "Los de siempre"], ["todos", "Todos"]] as const).map(([k, t]) => (
                <button key={k} type="button" role="tab" aria-selected={vista === k} className={vista === k ? "on" : ""} onClick={() => setVista(k)}>
                  {t} <b>{cuentas[k]}</b>
                </button>
              ))}
            </div>
            <div className="cs-exc-masivo">
              <span>{visibles.length} {visibles.length === 1 ? "SKU" : "SKU"} en la lista</span>
              <button type="button" onClick={() => poner(visibles.map((s) => s.codigo), true)} disabled={!visibles.length}>Sacar los de la lista</button>
              <button type="button" onClick={() => poner(visibles.map((s) => s.codigo), false)} disabled={!visibles.length}>Meter los de la lista</button>
            </div>
          </div>

          <ul className="cs-exc-lista" aria-label="SKU">
            {vistos.map((s) => {
              const f = esFuera(s);
              return (
                <li key={s.codigo} className={f ? "fuera" : ""}>
                  <label>
                    <input type="checkbox" checked={f} onChange={(e) => poner([s.codigo], e.target.checked)} />
                    <code>{s.codigo}</code>
                    <span className="cs-exc-n">{s.nombre || "—"}</span>
                    <span className="cs-exc-tags">
                      {s.hoy && <i className="hoy">hoy</i>}
                      {s.porDefecto && <i className="siempre">de siempre</i>}
                      {f !== s.porDefecto && <i className="tuyo">{f ? "sacado por ti" : "metido por ti"}</i>}
                    </span>
                  </label>
                </li>
              );
            })}
            {!visibles.length && <li className="vacio">Nada con ese filtro.</li>}
            {visibles.length > TOPE && <li className="vacio">Y {visibles.length - TOPE} más: escribe un código para encontrarlo.</li>}
          </ul>

          <footer className="cs-exc-pie">
            <span className="cs-exc-res">
              <span><b>{totalFuera}</b> fuera · {sinGuardar ? <em>{sinGuardar} cambio{sinGuardar === 1 ? "" : "s"} sin guardar</em> : "sin cambios"}</span>
              {panel.faltaSql && <small className="mal">Para guardar, corre supabase/migraciones/2026-10-excluidos-sku.sql.</small>}
              {msg && <small className={msg.mal ? "mal" : ""} role="status">{msg.t}</small>}
            </span>
            <button type="button" className="cs-bt alt" onClick={deSiempre} disabled={pend}>Volver a lo de siempre</button>
            <button type="button" className="cs-bt alt" onClick={cerrar} disabled={pend}>Cancelar</button>
            <button type="button" className="cs-bt" onClick={guardar} disabled={pend || panel.faltaSql}>{pend ? "Guardando…" : "Guardar"}</button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
