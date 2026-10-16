"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DatosCasco } from "@/modulos/inventario/validacion-pasivo";
import { Rango } from "../../../sider/seguimiento/Rango";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** AG18 · lo que tienes FÍSICO y ya tiene baja en SAP: casco que debe ir a Carnaval. Solo visual, no envía nada. */
export function CascoCarnaval({ datos }: { datos: DatosCasco }) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const { fecha, dias, filas, avisos, error } = datos;
  const totU = filas.reduce((s, f) => s + f.unidades, 0);
  const totC = filas.reduce((s, f) => s + f.cajas, 0);
  const verEst = filas.some((f) => f.estibas != null);

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · VALIDACIÓN</p>
          <h1>Casco físico con baja en SAP · AG18</h1>
          <p className="sub">
            Lo que tienes <b>físico</b> en la fábrica pero ya tiene <b>baja en SAP</b>: no está en el sistema y es casco que debe ir a <b>Carnaval</b>.
            Es la diferencia del <Link href={fecha ? `/inventario/balance/cuadre?fecha=${fecha}` : "/inventario/balance/cuadre"}>Cuadre SAP AG18</Link> (el casco de Baja y Lavado). Aquí no se envía nada.
          </p>
        </div>
        <div className="bal-dias">
          <div className="sd bal-cal">
            <Rango rotulo="Conteo del día" desde={fecha ?? ""} hasta={fecha ?? ""}
                   dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                   alElegir={(d) => startCambio(() => router.push(`/inventario/balance/validacion?hoja=AG18&fecha=${d}`))} />
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
            <div className="va-cif"><span>Materiales con casco</span><b>{filas.length}</b></div>
            <div className="va-cif"><span>Unidades a Carnaval</span><b>{nf.format(totU)}</b></div>
            <div className="va-cif"><span>Cajas</span><b>{nf.format(totC)}</b></div>
            <button type="button" className="va-imprimir" onClick={() => window.print()}>Imprimir</button>
          </div>

          {!filas.length ? <p className="va-vacio">No hay casco con baja para este día.</p> : (
            <div className="va-scroll">
              <table className="va-t">
                <thead>
                  <tr>
                    <th>Código</th><th>Material</th>
                    <th className="n va-clave">Unidades</th><th className="n">Cajas</th>{verEst && <th className="n">Estibas</th>}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.codigo}>
                      <td className="mono">{f.codigo}</td>
                      <td>{f.material}</td>
                      <td className="n va-clave"><b>{nf.format(f.unidades)}</b></td>
                      <td className="n">{nf.format(f.cajas)}</td>
                      {verEst && <td className="n">{f.estibas != null ? nf.format(f.estibas) : "—"}</td>}
                    </tr>
                  ))}
                  <tr>
                    <td /><td><b>TOTAL</b></td>
                    <td className="n va-clave"><b>{nf.format(totU)}</b></td><td className="n"><b>{nf.format(totC)}</b></td>{verEst && <td />}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="va-nota">
            Casco físico (más ajustes del Balance) de Baja y Lavado · Fábrica: ya tiene baja en SAP, así que SAP no lo tiene en AG18, pero lo tienes en la fábrica. Cuadra con lo que el Cuadre SAP resta a lo contado.
          </p>
        </>
      )}
    </>
  );
}
