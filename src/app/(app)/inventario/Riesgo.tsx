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

export function Riesgo({ r, bodega, sinContar, ultimo }: {
  r: DatosRiesgo; bodega: string; sinContar: number; ultimo: string | null;
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
          <p className="ir-frase">
            {urgentes > 0
              ? <><b className="mal">{urgentes} material{urgentes === 1 ? "" : "es"}</b> ya {urgentes === 1 ? "está vencido o no alcanza" : "están vencidos o no alcanzan"} a salir</>
              : <>Nada vencido ni pasado de salida</>}
            {semana.materiales > 0 && <> y <b>{semana.materiales}</b> {semana.materiales === 1 ? "tiene" : "tienen"} que salir esta semana</>}.
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
        <p className="ir-ojo">
          <b>{nf.format(sinContar)} módulo{sinContar === 1 ? "" : "s"} sin contar</b> en el último recorrido{ultimo && <> ({ultimo})</>}: lo que
          esté ahí no aparece en estas cifras.
        </p>
      )}
      {U && sinUxc > 0 && (
        <p className="ir-ojo">
          <b>{sinUxc} renglón{sinUxc === 1 ? "" : "es"}</b> de materiales sin «unidades por caja» en el maestro: no suman en unidades.
          Se corrige en <b>Maestro › Materiales</b>.
        </p>
      )}

      {/* ---------- LAS ALERTAS ---------- */}
      <div className="ir-alertas" role="group" aria-label="Filtrar por franja">
        {ALERTAS.map((f) => {
          const x = r.franjas[f]; const i = info(f);
          return (
            <button type="button" key={f} className={`ir-al ${f}` + (filtro === f ? " on" : "") + (x.renglones ? "" : " cero")}
                    onClick={() => setFiltro(filtro === f ? "riesgo" : f)} aria-pressed={filtro === f}>
              <span className="rot">{i.rot}</span>
              <b className="n">{cant(x.cajas, x.unidades)}</b>
              <span className="u">{U ? "unidades" : "cajas"}</span>
              <span className="s">{x.materiales} material{x.materiales === 1 ? "" : "es"} · {x.renglones} ubicaci{x.renglones === 1 ? "ón" : "ones"}</span>
            </button>
          );
        })}
      </div>

      <div className="ir-dos">
        <section className="ir-card">
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

        <section className="ir-card">
          <div className="ir-h"><h2>Cómo está la bodega</h2><span>{nf.format(total)} {U ? "unidades" : "cajas"} · {r.ubicaciones} ubicaciones</span></div>
          <div className="ir-reparto" role="img" aria-label="Reparto del inventario por franja">
            {FRANJAS.map((f) => { const v = U ? r.franjas[f.clave].unidades : r.franjas[f.clave].cajas;
              return v > 0 ? <i key={f.clave} className={f.clave} style={{ flexGrow: v }} title={`${f.rot}: ${nf.format(v)}`} /> : null })}
          </div>
          <ul className="ir-ley">
            {FRANJAS.map((f) => { const x = r.franjas[f.clave]; const v = U ? x.unidades : x.cajas;
              return (
                <li key={f.clave}><i className={f.clave} />{f.corto}<b>{nf.format(v)}</b><em>{total ? Math.round((v / total) * 100) : 0} %</em></li>
              ) })}
          </ul>
        </section>
      </div>

      {/* ---------- LOS MATERIALES ---------- */}
      <section className="ir-card">
        <div className="ir-h">
          <h2>{filtro === "riesgo" ? "Materiales en riesgo" : filtro === "todos" ? "Todos los materiales" : info(filtro).rot}</h2>
          <span>toca uno para ver dónde está</span>
        </div>
        <div className="ir-bar">
          <input type="search" placeholder="Buscar código, material o ubicación" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" />
          <div className="ir-chips">
            <button type="button" className={filtro === "riesgo" ? "on" : ""} onClick={() => setFiltro("riesgo")}>En riesgo</button>
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
                <span className="dato d4"><small>Total</small><b>{cant(m.cajas, m.unidades)}</b></span>
                <span className="dato d5"><small>Ubicaciones</small><b>{m.sitios.length}</b></span>
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
