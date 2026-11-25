"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PESO, RELEVO, conUnidad, diaCorto, inicioPeriodo, sumarDias, textoMeta,
  type Accion, type Analisis, type Disparador, type Estado, type Indicador, type Proceso, type Resultado, type Turno,
} from "@/modulos/gestion/semaforo";
import { Areas } from "./Areas";
import { Capturar } from "./Capturar";
import { FichaIndicador, deIndicador, nuevoIndicador } from "./FichaIndicador";
import { Turnos } from "./Turnos";
import { Hoja5W } from "./Hoja5W";
import { PlanAccion } from "./PlanAccion";

/* ---------- pequeñas utilidades ---------- */
const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const corto = (n: string) => n.replace(/^Turno\s*/i, "");
const diasEntre = (d: string, h: string) => {
  const out: string[] = [];
  for (let f = d; f <= h && out.length < 62; f = sumarDias(f, 1)) out.push(f);
  return out;
};
/** «turnos», «días», «semanas» o «meses»: lo que cuenta el disparador de ese indicador. */
export const unidadDisparo = (i: Pick<Indicador, "frecuencia" | "captura">, n: number) => {
  const [uno, varios] = i.frecuencia === "semana" ? ["semana", "semanas"] : i.frecuencia === "mes" ? ["mes", "meses"]
    : i.captura === "turnos" ? ["turno", "turnos"] : ["día", "días"];
  return n === 1 ? uno : varios;
};
export const textoDisparador = (i: Indicador) =>
  i.disparo_activo ? `No cumple ${i.disparo_consecutivos} ${unidadDisparo(i, i.disparo_consecutivos)}` : "Sin disparador";

/** En qué va el 5W de un disparador: la palabra y la clase del rótulo. */
export function estado5w(d: Disparador, a?: Analisis | null): { t: string; c: string } {
  if (d.estado === "cerrado") return { t: "Cerrado", c: "ok" };
  if (d.estado === "descartado") return { t: "Descartado", c: "gris" };
  if (!a) return { t: "Pendiente", c: "mal" };
  const p = RELEVO.find((r) => r.n === (a.paso ?? 1)) ?? RELEVO[0];
  return { t: p.n === 4 ? "En OPL" : `En ${p.quien}`, c: "va" };
}

type Hoja = "tablero" | "plan";

export function Tablero({ d, h, hoy, maxDias, turnos, procesos, indicadores, resultados, disparadores, analisis, acciones, faltaSql, puedeIndicador, puedeCapturar, puede5w, areasRoturas }: {
  d: string; h: string; hoy: string; maxDias: number;
  turnos: Turno[]; procesos: Proceso[]; indicadores: Indicador[]; resultados: Resultado[]; disparadores: Disparador[];
  analisis: Analisis[]; acciones: Accion[]; faltaSql: boolean; puedeIndicador: boolean; puedeCapturar: boolean; puede5w: boolean; areasRoturas: string[];
}) {
  const router = useRouter();
  const [hoja, setHoja] = useState<Hoja>("tablero");
  const [area, setArea] = useState<string>("todas");
  const [ficha, setFicha] = useState<ReturnType<typeof deIndicador> | null>(null);
  const [verAreas, setVerAreas] = useState(false);
  const [verTurnos, setVerTurnos] = useState(false);
  const [inactivos, setInactivos] = useState(false);
  const [celda, setCelda] = useState<{ i: Indicador; f: string; t?: Turno; r?: Resultado } | null>(null);
  const [abre, setAbre] = useState<"area" | "fechas" | "param" | null>(null);
  const dropsRef = useRef<HTMLDivElement>(null);
  /* Los desplegables se cierran al tocar fuera. */
  useEffect(() => {
    if (!abre) return;
    const fuera = (e: MouseEvent) => { if (dropsRef.current && !dropsRef.current.contains(e.target as Node)) setAbre(null) };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abre]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [desde, setDesde] = useState(d);
  const [hasta, setHasta] = useState(h);
  useEffect(() => { setDesde(d); setHasta(h) }, [d, h]);
  /* Si el área escogida se desactivó o se eliminó, vuelve a «Todas». */
  useEffect(() => {
    if (area !== "todas" && area !== "ninguna" && !procesos.some((p) => p.activo && p.id === area)) setArea("todas");
  }, [procesos, area]);

  const tActivos = useMemo(() => [...turnos].filter((t) => t.activo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)), [turnos]);
  const turnoPorId = useMemo(() => new Map(turnos.map((t) => [t.id, t])), [turnos]);
  const indPorId = useMemo(() => new Map(indicadores.map((i) => [i.id, i])), [indicadores]);
  const anPor = useMemo(() => new Map(analisis.map((a) => [a.disparador_id, a])), [analisis]);
  const dias = useMemo(() => diasEntre(d, h), [d, h]);
  const nT = Math.max(1, tActivos.length);
  const opcionesArea = [{ id: "todas", nombre: "Todas" }, ...procesos.filter((p) => p.activo),
    ...(indicadores.some((i) => i.activo && (!i.proceso_id || !procesos.some((p) => p.activo && p.id === i.proceso_id))) ? [{ id: "ninguna", nombre: "Sin área" }] : [])];
  const enArea = (i?: Indicador) => !!i && (area === "todas" || (area === "ninguna" ? !i.proceso_id : i.proceso_id === area));

  /* Resultado por indicador · fecha · turno ("-" = sin turno). */
  const res = useMemo(() => {
    const m = new Map<string, Resultado>();
    for (const r of resultados) m.set(`${r.indicador_id}|${r.fecha}|${r.turno_id ?? "-"}`, r);
    return m;
  }, [resultados]);

  const vista = useMemo(() => indicadores.filter((i) => (i.activo || inactivos) && enArea(i)), [indicadores, area, inactivos]); // eslint-disable-line react-hooks/exhaustive-deps
  const nInactivos = indicadores.filter((i) => !i.activo).length;
  const areaNueva = area !== "todas" && area !== "ninguna" ? area : null;
  const crear = (enArea: string | null, padre?: Indicador) => { setAbre(null); setFicha(nuevoIndicador(turnos, enArea, padre)) };

  /* Orden: por área y, dentro, cada KPI con sus PI debajo. */
  const filas = useMemo(() => {
    const ids = new Set(vista.map((i) => i.id));
    const hijos = new Map<string, Indicador[]>();
    for (const i of vista) if (i.tipo === "pi" && i.padre_id && ids.has(i.padre_id) && indPorId.get(i.padre_id)?.proceso_id === i.proceso_id) {
      const a = hijos.get(i.padre_id); a ? a.push(i) : hijos.set(i.padre_id, [i]);
    }
    const esHijo = new Set([...hijos.values()].flat().map((i) => i.id));
    const orden = (xs: Indicador[]) => [...xs].sort((a, b) => (a.tipo === b.tipo ? a.orden - b.orden || a.codigo.localeCompare(b.codigo) : a.tipo === "kpi" ? -1 : 1));
    const out: ({ grupo: string; id: string } | { i: Indicador; pi: boolean })[] = [];
    const poner = (id: string, nombre: string, xs: Indicador[]) => {
      if (!xs.length) return;
      if (area === "todas") out.push({ grupo: nombre, id });
      for (const i of orden(xs)) { out.push({ i, pi: false }); for (const c of orden(hijos.get(i.id) ?? [])) out.push({ i: c, pi: true }) }
    };
    const raices = vista.filter((i) => !esHijo.has(i.id));
    for (const p of procesos.filter((p) => p.activo)) poner(p.id, p.nombre, raices.filter((i) => i.proceso_id === p.id));
    poner("ninguna", "Sin área", raices.filter((i) => !i.proceso_id || !procesos.some((p) => p.activo && p.id === i.proceso_id)));
    return out;
  }, [vista, procesos, indPorId, area]);

  /* El último resultado del rango de cada indicador: con eso se cuenta quién cumple. */
  const ultimo = useMemo(() => {
    const m = new Map<string, Estado>();
    const ord = (r: Resultado) => r.fecha + String(r.turno_id ? turnoPorId.get(r.turno_id)?.orden ?? 0 : 0).padStart(4, "0");
    const rs = resultados.filter((r) => r.fecha <= h && r.fecha >= inicioPeriodo(d, "mes")).sort((a, b) => ord(a).localeCompare(ord(b)));
    for (const r of rs) {
      const i = indPorId.get(r.indicador_id);
      if (!i) continue;
      if (i.frecuencia === "dia" && r.fecha < d) continue;
      m.set(r.indicador_id, r.estado);
    }
    return m;
  }, [resultados, indPorId, turnoPorId, d, h]);

  const ocurrencias = useMemo(() => disparadores
    .filter((x) => enArea(indPorId.get(x.indicador_id)) && ((x.fecha >= d && x.fecha <= h) || x.estado === "activo"))
    .sort((a, b) => (a.estado === "activo") === (b.estado === "activo") ? b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en) : a.estado === "activo" ? -1 : 1),
  [disparadores, indPorId, d, h, area]); // eslint-disable-line react-hooks/exhaustive-deps
  const activos = useMemo(() => new Set(disparadores.filter((x) => x.estado === "activo").map((x) => x.indicador_id)), [disparadores]);

  const cuenta = (e: Estado | null) => vista.filter((i) => i.activo).filter((i) => (ultimo.get(i.id) ?? null) === e).length;
  const descartados = new Set(disparadores.filter((x) => x.estado === "descartado").map((x) => x.id));
  const indDeDisp = useMemo(() => new Map(disparadores.map((x) => [x.id, x.indicador_id])), [disparadores]);
  const abiertas = acciones.filter((a) => a.estado === "abierta" && !descartados.has(a.disparador_id) && enArea(indPorId.get(indDeDisp.get(a.disparador_id) ?? ""))).length;

  const ir = (nd: string, nh: string) => {
    let a = nd, b = nh;
    if (a > b) [a, b] = [b, a];
    if (b > hoy) b = hoy;
    router.push(`/gestion?d=${a}&h=${b}`);
  };
  const lunes = inicioPeriodo(hoy, "semana");
  const atajos: [string, string, string][] = [
    ["Hoy", hoy, hoy], ["3 días", sumarDias(hoy, -2), hoy], ["7 días", sumarDias(hoy, -6), hoy], ["Esta semana", lunes, hoy],
    ["Semana pasada", sumarDias(lunes, -7), sumarDias(lunes, -1)], ["Este mes", inicioPeriodo(hoy, "mes"), hoy],
  ];

  const disp = abierto ? disparadores.find((x) => x.id === abierto) ?? null : null;

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · TABLERO</p>
          <h1>Indicador · Meta · Disparador</h1>
          <p className="sub">
            Todo se parametriza aquí: toca un indicador para abrir su ficha (meta, captura, turnos, disparador), una casilla para
            escribir su resultado, y <b>Parametrizar</b> para crear indicadores, áreas y turnos. Lo que no cumple salta abajo como
            {" "}<b>ocurrencia</b> y desde ahí se hace el <b>5W</b> en relevo. Las acciones quedan en <b>Plan de acción</b>.
          </p>
        </div>
      </section>

      <div className="tb-linea">
        <div className="tb-hojas" role="tablist" aria-label="Hoja">
          <button type="button" role="tab" aria-selected={hoja === "tablero"} className={hoja === "tablero" ? "on" : ""} onClick={() => setHoja("tablero")}>Tablero</button>
          <button type="button" role="tab" aria-selected={hoja === "plan"} className={hoja === "plan" ? "on" : ""} onClick={() => setHoja("plan")}>
            Plan de acción {abiertas > 0 && <em>{abiertas}</em>}
          </button>
        </div>
        <div className="tb-drops" ref={dropsRef} onKeyDown={(e) => { if (e.key === "Escape") setAbre(null) }}>
          {puedeIndicador && (
            <div className="tb-dropw">
              <button type="button" className={"tb-drop tb-param" + (abre === "param" ? " ab" : "")} aria-haspopup="menu" aria-expanded={abre === "param"} onClick={() => setAbre(abre === "param" ? null : "param")}>
                <b>Parametrizar</b><i aria-hidden>▾</i>
              </button>
              {abre === "param" && (
                <div className="tb-pop tb-pop-param" role="menu" aria-label="Parametrizar">
                  <button type="button" role="menuitem" onClick={() => crear(areaNueva)}>+ Nuevo indicador<small>KPI o PI{areaNueva ? ` · en ${opcionesArea.find((p) => p.id === areaNueva)?.nombre}` : ""}</small></button>
                  <button type="button" role="menuitem" onClick={() => { setAbre(null); setVerAreas(true) }}>Áreas<small>agregar, ordenar, activar, eliminar</small></button>
                  <button type="button" role="menuitem" onClick={() => { setAbre(null); setVerTurnos(true) }}>Turnos<small>las columnas de cada día · horario y orden</small></button>
                  {nInactivos > 0 && (
                    <button type="button" role="menuitemcheckbox" aria-checked={inactivos} onClick={() => { setAbre(null); setInactivos(!inactivos) }}>
                      {inactivos ? "Ocultar" : "Mostrar"} inactivos ({nInactivos})<small>para activarlos o eliminarlos desde su ficha</small>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="tb-dropw">
            <button type="button" className={"tb-drop" + (abre === "area" ? " ab" : "")} aria-haspopup="listbox" aria-expanded={abre === "area"} onClick={() => setAbre(abre === "area" ? null : "area")}>
              <small>Área</small><b>{opcionesArea.find((p) => p.id === area)?.nombre ?? "Todas"}</b><i aria-hidden>▾</i>
            </button>
            {abre === "area" && (
              <div className="tb-pop tb-pop-area" role="listbox" aria-label="Área">
                {opcionesArea.map((p) => (
                  <button key={p.id} type="button" role="option" aria-selected={area === p.id} className={area === p.id ? "on" : ""} onClick={() => { setArea(p.id); setAbre(null) }}>
                    {p.nombre}{area === p.id && <span aria-hidden>✓</span>}
                  </button>
                ))}
                {puedeIndicador && <button type="button" className="tb-pop-ed" onClick={() => { setAbre(null); setVerAreas(true) }}>✎ Editar áreas</button>}
              </div>
            )}
          </div>
          {hoja === "tablero" && (
            <div className="tb-dropw">
              <button type="button" className={"tb-drop" + (abre === "fechas" ? " ab" : "")} aria-haspopup="dialog" aria-expanded={abre === "fechas"} onClick={() => { setDesde(d); setHasta(h); setAbre(abre === "fechas" ? null : "fechas") }}>
                <small>Fechas</small><b>{d === h ? diaCorto(d) : `${diaCorto(d)} – ${diaCorto(h)}`}</b><i aria-hidden>▾</i>
              </button>
              {abre === "fechas" && (
                <div className="tb-pop tb-pop-fechas" role="dialog" aria-label="Fechas">
                  <div className="tb-at">
                    {atajos.map(([t, a, b]) => <button key={t} type="button" className={a === d && b === h ? "on" : ""} onClick={() => { setAbre(null); ir(a, b) }}>{t}</button>)}
                  </div>
                  <div className="tb-cal">
                    <label>Desde<input type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} /></label>
                    <label>Hasta<input type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} /></label>
                  </div>
                  <div className="tb-ver">
                    <small>Máximo {maxDias} días</small>
                    <button type="button" disabled={!desde || !hasta} onClick={() => { setAbre(null); ir(desde, hasta) }}>Ver</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {faltaSql && <p className="gs-solover">Falta crear las tablas del 5W: corre <b>supabase/migraciones/2026-10-gestion-5why-plan.sql</b> y después <b>2026-11-gestion-tablero-relevo.sql</b>.</p>}

      {hoja === "plan" ? (
        <PlanAccion
          acciones={acciones} disparadores={disparadores} indicadores={indPorId} turnos={turnoPorId} hoy={hoy}
          enArea={enArea} puede={puede5w && !faltaSql} abrir={(id) => setAbierto(id)}
        />
      ) : (
        <>
          <div className="gs-cifras c4">
            <div className="gs-cif"><span>Indicadores</span><b>{vista.length}</b></div>
            <div className="gs-cif bien"><span>Cumplen · último resultado</span><b>{cuenta("verde")}</b></div>
            <div className={"gs-cif" + (cuenta("rojo") ? " mal" : "")}><span>No cumplen</span><b>{cuenta("rojo")}</b></div>
            <a href="#ocurrencias" className={"gs-cif enlace" + (ocurrencias.length ? " mal" : "")}><span>Ocurrencias</span><b>{ocurrencias.length}</b></a>
          </div>

          {!vista.length ? (
            <p className="gs-vacio">
              {indicadores.some((i) => i.activo)
                ? "Esa área no tiene indicadores activos."
                : <>Todavía no hay indicadores.</>}
              {puedeIndicador && <>{" "}<button type="button" className="btn" onClick={() => crear(areaNueva)}>+ Crear indicador</button></>}
            </p>
          ) : (
            <div className="tb-scroll">
              <table className="tb-t">
                <thead>
                  <tr>
                    <th rowSpan={2} className="fijo f1">Indicador</th>
                    <th rowSpan={2} className="fijo f2">Meta</th>
                    <th rowSpan={2} className="fijo f3">Disparador</th>
                    {dias.map((f) => <th key={f} colSpan={nT} className={"dia" + (f === hoy ? " hoy" : "")}>{ddmm(f)}<small>{DOW[new Date(f + "T12:00:00Z").getUTCDay()]}</small></th>)}
                  </tr>
                  <tr>
                    {dias.map((f) => tActivos.length
                      ? tActivos.map((t, k) => <th key={f + t.id} className={"tur" + (k === 0 ? " ini" : "")} title={`${t.nombre} · ${t.hora_ini.slice(0, 5)}–${t.hora_fin.slice(0, 5)}`}>{corto(t.nombre)}</th>)
                      : <th key={f} className="tur ini">Día</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((x) => "grupo" in x ? (
                    <tr key={"g" + x.id} className="grupo"><td className="fijo f1" colSpan={3}>{x.grupo}
                      {puedeIndicador && <button type="button" className="tb-mas" onClick={() => crear(x.id === "ninguna" ? null : x.id)} title={`Nuevo indicador en ${x.grupo}`}>+ indicador</button>}</td><td colSpan={dias.length * nT} /></tr>
                  ) : (
                    <tr key={x.i.id} className={(x.pi ? "es-pi" : "es-kpi") + (activos.has(x.i.id) ? " disp" : "") + (x.i.activo ? "" : " inact")}>
                      <td className="fijo f1">
                        <button type="button" className="tb-ed" disabled={!puedeIndicador} onClick={() => setFicha(deIndicador(x.i, turnos))} title={puedeIndicador ? "Abrir la ficha del indicador" : undefined}>
                          <b>{x.i.codigo}</b><span className={"tb-tag" + (x.i.tipo === "kpi" ? " es-kpi" : "")}>{x.i.tipo === "kpi" ? "KPI" : "PI"}</span>
                          {!x.i.activo && <span className="tb-tag off">Inactivo</span>}
                          <span className="nom">{x.i.nombre}</span>
                        </button>
                        {puedeIndicador && x.i.tipo === "kpi" && x.i.activo && <button type="button" className="tb-mas pi" onClick={() => crear(x.i.proceso_id, x.i)} title={`Nuevo PI que explica a ${x.i.codigo}`}>+ PI</button>}
                      </td>
                      <td className="fijo f2"><button type="button" className="tb-ed val" disabled={!puedeIndicador} onClick={() => setFicha(deIndicador(x.i, turnos))}>{textoMeta(x.i)}{puedeIndicador && <i aria-hidden>✎</i>}</button></td>
                      <td className="fijo f3"><button type="button" className={"tb-ed val" + (x.i.disparo_activo ? "" : " off")} disabled={!puedeIndicador} onClick={() => setFicha(deIndicador(x.i, turnos))}>{textoDisparador(x.i)}{puedeIndicador && <i aria-hidden>✎</i>}</button></td>
                      {dias.map((f) => <Celdas key={f} i={x.i} f={f} turnos={tActivos} nT={nT} res={res}
                        abrir={puedeCapturar && x.i.activo ? (fecha, t, r) => setCelda({ i: x.i, f: fecha, t, r }) : undefined} />)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section className="tb-ocu" id="ocurrencias">
            <h2>Ocurrencias <b>{ocurrencias.length}</b><small>disparadores que saltaron en estas fechas, y los que siguen abiertos</small></h2>
            {!ocurrencias.length ? (
              <p className="gs-vacio">Nada saltó en estas fechas.</p>
            ) : (
              <div className="tb-scroll">
                <table className="tb-o">
                  <thead><tr><th>Indicador</th><th>Cuándo</th><th>Valor vs meta</th><th>Regla</th><th>5W</th><th /></tr></thead>
                  <tbody>
                    {ocurrencias.map((o) => {
                      const i = indPorId.get(o.indicador_id), t = o.turno_id ? turnoPorId.get(o.turno_id) : undefined;
                      const a = anPor.get(o.id), e = estado5w(o, a);
                      return (
                        <tr key={o.id} className={o.estado}>
                          <td><b>{i?.codigo ?? "—"}</b> {i?.nombre ?? "Indicador eliminado"}</td>
                          <td className="nw">{ddmm(o.fecha)}{t ? ` · turno ${corto(t.nombre)}` : ""}</td>
                          <td className="nw mal">{i ? conUnidad(o.valor, i) : o.valor} · meta {o.meta ?? "—"}</td>
                          <td>{o.regla ?? "—"}</td>
                          <td><span className={"tb-pill " + e.c}>{e.t}</span></td>
                          <td className="nw">
                            <button type="button" className={"btn" + (o.estado === "activo" && !a && puede5w ? "" : " plano")} onClick={() => setAbierto(o.id)}>
                              {o.estado === "activo" && puede5w && !faltaSql ? (a ? "Seguir 5W" : "Hacer 5W") : "Ver 5W"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {verAreas && <Areas procesos={procesos} indicadores={indicadores} deRoturas={areasRoturas} cerrar={() => setVerAreas(false)} />}
      {ficha && <FichaIndicador key={ficha.id ?? "nuevo"} inicial={ficha} indicadores={indicadores} procesos={procesos} turnos={turnos} cerrar={() => setFicha(null)} />}
      {verTurnos && <Turnos turnos={turnos} cerrar={() => setVerTurnos(false)} />}
      {celda && <Capturar i={celda.i} fecha={celda.f} turno={celda.t} r={celda.r} cerrar={() => setCelda(null)} />}
      {disp && (
        <Hoja5W
          key={disp.id + (anPor.get(disp.id)?.actualizado_en ?? "-")}
          d={disp} i={indPorId.get(disp.indicador_id)} turno={disp.turno_id ? turnoPorId.get(disp.turno_id) : undefined}
          an={anPor.get(disp.id) ?? null} acciones={acciones.filter((a) => a.disparador_id === disp.id)}
          puede={puede5w && !faltaSql} hoy={hoy} cerrar={() => setAbierto(null)}
        />
      )}
    </>
  );
}

/** Las celdas de un día: una por turno, o una sola si el indicador es de valor único, semanal o mensual.
 *  Con permiso de capturar, cada casilla se toca para escribir (o corregir) su resultado. */
function Celdas({ i, f, turnos, nT, res, abrir }: {
  i: Indicador; f: string; turnos: Turno[]; nT: number; res: Map<string, Resultado>;
  abrir?: (fecha: string, t: Turno | undefined, r: Resultado | undefined) => void;
}) {
  const porTurno = i.frecuencia === "dia" && i.captura === "turnos" && turnos.length > 0;
  const dentro = (txt: string, fn: () => void, titulo?: string) => abrir
    ? <button type="button" className="tb-cel" onClick={fn} title={titulo ? `${titulo} · tocar para cambiar` : "Tocar para escribir el resultado"}>{txt}</button>
    : txt;
  if (!porTurno) {
    const dia = inicioPeriodo(f, i.frecuencia);
    let r = res.get(`${i.id}|${dia}|-`);
    /* Un diario de valor único que alguien cargó con turno: se muestra el peor del día. */
    if (!r && i.frecuencia === "dia") r = turnos.map((t) => res.get(`${i.id}|${dia}|${t.id}`)).filter(Boolean).sort((a, b) => PESO[b!.estado] - PESO[a!.estado])[0];
    const per = i.frecuencia !== "dia";
    const tit = per ? (i.frecuencia === "semana" ? "Valor de la semana" : "Valor del mes") : r?.comentario ?? undefined;
    return (
      <td colSpan={nT} className={"c ini " + (r?.estado ?? "sin") + (per ? " per" : "")} title={abrir ? undefined : tit}>
        {dentro(r ? conUnidad(r.valor, i) : "—", () => abrir!(dia, undefined, r?.turno_id ? undefined : r), tit)}
      </td>
    );
  }
  return (
    <>
      {turnos.map((t, k) => {
        const aplica = !i.turnos.length || i.turnos.includes(t.id);
        const r = aplica ? res.get(`${i.id}|${f}|${t.id}`) : undefined;
        return (
          <td key={t.id} className={"c" + (k === 0 ? " ini" : "") + (aplica ? " " + (r?.estado ?? "sin") : " na")} title={aplica ? (abrir ? undefined : r?.comentario ?? undefined) : "No se mide en este turno"}>
            {aplica ? dentro(r ? conUnidad(r.valor, i) : "—", () => abrir!(f, t, r), r?.comentario ?? undefined) : ""}
          </td>
        );
      })}
    </>
  );
}
