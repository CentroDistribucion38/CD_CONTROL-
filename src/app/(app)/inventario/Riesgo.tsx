"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FRANJAS, enRiesgo, type Franja, type MaterialRiesgo, type Riesgo as R } from "@/modulos/inventario/riesgo";

/**
 * RIESGO DE VENCIMIENTO — lo primero que se ve en el tablero de inventario.
 *
 * Las alertas arriba, por franja y tocables: tocar una filtra la lista.
 * Tocar un material abre al lado TODAS sus ubicaciones, con lote,
 * vencimiento, cuánto hay y quién lo contó. Y el informe en PDF para
 * mandar.
 */
export type DatosRiesgo = Omit<R, "foto">;

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const fecha = (s: string | null) => s ? new Date(s.length === 10 ? s + "T00:00:00" : s)
  .toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const corta = (s: string | null) => s ? new Date(s.length === 10 ? s + "T00:00:00" : s)
  .toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const cuando = (s: string | null) => s ? new Date(s).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const ALERTAS: Franja[] = ["vencido", "pasado", "semana", "quince", "mes"];
const info = (f: Franja) => FRANJAS.find((x) => x.clave === f)!;
const dias = (d: number | null) => d == null ? "—" : d < 0 ? `hace ${nf.format(-d)} d` : `${nf.format(d)} d`;

/** La letra de la variable de color de cada franja, para pintar el aro. */
const VAR: Record<Franja, string> = { vencido: "v", pasado: "p", semana: "s", quince: "q", mes: "m", ok: "o", sinfecha: "n" };

export function Riesgo({ r, bodega, sinContar, ultimo, activas }: {
  r: DatosRiesgo; bodega: string; sinContar: number; ultimo: string | null;
  /** Cuántas posiciones activas tiene la bodega, para la barra de avance. */
  activas?: number;
}) {
  const [unidad, setUnidad] = useState<"cajas" | "unidades">("cajas");
  const [filtro, setFiltro] = useState<Franja | "riesgo" | "todos">("riesgo");
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState<MaterialRiesgo | null>(null);
  const [todos, setTodos] = useState(false);
  const [pdf, setPdf] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const U = unidad === "unidades";
  const cant = (c: number, u: number | null) => U ? (u == null ? "—" : nf.format(u)) : nf.format(c);
  const sinUxc = FRANJAS.reduce((a, f) => a + r.franjas[f.clave].sinUxc, 0);

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return r.materiales.filter((m) =>
      (filtro === "todos" || (filtro === "riesgo" ? enRiesgo(m.franja) : m.sitios.some((s) => s.franja === filtro)))
      && (!q || m.codigo.toLowerCase().includes(q) || m.nombre.toLowerCase().includes(q)
          || m.sitios.some((s) => s.ubicacion.toLowerCase().includes(q))));
  }, [r.materiales, filtro, buscar]);
  const vistos = todos ? lista : lista.slice(0, 40);

  useEffect(() => {
    if (!abierto) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(null) };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [abierto]);

  const urgentes = r.franjas.vencido.materiales + r.franjas.pasado.materiales;
  const semana = r.franjas.semana;
  const maxS = Math.max(1, ...r.semanas.map((s) => U ? s.unidades : s.cajas));
  const total = U ? r.totalUnidades : r.totalCajas;

  /* EL PEOR, ARRIBA Y GRANDE. Un tablero que empieza por cinco cifras
     iguales obliga a buscar cuál importa; este empieza por la que
     importa y las demás quedan de contexto. */
  const enRiesgoL = useMemo(() => r.materiales.filter((m) => enRiesgo(m.franja)), [r.materiales]);
  const peor = useMemo(() => [...enRiesgoL].sort((a, b) =>
    ALERTAS.indexOf(a.franja) - ALERTAS.indexOf(b.franja) || b.enRiesgoCajas - a.enRiesgoCajas)[0] ?? null,
    [enRiesgoL]);
  const contados = activas != null ? Math.max(0, activas - sinContar) : null;
  const pctBodega = (v: number) => total ? (v / total) * 100 : 0;
  /* El aro: una vuelta, un pedazo por franja con algo. */
  const RAD = 60, CIRC = 2 * Math.PI * RAD;
  const aro = useMemo(() => {
    let giro = -90;
    return FRANJAS.map((f) => {
      const v = U ? r.franjas[f.clave].unidades : r.franjas[f.clave].cajas;
      const largo = total ? (v / total) * CIRC : 0;
      const y = giro; giro += total ? (v / total) * 360 : 0;
      return { clave: f.clave, rot: f.corto, v, largo, giro: y };
    }).filter((x) => x.largo > 0);
  }, [r.franjas, total, U, CIRC]);
  const conMargen = Math.round(pctBodega(U ? r.franjas.ok.unidades : r.franjas.ok.cajas));

  async function informe(m?: MaterialRiesgo) {
    setPdf(true);
    try { const { informeRiesgo } = await import("./informe"); await informeRiesgo(r, { bodega, unidad, material: m, dentro: caja.current }) }
    finally { setPdf(false) }
  }

  return (
    <div className="ir" ref={caja}>
      <header className="ir-top">
        <div>
          <p className="ir-o">INVENTARIO · RIESGO DE VENCIMIENTO · {bodega}</p>
          <h1>Qué se vence y dónde está</h1>
          {/* LA FRASE DICE LO QUE PASA HOY, en palabras. «Una sola
              referencia está vencida: Poker R 330cc X30, 540 cajas, en
              una ubicación»: eso se entiende sin mirar ninguna cifra. */}
          <p className="ir-frase">
            {peor ? (
              <>
                {enRiesgoL.length === 1 ? "Una sola referencia" : `${enRiesgoL.length} referencias`}{" "}
                {peor.franja === "vencido" ? (enRiesgoL.length === 1 ? "está vencida" : "están en riesgo")
                  : enRiesgoL.length === 1 ? "está en riesgo" : "están en riesgo"}:{" "}
                <b className="mal">{peor.nombre}, {cant(peor.enRiesgoCajas, peor.enRiesgoUnidades)} {U ? "unidades" : "cajas"}</b>,
                {" "}en {peor.sitios.length === 1 ? "una ubicación" : `${peor.sitios.length} ubicaciones`}.
                {enRiesgoL.length === 1 && <> Nada más entra a riesgo en los próximos 30 días.</>}
              </>
            ) : (
              <>Nada vencido ni por salir en los próximos 30 días. La bodega está con margen.</>
            )}
            {" "}Foto de {r.recorridos} recorrido{r.recorridos === 1 ? "" : "s"}{r.desde && <> · {fecha(r.desde)}{r.hasta !== r.desde && <> al {fecha(r.hasta)}</>}</>}.
          </p>
        </div>
        <div className="ir-acc">
          <div className="ir-seg" role="group" aria-label="Contar en">
            <button type="button" className={!U ? "on" : ""} onClick={() => setUnidad("cajas")}>Cajas</button>
            <button type="button" className={U ? "on" : ""} onClick={() => setUnidad("unidades")}>Unidades</button>
          </div>
          <button type="button" className="ir-btn" onClick={() => informe()} disabled={pdf}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>{pdf ? "Armando…" : "Informe PDF"}
          </button>
        </div>
      </header>

      {sinContar > 0 && (
        <div className="ir-aviso">
          <span className="ic" aria-hidden>
            <svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></svg>
          </span>
          <div>
            <b>{nf.format(sinContar)} módulo{sinContar === 1 ? "" : "s"} sin contar en el último recorrido</b>
            <span>{ultimo ? `${ultimo} · ` : ""}lo que esté ahí no aparece en estas cifras</span>
          </div>
          {contados != null && activas ? (
            <div className="prog">
              <div className="t">{nf.format(contados)} de {nf.format(activas)} contados</div>
              <div className="p"><i style={{ width: `${Math.max(1, Math.round((contados / activas) * 100))}%` }} /></div>
            </div>
          ) : null}
        </div>
      )}
      {U && sinUxc > 0 && (
        <p className="ir-ojo">
          <b>{sinUxc} renglón{sinUxc === 1 ? "" : "es"}</b> de materiales sin «unidades por caja» en el maestro: no suman en unidades.
          Se corrige en <b>Maestro › Materiales</b>.
        </p>
      )}

      {/* ---------- ARRIBA: EL PEOR Y CÓMO ESTÁ LA BODEGA ---------- */}
      <div className="ir-duo">
        <section className={"ir-card ir-hero " + (peor ? peor.franja : "ok")}>
          {peor ? (
            <>
              <div className="ir-hero-1">
                <span className={"ir-pill " + peor.franja}>{info(peor.franja).corto}</span>
                <span>
                  {(peor.sitios[0]?.dias_para_vencer ?? null) != null && peor.sitios[0].dias_para_vencer! < 0
                    ? <>venció hace {nf.format(-peor.sitios[0].dias_para_vencer!)} día{peor.sitios[0].dias_para_vencer === -1 ? "" : "s"}</>
                    : peor.diasSalir != null && peor.diasSalir < 0
                      ? <>debió salir hace {nf.format(-peor.diasSalir)} día{peor.diasSalir === -1 ? "" : "s"}</>
                      : <>sale en {dias(peor.diasSalir)}</>}
                  {peor.vence && <> · {corta(peor.vence)}</>}
                </span>
              </div>
              <div className="ir-hero-2">
                <p className="n">
                  {cant(peor.enRiesgoCajas, peor.enRiesgoUnidades)}
                  <small>{U ? "UNIDADES" : <>CAJAS{peor.enRiesgoUnidades != null && <> · {nf.format(peor.enRiesgoUnidades)} UNIDADES</>}</>}</small>
                </p>
                <div className="qu">
                  <h2>{peor.nombre}</h2>
                  <p className="meta">{peor.codigo}{peor.familia ? ` · ${peor.familia}` : ""}</p>
                </div>
              </div>
              <div className="ir-hero-3">
                <div className="d">
                  <div className="k">DÓNDE ESTÁ</div>
                  <div className="v">
                    {peor.sitios[0] ? (peor.sitios[0].calle && peor.sitios[0].modulo
                      ? `${peor.sitios[0].calle}${peor.sitios[0].modulo} · módulo ${peor.sitios[0].modulo}`
                      : peor.sitios[0].ubicacion) : "—"}
                  </div>
                </div>
                <div className="d"><div className="k">UBICACIONES</div><div className="v">{peor.sitios.length}</div></div>
                <div className="d"><div className="k">% DE LA BODEGA</div>
                  <div className="v mal">{pctBodega(U ? (peor.enRiesgoUnidades ?? 0) : peor.enRiesgoCajas).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</div></div>
                <button type="button" className="ver" onClick={() => setAbierto(peor)}>
                  <svg viewBox="0 0 24 24" aria-hidden><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>
                  Ver dónde está ›
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="ir-hero-1"><span className="ir-pill ok">Con margen</span><span>nada que sacar con afán</span></div>
              <div className="ir-hero-2">
                <p className="n bien">{cant(r.totalCajas, r.totalUnidades)}<small>{U ? "UNIDADES" : "CAJAS"} EN LA BODEGA</small></p>
                <div className="qu"><h2>Nada vencido ni por salir</h2>
                  <p className="meta">{r.materiales.length} materiales · {r.ubicaciones} ubicaciones</p></div>
              </div>
            </>
          )}
        </section>

        <section className="ir-card ir-bod">
          <svg className="aro" viewBox="0 0 140 140" role="img" aria-label={`${conMargen} % del inventario con margen`}>
            <circle cx="70" cy="70" r={RAD} className="pista" />
            {aro.map((x) => (
              <circle key={x.clave} cx="70" cy="70" r={RAD} className="trozo"
                      style={{ stroke: `var(--ir-${VAR[x.clave]})` }}
                      strokeDasharray={`${x.largo} ${CIRC - x.largo}`}
                      transform={`rotate(${x.giro} 70 70)`} />
            ))}
            <text x="70" y="70" className="pc" textAnchor="middle" dominantBaseline="middle" fontSize="25">{conMargen}%</text>
            <text x="70" y="88" className="pcr" textAnchor="middle" fontSize="8.5">CON MARGEN</text>
          </svg>
          <div className="lado">
            <h3>Cómo está la bodega</h3>
            <p className="sub">{nf.format(total)} {U ? "unidades" : "cajas"} · {r.ubicaciones} ubicaciones</p>
            {FRANJAS.map((f) => { const x = r.franjas[f.clave]; const v = U ? x.unidades : x.cajas; return v > 0 ? (
              <div className="l" key={f.clave}>
                <i className={f.clave} />{f.corto}<b>{nf.format(v)}</b>
                <span>{Math.round(pctBodega(v))} %</span>
              </div>
            ) : null })}
            {aro.length < FRANJAS.length && (
              <div className="l"><i className="nada" />Todo lo demás<b>0</b><span>0 %</span></div>
            )}
          </div>
        </section>
      </div>

      {/* ---------- LAS OTRAS FRANJAS: contexto, y filtran la lista ---------- */}
      <div className="ir-fr" role="group" aria-label="Filtrar por franja">
        {ALERTAS.filter((f) => !peor || f !== peor.franja).map((f) => {
          const x = r.franjas[f]; const i = info(f);
          return (
            <button type="button" key={f} className={`ir-frb ${f}` + (filtro === f ? " on" : "") + (x.renglones ? "" : " cero")}
                    onClick={() => setFiltro(filtro === f ? "riesgo" : f)} aria-pressed={filtro === f}>
              <span className="k">{i.rot}</span>
              <span className={"v " + (x.renglones ? f : "")}>{cant(x.cajas, x.unidades)}</span>
              {x.renglones > 0 && <span className="s">{x.materiales} material{x.materiales === 1 ? "" : "es"} · {x.renglones} ubicaci{x.renglones === 1 ? "ón" : "ones"}</span>}
            </button>
          );
        })}
      </div>

      {/* ---------- CUÁNDO TIENE QUE SALIR ----------
          Solo cuando hay algo que sacar: con la bodega limpia es una
          rejilla de ceros que no dice nada. */}
      {r.semanas.some((s) => (U ? s.unidades : s.cajas) > 0) && (
        <section className="ir-card ir-sem-caja">
          <div className="ir-h"><h2>Cuándo tiene que salir</h2><span>{U ? "unidades" : "cajas"} por semana de salida</span></div>
          <div className="ir-sem" role="img" aria-label="Cantidad que tiene que salir por semana">
            {r.semanas.map((s, i) => {
              const v = U ? s.unidades : s.cajas;
              const t = i === 0 ? "r" : i === 1 ? "n" : i <= 3 ? "a" : "g";
              return (
                <div key={s.rot} className="col">
                  <span className="bar-e">{v > 0 && <b>{nf.format(v)}</b>}<i className={v ? t : "cero"} style={{ height: v ? `${Math.max(3, (v / maxS) * 100)}%` : 3 }} /></span>
                  <span className="x">{s.rot}</span>
                </div>
              );
            })}
          </div>
          <p className="ir-dice">«Pasó» es lo que ya debió salir. «Esta» son los próximos 7 días.</p>
        </section>
      )}

      {/* ---------- LOS MATERIALES ---------- */}
      <section className="ir-card">
        <div className="ir-th">
          <b>{filtro === "riesgo" ? "Materiales en riesgo" : filtro === "todos" ? "Todos los materiales" : info(filtro).rot}</b>
          <input type="search" placeholder="Buscar código, material o ubicación" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" />
          <div className="ir-chips">
            <button type="button" className={filtro === "riesgo" ? "on" : ""} onClick={() => setFiltro("riesgo")}>En riesgo <em>{enRiesgoL.length}</em></button>
            <button type="button" className={filtro === "todos" ? "on" : ""} onClick={() => setFiltro("todos")}>Todos <em>{r.materiales.length}</em></button>
          </div>
        </div>
        {vistos.length === 0 ? <p className="ir-vacio">{buscar ? "Nada coincide con la búsqueda." : "Nada en esta franja."}</p> : (
          <div className="ir-lista">
            {vistos.map((m) => (
              <button type="button" key={m.codigo} className="ir-m" onClick={() => setAbierto(m)}>
                <span className={"ir-pill " + m.franja}>{info(m.franja).corto}</span>
                <span className="que"><b>{m.nombre}</b><small>{m.codigo}{m.familia ? ` · ${m.familia}` : ""}</small></span>
                <span className="dato d1"><small>Sale</small><b>{dias(m.diasSalir)}</b></span>
                <span className="dato d2"><small>Vence</small><b>{corta(m.vence)}</b></span>
                <span className="dato d3"><small>En riesgo</small><b className={m.enRiesgoCajas ? "mal" : ""}>{cant(m.enRiesgoCajas, m.enRiesgoUnidades)}</b></span>
                <span className="dato d4"><small>Ubicaciones</small><b>{m.sitios.length}</b></span>
                <svg className="fl" viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
              </button>
            ))}
          </div>
        )}
        {lista.length > 40 && !todos && <button type="button" className="ir-mas" onClick={() => setTodos(true)}>Ver los {lista.length}</button>}
      </section>

      {/* ---------- EL PANEL: DÓNDE ESTÁ ---------- */}
      {abierto && (
        <div className="ir-velo" onClick={() => setAbierto(null)}>
          <aside className="ir-panel" role="dialog" aria-modal="true" aria-label={`Dónde está ${abierto.nombre}`} onClick={(e) => e.stopPropagation()}>
            <div className="ir-pc">
              <div>
                <span className={"ir-pill " + abierto.franja}>{info(abierto.franja).rot}</span>
                <h3>{abierto.nombre}</h3>
                <p>{abierto.codigo}{abierto.familia ? ` · ${abierto.familia}` : ""}{abierto.uxc ? ` · ${abierto.uxc} unidades por caja` : ""}</p>
              </div>
              <button type="button" className="ir-x" onClick={() => setAbierto(null)} aria-label="Cerrar">
                <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="ir-pk">
              <div><small>Total</small><b>{nf.format(abierto.cajas)}</b><span>cajas{abierto.unidades != null && ` · ${nf.format(abierto.unidades)} und`}</span></div>
              <div className={abierto.enRiesgoCajas ? "mal" : ""}><small>En riesgo</small><b>{nf.format(abierto.enRiesgoCajas)}</b><span>cajas{abierto.enRiesgoUnidades != null && ` · ${nf.format(abierto.enRiesgoUnidades)} und`}</span></div>
              <div><small>Ubicaciones</small><b>{abierto.sitios.length}</b><span>la primera en salir, arriba</span></div>
            </div>
            <div className="ir-sitios">
              {abierto.sitios.map((s) => (
                <div key={s.id} className={"ir-s " + s.franja}>
                  <div className="cab">
                    <b className="ub">{s.ubicacion}</b>
                    <span className={"ir-pill " + s.franja}>{info(s.franja).corto}</span>
                  </div>
                  {(s.calle || s.modulo) && <p className="donde">Calle {s.calle ?? "—"} · Módulo {s.modulo ?? "—"}{s.lado ? ` · ${s.lado === "IZQ" ? "izquierda" : "derecha"}` : ""}</p>}
                  <dl>
                    <div><dt>Vence</dt><dd>{fecha(s.vencimiento)}</dd></div>
                    <div><dt>Para vencer</dt><dd>{dias(s.dias_para_vencer)}</dd></div>
                    <div><dt>Para salir</dt><dd className={s.dias_para_salir != null && s.dias_para_salir < 0 ? "mal" : ""}>{dias(s.dias_para_salir)}</dd></div>
                    <div><dt>Fabricado</dt><dd>{fecha(s.fabricacion)}</dd></div>
                    <div><dt>Estibas · cajas · saldo</dt><dd>{nf.format(s.estibas)} · {nf.format(s.cajas)} · {nf.format(s.saldo)}</dd></div>
                    <div><dt>Total</dt><dd><b>{nf.format(s.total_cajas)} cajas</b>{s.unidades != null && <> · {nf.format(s.unidades)} und</>}</dd></div>
                  </dl>
                  {(s.averia || s.pnc || s.nota) && (
                    <p className="tags">{s.averia && <span className="t">Avería</span>}{s.pnc && <span className="t">PNC</span>}{s.nota && <em>{s.nota}</em>}</p>
                  )}
                  <p className="quien">Contó {s.conto ?? "—"} · {cuando(s.contado_en)} · {s.conteo}</p>
                </div>
              ))}
            </div>
            <div className="ir-pp">
              <button type="button" className="ir-btn" onClick={() => informe(abierto)} disabled={pdf}>
                <svg viewBox="0 0 24 24" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>{pdf ? "Armando…" : "PDF de este material"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
