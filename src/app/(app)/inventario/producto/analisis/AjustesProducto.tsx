"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FilaAjuste } from "@/modulos/inventario/compensa";
import { analisisFinal } from "@/modulos/inventario/compensa";
import type { GuardadoProducto } from "@/modulos/inventario/producto-dif";
import { guardarFinalProducto, guardarHechoProducto, guardarObservacionProducto } from "./actions";

/**
 * PASO 2 · AJUSTES y PASO 3 · ANÁLISIS FINAL de Producto — del análisis guardado del cíclico.
 *
 * Igual que en Balance: el ajuste es la diferencia (sobrante sube SAP, faltante baja SAP), con una columna para
 * escribir lo que se ajustó DE VERDAD en SAP y su observación; el final es SAP + ajuste hecho contra el mismo
 * conteo. En producto no hay compensación retornable / NR.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const sentido = (v: number) => (v > 0 ? "Sobrante · sube SAP" : v < 0 ? "Faltante · baja SAP" : "Cuadrado");
const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Props = {
  fiscalId: string; nombre: string; guardado: GuardadoProducto | null; filas: FilaAjuste[];
  puedeEditar: boolean; falta: string | null; final: { en: string } | null;
};

function SinGuardar({ fiscalId, nombre, que }: { fiscalId: string; nombre: string; que: string }) {
  return (
    <section className="ad-caja">
      <h2>Todavía no se ha guardado el análisis de {nombre}</h2>
      <p className="ad-nota">{que} sale del análisis guardado. Vuelve al paso 1, revísalo y dale <b>Guardar y pasar a ajustes</b>.</p>
      <p className="ad-ir"><Link className="ad-bt" href={`/inventario/producto/analisis?c=${fiscalId}`}>← Ir al análisis</Link></p>
    </section>
  );
}

export function AjustesProducto({ fiscalId, nombre, guardado, filas: inicio, puedeEditar, falta }: Props) {
  const [filas, setFilas] = useState(inicio);
  const [ver, setVer] = useState<"todo" | "sobra" | "falta">("todo");
  const [estado, setEstado] = useState<Record<string, "guardando" | "ok" | "mal">>({});
  const [hEstado, setHEstado] = useState<Record<string, "guardando" | "ok" | "mal">>({});
  const [msg, setMsg] = useState<string | null>(null);

  const vistas = useMemo(() => ver === "sobra" ? filas.filter((f) => f.ajuste > 0).sort((a, b) => b.ajuste - a.ajuste)
    : ver === "falta" ? filas.filter((f) => f.ajuste < 0).sort((a, b) => a.ajuste - b.ajuste)
    : filas.filter((f) => f.ajuste !== 0 || f.observacion || (f.ajusteHecho ?? 0) !== 0), [filas, ver]);
  const familias = useMemo(() => {
    const m = new Map<string, FilaAjuste[]>();
    for (const f of vistas) (m.get(f.familia) ?? m.set(f.familia, []).get(f.familia)!).push(f);
    return [...m];
  }, [vistas]);
  const k = useMemo(() => ({
    bruta: filas.reduce((t, f) => t + f.diferencia, 0),
    sobra: filas.reduce((t, f) => t + Math.max(0, f.ajuste), 0),
    falta: filas.reduce((t, f) => t + Math.min(0, f.ajuste), 0),
    hecho: filas.reduce((t, f) => t + (f.ajusteHecho ?? 0), 0),
    nSobra: filas.filter((f) => f.ajuste > 0).length,
    nFalta: filas.filter((f) => f.ajuste < 0).length,
  }), [filas]);
  const pendientes = filas.filter((f) => f.ajuste - (f.ajusteHecho ?? 0) !== 0).length;

  const escribir = (codigo: string, texto: string) => setFilas((p) => p.map((f) => (f.codigo === codigo ? { ...f, observacion: texto } : f)));
  async function guardarObs(codigo: string, texto: string, antes: string) {
    if (texto === antes) return;
    setEstado((e) => ({ ...e, [codigo]: "guardando" }));
    const r = await guardarObservacionProducto(fiscalId, codigo, texto.trim());
    if ("error" in r && r.error) { setEstado((e) => ({ ...e, [codigo]: "mal" })); setMsg(r.error); return }
    setEstado((e) => ({ ...e, [codigo]: "ok" }));
  }
  async function marcar(f: FilaAjuste, ajuste: number | null) {
    setFilas((p) => p.map((x) => (x.codigo === f.codigo ? { ...x, ajusteHecho: ajuste } : x)));
    setHEstado((e) => ({ ...e, [f.codigo]: "guardando" }));
    const r = await guardarHechoProducto(fiscalId, f.codigo, ajuste);
    if ("error" in r && r.error) { setHEstado((e) => ({ ...e, [f.codigo]: "mal" })); setMsg(r.error); return }
    setHEstado((e) => ({ ...e, [f.codigo]: "ok" }));
  }

  if (falta) return <p className="ad-msg mal">{falta}</p>;
  if (!guardado) return <SinGuardar fiscalId={fiscalId} nombre={nombre} que="Los ajustes" />;

  return (
    <>
      <div className="ad-barra">
        <div className="ad-carga">
          <b>Análisis guardado · {nombre}</b>
          <small>{cuando(guardado.guardado_en)}{guardado.guardado_por ? ` · ${guardado.guardado_por}` : ""} · si cambias algo del análisis, vuelve a guardarlo y los ajustes se recalculan (las observaciones se quedan).</small>
        </div>
        <Link className="ad-bt alt" href={`/inventario/producto/analisis?c=${fiscalId}`}>← Volver al análisis</Link>
        <Link className="ad-bt" href={`/inventario/producto/analisis?c=${fiscalId}&paso=final`}>Ver análisis final →</Link>
      </div>
      {msg && <p className="ad-msg mal" role="status">{msg}</p>}

      <div className="ad-k ad-k4">
        <div><span>DIFERENCIA DEL ANÁLISIS</span><b>{signo(k.bruta)}</b><small>conteo de Bavaria − SAP</small></div>
        <div className="sobra"><span>AJUSTE SOBRANTE</span><b>{signo(k.sobra)}</b><small>{k.nSobra} código{k.nSobra === 1 ? "" : "s"} · sube SAP</small></div>
        <div className="falta"><span>AJUSTE FALTANTE</span><b>{signo(k.falta)}</b><small>{k.nFalta} código{k.nFalta === 1 ? "" : "s"} · baja SAP</small></div>
        <div className="comp"><span>AJUSTADO EN SAP</span><b>{signo(k.hecho)}</b><small>{pendientes ? `faltan ${pendientes} por hacer` : "todo hecho"}</small></div>
      </div>

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Ajustes · {nombre}</h2>
          <div className="ad-ver" role="tablist" aria-label="Qué ver">
            {([["todo", "Todo", filas.filter((f) => f.ajuste !== 0).length], ["sobra", "Sobrantes", k.nSobra], ["falta", "Faltantes", k.nFalta]] as const).map(([v, t, c]) => (
              <button key={v} type="button" role="tab" aria-selected={ver === v} className={(ver === v ? "on " : "") + v} onClick={() => setVer(v)}>{t} <em>{c}</em></button>
            ))}
          </div>
        </div>
        <div className="ad-tabla-caja">
          <table className="ad-t ad-piv ad-aj">
            <thead><tr>
              <th>Familia</th><th>Código</th><th>Descripción</th><th className="n">SAP</th><th className="n">Conteo</th><th className="n">Ajuste</th>
              <th>Sentido</th><th className="hecho">Ajustado en SAP</th><th className="obs">Observación del ajuste</th>
            </tr></thead>
            <tbody>
              {familias.map(([fam, xs]) => (
                <Fragment key={fam}>
                  {xs.map((f, i) => (
                    <tr key={f.codigo}>
                      {i === 0 && <td className="fam" rowSpan={xs.length}>{fam}</td>}
                      <td className="mono">{f.codigo}</td>
                      <td>{f.descripcion}</td>
                      <td className="n">{n(f.sap)}</td>
                      <td className="n">{n(f.conteo)}</td>
                      <td className={"n b" + (f.ajuste < 0 ? " neg" : f.ajuste > 0 ? " pos" : "")}>{f.ajuste ? signo(f.ajuste) : "0"}</td>
                      <td><span className={"ad-sent" + (f.ajuste > 0 ? " sobra" : f.ajuste < 0 ? " falta" : " ok")}>{sentido(f.ajuste)}</span></td>
                      <td className="hecho">
                        <div className="ad-hecho">
                          <div className="ad-ajc">
                            <input type="number" className="ad-cant ad-cant-aj" disabled={!puedeEditar} defaultValue={f.ajusteHecho ?? ""} key={`${f.codigo}-${f.ajusteHecho ?? "x"}`}
                                   placeholder={f.ajuste ? signo(f.ajuste) : "± ajustar"} aria-label={`Ajuste hecho en SAP del ${f.codigo}`}
                                   title="Lo que ajustaste en SAP, con su signo (+500 sube SAP, −500 lo baja). Vacío = nada ajustado."
                                   onBlur={(e) => { const t = e.currentTarget.value.trim(); const v = t === "" ? null : Number(t); if (v != null && !Number.isFinite(v)) return; if ((v || null) !== (f.ajusteHecho || null)) void marcar(f, v || null) }}
                                   onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }} />
                            {puedeEditar && f.ajuste !== 0 && f.ajusteHecho !== f.ajuste && <button type="button" className="ad-todo" title={`Poner todo el ajuste (${signo(f.ajuste)})`} onClick={() => void marcar(f, f.ajuste)}>todo</button>}
                            {f.ajusteHecho != null && (f.ajusteHecho !== f.ajuste
                              ? <small className="ad-queda">diferencia final {signo(f.ajuste - f.ajusteHecho)}</small>
                              : <small className="ad-cuadra">diferencia final 0 · cuadra</small>)}
                          </div>
                          <i className={hEstado[f.codigo] ?? ""}>{hEstado[f.codigo] === "guardando" ? "…" : hEstado[f.codigo] === "ok" ? "✓" : hEstado[f.codigo] === "mal" ? "!" : ""}</i>
                        </div>
                      </td>
                      <td className="obs">
                        {puedeEditar ? (
                          <div className="ad-obs">
                            <textarea rows={1} value={f.observacion} placeholder="Qué se ajustó en SAP y por qué…"
                                      onChange={(e) => escribir(f.codigo, e.target.value)}
                                      onFocus={(e) => (e.currentTarget.dataset.antes = e.currentTarget.value)}
                                      onBlur={(e) => void guardarObs(f.codigo, e.currentTarget.value, e.currentTarget.dataset.antes ?? "")} />
                            <i className={estado[f.codigo] ?? ""} aria-live="polite">{estado[f.codigo] === "guardando" ? "…" : estado[f.codigo] === "ok" ? "✓" : estado[f.codigo] === "mal" ? "!" : ""}</i>
                          </div>
                        ) : (f.observacion || <span className="ad-na">—</span>)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {!familias.length && <tr><td colSpan={9} className="ad-vacio">Nada que ajustar: todo cuadra.</td></tr>}
            </tbody>
            <tfoot><tr><td colSpan={5}>Total</td><td className="n">{signo(k.sobra + k.falta)}</td><td /><td className="n">{signo(k.hecho)}</td><td /></tr></tfoot>
          </table>
        </div>
        <p className="ad-nota">Ajuste = conteo de Bavaria − SAP. Escribe en <b>Ajustado en SAP</b> lo que de verdad moviste (todo o una parte, con su signo) y la observación: se guardan solas al salir del campo y con eso se arma el análisis final.</p>
      </section>
    </>
  );
}

export function FinalProducto({ fiscalId, nombre, guardado, filas: ajustes, puedeEditar, falta, final }: Props) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; mal?: boolean } | null>(null);
  const [solo, setSolo] = useState(false);
  const filas = useMemo(() => analisisFinal(ajustes), [ajustes]);
  const vistas = useMemo(() => filas.filter((f) => !solo || f.difFinal !== 0), [filas, solo]);
  const familias = useMemo(() => {
    const m = new Map<string, typeof filas>();
    for (const f of vistas) (m.get(f.familia) ?? m.set(f.familia, []).get(f.familia)!).push(f);
    return [...m];
  }, [vistas]);
  const s = (k: (f: (typeof filas)[number]) => number, xs = filas) => xs.reduce((t, f) => t + k(f), 0);
  const ini = s((f) => f.diferencia), fin = s((f) => f.difFinal);
  const pendientes = filas.filter((f) => f.difFinal !== 0).length;
  const avance = 1 - s((f) => Math.abs(f.difFinal)) / Math.max(1, s((f) => Math.abs(f.diferencia)));

  const guardar = () => start(async () => {
    const r = await guardarFinalProducto(fiscalId, JSON.stringify(filas.map((f) => ({
      familia: f.familia, codigo: f.codigo, descripcion: f.descripcion, sap: f.sap, conteo: f.conteo, diferencia: f.diferencia,
      ajuste: f.ajuste, movAjuste: f.movAjuste, sapFinal: f.sapFinal, difFinal: f.difFinal, observacion: f.observacion,
    }))));
    if ("error" in r && r.error) { setMsg({ mal: true, t: r.error }); return }
    setMsg({ t: "Análisis final guardado: ya está en el histórico." });
    router.refresh();
  });

  if (falta) return <p className="ad-msg mal">{falta}</p>;
  if (!guardado) return <SinGuardar fiscalId={fiscalId} nombre={nombre} que="El análisis final" />;

  return (
    <>
      <div className="ad-barra">
        <div className="ad-carga">
          <b>{final ? `Análisis final guardado · ${cuando(final.en)}` : "Análisis final sin guardar"}</b>
          <small>SAP final = SAP + ajuste hecho. Lo que escribes en <b>Ajustes</b> se ve aquí al instante; guárdalo cuando termines para que quede en el histórico.</small>
        </div>
        <Link className="ad-bt alt" href={`/inventario/producto/analisis?c=${fiscalId}&paso=ajustes`}>← Ajustes</Link>
        {puedeEditar && <button type="button" className="ad-bt" disabled={pend} onClick={guardar}>{pend ? "Guardando…" : final ? "Guardar de nuevo el final" : "Guardar análisis final"}</button>}
      </div>
      {msg && <p className={"ad-msg" + (msg.mal ? " mal" : " bien")} role="status">{msg.t}</p>}

      <div className="ad-k ad-k4">
        <div><span>DIFERENCIA INICIAL</span><b>{signo(ini)}</b><small>la del análisis guardado</small></div>
        <div className="comp"><span>AJUSTADO EN SAP</span><b>{signo(s((f) => f.movAjuste))}</b><small>lo escrito en Ajustes</small></div>
        <div className={fin === 0 ? "sobra" : "falta"}><span>DIFERENCIA FINAL</span><b>{signo(fin)}</b><small>{pendientes ? `${pendientes} código${pendientes === 1 ? "" : "s"} siguen con diferencia` : "todo cuadra ✓"}</small></div>
        <div><span>AVANCE</span><b>{Math.round(Math.max(0, avance) * 100)}%</b><small>de la diferencia ya resuelta</small></div>
      </div>

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Análisis final · {nombre}</h2>
          <label className="ad-chk"><input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} /> Solo lo que sigue con diferencia</label>
        </div>
        <div className="ad-tabla-caja">
          <table className="ad-t ad-piv ad-aj">
            <thead><tr>
              <th>Familia</th><th>Código</th><th>Descripción</th><th className="n">SAP inicial</th><th className="n">Ajuste hecho</th>
              <th className="n">SAP final</th><th className="n">Conteo</th><th className="n">Diferencia final</th><th>Estado</th><th>Observación del ajuste</th>
            </tr></thead>
            <tbody>
              {familias.map(([fam, xs]) => (
                <Fragment key={fam}>
                  {xs.map((f, i) => (
                    <tr key={f.codigo}>
                      {i === 0 && <td className="fam" rowSpan={xs.length}>{fam}</td>}
                      <td className="mono">{f.codigo}</td>
                      <td>{f.descripcion}</td>
                      <td className="n">{n(f.sap)}</td>
                      <td className="n">{f.movAjuste ? signo(f.movAjuste) : <span className="ad-na">—</span>}</td>
                      <td className="n b">{n(f.sapFinal)}</td>
                      <td className="n">{n(f.conteo)}</td>
                      <td className={"n b" + (f.difFinal < 0 ? " neg" : f.difFinal > 0 ? " pos" : "")}>{f.difFinal ? signo(f.difFinal) : "0"}</td>
                      <td><span className={"ad-sent" + (f.difFinal === 0 ? (f.diferencia === 0 ? " ok" : " sobra") : " falta")}>{f.difFinal === 0 ? (f.diferencia === 0 ? "Cuadraba" : "Cuadrado ✓") : "Pendiente"}</span></td>
                      <td className="ad-obs-final">{f.observacion || <span className="ad-na">—</span>}</td>
                    </tr>
                  ))}
                  <tr className="sub">
                    <td colSpan={3}>Total {fam}</td>
                    <td className="n">{n(s((f) => f.sap, xs))}</td><td className="n">{signo(s((f) => f.movAjuste, xs))}</td>
                    <td className="n">{n(s((f) => f.sapFinal, xs))}</td><td className="n">{n(s((f) => f.conteo, xs))}</td><td className="n">{signo(s((f) => f.difFinal, xs))}</td><td /><td />
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot><tr>
              <td colSpan={3}>Total general</td><td className="n">{n(s((f) => f.sap))}</td><td className="n">{signo(s((f) => f.movAjuste))}</td>
              <td className="n">{n(s((f) => f.sapFinal))}</td><td className="n">{n(s((f) => f.conteo))}</td><td className="n">{signo(fin)}</td><td /><td />
            </tr></tfoot>
          </table>
        </div>
        <p className="ad-nota">El ajuste hecho mueve SAP en su signo. Si todo se ajustó, la diferencia final es cero.</p>
      </section>
    </>
  );
}
