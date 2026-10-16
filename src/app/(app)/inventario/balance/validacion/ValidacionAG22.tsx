"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DatosValidacionAG22, FilaValidacionAG22 } from "@/modulos/inventario/validacion-pasivo";
import { Rango } from "../../../sider/seguimiento/Rango";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n0 = (v: number | null) => (v == null ? "—" : Math.abs(v) < 0.5 ? "0" : nf.format(Math.round(v)));
const guion = (v: number) => (Math.abs(v) < 0.5 ? "—" : nf.format(Math.round(v)));
const pos = (v: number) => Math.max(0, Math.round(v));

/** Pendiente de una celda: rojo si la Base tiene más de lo contado. */
const Pend = ({ v, upc }: { v: number; upc: number }) => (
  <td className={"n va-clave" + (v < -0.5 ? " neg" : "")}><b>{n0(v)}</b>
    {upc > 1 && Math.abs(v) > 0.5 && <small>{nf.format(Math.round(v / upc))} cajas</small>}</td>
);

export function ValidacionAG22({ datos }: { datos: DatosValidacionAG22 }) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const [soloDif, setSoloDif] = useState(false);
  const { fecha, dias, filas, avisos, error } = datos;
  const vistas = useMemo(() => (soloDif ? filas.filter((f) => f.estado !== "cuadra") : filas), [filas, soloDif]);
  const cuadran = filas.filter((f) => f.estado === "cuadra").length;
  const difs = filas.length - cuadran;
  const suma = (k: keyof FilaValidacionAG22) => filas.reduce((s, f) => s + pos(f[k] as number), 0);

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · VALIDACIÓN DE PASIVO</p>
          <h1>Validación de pasivo · AG22</h1>
          <p className="sub">
            Lo contado en <b>Bodega 38</b> contra la <b>Base de pasivos de AG22</b>, <b>sin la rotura de línea</b>: la baja del conteo contra
            PRESORTING + BAJA PROYECTADA, el lavado contra LAVADO y el extrasucio contra EXTRASUCIO. Lo contado en OTROS no está en la Base: hay que bloquearlo.
          </p>
        </div>
        <div className="bal-dias">
          <div className="sd bal-cal">
            <Rango rotulo="Conteo del día" desde={fecha ?? ""} hasta={fecha ?? ""}
                   dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                   alElegir={(d) => startCambio(() => router.push(`/inventario/balance/validacion?hoja=AG22&fecha=${d}`))} />
          </div>
          {cambiando && <em>Trayendo…</em>}
        </div>
      </section>

      {error && <p className="va-error">Error: {error}</p>}
      {avisos.map((a) => <p key={a} className="va-aviso">{a}</p>)}
      {!error && !fecha && <p className="va-vacio">Todavía no hay conteos enviados.</p>}

      {!error && fecha && (
        <>
          <div className="va-cifras">
            <div className="va-cif"><span>Materiales</span><b>{filas.length}</b></div>
            <div className="va-cif bien"><span>Cuadran</span><b>{cuadran}</b></div>
            <div className={"va-cif" + (difs ? " mal" : "")}><span>No cuadran</span><b>{difs}</b></div>
            <div className="va-cif"><span>Pendiente por baja</span><b>{nf.format(suma("pendBaja"))}</b></div>
            <div className="va-cif"><span>Pendiente por lavado</span><b>{nf.format(suma("pendLavado"))}</b></div>
            <div className="va-cif"><span>Pendiente por extrasucio</span><b>{nf.format(suma("pendExtra"))}</b></div>
            <div className="va-cif"><span>Pendiente por bloquear</span><b>{nf.format(suma("pendBloquear"))}</b></div>
            <label className="va-chk"><input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} />Solo los que no cuadran</label>
            <button type="button" className="va-imprimir" onClick={() => window.print()}>Imprimir</button>
          </div>

          {!vistas.length && <p className="va-vacio">{filas.length ? "Todo cuadra." : "No hay envases con conteo ni pasivo en Bodega 38 este día."}</p>}

          {vistas.length > 0 && (
            <div className="va-scroll">
              <table className="va-t">
                <thead>
                  <tr>
                    <th rowSpan={2}>Código</th><th rowSpan={2}>Material</th>
                    <th className="n" colSpan={4}>Conteo · Bodega 38</th>
                    <th className="n" colSpan={3}>Base · AG22</th>
                    <th className="n" rowSpan={2}>Rotura de línea<small>fuera de la comparación</small></th>
                    <th className="n va-clave" colSpan={4}>Pendiente · conteo − Base</th>
                    <th rowSpan={2}>Estado</th>
                  </tr>
                  <tr>
                    <th className="n">Baja</th><th className="n">Lavado</th><th className="n">Extrasucio</th><th className="n">Otros</th>
                    <th className="n">Baja<small>PRES. + B. PROY.</small></th><th className="n">Lavado</th><th className="n">Extrasucio</th>
                    <th className="n va-clave">Baja</th><th className="n va-clave">Lavado</th><th className="n va-clave">Extrasucio</th><th className="n va-clave">Bloquear</th>
                  </tr>
                </thead>
                <tbody>
                  {vistas.map((f) => (
                    <tr key={f.codigo} className={f.estado === "cuadra" ? "cuadra" : "falta"}>
                      <td className="mono">{f.codigo}</td>
                      <td>{f.material}</td>
                      <td className="n">{guion(f.conteoBaja)}</td>
                      <td className="n">{guion(f.conteoLavado)}</td>
                      <td className="n">{guion(f.conteoExtra)}</td>
                      <td className="n">{guion(f.conteoOtros)}</td>
                      <td className="n">{guion(f.baseBaja)}</td>
                      <td className="n">{guion(f.baseLavado)}</td>
                      <td className="n">{guion(f.baseExtra)}</td>
                      <td className="n va-sub">{guion(f.rotura)}</td>
                      <Pend v={f.pendBaja} upc={f.upc} />
                      <Pend v={f.pendLavado} upc={f.upc} />
                      <Pend v={f.pendExtra} upc={f.upc} />
                      <Pend v={f.pendBloquear} upc={f.upc} />
                      <td><span className={`va-tag ${f.estado === "cuadra" ? "cuadra" : "falta"}`}>{f.estado === "cuadra" ? "Cuadra" : "Diferencia"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="va-nota">
            Unidades. Conteo = lo contado en Bodega 38 (todo lo que no es FABRICA_…) por el estado del envase en el conteo. Base = Pasivos AG22 del día;
            la rotura de línea se muestra pero no entra, porque no se cuenta físicamente. Pendiente positivo = se contó más de lo que dice la Base; negativo (rojo) = la Base tiene más de lo contado.
            Esta hoja solo valida: no envía nada a la Base.
          </p>
        </>
      )}
    </>
  );
}
