"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DatosValidacion, EstadoValidacion, FilaValidacion } from "@/modulos/inventario/validacion-pasivo";
import { Rango } from "../../../sider/seguimiento/Rango";
import { enviarPendienteBaja } from "./actions";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n0 = (v: number | null) => (v == null ? "—" : nf.format(Math.round(v)));
const sg = (v: number | null) => (v == null ? "—" : Math.abs(v) < 0.5 ? "0" : `${v > 0 ? "+" : "−"}${nf.format(Math.abs(Math.round(v)))}`);
const ETQ: Record<EstadoValidacion, string> = { cuadra: "Cuadra", falta: "SAP tiene menos", sobra: "SAP tiene más", sin_sap: "Sin ZEXI" };

/** Lo que se enviaría de cada fila: cada parte del pendiente (baja, lavado, bloquear) redondeada, solo si es mayor a 0. */
const pos = (v: number) => Math.max(0, Math.round(v));
const aEnviar = (f: FilaValidacion) => pos(f.pendBaja) + pos(f.pendLavado) + pos(f.pendBloquear);
/** Cuando el pasivo es mayor que lo contado en baja o en lavado, esa parte sale negativa y no se envía. */
const hayNegativo = (f: FilaValidacion) => f.pendBaja < -0.5 || f.pendLavado < -0.5;

export function Validacion({ datos, puedeEnviar }: { datos: DatosValidacion; puedeEnviar: boolean }) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const [enviando, startEnvio] = useTransition();
  const [soloDif, setSoloDif] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [resp, setResp] = useState<{ ok: boolean; texto: string } | null>(null);
  const { fecha, dias, filas, hayZexi, yaEnviado, historico, avisos, error } = datos;
  const vistas = useMemo(() => (soloDif ? filas.filter((f) => f.estado !== "cuadra") : filas), [filas, soloDif]);
  const cuadran = filas.filter((f) => f.estado === "cuadra").length;
  const difs = filas.filter((f) => f.estado === "falta" || f.estado === "sobra").length;
  const paraEnviar = filas.filter((f) => aEnviar(f) > 0);
  const unidades = paraEnviar.reduce((s, f) => s + aEnviar(f), 0);
  const totBaja = filas.reduce((s, f) => s + pos(f.pendBaja), 0);
  const totLavado = filas.reduce((s, f) => s + pos(f.pendLavado), 0);
  const totBloquear = filas.reduce((s, f) => s + pos(f.pendBloquear), 0);
  const sinEnviar = filas.filter((f) => aEnviar(f) === 0).length;

  function enviar() {
    if (!fecha) return;
    setResp(null);
    startEnvio(async () => {
      const r = await enviarPendienteBaja(fecha);
      setConfirmar(false);
      if ("error" in r && r.error) setResp({ ok: false, texto: r.error });
      else if ("ok" in r && r.ok) { setResp({ ok: true, texto: `Enviado a la Base de pasivos (AG18): ${r.filas} materiales · ${nf.format(r.unidades)} u — pendiente baja ${nf.format(r.baja)} · pendiente lavado ${nf.format(r.lavado)} · pendiente bloquear ${nf.format(r.bloquear)}.` }); router.refresh() }
    });
  }

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · VALIDACIÓN DE PASIVO</p>
          <h1>Validación de pasivo · AG18</h1>
          <p className="sub">
            <b>Total conteo − pasivo = pendiente</b>, separado por lo que de verdad es: <b>por baja</b>, <b>por lavado</b> y <b>por bloquear</b> (lo contado en OTROS).
            <b> Pasivo + pendiente</b> tiene que dar la existencia final del <Link href={fecha ? `/inventario/balance/cuadre?fecha=${fecha}` : "/inventario/balance/cuadre"}>Cuadre SAP AG18</Link>.
            Cada parte se envía a la Base de pasivos con su causal para que el Informe la tome en AG18.
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
            <div className="va-cif"><span>Pendiente por baja</span><b>{nf.format(totBaja)}</b></div>
            <div className="va-cif"><span>Pendiente por lavado</span><b>{nf.format(totLavado)}</b></div>
            <div className="va-cif"><span>Pendiente por bloquear</span><b>{nf.format(totBloquear)}</b></div>
            <label className="va-chk"><input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} />Solo los que no cuadran</label>
            <button type="button" className="va-imprimir" onClick={() => window.print()}>Imprimir</button>
          </div>

          {puedeEnviar && !historico && (
            <div className="va-envio">
              {!confirmar ? (
                <button type="button" className="va-enviar" disabled={enviando || !paraEnviar.length} onClick={() => { setResp(null); setConfirmar(true) }}>
                  {yaEnviado ? "Reenviar a la Base de pasivos" : "Enviar a la Base de pasivos"}
                </button>
              ) : (
                <>
                  <span>
                    Se {yaEnviado ? "reemplaza lo enviado antes y se " : ""}envían <b>{paraEnviar.length}</b> materiales · <b>{nf.format(unidades)}</b> u como
                    PENDIENTE BAJA · LAVADO · BLOQUEAR · AG18 del {fecha.split("-").reverse().join("/")} (baja {nf.format(totBaja)} · lavado {nf.format(totLavado)} · bloquear {nf.format(totBloquear)}).
                  </span>
                  <button type="button" className="va-enviar" disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Sí, enviar"}</button>
                  <button type="button" className="va-cancelar" disabled={enviando} onClick={() => setConfirmar(false)}>Cancelar</button>
                </>
              )}
              {!confirmar && <small>Solo las partes mayores a 0{sinEnviar ? ` · ${sinEnviar} sin pendiente no se envían` : ""}. Si lo vuelves a enviar el mismo día, reemplaza lo anterior.</small>}
              {resp && <p className={resp.ok ? "va-ok-env" : "va-error"}>{resp.texto}</p>}
            </div>
          )}
          {historico && <p className="va-aviso">Este día está cargado tal cual tu Excel (histórico): no se envía nada para no duplicar.</p>}

          {!vistas.length && <p className="va-vacio">{filas.length ? "Todo cuadra." : "No hay envases con conteo ni pasivo en este día."}</p>}

          {vistas.length > 0 && (
            <div className="va-scroll">
              <table className="va-t">
                <thead>
                  <tr>
                    <th>Código</th><th>Material</th>
                    <th className="n">Conteo físico</th>
                    <th className="n">Dif. balance<small>Baja + Lavado</small></th><th className="n">Total conteo<small>del Cuadre</small></th>
                    <th className="n">Baja<small>Base · conteo</small></th><th className="n">Lavado<small>Base · conteo</small></th><th className="n">Pasivo</th>
                    <th className="n va-clave">Pendiente por baja<small>conteo baja − casco − Base</small></th>
                    <th className="n va-clave">Pendiente por lavado<small>conteo lavado − Base</small></th>
                    <th className="n va-clave">Pendiente por bloquear<small>contado en OTROS</small></th>
                    <th className="n">Enviado a la Base</th>
                    <th className="n">Existencia final SAP</th>
                    <th className="n">Dif.<small>SAP − (pasivo + pend.)</small></th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {vistas.map((f) => {
                    const falta = aEnviar(f), igual = f.enviado === falta;
                    return (
                      <tr key={f.codigo} className={f.estado}>
                        <td className="mono">{f.codigo}</td>
                        <td>{f.material}</td>
                        <td className="n">{n0(f.conteo)}</td>
                        <td className="n">{f.lavadoCasco ? n0(f.lavadoCasco) : "—"}</td>
                        <td className="n"><b>{n0(f.total)}</b></td>
                        <td className="n">{n0(f.baja)}<small>conteo {n0(f.conteoBaja)}</small></td>
                        <td className="n">{n0(f.lavado)}<small>conteo {n0(f.conteoLavado)}</small></td>
                        <td className="n"><b>{n0(f.pasivo)}</b></td>
                        <td className={"n va-clave" + (f.pendBaja < -0.5 ? " neg" : "")}><b>{n0(f.pendBaja)}</b>
                          {f.upc > 1 && Math.abs(f.pendBaja) > 0.5 && <small>{nf.format(Math.round(f.pendBaja / f.upc))} cajas</small>}</td>
                        <td className={"n va-clave" + (f.pendLavado < -0.5 ? " neg" : "")}><b>{n0(f.pendLavado)}</b>
                          {f.upc > 1 && Math.abs(f.pendLavado) > 0.5 && <small>{nf.format(Math.round(f.pendLavado / f.upc))} cajas</small>}</td>
                        <td className="n va-clave"><b>{n0(f.pendBloquear)}</b>
                          {f.upc > 1 && f.pendBloquear > 0.5 && <small>{nf.format(Math.round(f.pendBloquear / f.upc))} cajas</small>}</td>
                        <td className="n">{f.enviado ? <>{n0(f.enviado)}{!igual && <small className="va-sub">distinto: reenvía</small>}</> : falta ? <span className="va-sub">sin enviar</span> : "—"}</td>
                        <td className="n">{n0(f.existencia)}</td>
                        <td className="n"><b>{sg(f.dif)}</b></td>
                        <td><span className={`va-tag ${f.estado}`}>{ETQ[f.estado]}</span>{hayNegativo(f) && <small className="va-sub">Pasivo mayor que lo contado en {f.pendBaja < -0.5 ? "baja" : "lavado"} · esa parte no se envía</small>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="va-nota">
            El total conteo es el del Cuadre SAP (conteo físico menos el lavado con baja del Casco). El pasivo es lo del informe de Pasivos de AG18 en ese día (Baja + Lavado, en unidades), sin lo ya enviado desde aquí. La existencia final es lo que dice
            la ZEXI de SAP más lo ya movido con el 311 en el Cuadre SAP. Cada pendiente entra al Informe de pasivos con su causal (baja y bloquear como Baja de AG18, lavado como Lavado); el Cuadre SAP no lo suma otra vez.
            El pendiente por baja descuenta el lavado con baja del Casco de lo contado en BAJA; lo contado en OTROS es lo que hay que bloquear.
          </p>
        </>
      )}
    </>
  );
}
