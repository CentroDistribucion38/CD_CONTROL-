"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import {
  conUnidad, diaCorto, etapaDe,
  type Accion, type Analisis, type Disparador, type Etapa, type Indicador, type Proceso, type Turno,
} from "@/modulos/gestion/semaforo";
import { descartarDisparador } from "../actions";
import { SoloVer } from "../comunes";
import { cerrarDisparador, guardarAccion, guardarAnalisis, marcarAccion, quitarAccion } from "./actions";

type Vista = "pendientes" | "analisis" | "cerrados" | "todos";
const ETAPA: Record<Etapa, string> = { pendiente: "Pendiente", analisis: "En análisis", cerrado: "Cerrado", descartado: "Descartado" };
const hace = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`;
};
const PREGUNTA = ["¿Por qué no se cumplió la meta?", "¿Por qué pasó lo anterior?", "¿Por qué?", "¿Por qué?", "¿Por qué?"];
const porquesDe = (a?: Analisis | null) => (a ? [a.porque1, a.porque2, a.porque3, a.porque4, a.porque5] : ["", "", "", "", ""]);

export function Disparadores({ turnos, procesos, indicadores, disparadores, analisis, acciones, puedeEditar, hoy, faltaSql }: {
  turnos: Turno[]; procesos: Proceso[]; indicadores: Indicador[]; disparadores: Disparador[];
  analisis: Analisis[]; acciones: Accion[]; puedeEditar: boolean; hoy: string; faltaSql: boolean;
}) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const ind = useMemo(() => new Map(indicadores.map((i) => [i.id, i])), [indicadores]);
  const tur = useMemo(() => new Map(turnos.map((t) => [t.id, t])), [turnos]);
  const pro = useMemo(() => new Map(procesos.map((p) => [p.id, p.nombre])), [procesos]);
  const anPor = useMemo(() => new Map(analisis.map((a) => [a.disparador_id, a])), [analisis]);
  const accPor = useMemo(() => {
    const m = new Map<string, Accion[]>();
    for (const a of acciones) { const x = m.get(a.disparador_id); x ? x.push(a) : m.set(a.disparador_id, [a]) }
    return m;
  }, [acciones]);
  const etapa = (d: Disparador) => etapaDe(d, anPor.has(d.id));

  const n = (e: Etapa) => disparadores.filter((d) => etapa(d) === e).length;
  const vencidas = acciones.filter((a) => a.estado === "abierta" && a.fecha_limite < hoy
    && disparadores.some((d) => d.id === a.disparador_id && d.estado === "activo")).length;

  /* La pestaña de arranque: lo que hay por atender. */
  const v: Vista = vista ?? (n("pendiente") ? "pendientes" : n("analisis") ? "analisis" : "todos");
  const lista = disparadores.filter((d) => {
    const e = etapa(d);
    return v === "todos" ? true : v === "pendientes" ? e === "pendiente" : v === "analisis" ? e === "analisis" : e === "cerrado" || e === "descartado";
  });
  const actual = lista.find((d) => d.id === sel) ?? lista[0] ?? null;

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · DISPARADORES</p>
          <h1>Disparadores</h1>
          <p className="sub">
            Cuando un indicador no cumple la meta las veces seguidas que dice su regla, salta un disparador y queda <b>pendiente</b>.
            De ahí se toma, se hace el <b>5 Why</b> hasta la causa raíz, se arma el <b>plan de acción</b> y se cierra cuando todo está hecho.
          </p>
        </div>
      </section>

      {!puedeEditar && <SoloVer />}
      {faltaSql && (
        <p className="gs-solover">Falta crear las tablas del 5 Why: corre <b>supabase/migraciones/2026-10-gestion-5why-plan.sql</b> en Supabase.</p>
      )}

      <div className="gs-cifras c4">
        <div className={"gs-cif" + (n("pendiente") ? " mal" : " bien")}><span>Pendientes</span><b>{n("pendiente")}</b></div>
        <div className="gs-cif"><span>En análisis</span><b>{n("analisis")}</b></div>
        <div className={"gs-cif" + (vencidas ? " mal" : "")}><span>Acciones vencidas</span><b>{vencidas}</b></div>
        <div className="gs-cif"><span>Cerrados</span><b>{n("cerrado")}</b></div>
      </div>

      <div className="gs-chips" role="group" aria-label="Ver">
        {([["pendientes", "Pendientes"], ["analisis", "En análisis"], ["cerrados", "Cerrados y descartados"], ["todos", "Todos"]] as [Vista, string][]).map(([k, t]) => (
          <button key={k} type="button" className={v === k ? "on" : ""} onClick={() => { setVista(k); setSel(null) }}>{t}</button>
        ))}
      </div>

      {!lista.length ? (
        <p className="gs-vacio">
          {v === "pendientes" ? "No hay disparadores pendientes. Cuando un indicador no cumpla la meta según su regla, aparece aquí." : "Nada por mostrar."}
        </p>
      ) : (
        <div className="gp">
          <ul className="gp-lista">
            {lista.map((d) => {
              const i = ind.get(d.indicador_id), a = anPor.get(d.id), e = etapa(d);
              const pq = porquesDe(a).filter(Boolean).length, ac = accPor.get(d.id) ?? [];
              return (
                <li key={d.id}>
                  <button type="button" className={"gp-item " + e + (actual?.id === d.id ? " sel" : "")} onClick={() => setSel(d.id)}>
                    <span className={"gp-pill " + e}>{ETAPA[e]}</span>
                    <b className="gp-nom">{i?.nombre ?? "Indicador eliminado"}</b>
                    <small><span className="mono">{i?.codigo ?? "—"}</span> · saltó {hace(d.creado_en)}</small>
                    {(e === "analisis" || e === "cerrado") && (
                      <small className="gp-prog">5 Why {pq}/5{ac.length ? ` · acciones ${ac.filter((x) => x.estado === "hecha").length}/${ac.length}` : ""}</small>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {actual && (
            <Panel
              key={actual.id + (anPor.get(actual.id)?.actualizado_en ?? "-")}
              d={actual} i={ind.get(actual.indicador_id)} etapa={etapa(actual)}
              proceso={ind.get(actual.indicador_id)?.proceso_id ? pro.get(ind.get(actual.indicador_id)!.proceso_id!) : undefined}
              turno={actual.turno_id ? tur.get(actual.turno_id) : undefined}
              an={anPor.get(actual.id) ?? null} acciones={accPor.get(actual.id) ?? []} puedeEditar={puedeEditar && !faltaSql} hoy={hoy}
            />
          )}
        </div>
      )}
    </>
  );
}

function Panel({ d, i, etapa, proceso, turno, an, acciones, puedeEditar, hoy }: {
  d: Disparador; i?: Indicador; etapa: Etapa; proceso?: string; turno?: Turno; an: Analisis | null; acciones: Accion[]; puedeEditar: boolean; hoy: string;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pend, start] = useTransition();
  const [resp, setResp] = useState(an?.responsable ?? "");
  const [pq, setPq] = useState<string[]>(porquesDe(an));
  const [raiz, setRaiz] = useState(an?.causa_raiz ?? "");
  const [nueva, setNueva] = useState({ accion: "", responsable: "", fecha: "" });
  const [verif, setVerif] = useState("");
  const [descarta, setDescarta] = useState<string | null>(null);

  const activo = d.estado === "activo";
  const editable = puedeEditar && activo;
  const ejecutar = (f: () => Promise<{ ok?: boolean; error?: string }>, ok: string, despues?: () => void) => start(async () => {
    const r = await f();
    if (r.error) { avisar.mal(r.error); return }
    avisar.bien(ok); despues?.(); router.refresh();
  });

  const guardar = () => ejecutar(() => guardarAnalisis({ disparador_id: d.id, responsable: resp, porques: pq, causa_raiz: raiz }),
    an ? "Avance guardado." : "Disparador tomado: ya está en análisis.");
  const poner = (k: number, v: string) => setPq((x) => x.map((t, j) => (j === k ? v : t)));
  const hechas = acciones.filter((x) => x.estado === "hecha").length;
  const faltas = [
    (an?.causa_raiz ?? "").trim().length < 10 ? "escribir y guardar la causa raíz" : "",
    !acciones.length ? "agregar al menos una acción" : "",
    acciones.length && hechas < acciones.length ? `hacer ${acciones.length - hechas} acción${acciones.length - hechas === 1 ? "" : "es"} pendiente${acciones.length - hechas === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return (
    <article className={"gp-panel " + etapa}>
      {avisos}
      <header>
        <div>
          <span className={"gp-pill " + etapa}>{ETAPA[etapa]}</span>
          <span className="mono"> {i?.codigo ?? "—"}</span>
          <h2>5 Why · {i?.nombre ?? "Indicador eliminado"}</h2>
          <small>{proceso ?? "Sin proceso"}</small>
        </div>
      </header>

      <div className="gp-hecho">
        <small>El problema</small>
        {i ? <>Resultado <b>{conUnidad(d.valor, i)}</b> contra meta <b>{d.meta ?? "—"}</b> el {diaCorto(d.fecha)}{turno ? ` · ${turno.nombre}` : ""}. Regla: {d.regla ?? "—"}.</>
          : <>Resultado {d.valor} el {diaCorto(d.fecha)}.</>}
      </div>

      {etapa === "pendiente" && editable && (
        <div className="gp-tomar">
          <label>Responsable del análisis
            <input value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Quién lo va a analizar" />
          </label>
          <button type="button" className="btn" disabled={pend} onClick={guardar}>Tomar y empezar el 5 Why</button>
        </div>
      )}
      {etapa === "pendiente" && !editable && <p className="gs-nota">Nadie ha tomado este disparador todavía.</p>}

      {(an || etapa !== "pendiente") && (
        <>
          <div className="gp-resp">Responsable: <b>{an?.responsable || "—"}</b></div>
          <ol className="gp-cadena">
            {PREGUNTA.map((p, k) => {
              const habil = editable && (k === 0 || pq[k - 1].trim().length > 0);
              return (
                <li key={k} className={pq[k].trim() ? "lleno" : ""}>
                  <span className="gp-n">{k + 1}</span>
                  <label>{p}
                    {editable ? (
                      <textarea rows={2} value={pq[k]} disabled={!habil} onChange={(e) => poner(k, e.target.value)}
                                placeholder={habil ? "Porque…" : "Se habilita al responder el anterior"} />
                    ) : <span className="gp-leido">{pq[k] || "—"}</span>}
                  </label>
                </li>
              );
            })}
          </ol>
          <div className="gp-raiz">
            <small>Causa raíz</small>
            {editable
              ? <textarea rows={2} value={raiz} onChange={(e) => setRaiz(e.target.value)} placeholder="La causa de fondo a la que llegaste con los porqués" />
              : <span className="gp-leido">{an?.causa_raiz || "—"}</span>}
          </div>
          {editable && <div className="gp-acciones-barra"><button type="button" className="btn" disabled={pend} onClick={guardar}>Guardar avance</button></div>}

          {/* ---------------- PLAN DE ACCIÓN ---------------- */}
          <section className="gp-plan">
            <h3>Plan de acción <small>{acciones.length ? `${hechas} de ${acciones.length} hechas` : "sin acciones"}</small></h3>
            {acciones.length > 0 && (
              <ul className="gp-acciones">
                {acciones.map((a) => {
                  const vencida = a.estado === "abierta" && a.fecha_limite < hoy;
                  return (
                    <li key={a.id} className={a.estado + (vencida ? " vencida" : "")}>
                      <input type="checkbox" checked={a.estado === "hecha"} disabled={!editable || pend}
                             onChange={(e) => ejecutar(() => marcarAccion(a.id, e.target.checked), e.target.checked ? "Acción hecha." : "Acción reabierta.")}
                             aria-label={`Marcar «${a.accion}» como hecha`} />
                      <div><b>{a.accion}</b><small>{a.responsable} · límite {diaCorto(a.fecha_limite)}{vencida ? " · VENCIDA" : ""}</small></div>
                      {editable && a.estado === "abierta" && (
                        <button type="button" className="btn plano" disabled={pend} onClick={() => ejecutar(() => quitarAccion(a.id), "Acción quitada.")}>Quitar</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {editable && an && (
              <div className="gp-nueva">
                <input value={nueva.accion} onChange={(e) => setNueva({ ...nueva, accion: e.target.value })} placeholder="Qué se va a hacer" />
                <input value={nueva.responsable} onChange={(e) => setNueva({ ...nueva, responsable: e.target.value })} placeholder="Quién" />
                <input type="date" min={hoy} value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} aria-label="Fecha límite" />
                <button type="button" className="btn" disabled={pend}
                        onClick={() => ejecutar(() => guardarAccion({ disparador_id: d.id, accion: nueva.accion, responsable: nueva.responsable || resp, fecha_limite: nueva.fecha }),
                          "Acción agregada.", () => setNueva({ accion: "", responsable: "", fecha: "" }))}>Agregar</button>
              </div>
            )}
            {editable && !an && <p className="gs-nota">Toma el disparador para armar el plan.</p>}
          </section>
        </>
      )}

      {!activo && d.nota && <p className="gs-nota"><b>{ETAPA[etapa]}:</b> {d.nota}</p>}

      {editable && (
        <footer className="gp-pie">
          {an && (
            <div className="gp-cierre">
              {faltas.length > 0 && <p className="gs-nota">Para cerrar falta: {faltas.join(", ")}.</p>}
              <input value={verif} onChange={(e) => setVerif(e.target.value)} placeholder="¿Cómo se verificó que el indicador volvió a la meta?" disabled={faltas.length > 0} />
              <button type="button" className="btn" disabled={pend || faltas.length > 0} onClick={() => ejecutar(() => cerrarDisparador(d.id, verif), "Disparador cerrado.")}>Cerrar disparador</button>
            </div>
          )}
          {descarta === null ? (
            <button type="button" className="btn plano" onClick={() => setDescarta("")}>No procede · descartar</button>
          ) : (
            <div className="gs-descarte">
              <input value={descarta} placeholder="¿Por qué se descarta?" onChange={(e) => setDescarta(e.target.value)} autoFocus />
              <button type="button" className="btn" disabled={pend} onClick={() => ejecutar(() => descartarDisparador(d.id, descarta), "Disparador descartado.", () => setDescarta(null))}>Descartar</button>
              <button type="button" className="btn plano" onClick={() => setDescarta(null)}>Cancelar</button>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
