"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Accion, AntesDespues, Zona } from "@/modulos/acciones/datos";
import { medir, horas, MIN_MEDIR, type Medida, type Metas } from "@/modulos/acciones/medir";
import { informePdf } from "./informe";

/**
 * LOS INDICADORES DE ACCIONES.
 *
 * Arriba lo que se pregunta en toda reunión —¿cuántas abiertas?, ¿a
 * tiempo?, ¿sirvieron?— con su meta al lado; debajo el porqué: tendencia,
 * tiempos, antigüedad, dónde se repite, quién las tiene. Todo con su
 * número exacto: cada barra lleva la cifra, no hay que adivinarla.
 *
 * MODO REUNIÓN: pantalla completa y va pasando solo de un bloque a otro,
 * para dejarlo puesto en el televisor del arranque de turno.
 */
const PERIODOS = [30, 90, 180] as const;
const BLOQUES = [
  { k: "resumen", rot: "Resumen" }, { k: "tendencia", rot: "Tendencia" }, { k: "mapa", rot: "Mapa" },
  { k: "pareto", rot: "Qué sale" }, { k: "gente", rot: "Responsables" }, { k: "antes", rot: "Antes y después" },
] as const;
const nf = (n: number) => n.toLocaleString("es-CO");

export function Indicadores({ acciones, nombres, zonas, metas, fotos, ahora }: {
  acciones: Accion[]; nombres: Record<string, string>; zonas: Zona[];
  metas: Metas; fotos: AntesDespues[]; ahora: string;
}) {
  const [dias, setDias] = useState<number>(90);
  const [reunion, setReunion] = useState(false);
  const [bloque, setBloque] = useState(0);
  const [pdf, setPdf] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const hoy = useMemo(() => new Date(ahora), [ahora]);
  const m = useMemo(() => medir(acciones, hoy, dias, metas, nombres), [acciones, hoy, dias, metas, nombres]);

  /* El modo reunión va pasando solo cada 15 s. */
  useEffect(() => {
    if (!reunion) return;
    const tm = setInterval(() => setBloque((b) => (b + 1) % BLOQUES.length), 15_000);
    return () => clearInterval(tm);
  }, [reunion]);
  useEffect(() => {
    const salir = () => { if (!document.fullscreenElement) setReunion(false) };
    document.addEventListener("fullscreenchange", salir);
    return () => document.removeEventListener("fullscreenchange", salir);
  }, []);
  async function entrarReunion() {
    setBloque(0); setReunion(true);
    try { await caja.current?.requestFullscreen?.() } catch { /* sin pantalla completa, igual rota */ }
  }
  async function salirReunion() {
    setReunion(false);
    if (document.fullscreenElement) try { await document.exitFullscreen() } catch { /* nada */ }
  }
  async function bajarPdf() {
    setPdf(true);
    try { await informePdf(m, hoy) } finally { setPdf(false) }
  }

  const ver = (k: string) => !reunion || BLOQUES[bloque].k === k;

  return (
    <div ref={caja} className={"ai" + (reunion ? " reunion" : "")}>
      <header className="ai-cab">
        <div>
          <p className="ai-ojo">ACCIONES · INDICADORES</p>
          <h1>¿Cómo vamos?</h1>
          <p className="ai-sub">Últimos {dias} días · {nf(m.kpis.reportadas)} reportadas · {nf(m.kpis.cerradas)} cerradas</p>
        </div>
        <div className="ai-herr">
          {!reunion && (
            <div className="ai-seg" role="group" aria-label="Periodo">
              {PERIODOS.map((p) => (
                <button key={p} type="button" className={dias === p ? "on" : ""} aria-pressed={dias === p}
                        onClick={() => setDias(p)}>{p} días</button>
              ))}
            </div>
          )}
          {!reunion && <button type="button" className="ai-btn sec" onClick={bajarPdf} disabled={pdf}>{pdf ? "Armando…" : "Informe PDF"}</button>}
          {reunion
            ? <button type="button" className="ai-btn sec" onClick={salirReunion}>Salir</button>
            : <button type="button" className="ai-btn" onClick={entrarReunion}>Modo reunión</button>}
        </div>
      </header>

      {reunion && (
        <nav className="ai-puntos" aria-label="Bloques">
          {BLOQUES.map((b, i) => (
            <button key={b.k} type="button" className={i === bloque ? "on" : ""} onClick={() => setBloque(i)}>{b.rot}</button>
          ))}
        </nav>
      )}

      {ver("resumen") && <Resumen m={m} />}
      {ver("tendencia") && <Tendencia m={m} />}
      {ver("mapa") && <Mapa m={m} zonas={zonas} />}
      {ver("pareto") && <Pareto m={m} />}
      {ver("gente") && <Responsables m={m} />}
      {ver("antes") && <Antes fotos={fotos} />}
    </div>
  );
}

/* ===================================================================== */
function Resumen({ m }: { m: Medida }) {
  const k = m.kpis;
  const delta = k.abiertas - k.abiertasAntes;
  return (
    <section className="ai-bloque" data-bloque="resumen">
      <div className="ai-kpis">
        <Kpi rot="ABIERTAS" n={nf(k.abiertas)} tono={k.vencidas ? "ojo" : "bien"}
             pie={<>{delta === 0 ? "igual que" : delta > 0 ? `▲ ${delta} más que` : `▼ ${-delta} menos que`} hace {m.dias} días</>} />
        <Kpi rot="VENCIDAS" n={nf(k.vencidas)} tono={k.vencidas ? "mal" : "bien"}
             pie={k.vencidas ? "hay que hablar de estas" : "ninguna fuera de plazo"} />
        <Kpi rot="CERRADAS A TIEMPO" n={k.aTiempo === null ? "—" : `${k.aTiempo}%`} meta={k.metas.aTiempo} valor={k.aTiempo}
             pie={`meta ${k.metas.aTiempo}% · ${nf(k.cerradas)} cerradas`} />
        <Kpi rot="EFECTIVIDAD" n={k.efectividad === null ? "—" : `${k.efectividad}%`} meta={k.metas.efectividad} valor={k.efectividad}
             pie={k.efectividad === null ? `${k.verificadas} verificada${k.verificadas === 1 ? "" : "s"} · faltan ${MIN_MEDIR - k.verificadas} para medir`
               : <>meta {k.metas.efectividad}% · real <b>{m.reincidencia.real === null ? "—" : `${m.reincidencia.real}%`}</b></>} />
        <Kpi rot="TIEMPO DE CIERRE" n={horas(k.cierreMedianaH)} tono="neutro" pie="mediana, del reporte al cierre" />
      </div>

      <div className="ai-dos">
        <div className="ai-caja">
          <h2>Tiempos por prioridad <em>contra su plazo</em></h2>
          <Tiempos m={m} />
        </div>
        <div className="ai-caja">
          <h2>Antigüedad de lo abierto <em>{nf(k.abiertas)} abiertas</em></h2>
          <Antiguedad m={m} />
        </div>
      </div>
    </section>
  );
}

function Kpi({ rot, n, pie, tono, meta, valor }: {
  rot: string; n: string; pie: React.ReactNode; tono?: "bien" | "ojo" | "mal" | "neutro"; meta?: number; valor?: number | null;
}) {
  const t = tono ?? (valor === null || valor === undefined || meta === undefined ? "neutro"
    : valor >= meta ? "bien" : valor >= meta - 10 ? "ojo" : "mal");
  return (
    <div className={"ai-kpi " + t}>
      <div className="rot">{rot}</div>
      <div className="n">{n}</div>
      {meta !== undefined && (
        <div className="ai-meta" aria-hidden>
          <i style={{ width: `${Math.min(100, valor ?? 0)}%` }} />
          <b style={{ left: `${meta}%` }} />
        </div>
      )}
      <div className="pie">{pie}</div>
    </div>
  );
}

function Tiempos({ m }: { m: Medida }) {
  const max = Math.max(1, ...m.tiempos.flatMap((x) => [x.cerrarP90H ?? 0, x.plazoH ?? 0, x.cerrarH ?? 0]));
  const P = { alta: "Alta", media: "Media", baja: "Baja" } as const;
  return (
    <div className="ai-tiempos">
      {m.tiempos.map((x) => {
        const pasa = x.cerrarH !== null && x.plazoH !== null && x.cerrarH > x.plazoH;
        return (
          <div className="ai-tp" key={x.prioridad}>
            <div className="ai-tp-cab">
              <b>{P[x.prioridad]}</b>
              <span>plazo {horas(x.plazoH)} · {x.n} cerradas</span>
              <em className={x.aTiempo === null ? "" : x.aTiempo >= 90 ? "bien" : x.aTiempo >= 75 ? "ojo" : "mal"}>
                {x.aTiempo === null ? "—" : `${x.aTiempo}% a tiempo`}</em>
            </div>
            <div className="ai-tp-pista">
              {x.cerrarP90H !== null && <span className="p90" style={{ width: `${(x.cerrarP90H / max) * 100}%` }} />}
              {x.cerrarH !== null && <span className={"med" + (pasa ? " pasa" : "")} style={{ width: `${(x.cerrarH / max) * 100}%` }} />}
              {x.plazoH !== null && <span className="plazo" style={{ left: `${(x.plazoH / max) * 100}%` }} title="Plazo" />}
            </div>
            <div className="ai-tp-num">
              <span>Asignar <b>{horas(x.asignarH)}</b></span>
              <span>Cerrar <b>{horas(x.cerrarH)}</b></span>
              <span>El 90 % en <b>{horas(x.cerrarP90H)}</b></span>
              <span>Verificar <b>{horas(x.verificarH)}</b></span>
            </div>
          </div>
        );
      })}
      <p className="ai-ley"><i className="med" /> mediana del cierre <i className="p90" /> el 90 % cierra antes de aquí <i className="plazo" /> plazo</p>
    </div>
  );
}

function Antiguedad({ m }: { m: Medida }) {
  const max = Math.max(1, ...m.franjas.map((f) => f.n));
  return (
    <div className="ai-edad">
      {m.franjas.map((f) => (
        <div className="ai-edad-f" key={f.rot}>
          <span className="rot">{f.rot}</span>
          <span className="pista">
            <i className="en" style={{ width: `${((f.n - f.vencidas) / max) * 100}%` }} />
            <i className="ven" style={{ width: `${(f.vencidas / max) * 100}%` }} />
          </span>
          <b>{f.n}</b>
        </div>
      ))}
      <p className="ai-ley"><i className="en" /> en plazo <i className="ven" /> vencidas</p>
    </div>
  );
}

/* ===================================================================== */
function Tendencia({ m }: { m: Medida }) {
  const s = m.semanas;
  const W = 760, H = 300, iz = 34, de = 14, ar = 30, ab = 34;
  const max = Math.max(4, ...s.flatMap((x) => [x.entran, x.cierran, x.quedan]));
  const tope = Math.ceil(max / 4) * 4;
  const ancho = (W - iz - de) / s.length;
  const y = (v: number) => ar + (H - ar - ab) * (1 - v / tope);
  const barra = Math.max(3, Math.min(16, ancho / 2 - 4));
  const linea = s.map((x, i) => `${iz + ancho * i + ancho / 2},${y(x.quedan)}`).join(" ");
  const cada = Math.ceil(s.length / 6);
  const ult = s[s.length - 1], pen = s[s.length - 2];
  const baja = ult && pen && ult.quedan < pen.quedan;
  return (
    <section className="ai-bloque" data-bloque="tendencia">
      <div className="ai-caja">
        <h2>Entran contra salen, semana a semana
          <em className={baja ? "bien" : "mal"}>{baja ? "el pendiente baja" : "el pendiente no baja"}</em></h2>
        <div className="ai-graf">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Acciones que entran, que se cierran y las que quedan abiertas por semana">
            {[0, .25, .5, .75, 1].map((f) => (
              <g key={f}>
                <line x1={iz} x2={W - de} y1={y(tope * f)} y2={y(tope * f)} className="rej" />
                <text x={iz - 6} y={y(tope * f) + 4} className="eje" textAnchor="end">{Math.round(tope * f)}</text>
              </g>
            ))}
            {s.map((x, i) => {
              const cx = iz + ancho * i + ancho / 2;
              return (
                <g key={x.desde}>
                  <rect x={cx - barra - 1} y={y(x.entran)} width={barra} height={Math.max(0, y(0) - y(x.entran))} rx={2} className="entran">
                    <title>{`Semana del ${x.etiqueta}: entran ${x.entran}`}</title></rect>
                  <rect x={cx + 1} y={y(x.cierran)} width={barra} height={Math.max(0, y(0) - y(x.cierran))} rx={2} className="cierran">
                    <title>{`Semana del ${x.etiqueta}: se cierran ${x.cierran}`}</title></rect>
                  {i % cada === 0 && <text x={cx} y={H - ab + 16} className="eje" textAnchor="middle">{x.etiqueta}</text>}
                </g>
              );
            })}
            <polyline points={linea} className="quedan" />
            {s.map((x, i) => (
              <circle key={x.desde} cx={iz + ancho * i + ancho / 2} cy={y(x.quedan)} r={i === s.length - 1 ? 5 : 3} className="quedan-p">
                <title>{`Abiertas al cierre de la semana del ${x.etiqueta}: ${x.quedan}`}</title></circle>
            ))}
            {ult && <text x={iz + ancho * (s.length - 1) + ancho / 2} y={y(ult.quedan) - 10} className="val" textAnchor="middle">{ult.quedan}</text>}
          </svg>
        </div>
        <p className="ai-ley"><i className="entran" /> entran <i className="cierran" /> se cierran <i className="quedan" /> abiertas al final de la semana</p>
      </div>
    </section>
  );
}

/* ===================================================================== */
function Mapa({ m, zonas }: { m: Medida; zonas: Zona[] }) {
  const porCod = new Map(m.zonas.map((z) => [z.codigo, z]));
  const max = Math.max(1, ...m.zonas.map((z) => z.total + z.vivas));
  const calor = (n: number) => Math.min(1, n / max);
  const conXY = zonas.filter((z) => z.lat !== null && z.lng !== null);
  const usarPlano = conXY.length >= 3;
  const r = m.reincidencia;
  return (
    <section className="ai-bloque" data-bloque="mapa">
      <div className="ai-dos ancho-iz">
        <div className="ai-caja">
          <h2>Mapa de calor de la bodega <em>{usarPlano ? "cada zona en su sitio" : "por zona"}</em></h2>
          {usarPlano ? <Plano zonas={conXY} porCod={porCod} calor={calor} /> : (
            <div className="ai-zonas">
              {zonas.map((z) => {
                const d = porCod.get(z.codigo);
                const c = d ? calor(d.total + d.vivas) : 0;
                return (
                  <div key={z.codigo} className={"ai-zona" + (c > .55 ? " fuerte" : "")}
                       style={{ ["--c" as string]: c }} title={`${z.nombre}: ${d?.total ?? 0} en el periodo · ${d?.vivas ?? 0} abiertas`}>
                    <b>{z.codigo}</b>
                    <span>{z.nombre}</span>
                    <em>{d?.total ?? 0}{d?.repeticiones ? <i> · ↻{d.repeticiones}</i> : null}</em>
                  </div>
                );
              })}
            </div>
          )}
          <p className="ai-ley"><i className="calor0" /> nada <i className="calor1" /> más acciones · ↻ veces que la misma falla volvió antes de 30 días</p>
        </div>
        <div className="ai-caja">
          <h2>¿Sirvió lo que se hizo?</h2>
          <div className="ai-rein">
            <div><b>{r.real === null ? "—" : `${r.real}%`}</b><span>efectividad real<br />(no se repitió en 30 días)</span></div>
            <div><b>{r.repeticiones}</b><span>veces volvió la misma falla a la misma zona</span></div>
            <div><b>{r.noEfectivas}</b><span>verificadas como no efectivas</span></div>
            <div><b>{r.reabiertas}</b><span>reabiertas ahora</span></div>
          </div>
          {r.repiten.length > 0 && <>
            <h3>Dónde se repite</h3>
            <ol className="ai-rep">
              {r.repiten.slice(0, 6).map((x) => (
                <li key={x.motivo + x.zona}><b>{x.motivo}</b><span>{x.zona}</span><em>{x.n} veces{x.abiertas ? ` · ${x.abiertas} abiertas` : ""}</em></li>
              ))}
            </ol>
          </>}
        </div>
      </div>
    </section>
  );
}

function Plano({ zonas, porCod, calor }: {
  zonas: Zona[]; porCod: Map<string, Medida["zonas"][number]>; calor: (n: number) => number;
}) {
  const W = 640, H = 380, pad = 44;
  const xs = zonas.map((z) => Number(z.lng)), ys = zonas.map((z) => Number(z.lat));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const px = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - pad * 2);
  const py = (v: number) => H - pad - ((v - y0) / (y1 - y0 || 1)) * (H - pad * 2);
  return (
    <div className="ai-graf">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Plano de la bodega con las zonas coloreadas por cantidad de acciones">
        <rect x={8} y={8} width={W - 16} height={H - 16} rx={6} className="piso" />
        {zonas.map((z) => {
          const d = porCod.get(z.codigo); const c = d ? calor(d.total + d.vivas) : 0;
          const r = 14 + c * 26;
          return (
            <g key={z.codigo}>
              <circle cx={px(Number(z.lng))} cy={py(Number(z.lat))} r={r + 8} className="halo" style={{ opacity: c * .35 }} />
              <circle cx={px(Number(z.lng))} cy={py(Number(z.lat))} r={r} className="pto" style={{ ["--c" as string]: c }}>
                <title>{`${z.nombre}: ${d?.total ?? 0} en el periodo · ${d?.vivas ?? 0} abiertas`}</title></circle>
              <text x={px(Number(z.lng))} y={py(Number(z.lat)) + 4} textAnchor="middle" className={"lbl" + (c > .55 ? " claro" : "")}>{z.codigo}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ===================================================================== */
function Pareto({ m }: { m: Medida }) {
  const p = m.pareto.slice(0, 10);
  const max = Math.max(1, ...p.map((x) => x.n));
  return (
    <section className="ai-bloque" data-bloque="pareto">
      <div className="ai-caja">
        <h2>Qué es lo que más sale
          <em>{m.corte80 >= 0 ? `${m.corte80 + 1} de ${m.pareto.length} motivos hacen el 80 %` : "sin datos en el periodo"}</em></h2>
        <div className="ai-pareto">
          {p.map((x, i) => (
            <div key={x.motivo} className={"ai-par" + (i <= m.corte80 ? " vital" : "")}>
              <span className="rot">{x.motivo}</span>
              <span className="pista"><i style={{ width: `${(x.n / max) * 100}%` }} /></span>
              <b>{x.n}</b>
              <em>{x.acumulado}%</em>
            </div>
          ))}
          {p.length === 0 && <p className="ai-vacio">No se reportó nada en este periodo.</p>}
        </div>
        <p className="ai-ley"><i className="vital" /> los pocos que hacen el 80 % —ahí va el esfuerzo · la última columna es el acumulado</p>
      </div>
    </section>
  );
}

/* ===================================================================== */
function Responsables({ m }: { m: Medida }) {
  const max = Math.max(1, ...m.responsables.map((r) => r.carga));
  return (
    <section className="ai-bloque" data-bloque="gente">
      <div className="ai-caja">
        <h2>Quién las tiene <em>se mide a quien las resuelve, no a quien reporta</em></h2>
        <div className="ai-tabla-env">
          <table className="ai-tabla">
            <thead><tr><th>Responsable</th><th>Abiertas</th><th className="n">Vencidas</th><th className="n">Cerradas</th>
              <th className="n">A tiempo</th><th className="n">Efectividad</th><th className="n">Cierra en</th></tr></thead>
            <tbody>
              {m.responsables.map((r) => (
                <tr key={r.clave}>
                  <td><span className={"ai-sem " + r.semaforo} aria-label={r.semaforo === "bien" ? "Bien" : r.semaforo === "ojo" ? "Ojo" : "Mal"} />
                    <b>{r.nombre}</b>{r.equipo && <small>{r.equipo}</small>}</td>
                  <td><span className="ai-carga"><i style={{ width: `${(r.carga / max) * 100}%` }} /></span><b className="cg">{r.carga}</b></td>
                  <td className={"n" + (r.vencidas ? " mal" : "")}>{r.vencidas}</td>
                  <td className="n">{r.cerradas}</td>
                  <td className="n">{r.aTiempo === null ? "—" : `${r.aTiempo}%`}</td>
                  <td className="n">{r.efectividad === null ? "—" : `${r.efectividad}%`}</td>
                  <td className="n">{horas(r.cierreH)}</td>
                </tr>
              ))}
              {m.responsables.length === 0 && <tr><td colSpan={7} className="ai-vacio">Nadie tiene acciones en este periodo.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="ai-ley"><span className="ai-sem bien" /> al día <span className="ai-sem ojo" /> algo vencido o bajo la meta <span className="ai-sem mal" /> 3+ vencidas o muy bajo la meta</p>
      </div>
    </section>
  );
}

/* ===================================================================== */
function Antes({ fotos }: { fotos: AntesDespues[] }) {
  return (
    <section className="ai-bloque" data-bloque="antes">
      <div className="ai-caja">
        <h2>Antes y después <em>las últimas verificadas con foto del hallazgo y del cierre</em></h2>
        {fotos.length === 0 ? <p className="ai-vacio">Todavía no hay acciones verificadas con las dos fotos.</p> : (
          <div className="ai-fotos">
            {fotos.map((f) => (
              <figure key={f.id} className="ai-foto">
                <div className="par">
                  <span>{f.antes && <img src={f.antes} alt={`Antes: ${f.titulo}`} loading="lazy" />}<i>ANTES</i></span>
                  <span>{f.despues && <img src={f.despues} alt={`Después: ${f.titulo}`} loading="lazy" />}<i className="d">DESPUÉS</i></span>
                </div>
                <figcaption><b>{f.codigo}</b> {f.titulo}<small>{f.donde}{f.efectiva ? " · efectiva" : ""}</small></figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
