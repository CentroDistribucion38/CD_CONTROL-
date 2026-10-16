"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DatosCasco } from "@/modulos/inventario/validacion-pasivo";
import { Rango } from "../../../sider/seguimiento/Rango";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** AG18 · lo que tienes FÍSICO y ya tiene baja en SAP: casco que debe ir a Carnaval. Solo visual, no envía nada. */
export function CascoCarnaval({ datos }: { datos: DatosCasco }) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  /* Filas que vas marcando con un clic para no perderte (solo en pantalla). */
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  /* La fila activa (la del cursor o la del teclado): ↑ ↓ la mueven, Espacio / Enter la marcan, Inicio / Fin saltan, Esc la suelta. */
  const [activa, setActiva] = useState<number | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filasRef = useRef<HTMLTableRowElement[]>([]);
  useEffect(() => { setActiva(null) }, [datos.fecha]);
  useEffect(() => { if (activa != null) filasRef.current[activa]?.scrollIntoView({ block: "nearest" }) }, [activa]);
  function tecla(e: React.KeyboardEvent) {
    const n = datos.filas.length;
    if (!n) return;
    const ir = (i: number) => { e.preventDefault(); setActiva(Math.max(0, Math.min(n - 1, i))) };
    if (e.key === "ArrowDown") ir(activa == null ? 0 : activa + 1);
    else if (e.key === "ArrowUp") ir(activa == null ? n - 1 : activa - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(n - 1);
    else if ((e.key === " " || e.key === "Enter") && activa != null) { e.preventDefault(); marcar(datos.filas[activa].codigo) }
    else if (e.key === "Escape") setActiva(null);
  }
  const marcar = (k: string) => setMarcadas((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n });
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
            <div className="va-scroll" ref={caja} tabIndex={0} onKeyDown={tecla} onMouseEnter={() => caja.current?.focus({ preventScroll: true })} aria-label="Lista de casco: flechas para moverte, espacio para marcar">
              <table className="va-t va-casco">
                <thead>
                  <tr>
                    <th>Código</th><th>Material</th>
                    <th className="n va-clave">Unidades</th><th className="n">Cajas</th>{verEst && <th className="n">Estibas</th>}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={f.codigo} ref={(el) => { if (el) filasRef.current[i] = el }} className={(marcadas.has(f.codigo) ? "marcada " : "") + (activa === i ? "activa" : "")}
                        onMouseEnter={() => setActiva(i)} onClick={() => { setActiva(i); marcar(f.codigo) }} title="Clic o Espacio: marcar / desmarcar la fila">
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
            Con el teclado: ↑ ↓ para moverte por las filas, Espacio o Enter para marcar la fila, Esc para soltarla. Casco físico (más ajustes del Balance) de Baja y Lavado · Fábrica: ya tiene baja en SAP, así que SAP no lo tiene en AG18, pero lo tienes en la fábrica. Cuadra con lo que el Cuadre SAP resta a lo contado.
          </p>
        </>
      )}
    </>
  );
}
