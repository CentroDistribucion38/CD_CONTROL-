"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FilaCuadre, Partida311 } from "@/modulos/inventario/cuadre";
import { guardarAjustes311 } from "./actions";

/**
 * EL TOOLBOX DE LOS 311 EN AG22.
 * «La ZEXI la tomo a las 6 AM, pero hago movimientos 311 en los otros almacenes: debe haber un icono que me traiga
 *  las partidas de los 311, lo selecciono y se suma o resta a la que subí, para hacer los movimientos reales.»
 *
 * La suma o resta es AUTOMÁTICA, según lo que se hizo en cada almacén: lo que ENTRÓ a AG18/AG17/AG16 salió de AG22 (resta);
 * lo que SALIÓ de ahí entró a AG22 (suma). Quien usa solo escoge qué partidas aplican.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const n = (v: number) => (v < 0 ? "−" : "") + nf.format(Math.abs(v));
const sg = (v: number) => (v > 0 ? "+" : "") + n(v);
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
type Vista = "todos" | "AG18" | "AG17" | "AG16" | "marcadas";

/** El icono de las dos flechas (movimiento entre almacenes). */
const Icono = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
    <path d="M4 8h14M14 4l4 4-4 4" /><path d="M20 16H6M10 12l-4 4 4 4" />
  </svg>
);

export function Partidas311({ fecha, partidas, filas, elegidas }: { fecha: string; partidas: Partida311[]; filas: FilaCuadre[]; elegidas: string[] }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [sel, setSel] = useState<Set<string>>(new Set(elegidas));
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<Vista>("todos");
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, start] = useTransition();

  /* La ZEXI de las 6 AM tal cual, por código (sin los 311 ya aplicados). */
  const zexiDe = useMemo(() => new Map(filas.map((f) => [f.codigo, f.sapZexi ?? f.sap])), [filas]);
  const hayZexi = filas.some((f) => f.sap != null);
  const guardadas = elegidas.length;

  const efectoDe = (codigo: string, claves: Set<string>) => partidas.filter((p) => p.codigo === codigo && claves.has(p.clave)).reduce((t, p) => t + p.efecto, 0);
  const visibles = useMemo(() => {
    const t = q.trim().toUpperCase(), partes = t.split(/[\s,;]+/).filter(Boolean);
    return partidas.filter((p) => {
      if (vista === "marcadas" ? !sel.has(p.clave) : vista !== "todos" && p.almacen !== vista) return false;
      if (!partes.length) return true;
      return partes.length > 1 ? partes.some((x) => p.codigo.startsWith(x)) : `${p.codigo} ${p.material}`.toUpperCase().includes(t);
    });
  }, [partidas, q, vista, sel]);
  const cuentas = { todos: partidas.length, AG18: partidas.filter((p) => p.almacen === "AG18").length, AG17: partidas.filter((p) => p.almacen === "AG17").length,
    AG16: partidas.filter((p) => p.almacen === "AG16").length, marcadas: partidas.filter((p) => sel.has(p.clave)).length };
  const sinGuardar = partidas.some((p) => sel.has(p.clave) !== elegidas.includes(p.clave));
  const efectoTotal = partidas.filter((p) => sel.has(p.clave)).reduce((t, p) => t + p.efecto, 0);

  const abrir = () => { setMsg(null); setSel(new Set(elegidas)); setQ(""); setVista("todos"); dlg.current?.showModal() };
  const cerrar = () => dlg.current?.close();
  const poner = (claves: string[], v: boolean) => setSel((s) => { const x = new Set(s); for (const c of claves) { if (v) x.add(c); else x.delete(c) } return x });
  const guardar = () => start(async () => {
    const r = await guardarAjustes311(fecha, JSON.stringify([...sel].filter((c) => partidas.some((p) => p.clave === c))));
    if ("error" in r && r.error) { setMsg(r.error); return }
    cerrar(); router.refresh();
  });

  return (
    <>
      <button type="button" className={"cs-bt alt cs-311-bt" + (guardadas ? " on" : "")} onClick={abrir} title="Traer los 311 que hice en AG18, AG17 y AG16 y aplicarlos a la ZEXI de las 6 AM">
        <Icono /> 311{guardadas ? <b>{guardadas}</b> : null}
      </button>

      <dialog ref={dlg} className="cs-exc cs-311" aria-labelledby="cs-311-t" onClick={(e) => { if (e.target === dlg.current) cerrar() }}>
        <div className="cs-exc-caja">
          <header className="cs-exc-cab">
            <div>
              <p className="cs-exc-ojo">Cuadre SAP · AG22 · Movimientos 311</p>
              <h2 id="cs-311-t">Partidas de los 311 de AG18, AG17 y AG16</h2>
            </div>
            <button type="button" className="cs-exc-x" onClick={cerrar} aria-label="Cerrar">×</button>
          </header>

          <div className="cs-exc-herr">
            <p className="cs-311-regla">Marca las partidas que aplican. <b>Se suma o se resta sola</b> según lo que se hizo en cada almacén: lo que <b>salió</b> de AG18 / AG17 / AG16 <b>suma</b> en AG22; lo que <b>entró</b> allá <b>resta</b> en AG22. Ejemplo: ZEXI de las 6 AM 300 y en AG18 saliste a AG22 con 100 → AG22 queda en 400.</p>
            <input type="search" className="cs-exc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por código o nombre (varios códigos: sepáralos con coma)" aria-label="Filtrar partidas" />
            <div className="cs-exc-vistas" role="tablist" aria-label="Qué almacén mostrar">
              {([["todos", "Todos"], ["AG18", "AG18"], ["AG17", "AG17"], ["AG16", "AG16"], ["marcadas", "Marcadas"]] as const).map(([k, t]) => (
                <button key={k} type="button" role="tab" aria-selected={vista === k} className={vista === k ? "on" : ""} onClick={() => setVista(k)}>{t} <b>{cuentas[k]}</b></button>
              ))}
            </div>
            <div className="cs-exc-masivo">
              <span>{visibles.length} partida{visibles.length === 1 ? "" : "s"} en la lista</span>
              <button type="button" onClick={() => poner(visibles.map((p) => p.clave), true)} disabled={!visibles.length}>Marcar las de la lista</button>
              <button type="button" onClick={() => poner(visibles.map((p) => p.clave), false)} disabled={!visibles.length}>Quitar las de la lista</button>
            </div>
          </div>

          <ul className="cs-exc-lista cs-311-lista" aria-label="Partidas del 311">
            {visibles.map((p) => {
              const on = sel.has(p.clave);
              const z = zexiDe.get(p.codigo);
              const despues = z == null ? null : z + efectoDe(p.codigo, sel);
              return (
                <li key={p.clave} className={on ? "fuera" : ""}>
                  <label>
                    <input type="checkbox" checked={on} onChange={(e) => poner([p.clave], e.target.checked)} />
                    <code>{p.codigo}</code>
                    <span className="cs-exc-n">{p.material}
                      <small>{p.almacen}: {p.cantidad > 0 ? "entró" : "salió"} {n(Math.abs(p.cantidad))}{p.archivo ? ` · ${p.archivo}` : ""}{p.hora ? ` · ${hora(p.hora)}` : ""}{p.documentos.length ? ` · doc ${p.documentos.slice(0, 2).join(", ")}${p.documentos.length > 2 ? ` +${p.documentos.length - 2}` : ""}` : ""}</small>
                    </span>
                    <span className="cs-311-efecto">
                      <b className={p.efecto > 0 ? "suma" : "resta"}>{p.efecto > 0 ? "Suma" : "Resta"} {n(Math.abs(p.efecto))}</b>
                      <small>{hayZexi ? (z == null ? "sin ZEXI" : on ? `ZEXI ${n(z)} → ${n(despues ?? z)}` : `ZEXI ${n(z)}`) : "falta la ZEXI"}</small>
                    </span>
                  </label>
                </li>
              );
            })}
            {!partidas.length && <li className="vacio">Todavía no hay 311 de este día: sube el archivo del 311 (o la ZEXI nueva) en el paso 3 de AG18, AG17 o AG16 y aparecen aquí.</li>}
            {partidas.length > 0 && !visibles.length && <li className="vacio">Nada con ese filtro.</li>}
          </ul>

          <footer className="cs-exc-pie">
            <span className="cs-exc-res">
              <span><b>{cuentas.marcadas}</b> aplicada{cuentas.marcadas === 1 ? "" : "s"} · {cuentas.marcadas ? <>efecto neto en AG22 <b>{sg(efectoTotal)}</b> u · </> : null}{sinGuardar ? <em>cambios sin guardar</em> : "sin cambios"}</span>
              {msg && <small className="mal" role="status">{msg}</small>}
            </span>
            <button type="button" className="cs-bt alt" onClick={() => setSel(new Set())} disabled={pend || !sel.size}>Quitar todas</button>
            <button type="button" className="cs-bt alt" onClick={cerrar} disabled={pend}>Cancelar</button>
            <button type="button" className="cs-bt" onClick={guardar} disabled={pend || !sinGuardar}>{pend ? "Guardando…" : "Aplicar a la ZEXI"}</button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
