"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import { usePedirTexto } from "@/components/PedirTexto";
import {
  RELEVO, conUnidad, diaCorto,
  type Accion, type Analisis, type Disparador, type Indicador, type TipoAccion, type Turno,
} from "@/modulos/gestion/semaforo";
import { descartarDisparador } from "./actions";
import { cerrarDisparador, guardarAccion, guardarAnalisis, marcarAccion, pasarRelevo, quitarAccion } from "./disparadores/actions";

import { CampoFecha } from "@/components/CampoFecha";
const PREGUNTA = ["¿Por qué 1?", "¿Por qué 2?", "¿Por qué 3?", "¿Por qué 4?", "¿Por qué 5?"];
const porquesDe = (a?: Analisis | null) => (a ? [a.porque1, a.porque2, a.porque3, a.porque4, a.porque5] : ["", "", "", "", ""]);
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/**
 * EL 5W EN HOJA COMPLETA, ENCIMA DEL TABLERO.
 * Arriba el relevo Sup OL → Coord OL → Sup AB → OPL; a la izquierda los cinco porqués y la causa raíz (y la OPL en la
 * última estación); a la derecha las acciones correctivas y preventivas, que caen también en «Plan de acción».
 */
export function Hoja5W({ d, i, turno, an, acciones, puede, hoy, cerrar }: {
  d: Disparador; i?: Indicador; turno?: Turno; an: Analisis | null; acciones: Accion[]; puede: boolean; hoy: string; cerrar: () => void;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pedirTexto, pidiendo] = usePedirTexto();
  const [pend, start] = useTransition();
  const [resp, setResp] = useState(an?.responsable ?? "");
  const [pq, setPq] = useState<string[]>(porquesDe(an));
  const [raiz, setRaiz] = useState(an?.causa_raiz ?? "");
  const [opl, setOpl] = useState(an?.opl ?? "");
  const [nueva, setNueva] = useState<{ tipo: TipoAccion; accion: string; responsable: string; fecha: string }>({ tipo: "correctiva", accion: "", responsable: "", fecha: "" });

  const paso = an?.paso ?? 1;
  const editable = puede && d.estado === "activo";
  const sucio = resp !== (an?.responsable ?? "") || raiz !== (an?.causa_raiz ?? "") || opl !== (an?.opl ?? "")
    || pq.some((t, k) => t !== porquesDe(an)[k]);

  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape" && !pidiendo) cerrar() };
    window.addEventListener("keydown", t);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", t); document.body.style.overflow = "" };
  }, [cerrar, pidiendo]);

  const datos = () => ({ disparador_id: d.id, responsable: resp, porques: pq, causa_raiz: raiz, ...(paso === 4 || opl ? { opl } : {}) });
  const correr = (pasos: (() => Promise<{ error?: string }>)[], ok: string, despues?: () => void) => start(async () => {
    for (const p of pasos) { const r = await p(); if (r.error) { avisar.mal(r.error); return } }
    avisar.bien(ok); despues?.(); router.refresh();
  });
  const guardar = () => correr([() => guardarAnalisis(datos())], an ? "5W guardado." : "5W empezado.");
  const pasar = (a: number) => {
    const quien = RELEVO.find((r) => r.n === a)!.quien;
    correr([...(sucio || !an ? [() => guardarAnalisis(datos())] : []), () => pasarRelevo(d.id, a)],
      a > paso ? `Pasado a ${quien}.` : `Devuelto a ${quien}.`);
  };
  const cerrarDisp = () => correr(
    [...(sucio ? [() => guardarAnalisis(datos())] : []), () => cerrarDisparador(d.id, `OPL: ${opl.trim()}`)],
    "Disparador cerrado.", cerrar);
  const descartar = async () => {
    const m = await pedirTexto({ titulo: "¿Descartar esta ocurrencia?", dice: "Queda como «no procede» con el motivo; no se puede reabrir.", rotulo: "Por qué no procede", minimo: 5, confirmar: "Descartar", peligro: true });
    if (m) correr([() => descartarDisparador(d.id, m)], "Ocurrencia descartada.", cerrar);
  };
  const agregar = () => correr(
    [...(!an || sucio ? [() => guardarAnalisis(datos())] : []),
      () => guardarAccion({ disparador_id: d.id, tipo: nueva.tipo, accion: nueva.accion, responsable: nueva.responsable || resp, fecha_limite: nueva.fecha })],
    "Acción registrada.", () => setNueva({ tipo: nueva.tipo, accion: "", responsable: "", fecha: "" }));

  const hechas = acciones.filter((a) => a.estado === "hecha").length;
  const faltaCerrar = [
    opl.trim().length < 5 ? "escribir la OPL" : "",
    raiz.trim().length < 10 ? "la causa raíz" : "",
    !acciones.length ? "al menos una acción" : "",
    acciones.length > hechas ? `marcar hecha${acciones.length - hechas === 1 ? "" : "s"} ${acciones.length - hechas} acción${acciones.length - hechas === 1 ? "" : "es"}` : "",
  ].filter(Boolean);
  const ultimoPase = (n: number) => [...(an?.relevos ?? [])].reverse().find((r) => r.a === n);

  return (
    <div className="h5-velo" role="dialog" aria-modal="true" aria-labelledby="h5-t" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      {avisos}{pidiendo}
      <article className={"h5 " + d.estado}>
        <header className="h5-cab">
          <div>
            <p className="ojo">5W · {i?.codigo ?? "—"} · {i?.nombre ?? "Indicador eliminado"} · {ddmm(d.fecha)}{turno ? ` turno ${turno.nombre.replace(/^Turno\s*/i, "")}` : ""}</p>
            <h2 id="h5-t">{i ? conUnidad(d.valor, i) : d.valor} contra meta {d.meta ?? "—"} · {d.regla ?? "—"}</h2>
          </div>
          <button type="button" className="h5-x" onClick={cerrar} aria-label="Cerrar">✕</button>
        </header>

        <ol className="h5-relevo" aria-label="Relevo del 5W">
          {RELEVO.map((r) => {
            const est = d.estado === "cerrado" || r.n < paso ? "hecho" : r.n === paso && d.estado === "activo" ? "aqui" : "";
            const p = ultimoPase(r.n);
            return (
              <li key={r.n} className={est}>
                <span className="n">{est === "hecho" ? "✓" : r.n}</span>
                <div><b>{r.quien}</b><small>{p ? `Recibió ${hora(p.en)}` : r.que}</small></div>
              </li>
            );
          })}
        </ol>

        {d.estado !== "activo" && (
          <p className={"h5-fin " + d.estado}><b>{d.estado === "cerrado" ? "Cerrado" : "Descartado"}</b>{d.cerrado_en ? ` el ${diaCorto(d.cerrado_en.slice(0, 10))}` : ""}{d.nota ? ` · ${d.nota}` : ""}</p>
        )}

        <div className="h5-cuerpo">
          <section className="h5-izq">
            <label className="h5-campo"><span>Responsable del análisis</span>
              {editable ? <input value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Quién lo analiza (Sup OL)" /> : <p>{an?.responsable || "—"}</p>}
            </label>
            {PREGUNTA.map((t, k) => {
              const habil = editable && (k === 0 || pq[k - 1].trim().length > 0);
              return (
                <label key={k} className={"h5-campo" + (pq[k].trim() ? " lleno" : "")}><span>{t}</span>
                  {editable
                    ? <textarea rows={1} value={pq[k]} disabled={!habil} placeholder={habil ? "Porque…" : "Responde el anterior primero"} onChange={(e) => setPq((x) => x.map((v, j) => (j === k ? e.target.value : v)))} />
                    : <p>{pq[k] || "—"}</p>}
                </label>
              );
            })}
            <label className="h5-campo raiz"><span>Causa raíz</span>
              {editable ? <textarea rows={2} value={raiz} onChange={(e) => setRaiz(e.target.value)} placeholder="La causa de fondo a la que llegaron los porqués" /> : <p>{an?.causa_raiz || "—"}</p>}
            </label>
            {(paso === 4 || (an?.opl ?? "")) && (
              <label className="h5-campo opl"><span>OPL · lección de un punto</span>
                {editable && paso === 4 ? <textarea rows={3} value={opl} onChange={(e) => setOpl(e.target.value)} placeholder="Lo que todos deben saber para que no vuelva a pasar" /> : <p>{an?.opl || "—"}</p>}
              </label>
            )}
          </section>

          <section className="h5-der">
            <h3>Acciones <small>{acciones.length ? `${hechas} de ${acciones.length} hechas` : "ninguna todavía"}</small></h3>
            {acciones.length > 0 && (
              <ul className="h5-acc">
                {acciones.map((a) => {
                  const tipo = a.tipo ?? "correctiva", vencida = a.estado === "abierta" && a.fecha_limite < hoy;
                  return (
                    <li key={a.id} className={a.estado + (vencida ? " vencida" : "")}>
                      <input type="checkbox" checked={a.estado === "hecha"} disabled={!editable || pend} aria-label={`Marcar «${a.accion}» como hecha`}
                             onChange={(e) => correr([() => marcarAccion(a.id, e.target.checked)], e.target.checked ? "Acción hecha." : "Acción reabierta.")} />
                      <span className={"tb-tipo " + tipo}>{tipo === "preventiva" ? "Preventiva" : "Correctiva"}</span>
                      <div><b>{a.accion}</b><small>{a.responsable} · {ddmm(a.fecha_limite)}{vencida ? " · VENCIDA" : ""}</small></div>
                      {editable && a.estado === "abierta" && <button type="button" className="h5-quitar" disabled={pend} onClick={() => correr([() => quitarAccion(a.id)], "Acción quitada.")} aria-label="Quitar acción">✕</button>}
                    </li>
                  );
                })}
              </ul>
            )}
            {editable && (
              <div className="h5-nueva">
                <div className="h5-seg" role="group" aria-label="Tipo de acción">
                  {(["correctiva", "preventiva"] as TipoAccion[]).map((t) => (
                    <button key={t} type="button" className={nueva.tipo === t ? "on " + t : ""} onClick={() => setNueva({ ...nueva, tipo: t })}>{t === "correctiva" ? "Correctiva" : "Preventiva"}</button>
                  ))}
                </div>
                <input value={nueva.accion} onChange={(e) => setNueva({ ...nueva, accion: e.target.value })} placeholder="Qué se va a hacer" />
                <div className="h5-fila">
                  <input value={nueva.responsable} onChange={(e) => setNueva({ ...nueva, responsable: e.target.value })} placeholder={resp ? `Quién (${resp})` : "Quién"} />
                  <CampoFecha min={hoy} value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} aria-label="Fecha límite" />
                  <button type="button" className="btn" disabled={pend || nueva.accion.trim().length < 5 || !nueva.fecha || !(nueva.responsable.trim() || resp.trim())} onClick={agregar}>+ Acción</button>
                </div>
              </div>
            )}
            {!editable && !acciones.length && <p className="gs-nota">Sin acciones registradas.</p>}
          </section>
        </div>

        {editable && (
          <footer className="h5-pie">
            <button type="button" className="btn plano" disabled={pend} onClick={descartar}>No procede · descartar</button>
            <span className="h5-falta">
              {paso === 4 && faltaCerrar.length > 0 ? `Para cerrar falta: ${faltaCerrar.join(", ")}.` : ""}
            </span>
            {paso > 1 && <button type="button" className="btn plano" disabled={pend} onClick={() => pasar(paso - 1)}>← Devolver a {RELEVO[paso - 2].quien}</button>}
            <button type="button" className="btn plano" disabled={pend || (!sucio && !!an) || resp.trim().length < 2} onClick={guardar}>Guardar</button>
            {paso < 4
              ? <button type="button" className="btn" disabled={pend || resp.trim().length < 2} onClick={() => pasar(paso + 1)}>Pasar a {RELEVO[paso].quien} →</button>
              : <button type="button" className="btn" disabled={pend || faltaCerrar.length > 0} onClick={cerrarDisp}>Cerrar con OPL</button>}
          </footer>
        )}
        {!puede && d.estado === "activo" && <p className="gs-solover">Solo lectura: para trabajar el 5W hace falta «Disparadores» en editar.</p>}
      </article>
    </div>
  );
}
