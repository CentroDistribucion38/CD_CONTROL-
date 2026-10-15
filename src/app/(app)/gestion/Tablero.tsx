"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PESO, conUnidad, diaCorto, etiquetaPeriodo, inicioPeriodo, sumarDias, textoMeta,
  type Disparador, type Estado, type Indicador, type Proceso, type Resultado, type Turno,
} from "@/modulos/gestion/semaforo";
import { Semaforo } from "./comunes";

const peor = (xs: Estado[]): Estado | null => xs.reduce<Estado | null>((a, e) => (a == null || PESO[e] > PESO[a] ? e : a), null);

export function Tablero({ fecha, hoy, turnos, procesos, indicadores, resultados, disparadores }: {
  fecha: string; hoy: string; turnos: Turno[]; procesos: Proceso[]; indicadores: Indicador[];
  resultados: Resultado[]; disparadores: Disparador[];
}) {
  const router = useRouter();
  const [proceso, setProceso] = useState<string>("todos");
  const [nivel, setNivel] = useState<0 | 1 | 2>(0);
  const turnoPorId = useMemo(() => new Map(turnos.map((t) => [t.id, t])), [turnos]);
  const turnosActivos = useMemo(() => turnos.filter((t) => t.activo), [turnos]);
  const activos = useMemo(() => new Set(disparadores.filter((d) => d.estado === "activo").map((d) => d.indicador_id)), [disparadores]);

  /* Los resultados por indicador, para no filtrar la lista entera en cada renglón. */
  const porInd = useMemo(() => {
    const m = new Map<string, Resultado[]>();
    for (const r of resultados) { const a = m.get(r.indicador_id); a ? a.push(r) : m.set(r.indicador_id, [r]) }
    return m;
  }, [resultados]);

  const dias7 = useMemo(() => Array.from({ length: 7 }, (_, k) => sumarDias(fecha, k - 6)), [fecha]);

  const vista = useMemo(() => indicadores.filter((i) => i.activo
    && (proceso === "todos" || (proceso === "ninguno" ? !i.proceso_id : i.proceso_id === proceso))
    && (nivel === 0 || i.nivel_reunion === nivel)), [indicadores, proceso, nivel]);

  /* De cada indicador: sus resultados del periodo de la fecha, su peor estado y su tira de 7 días. */
  const filas = useMemo(() => {
    const m = new Map<string, { del: Resultado[]; estado: Estado | null; tira: (Estado | null)[] }>();
    for (const i of vista) {
      const rs = porInd.get(i.id) ?? [];
      const ini = inicioPeriodo(fecha, i.frecuencia);
      const del = rs.filter((r) => r.fecha === ini);
      const tira = dias7.map((d) => peor(rs.filter((r) => r.fecha === inicioPeriodo(d, i.frecuencia)).map((r) => r.estado)));
      m.set(i.id, { del, estado: peor(del.map((r) => r.estado)), tira });
    }
    return m;
  }, [vista, porInd, fecha, dias7]);

  const cuenta = (e: Estado | null) => vista.filter((i) => filas.get(i.id)?.estado === e).length;
  const nDisp = vista.filter((i) => activos.has(i.id)).length;

  /* Por proceso: primero los KPI y debajo de cada uno sus PI. El PI cuyo KPI no se ve (otro proceso o filtrado) va solo. */
  const grupos = useMemo(() => {
    const ids = new Set(vista.map((i) => i.id));
    const hijos = new Map<string, Indicador[]>();
    for (const i of vista) if (i.tipo === "pi" && i.padre_id && ids.has(i.padre_id) && vista.find((k) => k.id === i.padre_id)?.proceso_id === i.proceso_id) {
      const a = hijos.get(i.padre_id); a ? a.push(i) : hijos.set(i.padre_id, [i]);
    }
    const hijo = new Set([...hijos.values()].flat().map((i) => i.id));
    const raices = vista.filter((i) => !hijo.has(i.id));
    const orden = (xs: Indicador[]) => [...xs].sort((a, b) => (a.tipo === b.tipo ? a.orden - b.orden || a.codigo.localeCompare(b.codigo) : a.tipo === "kpi" ? -1 : 1));
    const lista: { id: string; nombre: string; filas: { i: Indicador; sangria: boolean }[] }[] = [];
    const ponProceso = (id: string, nombre: string, xs: Indicador[]) => {
      if (!xs.length) return;
      lista.push({ id, nombre, filas: orden(xs).flatMap((i) => [{ i, sangria: false }, ...orden(hijos.get(i.id) ?? []).map((h) => ({ i: h, sangria: true }))]) });
    };
    for (const p of procesos.filter((p) => p.activo)) ponProceso(p.id, p.nombre, raices.filter((i) => i.proceso_id === p.id));
    ponProceso("ninguno", "Sin proceso", raices.filter((i) => !i.proceso_id || !procesos.some((p) => p.id === i.proceso_id && p.activo)));
    return lista;
  }, [vista, procesos]);

  const ir = (f: string) => router.push(f === hoy ? "/gestion" : `/gestion?fecha=${f}`);
  const T = (id: string | null) => (id ? turnoPorId.get(id) : undefined);
  const corto = (n: string) => n.replace(/^Turno\s*/i, "T");

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · TABLERO</p>
          <h1>KPI · PI · Meta</h1>
          <p className="sub">
            Cómo va cada indicador contra su meta, turno por turno. Los KPI son el resultado; los PI debajo de cada uno son lo que lo
            explica. Los números se digitan en <b>Resultado por turno</b> y las reglas se mueven en <b>Maestro</b>.
          </p>
        </div>
      </section>

      <div className="gs-barra">
        <div className="gs-fecha">
          <button type="button" onClick={() => ir(sumarDias(fecha, -1))} aria-label="Día anterior">‹</button>
          <input type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && ir(e.target.value)} aria-label="Día" />
          <button type="button" onClick={() => ir(sumarDias(fecha, 1))} disabled={fecha >= hoy} aria-label="Día siguiente">›</button>
          {fecha !== hoy && <button type="button" className="gs-hoy" onClick={() => ir(hoy)}>Hoy</button>}
        </div>
        <div className="gs-filtros">
          <label>Proceso
            <select value={proceso} onChange={(e) => setProceso(e.target.value)}>
              <option value="todos">Todos</option>
              {procesos.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              <option value="ninguno">Sin proceso</option>
            </select>
          </label>
          <label>Reunión
            <select value={nivel} onChange={(e) => setNivel(Number(e.target.value) as 0 | 1 | 2)}>
              <option value={0}>Todas</option><option value={1}>Nivel 1</option><option value={2}>Nivel 2</option>
            </select>
          </label>
        </div>
      </div>

      <div className="gs-cifras">
        <div className="gs-cif"><span>Indicadores</span><b>{vista.length}</b></div>
        <div className="gs-cif bien"><span>Cumplen</span><b>{cuenta("verde")}</b></div>
        <div className="gs-cif mal"><span>No cumplen</span><b>{cuenta("rojo")}</b></div>
        <div className="gs-cif"><span>Sin captura</span><b>{cuenta(null)}</b></div>
        <Link href="/gestion/disparadores" className={"gs-cif enlace" + (nDisp ? " mal" : "")}><span>Disparadores activos</span><b>{nDisp}</b></Link>
      </div>

      {!vista.length && (
        <p className="gs-vacio">
          {indicadores.some((i) => i.activo)
            ? "Ningún indicador cumple ese filtro."
            : <>Todavía no hay indicadores. Créalos en <Link href="/gestion/maestro">Maestro</Link>: define el KPI, sus PI, la meta y los turnos.</>}
        </p>
      )}

      {grupos.map((g) => (
        <section key={g.id} className="gs-proceso">
          <h2>{g.nombre}<small>{g.filas.length} indicador{g.filas.length === 1 ? "" : "es"}</small></h2>
          <div className="gs-scroll">
            <table className="gs-t">
              <thead>
                <tr>
                  <th>Código</th><th>Indicador</th><th>Meta</th>
                  <th>{diaCorto(fecha)}</th><th>Estado</th><th>Últimos 7 días</th><th />
                </tr>
              </thead>
              <tbody>
                {g.filas.map(({ i, sangria }) => {
                  const f = filas.get(i.id)!;
                  const delOrden = [...f.del].sort((a, b) => (T(a.turno_id)?.orden ?? 0) - (T(b.turno_id)?.orden ?? 0));
                  const ped = i.captura === "turnos" && i.frecuencia === "dia"
                    ? turnosActivos.filter((t) => i.turnos.length === 0 || i.turnos.includes(t.id)) : [];
                  return (
                    <tr key={i.id} className={(sangria ? "pi " : "kpi ") + (activos.has(i.id) ? "disp" : "")}>
                      <td className="mono">{i.codigo}</td>
                      <td>
                        <span className={"gs-tipo " + i.tipo}>{i.tipo === "kpi" ? "KPI" : "PI"}</span>
                        <span className="gs-nom">{i.nombre}</span>
                        <small className="gs-sub">{i.frecuencia === "dia" ? (i.captura === "turnos" ? "Por turno" : "Diario") : etiquetaPeriodo(fecha, i.frecuencia)}{i.responsable ? ` · ${i.responsable}` : ""}</small>
                      </td>
                      <td className="gs-meta">{textoMeta(i)}</td>
                      <td>
                        <div className="gs-vals">
                          {ped.length > 0
                            ? ped.map((t) => {
                                const r = delOrden.find((x) => x.turno_id === t.id);
                                return <span key={t.id} className={"gs-val " + (r?.estado ?? "sin")} title={`${t.nombre}${r?.comentario ? " · " + r.comentario : ""}`}><em>{corto(t.nombre)}</em>{r ? conUnidad(r.valor, i) : "—"}</span>;
                              })
                            : delOrden.length
                              ? delOrden.map((r) => <span key={r.id} className={"gs-val " + r.estado} title={r.comentario ?? undefined}>{conUnidad(r.valor, i)}</span>)
                              : <span className="gs-val sin">—</span>}
                        </div>
                      </td>
                      <td><Semaforo estado={f.estado} /></td>
                      <td>
                        <div className="gs-tira" aria-label="Estado de los últimos 7 días">
                          {f.tira.map((e, k) => <i key={k} className={e ?? "sin"} title={`${diaCorto(dias7[k])}${e ? " · " + e : " · sin captura"}`} />)}
                        </div>
                      </td>
                      <td>{activos.has(i.id) && <Link className="gs-disp" href="/gestion/disparadores">Disparador activo</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
