"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DatosValidacion, EstadoValidacion } from "@/modulos/inventario/validacion-pasivo";
import { Rango } from "../../../sider/seguimiento/Rango";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n0 = (v: number | null) => (v == null ? "—" : nf.format(Math.round(v)));
const sg = (v: number | null) => (v == null ? "—" : Math.abs(v) < 0.5 ? "0" : `${v > 0 ? "+" : "−"}${nf.format(Math.abs(Math.round(v)))}`);
const ETQ: Record<EstadoValidacion, string> = { cuadra: "Cuadra", falta: "SAP tiene menos", sobra: "SAP tiene más", sin_sap: "Sin ZEXI" };

export function Validacion({ datos }: { datos: DatosValidacion }) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const [soloDif, setSoloDif] = useState(false);
  const { fecha, dias, filas, hayZexi, avisos, error } = datos;
  const vistas = useMemo(() => (soloDif ? filas.filter((f) => f.estado !== "cuadra") : filas), [filas, soloDif]);
  const cuadran = filas.filter((f) => f.estado === "cuadra").length;
  const difs = filas.filter((f) => f.estado === "falta" || f.estado === "sobra").length;

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · VALIDACIÓN DE PASIVO</p>
          <h1>Validación de pasivo · AG18</h1>
          <p className="sub">
            Solo para validar. <b>Conteo físico − pasivo = pendiente por baja</b>, y <b>pasivo + pendiente por baja</b> tiene que dar la
            existencia final del <Link href={fecha ? `/inventario/balance/cuadre?fecha=${fecha}` : "/inventario/balance/cuadre"}>Cuadre SAP AG18</Link>.
            No cambia el Cuadre ni la Base de pasivos.
          </p>
        </div>
        <div className="bal-dias">
          <div className="sd bal-cal">
            <Rango rotulo="Conteo del día" desde={fecha ?? ""} hasta={fecha ?? ""}
                   dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                   alElegir={(d) => startCambio(() => router.push(`/inventario/balance/validacion?fecha=${d}`))} />
          </div>
          {cambiando && <em>Trayendo…</em>}
        </div>
      </section>

      {error && <p className="va-error">Error: {error}</p>}
      {avisos.map((a) => <p key={a} className="va-aviso">{a}</p>)}
      {!error && !fecha && <p className="va-vacio">Todavía no hay conteos enviados.</p>}
      {!error && fecha && !hayZexi && <p className="va-aviso">Todavía no hay ZEXI de SAP guardada para este día en el Cuadre SAP AG18: se ve el pendiente por baja, pero no se puede validar contra SAP.</p>}

      {!error && fecha && (
        <>
          <div className="va-cifras">
            <div className="va-cif"><span>Materiales</span><b>{filas.length}</b></div>
            <div className="va-cif bien"><span>Cuadran</span><b>{cuadran}</b></div>
            <div className={"va-cif" + (difs ? " mal" : "")}><span>No cuadran</span><b>{difs}</b></div>
            <label className="va-chk"><input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} />Solo los que no cuadran</label>
            <button type="button" className="va-imprimir" onClick={() => window.print()}>Imprimir</button>
          </div>

          {!vistas.length && <p className="va-vacio">{filas.length ? "Todo cuadra." : "No hay envases con conteo ni pasivo en este día."}</p>}

          {vistas.length > 0 && (
            <div className="va-scroll">
              <table className="va-t">
                <thead>
                  <tr>
                    <th>Código</th><th>Material</th>
                    <th className="n">Conteo físico</th>
                    <th className="n">Baja</th><th className="n">Lavado</th><th className="n">Pasivo</th>
                    <th className="n va-clave">Pendiente por baja<small>conteo − pasivo</small></th>
                    <th className="n">Existencia final SAP</th>
                    <th className="n">Dif.<small>SAP − (pasivo + pend.)</small></th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {vistas.map((f) => (
                    <tr key={f.codigo} className={f.estado}>
                      <td className="mono">{f.codigo}</td>
                      <td>{f.material}</td>
                      <td className="n">{n0(f.conteo)}</td>
                      <td className="n">{n0(f.baja)}</td>
                      <td className="n">{n0(f.lavado)}</td>
                      <td className="n"><b>{n0(f.pasivo)}</b></td>
                      <td className={"n va-clave" + (f.pendiente < 0 ? " neg" : "")}><b>{n0(f.pendiente)}</b>
                        {f.pendienteCajas != null && <small>{nf.format(Math.round(f.pendienteCajas))} cajas</small>}</td>
                      <td className="n">{n0(f.existencia)}</td>
                      <td className="n"><b>{sg(f.dif)}</b></td>
                      <td><span className={`va-tag ${f.estado}`}>{ETQ[f.estado]}</span>{f.pendiente < 0 && <small className="va-sub">Pasivo mayor que el conteo</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="va-nota">
            El pasivo es lo del informe de Pasivos de AG18 en ese día (Baja + Lavado, en unidades). La existencia final es lo que dice la ZEXI de SAP más lo
            ya movido con el 311 en el Cuadre SAP.
          </p>
        </>
      )}
    </>
  );
}
