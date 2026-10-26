"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BloqueExist, DatosExistencias, EstadoExist } from "@/modulos/inventario/existencias-pasivo";
import { Rango } from "../../../sider/seguimiento/Rango";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n0 = (v: number | null) => (v == null ? "—" : nf.format(Math.round(v)));
const sg = (v: number | null) => (v == null ? "—" : Math.abs(v) < 0.5 ? "0" : `${v > 0 ? "+" : "−"}${nf.format(Math.abs(Math.round(v)))}`);
const ETQ: Record<EstadoExist, string> = { cuadra: "Cuadra", falta: "SAP tiene menos", sobra: "SAP tiene más", sin_sap: "Sin ZEXI" };
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : null);
const noCuadran = (b: BloqueExist) => b.filas.filter((f) => f.estado === "falta" || f.estado === "sobra").length;

export function Existencias({ datos, inicial }: { datos: DatosExistencias; inicial: "AG18" | "AG22" }) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const [alm, setAlm] = useState<"AG18" | "AG22">(inicial);
  const [soloDif, setSoloDif] = useState(false);
  const { fecha, dias, error } = datos;
  const b = alm === "AG18" ? datos.ag18 : datos.ag22;
  const vistas = useMemo(() => (soloDif ? b.filas.filter((f) => f.estado !== "cuadra") : b.filas), [b, soloDif]);
  const cuadran = b.filas.filter((f) => f.estado === "cuadra").length;
  const difs = noCuadran(b);
  const queBase = alm === "AG18" ? "Baja + Lavado de AG18" : "PRESORTING, ROTURA DE LINEA, LAVADO, EXTRASUCIO, BAJA PROYECTADA, DIF INV y SINIESTRO de AG22";
  const cuadre = fecha ? `/inventario/balance/cuadre?fecha=${fecha}&alm=${alm}` : "/inventario/balance/cuadre";

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · PASIVOS · EXISTENCIAS</p>
          <h1>Existencias vs Base de pasivos</h1>
          <p className="sub">
            La existencia de SAP —lo último que se cargó ese día en el <Link href={cuadre}>Cuadre SAP</Link> de cada almacén— tiene que ser igual a lo que dice la
            Base de pasivos. Solo valida: no cambia nada.
          </p>
        </div>
        <div className="bal-dias">
          <div className="sd bal-cal">
            <Rango rotulo="Día" desde={fecha ?? ""} hasta={fecha ?? ""}
                   dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                   alElegir={(d) => startCambio(() => router.push(`/inventario/balance/existencias?fecha=${d}&alm=${alm}`))} />
          </div>
          {cambiando && <em>Trayendo…</em>}
        </div>
      </section>

      {error && <p className="va-error">Error: {error}</p>}
      {!error && !fecha && <p className="va-vacio">Todavía no hay datos cargados.</p>}

      {!error && fecha && (
        <>
          <div className="ex-tabs" role="tablist">
            {(["AG18", "AG22"] as const).map((a) => {
              const x = a === "AG18" ? datos.ag18 : datos.ag22, n = noCuadran(x);
              return (
                <button key={a} type="button" role="tab" aria-selected={alm === a} className={"ex-tab" + (alm === a ? " on" : "")} onClick={() => setAlm(a)}>
                  {a}{x.hayDia && x.hayZexi && (n ? <em>{n} no cuadran</em> : <em className="bien">cuadra</em>)}
                </button>
              );
            })}
          </div>

          {b.avisos.map((a) => <p key={a} className="va-aviso">{a}</p>)}
          {!b.hayDia && <p className="va-aviso">{alm} no tiene datos el {fecha.split("-").reverse().join("/")}. Escoge otro día o carga primero el Cuadre SAP de {alm}.</p>}
          {b.hayDia && !b.hayZexi && <p className="va-aviso">{alm} no tiene ZEXI de SAP guardada ese día en el Cuadre SAP: no hay existencia que comparar.</p>}

          {b.hayDia && (
            <>
              {b.hayZexi && (
                <p className="ex-zexi">
                  ZEXI de {alm}: <b>{b.zexiArchivo ?? "sin nombre"}</b>{hora(b.zexiEn) ? <> · cargada {hora(b.zexiEn)}</> : null}. Base: {queBase}.
                </p>
              )}
              <div className="va-cifras">
                <div className="va-cif"><span>Materiales</span><b>{b.filas.length}</b></div>
                <div className="va-cif bien"><span>Cuadran</span><b>{cuadran}</b></div>
                <div className={"va-cif" + (difs ? " mal" : "")}><span>No cuadran</span><b>{difs}</b></div>
                <label className="va-chk"><input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} />Solo los que no cuadran</label>
                <button type="button" className="va-imprimir" onClick={() => window.print()}>Imprimir</button>
              </div>

              {!vistas.length && <p className="va-vacio">{b.filas.length ? "Todo cuadra." : `No hay materiales con existencia ni base en ${alm} ese día.`}</p>}

              {vistas.length > 0 && (
                <div className="va-scroll">
                  <table className="va-t">
                    <thead>
                      <tr>
                        <th>Código</th><th>Material</th>
                        <th className="n">ZEXI SAP</th><th className="n">Movido 311</th>
                        <th className="n va-clave">Existencia final<small>ZEXI + 311</small></th>
                        <th className="n va-clave">Base de pasivos</th>
                        <th className="n">Dif.<small>existencia − base</small></th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vistas.map((f) => (
                        <tr key={f.grupo + f.codigo} className={f.estado}>
                          <td className="mono">{f.codigo}</td>
                          <td>{f.material}{alm === "AG22" && f.grupo !== "ENVASE" && <span className="ex-grupo">{f.grupo === "CAJA" ? "caja" : "estiba"}</span>}</td>
                          <td className="n">{n0(f.sap)}</td>
                          <td className="n">{f.movido ? sg(f.movido) : "—"}</td>
                          <td className="n va-clave"><b>{n0(f.existencia)}</b></td>
                          <td className="n va-clave"><b>{n0(f.base)}</b></td>
                          <td className="n"><b>{sg(f.dif)}</b></td>
                          <td><span className={`va-tag ${f.estado}`}>{ETQ[f.estado]}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="va-nota">
                Existencia final = la ZEXI guardada ese día (la última que se subió) más lo movido con el 311, igual que en el Cuadre SAP.
                {alm === "AG18" ? " En AG18 la Base incluye el pendiente por baja que se envía desde Validación." : " En AG22 se compara con el Bloqueado."}
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
