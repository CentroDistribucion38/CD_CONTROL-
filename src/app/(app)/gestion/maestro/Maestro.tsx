"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import {
  FRECUENCIAS, OPERADORES, SIMBOLO, fmt, textoDisparo, textoMeta, textoRegla,
  type Indicador, type Op, type Proceso, type Turno,
} from "@/modulos/gestion/semaforo";
import { activarIndicador, guardarIndicador, guardarProceso, guardarTurno, type FormIndicador } from "../actions";
import { SoloVer } from "../comunes";

type Pestana = "indicadores" | "procesos" | "turnos";

/* El formulario trabaja con texto (lo que escribe la gente) y se convierte al guardar. */
type Form = {
  id?: string; codigo: string; nombre: string; tipo: "kpi" | "pi"; padre_id: string; proceso_id: string; nivel_reunion: 1 | 2;
  unidad: string; decimales: string; meta_op: Op; meta_valor: string; amarillo_op: Op | ""; amarillo_valor: string;
  rojo_op: Op | ""; rojo_valor: string; frecuencia: "dia" | "semana" | "mes"; captura: "turnos" | "unico"; turnos: string[];
  responsable: string; disparo_activo: boolean; disparo_en: "rojo" | "amarillo"; disparo_consecutivos: string; orden: string; activo: boolean;
};

const VACIO = (turnos: Turno[]): Form => ({
  codigo: "", nombre: "", tipo: "kpi", padre_id: "", proceso_id: "", nivel_reunion: 1, unidad: "%", decimales: "0",
  meta_op: ">=", meta_valor: "", amarillo_op: "", amarillo_valor: "", rojo_op: "", rojo_valor: "", frecuencia: "dia", captura: "turnos",
  turnos: turnos.filter((t) => t.activo).map((t) => t.id), responsable: "", disparo_activo: true, disparo_en: "rojo",
  disparo_consecutivos: "1", orden: "0", activo: true,
});
const DE = (i: Indicador): Form => ({
  id: i.id, codigo: i.codigo, nombre: i.nombre, tipo: i.tipo, padre_id: i.padre_id ?? "", proceso_id: i.proceso_id ?? "", nivel_reunion: i.nivel_reunion,
  unidad: i.unidad, decimales: String(i.decimales), meta_op: i.meta_op, meta_valor: String(i.meta_valor),
  amarillo_op: i.amarillo_op ?? "", amarillo_valor: i.amarillo_valor == null ? "" : String(i.amarillo_valor),
  rojo_op: i.rojo_op ?? "", rojo_valor: i.rojo_valor == null ? "" : String(i.rojo_valor),
  frecuencia: i.frecuencia, captura: i.captura, turnos: i.turnos, responsable: i.responsable ?? "",
  disparo_activo: i.disparo_activo, disparo_en: i.disparo_en, disparo_consecutivos: String(i.disparo_consecutivos), orden: String(i.orden), activo: i.activo,
});
const aNum = (t: string): number | null => { const s = t.trim().replace(",", "."); return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null };

export function Maestro({ turnos, procesos, indicadores, puedeEditar }: {
  turnos: Turno[]; procesos: Proceso[]; indicadores: Indicador[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pend, start] = useTransition();
  const [pestana, setPestana] = useState<Pestana>("indicadores");
  const [f, setF] = useState<Form | null>(null);
  const [fp, setFp] = useState<{ id?: string; nombre: string; orden: string; activo: boolean } | null>(null);
  const [ft, setFt] = useState<{ id?: string; nombre: string; hora_ini: string; hora_fin: string; orden: string; activo: boolean } | null>(null);
  const pro = useMemo(() => new Map(procesos.map((p) => [p.id, p.nombre])), [procesos]);
  const kpis = indicadores.filter((i) => i.tipo === "kpi" && i.activo);

  const fin = (r: { error?: string; ok?: boolean }, bien: string, cerrar: () => void) => {
    if (r.error) { avisar.mal(r.error); return }
    avisar.bien(bien); cerrar(); router.refresh();
  };

  const guardarInd = () => f && start(async () => {
    const meta = aNum(f.meta_valor);
    if (meta == null) { avisar.mal("La meta necesita un número."); return }
    const body: FormIndicador = {
      id: f.id, codigo: f.codigo, nombre: f.nombre, tipo: f.tipo, padre_id: f.tipo === "pi" ? f.padre_id || null : null,
      proceso_id: f.proceso_id || null, nivel_reunion: f.nivel_reunion, unidad: f.unidad, decimales: aNum(f.decimales) ?? 0,
      meta_op: f.meta_op, meta_valor: meta,
      amarillo_op: f.amarillo_op || null, amarillo_valor: f.amarillo_op ? aNum(f.amarillo_valor) : null,
      rojo_op: f.rojo_op || null, rojo_valor: f.rojo_op ? aNum(f.rojo_valor) : null,
      frecuencia: f.frecuencia, captura: f.captura, turnos: f.turnos, responsable: f.responsable || null,
      disparo_activo: f.disparo_activo, disparo_en: f.disparo_en, disparo_consecutivos: aNum(f.disparo_consecutivos) ?? 1,
      orden: aNum(f.orden) ?? 0, activo: f.activo,
    };
    fin(await guardarIndicador(body), f.id ? "Indicador actualizado." : "Indicador creado.", () => setF(null));
  });

  const vistaPrevia = (x: Form) => {
    const u = { unidad: x.unidad, decimales: aNum(x.decimales) ?? 0 };
    const meta = aNum(x.meta_valor);
    const a = textoRegla((x.amarillo_op || null) as Op | null, aNum(x.amarillo_valor), u);
    const r = textoRegla((x.rojo_op || null) as Op | null, aNum(x.rojo_valor), u);
    return [
      meta == null ? "Escribe la meta." : `Cumple si ${textoMeta({ meta_op: x.meta_op, meta_valor: meta, ...u })}.`,
      a ? `Alerta si ${a}.` : "", r ? `Crítico si ${r}.` : "",
      x.disparo_activo ? `El disparador salta con ${textoDisparo({ disparo_en: x.disparo_en, disparo_consecutivos: aNum(x.disparo_consecutivos) ?? 1 })}.` : "Sin disparador.",
    ].filter(Boolean).join(" ");
  };

  const selOp = (v: Op | "", on: (o: Op | "") => void, vacio?: string) => (
    <select value={v} onChange={(e) => on(e.target.value as Op | "")}>
      {vacio !== undefined && <option value="">{vacio}</option>}
      {OPERADORES.map((o) => <option key={o.k} value={o.k}>{SIMBOLO[o.k]} {o.t.split(" ").slice(1).join(" ")}</option>)}
    </select>
  );

  return (
    <>
      {avisos}
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · MAESTRO</p>
          <h1>Maestro</h1>
          <p className="sub">
            Aquí se parametriza todo: los turnos, los procesos y los indicadores —KPI y PI— con su meta, sus umbrales, su frecuencia,
            cómo se captura y cuándo salta su disparador. Nada de esto está escrito en el código.
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
        {puedeEditar && !f && <div><button type="button" className="btn" onClick={() => setF(VACIO(turnos))}>+ Nuevo indicador</button></div>}

        {f && (
          <section className="gs-form">
            <h2>{f.id ? `Editar ${f.codigo}` : "Nuevo indicador"}</h2>
            <div className="gs-seg" role="group" aria-label="Tipo">
              <button type="button" className={f.tipo === "kpi" ? "on" : ""} onClick={() => setF({ ...f, tipo: "kpi", padre_id: "" })}>KPI · el resultado</button>
              <button type="button" className={f.tipo === "pi" ? "on" : ""} onClick={() => setF({ ...f, tipo: "pi" })}>PI · indicador de proceso</button>
            </div>
            <div className="gs-grid">
              <label className="ancho">Nombre<input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Cumplimiento del plan de despacho" /></label>
              <label>Código<input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Automático" /></label>
              {f.tipo === "pi" && (
                <label>KPI al que explica
                  <select value={f.padre_id} onChange={(e) => setF({ ...f, padre_id: e.target.value })}>
                    <option value="">— escoge —</option>
                    {kpis.map((k) => <option key={k.id} value={k.id}>{k.codigo} · {k.nombre}</option>)}
                  </select>
                </label>
              )}
              <label>Proceso
                <select value={f.proceso_id} onChange={(e) => setF({ ...f, proceso_id: e.target.value })}>
                  <option value="">Sin proceso</option>
                  {procesos.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
              <label>Reunión
                <select value={f.nivel_reunion} onChange={(e) => setF({ ...f, nivel_reunion: Number(e.target.value) === 2 ? 2 : 1 })}>
                  <option value={1}>Nivel 1</option><option value={2}>Nivel 2</option>
                </select>
              </label>
              <label>Responsable<input value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} placeholder="Quién responde por él" /></label>
              <label>Unidad<input value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} placeholder="%, cajas, min…" /></label>
              <label>Decimales<input inputMode="numeric" value={f.decimales} onChange={(e) => setF({ ...f, decimales: e.target.value })} /></label>
            </div>

            <h3>Meta y semáforo</h3>
            <div className="gs-grid gs-reglas">
              <div className="gs-regla meta"><span>Meta (cumple si)</span>{selOp(f.meta_op, (o) => o && setF({ ...f, meta_op: o }))}<input inputMode="decimal" value={f.meta_valor} onChange={(e) => setF({ ...f, meta_valor: e.target.value })} placeholder="Valor" /></div>
              <div className="gs-regla amarillo"><span>Alerta (opcional)</span>{selOp(f.amarillo_op, (o) => setF({ ...f, amarillo_op: o }), "Sin umbral")}<input inputMode="decimal" value={f.amarillo_valor} disabled={!f.amarillo_op} onChange={(e) => setF({ ...f, amarillo_valor: e.target.value })} placeholder="Valor" /></div>
              <div className="gs-regla rojo"><span>Crítico (opcional)</span>{selOp(f.rojo_op, (o) => setF({ ...f, rojo_op: o }), "Sin umbral")}<input inputMode="decimal" value={f.rojo_valor} disabled={!f.rojo_op} onChange={(e) => setF({ ...f, rojo_valor: e.target.value })} placeholder="Valor" /></div>
            </div>

            <h3>Captura</h3>
            <div className="gs-grid">
              <label>Frecuencia
                <select value={f.frecuencia} onChange={(e) => { const fr = e.target.value as Form["frecuencia"]; setF({ ...f, frecuencia: fr, captura: fr === "dia" ? f.captura : "unico" }) }}>
                  {FRECUENCIAS.map((x) => <option key={x.k} value={x.k}>{x.nombre}</option>)}
                </select>
              </label>
              <label>Cómo se digita
                <select value={f.captura} disabled={f.frecuencia !== "dia"} onChange={(e) => setF({ ...f, captura: e.target.value as Form["captura"] })}>
                  <option value="turnos">Por turno</option><option value="unico">Valor único</option>
                </select>
              </label>
              {f.captura === "turnos" && f.frecuencia === "dia" && (
                <div className="gs-checks ancho"><span>En qué turnos</span>
                  {turnos.filter((t) => t.activo).map((t) => (
                    <label key={t.id}><input type="checkbox" checked={f.turnos.includes(t.id)}
                      onChange={(e) => setF({ ...f, turnos: e.target.checked ? [...f.turnos, t.id] : f.turnos.filter((x) => x !== t.id) })} />{t.nombre}</label>
                  ))}
                </div>
              )}
            </div>

            <h3>Disparador</h3>
            <div className="gs-grid">
              <label className="gs-chk"><input type="checkbox" checked={f.disparo_activo} onChange={(e) => setF({ ...f, disparo_activo: e.target.checked })} />Salta solo cuando se desvía</label>
              <label>Salta con
                <select value={f.disparo_en} disabled={!f.disparo_activo} onChange={(e) => setF({ ...f, disparo_en: e.target.value as "rojo" | "amarillo" })}>
                  <option value="rojo">Crítico (rojo)</option><option value="amarillo">Alerta o crítico</option>
                </select>
              </label>
              <label>Resultados seguidos
                <input inputMode="numeric" value={f.disparo_consecutivos} disabled={!f.disparo_activo} onChange={(e) => setF({ ...f, disparo_consecutivos: e.target.value })} />
              </label>
              <label>Orden<input inputMode="numeric" value={f.orden} onChange={(e) => setF({ ...f, orden: e.target.value })} /></label>
              <label className="gs-chk"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />Activo (se pide y se ve)</label>
            </div>

            <p className="gs-previa">{vistaPrevia(f)}</p>
            <div className="gs-acc">
              <button type="button" className="btn" disabled={pend} onClick={guardarInd}>{pend ? "Guardando…" : "Guardar indicador"}</button>
              <button type="button" className="btn plano" onClick={() => setF(null)}>Cancelar</button>
            </div>
          </section>
        )}

        <div className="gs-scroll">
          <table className="gs-t">
            <thead><tr><th>Código</th><th>Indicador</th><th>Proceso</th><th>Meta</th><th>Frecuencia</th><th>Disparador</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {indicadores.map((i) => (
                <tr key={i.id} className={i.activo ? "" : "off"}>
                  <td className="mono">{i.codigo}</td>
                  <td><span className={"gs-tipo " + i.tipo}>{i.tipo === "kpi" ? "KPI" : "PI"}</span><span className="gs-nom">{i.nombre}</span>
                    {i.padre_id && <small className="gs-sub">explica a {indicadores.find((k) => k.id === i.padre_id)?.codigo ?? "—"}</small>}</td>
                  <td>{i.proceso_id ? pro.get(i.proceso_id) : "—"}<small className="gs-sub">Reunión nivel {i.nivel_reunion}</small></td>
                  <td className="gs-meta">{textoMeta(i)}
                    {(i.amarillo_op || i.rojo_op) && <small className="gs-sub">{[i.amarillo_op && `alerta ${textoRegla(i.amarillo_op, i.amarillo_valor, i)}`, i.rojo_op && `crítico ${textoRegla(i.rojo_op, i.rojo_valor, i)}`].filter(Boolean).join(" · ")}</small>}</td>
                  <td>{FRECUENCIAS.find((x) => x.k === i.frecuencia)?.nombre}<small className="gs-sub">{i.captura === "turnos" ? `por turno (${i.turnos.length || "todos"})` : "valor único"}</small></td>
                  <td>{i.disparo_activo ? textoDisparo(i) : "—"}</td>
                  <td>{i.activo ? "Activo" : "Inactivo"}</td>
                  <td className="gs-acc">
                    {puedeEditar && <>
                      <button type="button" className="btn plano" onClick={() => { setF(DE(i)); window.scrollTo({ top: 0, behavior: "smooth" }) }}>Editar</button>
                      <button type="button" className="btn plano" disabled={pend} onClick={() => start(async () => fin(await activarIndicador(i.id, !i.activo), i.activo ? "Indicador desactivado." : "Indicador activado.", () => {}))}>{i.activo ? "Desactivar" : "Activar"}</button>
                    </>}
                  </td>
                </tr>
              ))}
              {!indicadores.length && <tr><td colSpan={8} className="gs-vacio">Todavía no hay indicadores. Crea el primero con «Nuevo indicador».</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}

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
                  <td className="gs-acc">{puedeEditar && <button type="button" className="btn plano" onClick={() => setFp({ id: p.id, nombre: p.nombre, orden: String(p.orden), activo: p.activo })}>Editar</button>}</td>
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
