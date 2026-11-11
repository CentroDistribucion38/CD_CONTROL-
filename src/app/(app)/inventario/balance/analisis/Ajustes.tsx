"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { InformeCierre } from "./InformeCierre";
import type { FilaAjuste, Guardado } from "@/modulos/inventario/analisis-ajustes";
import type { Mov311 } from "@/modulos/inventario/analisis-dif";
import { guardarHecho, guardarObservacion } from "./actions";
import { Partidas311 } from "./Partidas311";
import { EtiquetaEnLinea, LeyendaEnLinea, type MapaEnLinea } from "./EnLinea";

/**
 * PASO 2 · LOS AJUSTES — del análisis guardado del día: diferencia, lo que se compensa entre el envase
 * retornable y su NR nuevo, el ajuste que queda (sobrante o faltante) y la observación de cada código.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const largo = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const sentido = (v: number) => (v > 0 ? "Sobrante · sube SAP" : v < 0 ? "Faltante · baja SAP" : "Cuadrado");

export function Ajustes({ fecha, guardado, filas: inicio, puedeEditar, faltaSql, finalEn = null, enLinea = {}, movimientos311 }: {
  movimientos311?: Mov311[]; enLinea?: MapaEnLinea; fecha: string; guardado: Guardado | null; filas: FilaAjuste[]; puedeEditar: boolean; faltaSql: boolean; finalEn?: string | null;
}) {
  const [filas, setFilas] = useState(inicio);
  /* «En otra hoja los sobrantes, los faltantes»: también en pantalla, una pestaña para cada uno. */
  const [ver, setVer] = useState<"todo" | "sobra" | "falta" | "cruza">("todo");
  const [estado, setEstado] = useState<Record<string, "guardando" | "ok" | "mal">>({});
  const [msg, setMsg] = useState<string | null>(null);

  const vistas = useMemo(() => {
    const xs = ver === "sobra" ? filas.filter((f) => f.ajuste > 0).sort((a, b) => b.ajuste - a.ajuste)
      : ver === "falta" ? filas.filter((f) => f.ajuste < 0).sort((a, b) => a.ajuste - b.ajuste)
      : ver === "cruza" ? filas.filter((f) => f.compensa !== 0)
      : filas.filter((f) => f.ajuste !== 0 || f.compensa !== 0 || f.observacion);
    return xs;
  }, [filas, ver]);
  const familias = useMemo(() => {
    const m = new Map<string, FilaAjuste[]>();
    for (const f of vistas) (m.get(f.familia) ?? m.set(f.familia, []).get(f.familia)!).push(f);
    return [...m];
  }, [vistas]);
  const k = useMemo(() => ({
    bruta: filas.reduce((t, f) => t + f.diferencia, 0),
    compensado: filas.reduce((t, f) => t + Math.max(0, f.compensa), 0),
    sobra: filas.reduce((t, f) => t + Math.max(0, f.ajuste), 0),
    falta: filas.reduce((t, f) => t + Math.min(0, f.ajuste), 0),
    nSobra: filas.filter((f) => f.ajuste > 0).length,
    nFalta: filas.filter((f) => f.ajuste < 0).length,
  }), [filas]);

  const escribir = (codigo: string, texto: string) => setFilas((p) => p.map((f) => (f.codigo === codigo ? { ...f, observacion: texto } : f)));
  /* LO HECHO EN SAP: la compensación (sí/no) y el ajuste (todo, una parte o nada). Se guarda al tocarlo. */
  const [hEstado, setHEstado] = useState<Record<string, "guardando" | "ok" | "mal">>({});
  async function marcar(f: FilaAjuste, comp: boolean, ajuste: number | null) {
    setFilas((p) => p.map((x) => (x.codigo === f.codigo ? { ...x, compHecha: comp, ajusteHecho: ajuste } : x)));
    setHEstado((e) => ({ ...e, [f.codigo]: "guardando" }));
    const r = await guardarHecho(fecha, f.codigo, comp, ajuste);
    if ("error" in r && r.error) { setHEstado((e) => ({ ...e, [f.codigo]: "mal" })); setMsg(r.error); return }
    setHEstado((e) => ({ ...e, [f.codigo]: "ok" }));
  }
  const pendientes = filas.filter((f) => (f.compensa !== 0 && !f.compHecha) || f.ajuste - (f.ajusteHecho ?? 0) !== 0).length;

  async function guardar(codigo: string, texto: string, antes: string) {
    if (texto === antes) return;
    setEstado((e) => ({ ...e, [codigo]: "guardando" }));
    const r = await guardarObservacion(fecha, codigo, texto.trim());
    if ("error" in r && r.error) { setEstado((e) => ({ ...e, [codigo]: "mal" })); setMsg(r.error); return }
    setEstado((e) => ({ ...e, [codigo]: "ok" }));
  }

  /* EL EXCEL SUPER DETALLADO: Resumen, Ajustes, Sobrantes, Faltantes y el Detalle partida por partida. */
  const [armando, setArmando] = useState(false);
  async function bajarExcel() {
    if (!guardado) return;
    setArmando(true); setMsg(null);
    try {
      const { armarLibroAjustes } = await import("@/modulos/inventario/libro-ajustes");
      const buf = await armarLibroAjustes({
        fecha, fechaLarga: largo(fecha), guardadoEn: guardado.guardado_en, guardadoPor: guardado.guardado_por,
        ajustes: filas, analisis: guardado.filas, movimientos311,
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = `ajustes-bodega38-${fecha}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { setMsg("No se pudo armar el Excel. Vuelve a intentar.") }
    finally { setArmando(false) }
  }

  if (faltaSql) return <p className="ad-msg mal">Falta correr supabase/migraciones/2026-10-analisis-diferencia-ajustes.sql en Supabase.</p>;
  if (!guardado) return (
    <section className="ad-caja">
      <h2>Todavía no se ha guardado el análisis del {largo(fecha)}</h2>
      <p className="ad-nota">Los ajustes salen del análisis guardado. Vuelve al paso 1, revísalo y dale <b>Guardar y pasar a ajustes</b>.</p>
      <p className="ad-ir"><Link className="ad-bt" href={`/inventario/balance/analisis?fecha=${fecha}`}>← Ir al análisis</Link></p>
    </section>
  );

  return (
    <>
      <div className="ad-barra">
        <div className="ad-carga">
          <b>Análisis guardado · {largo(fecha)}</b>
          <small>{new Date(guardado.guardado_en).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{guardado.guardado_por ? ` · ${guardado.guardado_por}` : ""} · si cambias algo del análisis, vuelve a guardarlo y los ajustes se recalculan (las observaciones se quedan).</small>
        </div>
        <Link className="ad-bt alt" href={`/inventario/balance/analisis?fecha=${fecha}`}>← Volver al análisis</Link>
        <button type="button" className="ad-bt alt" disabled={armando} onClick={() => void bajarExcel()}>{armando ? "Armando el Excel…" : "Descargar Excel"}</button>
        <InformeCierre fecha={fecha} fechaLarga={largo(fecha)} ajustes={filas} guardadoEn={guardado.guardado_en} guardadoPor={guardado.guardado_por} finalEn={finalEn} />
        <Link className="ad-bt" href={`/inventario/balance/analisis?fecha=${fecha}&paso=final`}>Ver análisis final →</Link>
      </div>
      {msg && <p className="ad-msg mal" role="status">{msg}</p>}

      <div className="ad-k ad-k4">
        <div><span>DIFERENCIA DEL ANÁLISIS</span><b>{signo(k.bruta)}</b><small>conteo − SAP, antes de compensar</small></div>
        <div className="comp"><span>COMPENSADO (R ↔ NR NUEVO)</span><b>{n(k.compensado)}</b><small>se cruza, no se ajusta</small></div>
        <div className="sobra"><span>AJUSTE SOBRANTE</span><b>{signo(k.sobra)}</b><small>{k.nSobra} código{k.nSobra === 1 ? "" : "s"} · sube SAP</small></div>
        <div className="falta"><span>AJUSTE FALTANTE</span><b>{signo(k.falta)}</b><small>{k.nFalta} código{k.nFalta === 1 ? "" : "s"} · baja SAP</small></div>
      </div>

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Ajustes · {largo(fecha)}</h2>
          <div className="ad-ver" role="tablist" aria-label="Qué ver">
            {([["todo", "Todo", filas.filter((f) => f.ajuste !== 0 || f.compensa !== 0).length], ["sobra", "Sobrantes", k.nSobra], ["falta", "Faltantes", k.nFalta], ["cruza", "Compensados", filas.filter((f) => f.compensa !== 0).length]] as const).map(([v, t, c]) => (
              <button key={v} type="button" role="tab" aria-selected={ver === v} className={(ver === v ? "on " : "") + v} onClick={() => setVer(v)}>{t} <em>{c}</em></button>
            ))}
          </div>
        </div>
        <LeyendaEnLinea codigos={filas.map((f) => f.codigo)} enLinea={enLinea} />
        <div className="ad-tabla-caja">
          <table className="ad-t ad-piv ad-aj">
            <thead><tr>
              <th>Familia</th><th>Código</th><th>Descripción</th><th className="n">Diferencia</th>
              <th>Compensa con</th><th className="n">Compensación</th><th className="n">Ajuste</th><th>Sentido</th><th className="hecho">Ajustado en SAP</th><th className="obs">Observación del ajuste</th>
            </tr></thead>
            <tbody>
              {familias.map(([fam, xs]) => (
                <Fragment key={fam}>
                  {xs.map((f, i) => (
                    <tr key={f.codigo} className={(f.compensa ? "cruza" : "") + (enLinea[f.codigo]?.length ? " enl" : "")}>
                      {i === 0 && <td className="fam" rowSpan={xs.length}>{fam}</td>}
                      <td className="mono">{f.codigo}</td>
                      <td>{f.descripcion}<EtiquetaEnLinea xs={enLinea[f.codigo]} /></td>
                      <td className={"n" + (f.diferencia < 0 ? " neg" : f.diferencia > 0 ? " pos" : "")}>{signo(f.diferencia)}</td>
                      <td>{f.par ? <><b className="mono">{f.par}</b><small>{f.parDescripcion}</small><small className="ad-nuevo">R contado en NUEVO: <b>{n(f.nuevo)}</b></small></> : <span className="ad-na">—</span>}</td>
                      <td className="n">{f.compensa ? signo(f.compensa) : <span className="ad-na">—</span>}</td>
                      <td className={"n b" + (f.ajuste < 0 ? " neg" : f.ajuste > 0 ? " pos" : "")}>{f.ajuste ? signo(f.ajuste) : "0"}</td>
                      <td><span className={"ad-sent" + (f.ajuste > 0 ? " sobra" : f.ajuste < 0 ? " falta" : " ok")}>{sentido(f.ajuste)}</span></td>
                      <td className="hecho">
                        {(
                          <div className="ad-hecho">
                            {f.compensa !== 0 && <span className="ad-auto" title="El NUEVO contado en el retornable ya se pasó a su NR: no hay que marcar nada">Compensación automática</span>}
                            {(
                              <div className="ad-ajc">
                                <input type="number" className="ad-cant ad-cant-aj" disabled={!puedeEditar} defaultValue={f.ajusteHecho ?? ""} key={`${f.codigo}-${f.ajusteHecho ?? "x"}`}
                                       placeholder={f.ajuste ? signo(f.ajuste) : "± ajustar"} aria-label={`Ajuste hecho en SAP del ${f.codigo}`}
                                       title="Lo que ajustas en SAP, con su signo (+500 sube SAP en 500, −500 lo baja). Sirve también si la fila ya cuadra por la compensación. Vacío = nada ajustado."
                                       onBlur={(e) => { const t = e.currentTarget.value.trim(); const v = t === "" ? null : Number(t); if (v != null && !Number.isFinite(v)) return; if ((v || null) !== (f.ajusteHecho || null)) void marcar(f, f.compHecha, v || null) }}
                                       onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }} />
                                {puedeEditar && f.ajusteHecho !== f.ajuste && <button type="button" className="ad-todo" title={`Poner todo el ajuste (${signo(f.ajuste)})`} onClick={() => void marcar(f, f.compHecha, f.ajuste)}>todo</button>}
                                {f.ajusteHecho != null && (f.ajusteHecho !== f.ajuste
                                  ? <small className="ad-queda">diferencia final {signo(f.ajuste - f.ajusteHecho)}</small>
                                  : <small className="ad-cuadra">diferencia final 0 · cuadra</small>)}
                              </div>
                            )}
                            <i className={hEstado[f.codigo] ?? ""}>{hEstado[f.codigo] === "guardando" ? "…" : hEstado[f.codigo] === "ok" ? "✓" : hEstado[f.codigo] === "mal" ? "!" : ""}</i>
                          </div>
                        )}
                      </td>
                      <td className="obs">
                        {puedeEditar ? (
                          <div className="ad-obs">
                            <textarea rows={1} value={f.observacion} placeholder="Qué se ajustó en SAP y por qué…"
                                      onChange={(e) => escribir(f.codigo, e.target.value)}
                                      onFocus={(e) => (e.currentTarget.dataset.antes = e.currentTarget.value)}
                                      onBlur={(e) => void guardar(f.codigo, e.currentTarget.value, e.currentTarget.dataset.antes ?? "")} />
                            <i className={estado[f.codigo] ?? ""} aria-live="polite">{estado[f.codigo] === "guardando" ? "…" : estado[f.codigo] === "ok" ? "✓" : estado[f.codigo] === "mal" ? "!" : ""}</i>
                          </div>
                        ) : (f.observacion || <span className="ad-na">—</span>)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {!familias.length && <tr><td colSpan={10} className="ad-vacio">Nada que ajustar: todo cuadra.</td></tr>}
            </tbody>
            <tfoot><tr>
              <td colSpan={3}>Total</td><td className="n">{signo(k.bruta)}</td><td /><td /><td className="n">{signo(k.sobra + k.falta)}</td><td colSpan={3} />
            </tr></tfoot>
          </table>
        </div>
        <p className="ad-nota">Ajuste = diferencia + compensación. Se compensan 3500162 ↔ 412644, 3500446 ↔ 412671 y 3500213 ↔ 412707: lo que se contó del retornable en <b>estado NUEVO</b> es botella nueva (el NR), y se pasa al NR hasta cubrir lo que le falta. La observación se guarda sola al salir del campo. Marca en <b>Hecho en SAP</b> lo que ya se movió (si el ajuste fue solo una parte, cambia la cantidad): con eso se arma el análisis final{pendientes ? <> — faltan <b>{pendientes}</b> por hacer</> : <> — <b>todo hecho</b></>}.</p>
      </section>
      <Partidas311 movimientos={movimientos311} />
    </>
  );
}
