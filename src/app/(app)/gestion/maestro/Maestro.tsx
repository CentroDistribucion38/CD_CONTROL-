"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { FRECUENCIAS, fmt, textoDisparo, textoMeta, type Indicador, type Proceso, type Turno } from "@/modulos/gestion/semaforo";
import { activarIndicador, eliminarArea, guardarProceso, guardarTurno } from "../actions";
import { SoloVer } from "../comunes";
import { FichaIndicador, deIndicador, nuevoIndicador } from "../FichaIndicador";

type Pestana = "indicadores" | "procesos" | "turnos";

const aNum = (t: string): number | null => { const s = t.trim().replace(",", "."); return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null };

export function Maestro({ turnos, procesos, indicadores, puedeEditar }: {
  turnos: Turno[]; procesos: Proceso[]; indicadores: Indicador[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pend, start] = useTransition();
  const [pedir, dialogo] = useConfirmar();
  const [pestana, setPestana] = useState<Pestana>("indicadores");
  const [ficha, setFicha] = useState<ReturnType<typeof deIndicador> | null>(null);
  const [fp, setFp] = useState<{ id?: string; nombre: string; orden: string; activo: boolean } | null>(null);
  const [ft, setFt] = useState<{ id?: string; nombre: string; hora_ini: string; hora_fin: string; orden: string; activo: boolean } | null>(null);
  const pro = useMemo(() => new Map(procesos.map((p) => [p.id, p.nombre])), [procesos]);
  /* Cada KPI con sus PI debajo; al final los PI que no cuelgan de ningún KPI. */
  const ordenados = useMemo(() => {
    const o = (a: Indicador, b: Indicador) => a.orden - b.orden || a.codigo.localeCompare(b.codigo, "es", { numeric: true });
    const kpis = indicadores.filter((i) => i.tipo === "kpi").sort(o);
    const ids = new Set(kpis.map((k) => k.id));
    return [...kpis.flatMap((k) => [k, ...indicadores.filter((i) => i.tipo === "pi" && i.padre_id === k.id).sort(o)]),
      ...indicadores.filter((i) => i.tipo === "pi" && (!i.padre_id || !ids.has(i.padre_id))).sort(o)];
  }, [indicadores]);

  /* Eliminar un proceso: solo si ningún indicador cuelga de él (si tiene, se desactiva o se le cambian los indicadores). */
  const eliminarProceso = async (p: Proceso) => {
    const n = indicadores.filter((i) => i.proceso_id === p.id).length;
    if (n) { avisar.mal(`«${p.nombre}» tiene ${n} indicador${n === 1 ? "" : "es"}. Pásalos a otro proceso o desactívalo en vez de eliminarlo.`); return }
    if (!(await pedir({ titulo: `¿Eliminar «${p.nombre}»?`, dice: "Se borra de Supabase y deja de salir en el tablero. No tiene indicadores.", confirmar: "Eliminar", peligro: true }))) return;
    start(async () => fin(await eliminarArea(p.id), `«${p.nombre}» eliminado.`, () => { if (fp?.id === p.id) setFp(null) }));
  };
  const fin = (r: { error?: string; ok?: boolean }, bien: string, cerrar: () => void) => {
    if (r.error) { avisar.mal(r.error); return }
    avisar.bien(bien); cerrar(); router.refresh();
  };

  return (
    <>
      {avisos}{dialogo}
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · MAESTRO</p>
          <h1>Maestro</h1>
          <p className="sub">
            Aquí se parametriza todo: los turnos, los procesos y los indicadores. El KPI es solo su nombre y agrupa a sus PI;
            cada PI lleva su meta, su frecuencia, cómo se captura y cuándo salta su disparador. Nada de esto está escrito en el código.
          </p>
        </div>
      </section>

      {!puedeEditar && <SoloVer />}

      <div className="gs-chips" role="tablist">
        {([["indicadores", `Indicadores (${indicadores.length})`], ["procesos", `Procesos (${procesos.length})`], ["turnos", `Turnos (${turnos.length})`]] as [Pestana, string][]).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k} className={pestana === k ? "on" : ""} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>

      {/* ============================ INDICADORES ============================ */}
      {pestana === "indicadores" && (<>
        {puedeEditar && (
          <div className="gs-acc">
            <button type="button" className="btn" onClick={() => setFicha(nuevoIndicador(turnos, null))}>+ Nuevo KPI</button>
            <button type="button" className="btn plano" disabled={!indicadores.some((i) => i.tipo === "kpi" && i.activo)}
              title={indicadores.some((i) => i.tipo === "kpi" && i.activo) ? undefined : "Primero crea un KPI"}
              onClick={() => setFicha({ ...nuevoIndicador(turnos, null), tipo: "pi" })}>+ Nuevo PI</button>
          </div>
        )}

        <div className="gs-scroll">
          <table className="gs-t">
            <thead><tr><th>Código</th><th>Indicador</th><th>Proceso</th><th>Meta</th><th>Frecuencia</th><th>Disparador</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {ordenados.map((i) => i.tipo === "kpi" ? (
                <tr key={i.id} className={"gs-kpi" + (i.activo ? "" : " off")}>
                  <td className="mono">{i.codigo}</td>
                  <td colSpan={5}><span className="gs-tipo kpi">KPI</span><span className="gs-nom">{i.nombre}</span>
                    <small className="gs-sub">{indicadores.filter((x) => x.padre_id === i.id).length} PI · todas las áreas</small></td>
                  <td>{i.activo ? "Activo" : "Inactivo"}</td>
                  <td className="gs-acc">
                    {puedeEditar && <>
                      <button type="button" className="btn plano" onClick={() => setFicha(deIndicador(i, turnos))}>Editar</button>
                      <button type="button" className="btn plano" disabled={pend} onClick={() => start(async () => fin(await activarIndicador(i.id, !i.activo), i.activo ? "KPI desactivado." : "KPI activado.", () => {}))}>{i.activo ? "Desactivar" : "Activar"}</button>
                    </>}
                  </td>
                </tr>
              ) : (
                <tr key={i.id} className={i.activo ? "" : "off"}>
                  <td className="mono">{i.codigo}</td>
                  <td><span className="gs-tipo pi">PI</span><span className="gs-nom">{i.nombre}</span>
                    <small className="gs-sub">{i.padre_id ? `de ${indicadores.find((k) => k.id === i.padre_id)?.nombre ?? "—"}` : "sin KPI"}</small></td>
                  <td>{i.proceso_id ? pro.get(i.proceso_id) : "—"}<small className="gs-sub">Reunión nivel {i.nivel_reunion}</small></td>
                  <td className="gs-meta">{textoMeta(i)}</td>
                  <td>{FRECUENCIAS.find((x) => x.k === i.frecuencia)?.nombre}<small className="gs-sub">{i.captura === "turnos" ? `por turno (${i.turnos.length || "todos"})` : "valor único"}</small></td>
                  <td>{i.disparo_activo ? textoDisparo(i) : "—"}</td>
                  <td>{i.activo ? "Activo" : "Inactivo"}</td>
                  <td className="gs-acc">
                    {puedeEditar && <>
                      <button type="button" className="btn plano" onClick={() => setFicha(deIndicador(i, turnos))}>Editar</button>
                      <button type="button" className="btn plano" disabled={pend} onClick={() => start(async () => fin(await activarIndicador(i.id, !i.activo), i.activo ? "Indicador desactivado." : "Indicador activado.", () => {}))}>{i.activo ? "Desactivar" : "Activar"}</button>
                    </>}
                  </td>
                </tr>
              ))}
              {!indicadores.length && <tr><td colSpan={8} className="gs-vacio">Todavía no hay indicadores. Crea primero el KPI (solo su nombre) y después sus PI.</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}

      {ficha && <FichaIndicador key={ficha.id ?? "nuevo-" + ficha.tipo} inicial={ficha} indicadores={indicadores} procesos={procesos} turnos={turnos} cerrar={() => setFicha(null)} />}

      {/* ============================ PROCESOS ============================ */}
      {pestana === "procesos" && (<>
        {puedeEditar && !fp && <div><button type="button" className="btn" onClick={() => setFp({ nombre: "", orden: "0", activo: true })}>+ Nuevo proceso</button></div>}
        {fp && (
          <section className="gs-form">
            <h2>{fp.id ? "Editar proceso" : "Nuevo proceso"}</h2>
            <div className="gs-grid">
              <label className="ancho">Nombre<input value={fp.nombre} onChange={(e) => setFp({ ...fp, nombre: e.target.value })} placeholder="Ej.: Despachos" /></label>
              <label>Orden<input inputMode="numeric" value={fp.orden} onChange={(e) => setFp({ ...fp, orden: e.target.value })} /></label>
              <label className="gs-chk"><input type="checkbox" checked={fp.activo} onChange={(e) => setFp({ ...fp, activo: e.target.checked })} />Activo</label>
            </div>
            <div className="gs-acc">
              <button type="button" className="btn" disabled={pend} onClick={() => start(async () => fin(await guardarProceso({ id: fp.id, nombre: fp.nombre, orden: aNum(fp.orden) ?? 0, activo: fp.activo }), "Proceso guardado.", () => setFp(null)))}>Guardar proceso</button>
              <button type="button" className="btn plano" onClick={() => setFp(null)}>Cancelar</button>
            </div>
          </section>
        )}
        <div className="gs-scroll">
          <table className="gs-t">
            <thead><tr><th>Proceso</th><th>Indicadores</th><th>Orden</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {procesos.map((p) => (
                <tr key={p.id} className={p.activo ? "" : "off"}>
                  <td><span className="gs-nom">{p.nombre}</span></td>
                  <td>{indicadores.filter((i) => i.proceso_id === p.id).length}</td><td>{p.orden}</td><td>{p.activo ? "Activo" : "Inactivo"}</td>
                  <td className="gs-acc">{puedeEditar && (<>
                    <button type="button" className="btn plano" onClick={() => setFp({ id: p.id, nombre: p.nombre, orden: String(p.orden), activo: p.activo })}>Editar</button>
                    <button type="button" className="btn plano gs-borrar" disabled={pend} onClick={() => eliminarProceso(p)}>Eliminar</button>
                  </>)}</td>
                </tr>
              ))}
              {!procesos.length && <tr><td colSpan={5} className="gs-vacio">Sin procesos todavía. Los indicadores pueden quedar sin proceso, pero agruparlos ayuda al tablero.</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}

      {/* ============================ TURNOS ============================ */}
      {pestana === "turnos" && (<>
        {puedeEditar && !ft && <div><button type="button" className="btn" onClick={() => setFt({ nombre: "", hora_ini: "06:00", hora_fin: "14:00", orden: String(turnos.length + 1), activo: true })}>+ Nuevo turno</button></div>}
        {ft && (
          <section className="gs-form">
            <h2>{ft.id ? "Editar turno" : "Nuevo turno"}</h2>
            <div className="gs-grid">
              <label className="ancho">Nombre<input value={ft.nombre} onChange={(e) => setFt({ ...ft, nombre: e.target.value })} placeholder="Ej.: Turno 1" /></label>
              <label>Desde<input type="time" value={ft.hora_ini} onChange={(e) => setFt({ ...ft, hora_ini: e.target.value })} /></label>
              <label>Hasta<input type="time" value={ft.hora_fin} onChange={(e) => setFt({ ...ft, hora_fin: e.target.value })} /></label>
              <label>Orden<input inputMode="numeric" value={ft.orden} onChange={(e) => setFt({ ...ft, orden: e.target.value })} /></label>
              <label className="gs-chk"><input type="checkbox" checked={ft.activo} onChange={(e) => setFt({ ...ft, activo: e.target.checked })} />Activo</label>
            </div>
            <p className="gs-previa">Un turno que termina antes de empezar (por ejemplo 22:00 a 06:00) cruza la medianoche. El orden decide qué turno es «el último» del día para el disparador.</p>
            <div className="gs-acc">
              <button type="button" className="btn" disabled={pend} onClick={() => start(async () => fin(await guardarTurno({ id: ft.id, nombre: ft.nombre, hora_ini: ft.hora_ini, hora_fin: ft.hora_fin, orden: aNum(ft.orden) ?? 0, activo: ft.activo }), "Turno guardado.", () => setFt(null)))}>Guardar turno</button>
              <button type="button" className="btn plano" onClick={() => setFt(null)}>Cancelar</button>
            </div>
          </section>
        )}
        <div className="gs-scroll">
          <table className="gs-t">
            <thead><tr><th>Turno</th><th>Horario</th><th>Orden</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id} className={t.activo ? "" : "off"}>
                  <td><span className="gs-nom">{t.nombre}</span></td><td className="mono">{t.hora_ini.slice(0, 5)} – {t.hora_fin.slice(0, 5)}</td>
                  <td>{fmt(t.orden)}</td><td>{t.activo ? "Activo" : "Inactivo"}</td>
                  <td className="gs-acc">{puedeEditar && <button type="button" className="btn plano" onClick={() => setFt({ id: t.id, nombre: t.nombre, hora_ini: t.hora_ini.slice(0, 5), hora_fin: t.hora_fin.slice(0, 5), orden: String(t.orden), activo: t.activo })}>Editar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </>
  );
}
