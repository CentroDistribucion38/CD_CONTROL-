"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DatosValidacionAG22 } from "@/modulos/inventario/validacion-pasivo";
import { Rango } from "../../../sider/seguimiento/Rango";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const n = (v: number) => (Math.abs(v) < 0.5 ? "—" : (v < 0 ? "−" : "") + nf.format(Math.abs(Math.round(v))));

/** AG22 · lo FÍSICO en Bodega 38 contra la Base de pasivos (envases) y lo contado por estado (cajas plásticas). Solo visual, no envía nada. */
export function FisicoBodega38({ datos }: { datos: DatosValidacionAG22 }) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const { fecha, dias, filas, cajas, avisos, error } = datos;
  /* Envases: lo contado menos la Base, por estado. + = lo tienes físico y no está en la Base · − = la Base tiene más de lo contado. */
  const env = filas.filter((f) => f.estado === "dif").map((f) => {
    const total = f.pendBaja + f.pendLavado + f.pendExtra + f.pendBloquear;
    return { ...f, cajas: f.upc > 1 ? total / f.upc : null };
  });
  const sum = (k: "pendBaja" | "pendLavado" | "pendExtra" | "pendBloquear") => env.reduce((s, f) => s + f[k], 0);
  const cls = (v: number) => (v < -0.5 ? " neg" : "");

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · VALIDACIÓN</p>
          <h1>Físico en Bodega 38 que no está en la Base · AG22</h1>
          <p className="sub">
            Lo contado en <b>Bodega 38</b> frente a la <b>Base de pasivos</b> de AG22 (rotura de línea aparte): <b>+</b> lo tienes físico y la Base no lo trae, <b>−</b> la Base trae más de lo contado.
            Las cajas plásticas salen por estado, como en el <Link href={fecha ? `/inventario/balance/cuadre?hoja=AG22&fecha=${fecha}` : "/inventario/balance/cuadre"}>Cuadre SAP AG22</Link>. Aquí no se envía nada.
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
            <div className="va-cif"><span>Envases con diferencia</span><b>{env.length}</b></div>
            <div className="va-cif"><span>Por bloquear</span><b>{nf.format(Math.max(0, Math.round(sum("pendBloquear"))))}</b></div>
            <div className="va-cif"><span>Cajas plásticas</span><b>{cajas.length}</b></div>
            <button type="button" className="va-imprimir" onClick={() => window.print()}>Imprimir</button>
          </div>

          <h2 className="va-h">Envases</h2>
          {!env.length ? <p className="va-vacio">Todo lo contado en Bodega 38 está en la Base.</p> : (
            <div className="va-scroll">
              <table className="va-t">
                <thead>
                  <tr>
                    <th>Código</th><th>Material</th>
                    <th className="n va-clave">Baja</th><th className="n va-clave">Lavado</th><th className="n va-clave">Extrasucio</th><th className="n va-clave">Por bloquear</th>
                    <th className="n">Cajas</th>
                  </tr>
                </thead>
                <tbody>
                  {env.map((f) => (
                    <tr key={f.codigo}>
                      <td className="mono">{f.codigo}</td><td>{f.material}</td>
                      <td className={"n va-clave" + cls(f.pendBaja)}><b>{n(f.pendBaja)}</b></td>
                      <td className={"n va-clave" + cls(f.pendLavado)}><b>{n(f.pendLavado)}</b></td>
                      <td className={"n va-clave" + cls(f.pendExtra)}><b>{n(f.pendExtra)}</b></td>
                      <td className="n va-clave"><b>{n(f.pendBloquear)}</b></td>
                      <td className="n">{f.cajas == null ? "—" : n(f.cajas)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td /><td><b>TOTAL</b></td>
                    <td className="n va-clave"><b>{n(sum("pendBaja"))}</b></td><td className="n va-clave"><b>{n(sum("pendLavado"))}</b></td>
                    <td className="n va-clave"><b>{n(sum("pendExtra"))}</b></td><td className="n va-clave"><b>{n(sum("pendBloquear"))}</b></td><td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <h2 className="va-h">Cajas plásticas · lo contado en Bodega 38 por estado</h2>
          {!cajas.length ? <p className="va-vacio">No hay cajas plásticas contadas en Bodega 38 este día.</p> : (
            <div className="va-scroll">
              <table className="va-t">
                <thead>
                  <tr><th>Código</th><th>Material</th><th className="n va-clave">Libre</th><th className="n va-clave">Control-cal</th><th className="n va-clave">Bloqueado</th><th className="n">Total</th></tr>
                </thead>
                <tbody>
                  {cajas.map((f) => (
                    <tr key={f.codigo}>
                      <td className="mono">{f.codigo}</td><td>{f.material}</td>
                      <td className="n va-clave"><b>{n(f.libre)}</b></td><td className="n va-clave"><b>{n(f.calidad)}</b></td><td className="n va-clave"><b>{n(f.bloqueado)}</b></td>
                      <td className="n">{n(f.libre + f.calidad + f.bloqueado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="va-nota">
            Envases en unidades: conteo de Bodega 38 menos la Base de pasivos de AG22, por estado (baja = presorting + baja proyectada). Lo contado en OTROS no está en la Base: es lo que hay que bloquear. Las cajas plásticas son lo contado en Bodega 38 por estado: suelta en BAJA → bloqueado, suelta en RETORNO → libre, la caja que lleva el envase → control-cal.
            Con el teclado: ↑ ↓ para moverte, Espacio o Enter para marcar la fila, Esc para soltarla.
          </p>
        </>
      )}
    </>
  );
}
