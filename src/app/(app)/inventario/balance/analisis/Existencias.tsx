"use client";

/**
 * EXISTENCIAS SAP POR ESTADO — la ZEXI de AG18 del día, a la vista dentro del análisis.
 * «Ten en la visual esta tabla y las existencias por estado: Libre utiliz. · In control-cal · Bloqueado.»
 * Sale de la ZEXI que se cargó en el Cuadre SAP AG18 de ese día; aquí solo se muestra.
 */
import { useState } from "react";
import type { Existencias as Ex } from "@/modulos/inventario/analisis-dif";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const v = (x: number | null) => (x == null ? "—" : nf.format(x));

export function Existencias({ ex }: { ex: Ex | null | undefined }) {
  const [abierta, setAbierta] = useState(true);
  if (!ex) {
    return (
      <section className="ad-caja ad-ex">
        <div className="ad-ex-cab"><h2>Existencias SAP por estado · AG18</h2></div>
        <p className="ad-vacio">El Cuadre SAP AG18 de ese día no tiene ZEXI cargada. Cárgala allá y aparece aquí.</p>
      </section>
    );
  }
  const t = ex.filas.reduce((a, f) => ({ libre: a.libre + (f.libre ?? 0), calidad: a.calidad + (f.calidad ?? 0), bloqueado: a.bloqueado + (f.bloqueado ?? 0), total: a.total + f.total }),
    { libre: 0, calidad: 0, bloqueado: 0, total: 0 });
  const hora = ex.en ? new Date(ex.en).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) : null;

  return (
    <section className="ad-caja ad-ex">
      <div className="ad-ex-cab">
        <h2>Existencias SAP por estado · AG18</h2>
        <small>{ex.archivo ?? "ZEXI"}{hora ? ` · cargada ${hora}` : ""} · {ex.filas.length} materiales</small>
        <button type="button" className="ad-ex-ver" aria-expanded={abierta} onClick={() => setAbierta((x) => !x)}>{abierta ? "Ocultar tabla" : "Ver tabla"}</button>
      </div>

      <div className="ad-ex-k">
        <div className="li"><span>Libre utiliz.</span><b>{nf.format(t.libre)}</b></div>
        <div className="ca"><span>In control-cal</span><b>{nf.format(t.calidad)}</b></div>
        <div className="bl"><span>Bloqueado</span><b>{nf.format(t.bloqueado)}</b></div>
        <div className="to"><span>Total general</span><b>{nf.format(t.total)}</b></div>
      </div>
      {!ex.conEstados && <p className="ad-ex-nota">Esta ZEXI solo trae el total: para ver los estados, cárgala con las columnas Libre utiliz., In control-cal y Bloqueado.</p>}

      {abierta && (
        <div className="ad-tabla-caja">
          <table className="ad-t ad-ex-t">
            <thead><tr>
              <th>Material</th><th>Descripción del material</th>
              <th className="n">Libre utiliz.</th><th className="n">In control-cal</th><th className="n">Bloqueado</th><th className="n">Total general</th>
              <th className="rep">Reparto</th>
            </tr></thead>
            <tbody>
              {ex.filas.map((f) => {
                const base = Math.max(1, (f.libre ?? 0) + (f.calidad ?? 0) + (f.bloqueado ?? 0));
                const ancho = (x: number | null) => `${((x ?? 0) / base) * 100}%`;
                return (
                  <tr key={f.codigo}>
                    <td className="mono">{f.codigo}</td>
                    <td>{f.descripcion}</td>
                    <td className={"n" + (f.libre ? " li" : " cero")}>{v(f.libre)}</td>
                    <td className={"n" + (f.calidad ? " ca" : " cero")}>{v(f.calidad)}</td>
                    <td className={"n" + (f.bloqueado ? " bl" : " cero")}>{v(f.bloqueado)}</td>
                    <td className="n b">{nf.format(f.total)}</td>
                    <td className="rep">
                      {ex.conEstados && (
                        <span className="ad-ex-barra" title={`Libre ${v(f.libre)} · Control-cal ${v(f.calidad)} · Bloqueado ${v(f.bloqueado)}`}>
                          <i className="li" style={{ width: ancho(f.libre) }} />
                          <i className="ca" style={{ width: ancho(f.calidad) }} />
                          <i className="bl" style={{ width: ancho(f.bloqueado) }} />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="sub">
                <td colSpan={2}>Total</td>
                <td className="n">{nf.format(t.libre)}</td><td className="n">{nf.format(t.calidad)}</td><td className="n">{nf.format(t.bloqueado)}</td>
                <td className="n">{nf.format(t.total)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
