"use client";

import { useMemo, useState } from "react";
import type { DiaHistorico, FilaHistorico } from "@/modulos/inventario/analisis-ajustes";

/**
 * CONTRA AYER — el análisis guardado de un día contra el día guardado anterior: qué códigos empeoraron,
 * cuáles mejoraron, cuáles aparecieron con diferencia y cuáles se cerraron.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const largo = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

type Estado = "empeoro" | "mejoro" | "nuevo" | "cerro" | "igual";
const ETQ: Record<Estado, string> = { empeoro: "Empeoró", mejoro: "Mejoró", nuevo: "Nuevo", cerro: "Se cerró", igual: "Igual" };

export function ContraAyer({ fecha, dias, detalle }: { fecha: string; dias: DiaHistorico[]; detalle: FilaHistorico[] }) {
  const fechas = useMemo(() => [...new Set(dias.map((d) => d.fecha))].sort().reverse(), [dias]);
  const [hoy, setHoy] = useState(fechas.find((f) => f <= fecha) ?? fechas[0] ?? fecha);
  const anterior = (f: string) => fechas.find((x) => x < f) ?? "";
  const [ayer, setAyer] = useState(anterior(hoy));
  const [ver, setVer] = useState<Estado | "todo">("todo");

  const filas = useMemo(() => {
    const H = new Map(detalle.filter((f) => f.fecha === hoy).map((f) => [f.codigo, f]));
    const A = new Map(detalle.filter((f) => f.fecha === ayer).map((f) => [f.codigo, f]));
    return [...new Set([...H.keys(), ...A.keys()])].map((c) => {
      const h = H.get(c), a = A.get(c);
      const dh = h?.diferencia ?? 0, da = a?.diferencia ?? 0;
      const estado: Estado = dh === da ? "igual" : da === 0 ? "nuevo" : dh === 0 ? "cerro" : Math.abs(dh) > Math.abs(da) ? "empeoro" : "mejoro";
      return { codigo: c, descripcion: (h ?? a)!.descripcion, familia: (h ?? a)!.familia, dh, da, cambio: dh - da, sapH: h?.sap ?? 0, sapA: a?.sap ?? 0, conH: h?.conteo ?? 0, conA: a?.conteo ?? 0, estado };
    }).filter((f) => f.dh !== 0 || f.da !== 0).sort((x, y) => Math.abs(y.cambio) - Math.abs(x.cambio));
  }, [detalle, hoy, ayer]);
  const cuenta = (e: Estado) => filas.filter((f) => f.estado === e).length;
  const vistas = ver === "todo" ? filas : filas.filter((f) => f.estado === ver);
  const totH = filas.reduce((t, f) => t + f.dh, 0), totA = filas.reduce((t, f) => t + f.da, 0);
  const absH = filas.reduce((t, f) => t + Math.abs(f.dh), 0), absA = filas.reduce((t, f) => t + Math.abs(f.da), 0);

  if (fechas.length < 2) return <section className="ad-caja"><h2>Hace falta otro día guardado</h2><p className="ad-nota">Para comparar se necesitan al menos dos días guardados en el histórico.</p></section>;

  return (
    <>
      <div className="ad-barra">
        <label className="ad-dia"><span>Día</span>
          <select className="ad-mes" value={hoy} onChange={(e) => { setHoy(e.target.value); setAyer(anterior(e.target.value)) }}>
            {fechas.map((f) => <option key={f} value={f}>{largo(f)}</option>)}
          </select>
        </label>
        <label className="ad-dia"><span>Contra</span>
          <select className="ad-mes" value={ayer} onChange={(e) => setAyer(e.target.value)}>
            {fechas.filter((f) => f < hoy).map((f) => <option key={f} value={f}>{largo(f)}</option>)}
          </select>
        </label>
        <div className="ad-carga">
          <b>{largo(hoy)} contra {ayer ? largo(ayer) : "—"}</b>
          <small>Diferencia = conteo − SAP de cada día guardado. Mejoró si quedó más cerca de cero.</small>
        </div>
      </div>

      <div className="ad-k ad-k4">
        <div><span>DIFERENCIA ANTERIOR</span><b>{signo(totA)}</b><small>{n(absA)} sin signo</small></div>
        <div><span>DIFERENCIA DEL DÍA</span><b>{signo(totH)}</b><small>{n(absH)} sin signo</small></div>
        <div className={absH <= absA ? "sobra" : "falta"}><span>CAMBIO (SIN SIGNO)</span><b>{signo(absH - absA)}</b><small>{absH <= absA ? "se acercó a cero" : "se alejó de cero"}</small></div>
        <div className="comp"><span>CÓDIGOS</span><b>{cuenta("mejoro") + cuenta("cerro")} ↓ · {cuenta("empeoro") + cuenta("nuevo")} ↑</b><small>mejoraron o cerraron · empeoraron o nuevos</small></div>
      </div>

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Código por código</h2>
          <div className="ad-ver" role="tablist" aria-label="Qué ver">
            {([["todo", "Todos", filas.length], ["empeoro", "Empeoraron", cuenta("empeoro")], ["nuevo", "Nuevos", cuenta("nuevo")], ["mejoro", "Mejoraron", cuenta("mejoro")], ["cerro", "Se cerraron", cuenta("cerro")]] as const).map(([v, t, c]) => (
              <button key={v} type="button" role="tab" aria-selected={ver === v} className={(ver === v ? "on " : "") + (v === "empeoro" || v === "nuevo" ? "falta" : v === "todo" ? "" : "sobra")} onClick={() => setVer(v)}>{t} <em>{c}</em></button>
            ))}
          </div>
        </div>
        <div className="ad-tabla-caja">
          <table className="ad-t ad-piv ad-aj">
            <thead><tr>
              <th>Código</th><th>Descripción</th><th className="n">SAP antes → día</th><th className="n">Conteo antes → día</th>
              <th className="n">Diferencia antes</th><th className="n">Diferencia del día</th><th className="n">Cambio</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {vistas.map((f) => (
                <tr key={f.codigo}>
                  <td className="mono">{f.codigo}</td>
                  <td>{f.descripcion}<small>{f.familia}</small></td>
                  <td className="n">{n(f.sapA)} → {n(f.sapH)}</td>
                  <td className="n">{n(f.conA)} → {n(f.conH)}</td>
                  <td className={"n" + (f.da < 0 ? " neg" : f.da > 0 ? " pos" : "")}>{signo(f.da)}</td>
                  <td className={"n b" + (f.dh < 0 ? " neg" : f.dh > 0 ? " pos" : "")}>{signo(f.dh)}</td>
                  <td className="n b">{signo(f.cambio)}</td>
                  <td><span className={"ad-sent " + (f.estado === "empeoro" || f.estado === "nuevo" ? "falta" : f.estado === "igual" ? "ok" : "sobra")}>{ETQ[f.estado]}</span></td>
                </tr>
              ))}
              {!vistas.length && <tr><td colSpan={8} className="ad-vacio">Nada en esa lista.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
