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

/** El nombre de cada estado en la tabla y su rango. */
const TXT: Record<Franja, { n: string; r?: string }> = {
  vencido: { n: "Vencido" }, pasado: { n: "Fuera de despacho" },
  semana: { n: "Salida crítica", r: "0–7 días" }, quince: { n: "Salida próxima", r: "8–15 días" },
  mes: { n: "Seguimiento", r: "16–30 días" }, ok: { n: "Con margen", r: "+30 días" }, sinfecha: { n: "Sin fecha" },
};

export function Riesgo({ r, bodega, sinContar, ultimo, activas, barra }: {
  r: DatosRiesgo; bodega: string; sinContar: number; ultimo: string | null;
  /** La barra para escoger el día de la foto (viene del servidor). */
  barra?: React.ReactNode;
  /** Cuántas posiciones activas tiene la bodega, para la barra de avance. */
  activas?: number;
}) {
  const [unidad, setUnidad] = useState<"cajas" | "unidades" | "hl">("cajas");
  const [filtro, setFiltro] = useState<Franja | "riesgo" | "todos">("riesgo");
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState<MaterialRiesgo | null>(null);
  const [todos, setTodos] = useState(false);
  const [pdf, setPdf] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const U = unidad === "unidades", H = unidad === "hl";
  /* HECTOLITROS: con una decimal (con dos si son pocos): 5,9 HL se lee; 6 HL no dice nada. */
  const fh = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: n < 10 ? 2 : 1 });
  const fmt = (n: number | null) => n == null ? "—" : H ? fh(n) : nf.format(n);
  const cant = (c: number, u: number | null, h: number | null = null) => H ? fmt(h) : U ? fmt(u) : nf.format(c);
  const pick = (c: number, u: number | null, h: number | null) => H ? (h ?? 0) : U ? (u ?? 0) : c;
  const palabra = H ? "hectolitros" : U ? "unidades" : "cajas";
  const Palabra = H ? "Hectolitros" : U ? "Unidades" : "Cajas";
  const sinUxc = FRANJAS.reduce((a, f) => a + r.franjas[f.clave].sinUxc, 0);
  const sinHl = FRANJAS.reduce((a, f) => a + r.franjas[f.clave].sinHl, 0);

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return r.materiales.filter((m) =>
      (filtro === "todos" || (filtro === "riesgo" ? enRiesgo(m.franja) : m.sitios.some((s) => s.franja === filtro)))
      && (!q || m.codigo.toLowerCase().includes(q) || m.nombre.toLowerCase().includes(q)
          || m.sitios.some((s) => s.ubicacion.toLowerCase().includes(q))));
  }, [r.materiales, filtro, buscar]);
  const vistos = todos ? lista : lista.slice(0, 40);

  /* «Ver ubicaciones» de arriba: abre ese material en su fila de la lista,
     y baja hasta ella. Se asegura de que la fila se vea (sin buscar, en riesgo). */
  const [bajar, setBajar] = useState<string | null>(null);
  const verPeor = () => {
    if (!peor) return;
    setBuscar(""); setFiltro("riesgo"); setTodos(true); setAbierto(peor); setBajar(peor.codigo);
  };
  useEffect(() => {
    if (!bajar) return;
    document.getElementById("ir-" + bajar)?.scrollIntoView({ block: "start", behavior: "smooth" });
    setBajar(null);
  }, [bajar, abierto]);

  const urgentes = r.franjas.vencido.materiales + r.franjas.pasado.materiales;
  const semana = r.franjas.semana;
  const maxS = Math.max(1, ...r.semanas.map((s) => pick(s.cajas, s.unidades, s.hl)));
  const total = pick(r.totalCajas, r.totalUnidades, r.totalHl);

  /* EL PEOR, ARRIBA Y GRANDE. Un tablero que empieza por cinco cifras
     iguales obliga a buscar cuál importa; este empieza por la que
     importa y las demás quedan de contexto. */
  const enRiesgoL = useMemo(() => r.materiales.filter((m) => enRiesgo(m.franja)), [r.materiales]);
  const peor = useMemo(() => [...enRiesgoL].sort((a, b) =>
    ALERTAS.indexOf(a.franja) - ALERTAS.indexOf(b.franja) || b.enRiesgoCajas - a.enRiesgoCajas)[0] ?? null,
    [enRiesgoL]);
  const contados = activas != null ? Math.max(0, activas - sinContar) : null;
  const pctBodega = (v: number) => total ? (v / total) * 100 : 0;
  const vF = (k: Franja) => pick(r.franjas[k].cajas, r.franjas[k].unidades, r.franjas[k].hl);
  const vOk = vF("ok");
  const vRiesgo = ALERTAS.reduce((a, k) => a + vF(k), 0);
  /* Las barras comparan solo los estados en riesgo entre sí: la mayor es la barra llena. */
  const maxRiesgo = Math.max(1, ...ALERTAS.map(vF));

  async function informe(m?: MaterialRiesgo) {
    setPdf(true);
    try { const { informeRiesgo } = await import("./informe"); await informeRiesgo(r, { bodega, unidad, material: m, dentro: caja.current }) }
    finally { setPdf(false) }
  }

  return (
    <div className="ir" ref={caja}>
      <header className="ir-top">
        <div>
          <p className="ir-o">INVENTARIO · {bodega}</p>
          <h1>Riesgo de vencimiento por ubicación</h1>
          <p className="ir-frase">
            {r.totalCajas === 0
              ? "No hay producto terminado en esta foto, así que no hay vencimientos que medir."
              : <>{nf.format(enRiesgoL.length)} referencia{enRiesgoL.length === 1 ? "" : "s"} con riesgo</>}
            {" "}· foto de {r.recorridos} recorrido{r.recorridos === 1 ? "" : "s"}{r.desde && <> del {fecha(r.desde)}{r.hasta !== r.desde && <> al {fecha(r.hasta)}</>}</>}
          </p>
        </div>
        <div className="ir-acc">
          <div className="ir-seg" role="group" aria-label="Contar en">
            <button type="button" className={unidad === "cajas" ? "on" : ""} onClick={() => setUnidad("cajas")}>Cajas</button>
            <button type="button" className={U ? "on" : ""} onClick={() => setUnidad("unidades")}>Unidades</button>
            <button type="button" className={H ? "on" : ""} onClick={() => setUnidad("hl")}>Hectolitros</button>
          </div>
          <button type="button" className="ir-btn" onClick={() => informe()} disabled={pdf}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>{pdf ? "Armando…" : "Informe PDF"}
          </button>
        </div>
      </header>

      {/* ---------- EL DÍA DE LA FOTO Y QUÉ TANTO SE CONTÓ: una sola caja ---------- */}
      <section className="ir-ctl" aria-label="Día de la foto y cobertura del conteo">
        {barra && <div className="ir-ctl-1">{barra}</div>}
        {sinContar > 0 && (
          <div className="ir-ctl-2 ir-aviso">
            <span className="ic" aria-hidden>!</span>
            <div className="tx">
              <b>{nf.format(sinContar)} módulo{sinContar === 1 ? "" : "s"} sin contar</b> en el último recorrido
              <span>{ultimo ? `${ultimo} · ` : ""}lo que esté ahí no entra en estas cifras</span>
            </div>
            {contados != null && activas ? (
              <div className="prog">
                <div className="p"><i style={{ width: `${Math.max(1, Math.round((contados / activas) * 100))}%` }} /></div>
                <div className="t"><span>{nf.format(contados)} de {nf.format(activas)} contados</span><span>{Math.round((contados / activas) * 100)} %</span></div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {r.totalCajas === 0 && (
        <div className="ir-aviso solo">
          <span className="ic" aria-hidden>!</span>
          <div className="tx">
            <b>{r.inventario.renglones === 0 ? "No hay renglones en esta foto" : "Esta foto no trae producto terminado"}</b>
            <span>
              {r.inventario.renglones === 0
                ? "Escoge otro día arriba."
                : `Solo hay ${nf.format(r.inventario.renglonesEnvase)} ${r.inventario.renglonesEnvase === 1 ? "renglón" : "renglones"} de envase en ${nf.format(r.ubicaciones)} ubicaciones. Escoge otro día o incluye lo que se está contando.`}
            </span>
          </div>
        </div>
      )}
      {U && sinUxc > 0 && (
        <p className="ir-ojo">
          <b>{sinUxc} {sinUxc === 1 ? "renglón" : "renglones"}</b> de materiales sin «unidades por caja» en el maestro: no suman en unidades.
          Se corrige en <b>Maestro › Materiales</b>.
        </p>
      )}
      {H && sinHl > 0 && (
        <p className="ir-ojo">
          <b>{sinHl} {sinHl === 1 ? "renglón" : "renglones"}</b> de materiales sin «unidades por caja» o sin HL por unidad en el maestro: no suman en hectolitros.
          Se corrige en <b>Maestro › Materiales</b>.
        </p>
      )}

      {/* ---------- LA TABLA POR TIEMPO PARA VENCER Y EL MARGEN DE LA BODEGA ---------- */}
      <div className="ir-g">
        <section className="ir-card ir-tabla">
          <div className="ir-h"><h2>{Palabra} por tiempo para vencer</h2><span>{fmt(total)} {palabra} · {nf.format(r.ubicaciones)} ubicaciones</span></div>
          <div className="ir-scroll">
            <table>
              <thead><tr><th>Estado</th><th>{Palabra}</th><th>% bodega</th><th className="bar" aria-hidden /><th className="mu">Materiales · ubicaciones</th></tr></thead>
              <tbody>
                {FRANJAS.map((f) => {
                  const x = r.franjas[f.clave]; const v = pick(x.cajas, x.unidades, x.hl);
                  const filtra = ALERTAS.includes(f.clave);
                  const on = filtro === f.clave;
                  const pc = pctBodega(v);
                  return (
                    <tr key={f.clave} className={`${f.clave}${f.clave === "ok" ? " margen" : ""}${filtra ? " tocable" : ""}${on ? " on" : ""}${v === 0 ? " cero" : ""}`}
                        {...(filtra ? { tabIndex: 0, role: "button", "aria-pressed": on,
                          onClick: () => setFiltro(on ? "riesgo" : f.clave),
                          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFiltro(on ? "riesgo" : f.clave) } } } : {})}>
                      <td><span className="cat"><i />{TXT[f.clave].n}{TXT[f.clave].r && <small>{TXT[f.clave].r}</small>}</span></td>
                      <td className="cj">{fmt(v)}</td>
                      <td className="pc">{v > 0 && pc < 0.005 ? "<0,01 %" : `${pc.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}</td>
                      <td className="bar">{f.clave === "ok" ? (v > 0 ? <span className="fuera">fuera de escala</span> : null)
                        : f.clave === "sinfecha" ? null
                        : <div className="br"><i style={{ width: `${v > 0 ? Math.max(0.4, (v / maxRiesgo) * 100) : 0}%` }} /></div>}</td>
                      <td className="mu">{x.renglones > 0 ? `${nf.format(x.materiales)} · ${nf.format(x.renglones)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="ir-nota">Las barras comparan solo los estados en riesgo entre sí (la más grande es la barra llena). Toca un estado en riesgo para filtrar la lista de abajo.</p>
        </section>

        <aside className="ir-lado">
          <section className="ir-card ir-margen">
            <div className="big">
              <span className="lb">Con margen · más de 30 días</span>
              <div className="v">{pctBodega(vOk).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<small> %</small></div>
              <p className="s"><b>{fmt(vOk)}</b> de {fmt(total)} {palabra}</p>
              <div className="split" aria-hidden>
                {(["ok", "mes", "quince", "semana", "pasado", "vencido"] as Franja[]).map((k) => {
                  const v = pick(r.franjas[k].cajas, r.franjas[k].unidades, r.franjas[k].hl);
                  return v > 0 ? <i key={k} className={k} style={{ width: `${Math.max(0.6, pctBodega(v))}%` }} /> : null;
                })}
              </div>
              <div className="leg"><span>Con margen</span><span>En riesgo <b>{pctBodega(vRiesgo).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</b></span></div>
            </div>
            <div className="desg">
              <div className="vencido"><span><i />Vencido y fuera de despacho</span><b>{fmt(vF("vencido") + vF("pasado"))}</b></div>
              <div className="semana"><span><i />Sale en 0–15 días</span><b>{fmt(vF("semana") + vF("quince"))}</b></div>
              <div className="mes"><span><i />Sale en 16–30 días</span><b>{fmt(vF("mes"))}</b></div>
            </div>
            <div className="risk"><span className="lb">En riesgo · vencido a 30 días</span><b>{fmt(vRiesgo)}</b></div>
          </section>
        </aside>
      </div>

      {/* ---------- LA REFERENCIA MÁS CRÍTICA ---------- */}
      {peor && (
        <section className={"ir-ref " + peor.franja} aria-label="Referencia más crítica">
          <span className="k" aria-hidden />
          <div className="num">
            <small>REFERENCIA MÁS CRÍTICA</small>
            <b>{cant(peor.enRiesgoCajas, peor.enRiesgoUnidades, peor.enRiesgoHl)}</b>
            <small>{H ? "HECTOLITROS" : U ? "UNIDADES" : <>CAJAS{peor.enRiesgoUnidades != null && <> · {nf.format(peor.enRiesgoUnidades)} UNIDADES</>}{peor.enRiesgoHl != null && <> · {fh(peor.enRiesgoHl)} HL</>}</>}</small>
          </div>
          <div className="inf">
            <div className="t1"><span className="chip">{info(peor.franja).corto.toUpperCase()}</span><h3>{peor.nombre}</h3><span className="cod">{peor.codigo}{peor.familia ? ` · ${peor.familia}` : ""}</span></div>
            <div className="dl">
              <div>
                {(peor.sitios[0]?.dias_para_vencer ?? null) != null && peor.sitios[0].dias_para_vencer! < 0 ? "Venció"
                  : peor.diasSalir != null && peor.diasSalir < 0 ? "Debió salir" : "Sale"}
                <b>
                  {(peor.sitios[0]?.dias_para_vencer ?? null) != null && peor.sitios[0].dias_para_vencer! < 0
                    ? `hace ${nf.format(-peor.sitios[0].dias_para_vencer!)} día${peor.sitios[0].dias_para_vencer === -1 ? "" : "s"}`
                    : peor.diasSalir != null && peor.diasSalir < 0
                      ? `hace ${nf.format(-peor.diasSalir)} día${peor.diasSalir === -1 ? "" : "s"}`
                      : `en ${dias(peor.diasSalir)}`}
                  {peor.vence && <> · {corta(peor.vence)}</>}
                </b>
              </div>
              <div>Dónde está<b>{peor.sitios[0] ? (peor.sitios[0].calle && peor.sitios[0].modulo ? `${peor.sitios[0].calle}${peor.sitios[0].modulo} · módulo ${peor.sitios[0].modulo}` : peor.sitios[0].ubicacion) : "—"}</b></div>
              <div>Ubicaciones<b>{peor.sitios.length}</b></div>
              <div>De la bodega<b>{pctBodega(pick(peor.enRiesgoCajas, peor.enRiesgoUnidades, peor.enRiesgoHl)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</b></div>
            </div>
          </div>
          <div className="go"><button type="button" className="ver" onClick={() => verPeor()}>Ver ubicaciones →</button></div>
        </section>
      )}

      {/* ---------- CUÁNDO TIENE QUE SALIR ----------
          Solo cuando hay algo que sacar: con la bodega limpia es una
          rejilla de ceros que no dice nada. */}
      {r.semanas.some((s) => pick(s.cajas, s.unidades, s.hl) > 0) && (
        <section className="ir-card ir-sem-caja">
          <div className="ir-h"><h2>Calendario de salida</h2><span>{palabra} por semana de despacho</span></div>
          <div className="ir-sem" role="img" aria-label="Cantidad a despachar por semana">
            {r.semanas.map((s, i) => {
              const v = pick(s.cajas, s.unidades, s.hl);
              const t = i === 0 ? "r" : i === 1 ? "n" : i <= 3 ? "a" : "g";
              return (
                <div key={s.rot} className="col">
                  <span className="bar-e">{v > 0 && <b>{fmt(v)}</b>}<i className={v ? t : "cero"} style={{ height: v ? `${Math.max(3, (v / maxS) * 100)}%` : 3 }} /></span>
                  <span className="x">{s.rot}</span>
                </div>
              );
            })}
          </div>
          <p className="ir-dice">«Vencidas»: fecha de salida superada. «S0»: próximos 7 días; S1…: semanas siguientes.</p>
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
            {vistos.map((m) => {
              const on = abierto?.codigo === m.codigo;
              return (
                <div key={m.codigo} className={"ir-fila" + (on ? " abierta" : "")} id={"ir-" + m.codigo}>
                  <button type="button" className="ir-m" aria-expanded={on} onClick={() => setAbierto(on ? null : m)}>
                    <span className={"ir-pill " + m.franja}>{info(m.franja).corto}</span>
                    <span className="que"><b>{m.nombre}</b><small>{m.codigo}{m.familia ? ` · ${m.familia}` : ""}</small></span>
                    <span className="dato d1"><small>Sale</small><b>{dias(m.diasSalir)}</b></span>
                    <span className="dato d2"><small>Vence</small><b>{corta(m.vence)}</b></span>
                    <span className="dato d3"><small>En riesgo</small><b className={m.enRiesgoCajas ? "mal" : ""}>{cant(m.enRiesgoCajas, m.enRiesgoUnidades, m.enRiesgoHl)}</b></span>
                    <span className="dato d4"><small>Ubicaciones</small><b>{m.sitios.length}</b></span>
                    <svg className="fl" viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                  {on && (
                    <div className="ir-det" role="region" aria-label={`Dónde está ${m.nombre}`}>
                      {m.uxc ? <p className="ir-dsub">{m.uxc} unidades por caja</p> : null}
        <div className="ir-pk">
          <div><small>Total</small><b>{nf.format(m.cajas)}</b><span>cajas{m.unidades != null && ` · ${nf.format(m.unidades)} und`}{m.hl != null && ` · ${fh(m.hl)} HL`}</span></div>
          <div className={m.enRiesgoCajas ? "mal" : ""}><small>En riesgo</small><b>{nf.format(m.enRiesgoCajas)}</b><span>cajas{m.enRiesgoUnidades != null && ` · ${nf.format(m.enRiesgoUnidades)} und`}{m.enRiesgoHl != null && ` · ${fh(m.enRiesgoHl)} HL`}</span></div>
          <div><small>Ubicaciones</small><b>{m.sitios.length}</b><span>la primera en salir, arriba</span></div>
        </div>
        <div className="ir-sitios">
          {m.sitios.map((s) => (
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
                      <div><dt>Total</dt><dd><b>{nf.format(s.total_cajas)} cajas</b>{s.unidades != null && <> · {nf.format(s.unidades)} und</>}{s.hl != null && <> · {fh(s.hl)} HL</>}</dd></div>
                    </dl>
                    {(s.averia || s.pnc || s.nota) && (
                      <p className="tags">{s.averia && <span className="t">Avería</span>}{s.pnc && <span className="t">PNC</span>}{s.nota && <em>{s.nota}</em>}</p>
                    )}
                    <p className="quien">Contó {s.conto ?? "—"} · {cuando(s.contado_en)} · {s.conteo}</p>
                  </div>
          ))}
        </div>
        <div className="ir-pp">
          <button type="button" className="ir-btn" onClick={() => informe(m)} disabled={pdf}>
                  <svg viewBox="0 0 24 24" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>{pdf ? "Armando…" : "PDF de este material"}
          </button>
        </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {lista.length > 40 && !todos && <button type="button" className="ir-mas" onClick={() => setTodos(true)}>Ver los {lista.length}</button>}
      </section>

    </div>
  );
}
