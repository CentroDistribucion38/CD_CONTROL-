"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Accion, PorArea } from "@/modulos/acciones/datos";

/**
 * EL TABLERO DEL ARRANQUE DE TURNO.
 *
 * No es un informe: es la pantalla que se queda puesta mientras se habla.
 * Una frase arriba que dice cómo estamos; cuatro cifras; las vencidas CON
 * NOMBRE —o con «Sin asignar» en rojo, que es lo primero que hay que
 * arreglar—, filtrables por dueño; cuánto llevan vencidas, para ver si es
 * un día malo o si se están quedando quietas; y la efectividad por área.
 *
 * El reloj se pinta en el navegador y no en el servidor: la hora del
 * servidor es UTC y saldría cinco horas adelantada.
 */
const dias = (a: Accion) => Math.max(0, Math.floor(-a.horas_restantes / 24));
/** Semáforo por días de atraso: 10 o más rojo, 6–9 naranja, lo demás ámbar. */
const tono = (d: number) => (d >= 10 ? "r" : d >= 6 ? "n" : "a");
const ini = (n: string) => { const p = n.trim().split(/\s+/); return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase() };

export function Tablero({ acciones, areas, nombres, meta, puedeReportar }: {
  acciones: Accion[];
  areas: PorArea[];
  nombres: Record<string, string>;
  meta: number;
  puedeReportar: boolean;
}) {
  const [reloj, setReloj] = useState("");
  const [dia, setDia] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const poner = () => {
      const d = new Date();
      setReloj(d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }));
      setDia(d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }));
    };
    poner();
    const t = setInterval(poner, 30_000);
    return () => clearInterval(t);
  }, []);

  /* A quién le toca: la persona; si no hay, el equipo; si no, nadie. */
  const dueno = (a: Accion) => a.responsable ? (nombres[a.responsable] ?? "Sin nombre") : a.equipo_nombre ?? null;

  const vencidas = useMemo(() => acciones.filter((a) => a.vencida)
    .sort((a, b) => a.horas_restantes - b.horas_restantes), [acciones]);
  const sinDueno = vencidas.filter((a) => !dueno(a));
  const criticas = acciones.filter((a) => a.viva && a.prioridad === "alta").length;
  const finDelDia = new Date(); finDelDia.setHours(23, 59, 59, 999);
  const vencenHoy = acciones.filter((a) => a.viva && !a.vencida && new Date(a.vence_en) <= finDelDia).length;
  const verificadas = acciones.filter((a) => a.estado === "verificada").length;
  const efectivas = acciones.filter((a) => a.efectiva).length;
  const pct = verificadas ? Math.round((efectivas / verificadas) * 100) : null;
  const masVieja = vencidas.length ? dias(vencidas[0]) : 0;

  /* LOS DUEÑOS de las vencidas, para los filtros: los que más tienen primero. */
  const duenos = [...vencidas.reduce((m, a) => { const d = dueno(a); if (d) m.set(d, (m.get(d) ?? 0) + 1); return m }, new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, 4);
  const lista = filtro === "todas" ? vencidas : filtro === "sin" ? sinDueno : vencidas.filter((a) => dueno(a) === filtro);
  const maxD = Math.max(1, ...vencidas.map(dias));

  /* CUÁNTO LLEVAN VENCIDAS: una barra por día de atraso (hasta 14; lo de
     más va junto en «14+»). */
  const tope = Math.min(14, Math.max(10, maxD));
  const hist = Array.from({ length: tope }, (_, i) => {
    const d = i + 1;
    return { d, rot: d === tope && maxD > tope ? `${tope}+` : String(d),
      n: vencidas.filter((a) => { const x = Math.max(1, dias(a)); return d === tope ? x >= d : x === d }).length };
  });
  const maxH = Math.max(1, ...hist.map((h) => h.n));
  const quietas = vencidas.filter((a) => dias(a) >= 7).length;

  async function reunion() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await caja.current?.requestFullscreen?.();
    } catch { /* sin pantalla completa, la página sigue igual */ }
  }

  return (
    <div className="ac-tv at" ref={caja}>
      <div className="at-top">
        <div>
          <p className="at-o">ACCIONES CORRECTIVAS · CD38 AG01 · ARRANQUE DE TURNO</p>
          <h1>Acciones correctivas</h1>
          <p className="at-frase">
            {vencidas.length === 0 ? <>Ninguna vencida. Así se ve un tablero al día.</> : <>
              <b className="mal">{vencidas.length} vencida{vencidas.length === 1 ? "" : "s"}</b>
              {sinDueno.length ? ` y ${sinDueno.length} no ${sinDueno.length === 1 ? "tiene" : "tienen"} responsable` : ", todas con responsable"}.
              {" "}La más vieja lleva {masVieja} día{masVieja === 1 ? "" : "s"}.</>}
          </p>
        </div>
        <div className="at-der">
          <div className="at-reloj"><b>{reloj || "—"}</b><span>{dia}</span></div>
          <button type="button" className="at-btn sec" onClick={reunion}>
            <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>Modo reunión
          </button>
          {puedeReportar && (
            <button type="button" className="at-btn" onClick={() => window.dispatchEvent(new Event("ac:reportar"))}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" /></svg>Reportar
            </button>
          )}
        </div>
      </div>

      <div className="at-kpis">
        <div className={"at-card at-k" + (vencidas.length ? " mal" : " bien")}>
          <span className="ic"><svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></svg></span>
          <div><b className="n">{vencidas.length}</b><span className="l">Vencidas</span>
            <span className="s">{vencidas.length ? `la más vieja, ${masVieja} día${masVieja === 1 ? "" : "s"}` : "ninguna se pasó del plazo"}</span></div>
        </div>
        <div className={"at-card at-k" + (criticas ? " mal" : " bien")}>
          <span className="ic"><svg viewBox="0 0 24 24"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.8 2.5-5 .3 1.6 1 2.5 2 3 .2-3-.5-5.5.5-8z" /></svg></span>
          <div><b className="n">{criticas}</b><span className="l">Críticas abiertas</span><span className="s">prioridad alta sin cerrar</span></div>
        </div>
        <div className="at-card at-k ojo">
          <span className="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg></span>
          <div><b className="n">{vencenHoy}</b><span className="l">Vencen hoy</span><span className="s">antes de las 23:59</span></div>
        </div>
        <div className={"at-card at-k anillo" + (pct === null ? "" : pct >= meta ? " bien" : " mal")}>
          <svg className="aro" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="26" className="fondo" />
            <circle cx="32" cy="32" r="26" className="valor" strokeDasharray={`${((pct ?? 0) / 100) * 163.4} 163.4`} transform="rotate(-90 32 32)" />
          </svg>
          <div><b className="n">{pct === null ? "—" : `${pct}%`}</b><span className="l">Efectividad</span>
            <span className="s">{pct === null ? "todavía no se ha verificado nada" : `meta ${meta} % · de ${verificadas} verificada${verificadas === 1 ? "" : "s"}`}</span></div>
        </div>
      </div>

      <div className="at-cuerpo">
        <section className="at-card">
          <div className="at-h"><h2>Vencidas · hay que hablar de estas</h2><span>la más vieja arriba</span></div>
          {vencidas.length > 0 && (
            <div className="at-chips" role="group" aria-label="Filtrar vencidas">
              <button type="button" className={"todas" + (filtro === "todas" ? " on" : "")} onClick={() => setFiltro("todas")}>Todas <em>{vencidas.length}</em></button>
              {sinDueno.length > 0 && <button type="button" className={"sin" + (filtro === "sin" ? " on" : "")} onClick={() => setFiltro("sin")}>Sin asignar <em>{sinDueno.length}</em></button>}
              {duenos.map(([d, n]) => <button type="button" key={d} className={filtro === d ? "on" : ""} onClick={() => setFiltro(d)}>{d} <em>{n}</em></button>)}
            </div>
          )}
          {vencidas.length === 0 ? (
            <p className="at-vacio">Ninguna vencida. Es la primera vez que esta pantalla no tiene nada que decir, y eso es exactamente lo que se buscaba.</p>
          ) : (
            <div className="at-lista">
              {lista.map((a) => {
                const d = dias(a); const q = dueno(a);
                return (
                  <div className="at-v" key={a.id}>
                    <span className="cod">{a.codigo}</span>
                    <span className="que"><b>{a.titulo}</b><small>{a.area_nombre}</small></span>
                    <span className={"at-quien" + (q ? "" : " sin")}>
                      {q ? <i>{ini(q)}</i> : <i aria-hidden>!</i>}{q ?? "Sin asignar"}
                    </span>
                    <span className="barra" aria-hidden><i className={tono(d)} style={{ width: `${Math.max(6, (d / maxD) * 100)}%` }} /></span>
                    <span className={"dd " + tono(d)}><b>{d || "<1"}</b><small>día{d === 1 ? "" : "s"}</small></span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="at-lado">
          <section className="at-card">
            <div className="at-h"><h2>Cuánto llevan vencidas</h2><span>acciones por días de atraso</span></div>
            <div className="at-hist" role="img" aria-label="Cantidad de acciones vencidas por días de atraso">
              {hist.map((h) => (
                <div key={h.d} className="col">
                  <span className="bar-e">
                    {h.n > 0 && <b>{h.n}</b>}
                    <i className={h.n ? tono(h.d) : "cero"} style={{ height: h.n ? `${(h.n / maxH) * 100}%` : 3 }} />
                  </span>
                  <span className="x">{h.rot}</span>
                </div>
              ))}
            </div>
            <p className="at-dice">
              {vencidas.length === 0 ? "Nada vencido." : quietas * 2 > vencidas.length
                ? <><b className="mal">{quietas} de las {vencidas.length}</b> llevan una semana o más. No es un día malo: se están quedando quietas.</>
                : <><b>{vencidas.length - quietas} de las {vencidas.length}</b> son de esta semana: todavía se alcanzan a sacar.</>}
            </p>
          </section>

          <section className="at-card">
            <div className="at-h"><h2>Efectividad por área</h2><span>efectivas sobre verificadas</span></div>
            <div className="at-areas">
              {[...areas].sort((a, b) => (b.verificadas || 0) - (a.verificadas || 0)).map((x) => (
                <div key={x.area} className={"at-ar" + (x.pct === null ? " nd" : x.pct >= meta ? " bien" : " mal")}>
                  <div className="at-fila"><b>{x.area_nombre}</b><span>{x.pct === null ? "sin verificar" : `${x.pct} %`}</span></div>
                  {x.pct !== null && <>
                    <span className="riel" aria-hidden><i style={{ width: `${x.pct}%` }} /></span>
                    <small>{x.efectivas} de {x.verificadas} verificada{x.verificadas === 1 ? "" : "s"}</small>
                  </>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
