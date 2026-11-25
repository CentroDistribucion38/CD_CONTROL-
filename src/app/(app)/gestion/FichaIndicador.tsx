"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import { FRECUENCIAS, OPERADORES, textoDisparo, textoMeta, type Indicador, type Op, type Proceso, type Turno } from "@/modulos/gestion/semaforo";
import { activarIndicador, eliminarIndicador, guardarIndicador } from "./actions";

/* El formulario trabaja con texto (lo que se escribe) y se convierte al guardar. */
type Form = {
  id?: string; codigo: string; nombre: string; tipo: "kpi" | "pi"; padre_id: string; proceso_id: string; nivel_reunion: 1 | 2;
  unidad: string; decimales: string; meta_op: Op; meta_valor: string; frecuencia: "dia" | "semana" | "mes"; captura: "turnos" | "unico";
  turnos: string[]; responsable: string; disparo_activo: boolean; disparo_consecutivos: string; orden: string; activo: boolean;
};
const aNum = (t: string): number | null => { const s = t.trim().replace(/\s/g, "").replace(",", "."); return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null };

/** Lo que trae un indicador nuevo: el área desde donde se creó, todos los turnos, disparador a 3 seguidos. */
export function nuevoIndicador(turnos: Turno[], area: string | null, padre?: Indicador): Form {
  return {
    codigo: "", nombre: "", tipo: padre ? "pi" : "kpi", padre_id: padre?.id ?? "", proceso_id: padre?.proceso_id ?? area ?? "", nivel_reunion: 1,
    unidad: "%", decimales: "2", meta_op: "<=", meta_valor: "", frecuencia: "dia", captura: "turnos",
    turnos: turnos.filter((t) => t.activo).map((t) => t.id), responsable: "", disparo_activo: true, disparo_consecutivos: "3", orden: "0", activo: true,
  };
}
/** «Sin turnos marcados» en la base quiere decir todos: en la ficha salen todos marcados. */
export const deIndicador = (i: Indicador, turnos: Turno[]): Form => ({
  id: i.id, codigo: i.codigo, nombre: i.nombre, tipo: i.tipo, padre_id: i.padre_id ?? "", proceso_id: i.proceso_id ?? "", nivel_reunion: i.nivel_reunion,
  unidad: i.unidad, decimales: String(i.decimales), meta_op: i.meta_op, meta_valor: String(i.meta_valor).replace(".", ","),
  frecuencia: i.frecuencia, captura: i.captura, turnos: i.turnos.length ? i.turnos : turnos.filter((t) => t.activo).map((t) => t.id), responsable: i.responsable ?? "",
  disparo_activo: i.disparo_activo, disparo_consecutivos: String(i.disparo_consecutivos), orden: String(i.orden), activo: i.activo,
});

/**
 * LA FICHA DEL INDICADOR, desde el tablero: todo lo que antes solo se hacía en Maestro.
 * Qué es (KPI o PI y a qué KPI explica), nombre y código, área, responsable y reunión; la meta con su unidad;
 * cómo se captura (diaria por turno —en qué turnos—, valor único, semanal o mensual); el disparador; el orden;
 * y al final activar / desactivar o eliminar (eliminar solo si no tiene historia).
 */
export function FichaIndicador({ inicial, indicadores, procesos, turnos, cerrar }: {
  inicial: Form; indicadores: Indicador[]; procesos: Proceso[]; turnos: Turno[]; cerrar: () => void;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const [pend, start] = useTransition();
  const [f, setF] = useState<Form>(inicial);
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape" && !dialogo) cerrar() };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [cerrar, dialogo]);

  const poner = (c: Partial<Form>) => setF((x) => ({ ...x, ...c }));
  const kpis = indicadores.filter((i) => i.tipo === "kpi" && i.activo && i.id !== f.id);
  const tAct = turnos.filter((t) => t.activo).sort((a, b) => a.orden - b.orden);
  const meta = aNum(f.meta_valor), n = aNum(f.disparo_consecutivos) ?? 1, dec = aNum(f.decimales) ?? 0;
  const unidadN = f.frecuencia === "semana" ? (n === 1 ? "semana" : "semanas") : f.frecuencia === "mes" ? (n === 1 ? "mes" : "meses")
    : f.captura === "turnos" ? (n === 1 ? "turno" : "turnos") : (n === 1 ? "día" : "días");
  const original = f.id ? indicadores.find((i) => i.id === f.id) : undefined;

  const falta = !f.nombre.trim() ? "Ponle nombre." : meta == null ? "Escribe la meta." : f.tipo === "pi" && !f.padre_id ? "Escoge el KPI al que explica."
    : f.captura === "turnos" && f.frecuencia === "dia" && tAct.length > 0 && !f.turnos.length ? "Escoge al menos un turno." : null;

  const guardar = () => start(async () => {
    if (falta) { avisar.mal(falta); return }
    const r = await guardarIndicador({
      id: f.id, codigo: f.codigo, nombre: f.nombre, tipo: f.tipo, padre_id: f.tipo === "pi" ? f.padre_id || null : null,
      proceso_id: f.proceso_id || null, nivel_reunion: f.nivel_reunion, unidad: f.unidad, decimales: dec,
      meta_op: f.meta_op, meta_valor: meta!, amarillo_op: null, amarillo_valor: null, rojo_op: null, rojo_valor: null,
      frecuencia: f.frecuencia, captura: f.captura, turnos: f.turnos, responsable: f.responsable || null,
      disparo_activo: f.disparo_activo, disparo_en: "rojo", disparo_consecutivos: n, orden: aNum(f.orden) ?? 0, activo: f.activo,
    });
    if (r.error) { avisar.mal(r.error); return }
    avisar.bien(f.id ? "Indicador guardado." : "Indicador creado."); router.refresh(); cerrar();
  });

  const activar = () => original && start(async () => {
    const r = await activarIndicador(original.id, !original.activo);
    if (r.error) { avisar.mal(r.error); return }
    avisar.bien(original.activo ? "Desactivado: sale del tablero y conserva su historia." : "Activado."); router.refresh(); cerrar();
  });
  const eliminar = async () => {
    if (!original) return;
    if (!(await pedir({ titulo: `¿Eliminar ${original.codigo}?`, dice: "Se borra de Supabase. Solo se puede si no tiene resultados, disparadores ni PI colgando.", confirmar: "Eliminar", peligro: true }))) return;
    start(async () => {
      const r = await eliminarIndicador(original.id);
      if (r.error) {
        if ("conHistoria" in r && r.conHistoria && original.activo
          && await pedir({ titulo: "No se puede eliminar", dice: `${r.error} ¿Lo desactivo?`, confirmar: "Desactivar" })) { activar(); return }
        avisar.mal(r.error); return;
      }
      avisar.bien(`${original.codigo} eliminado.`); router.refresh(); cerrar();
    });
  };

  return (
    <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="fi-t" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      {avisos}{dialogo}
      <div className="cf-caja fi-caja">
        <h2 id="fi-t">{f.id ? `${f.codigo} · ficha del indicador` : "Nuevo indicador"}</h2>

        <div className="fi-seg" role="group" aria-label="Tipo">
          <button type="button" aria-pressed={f.tipo === "kpi"} onClick={() => poner({ tipo: "kpi", padre_id: "" })}>KPI · el resultado</button>
          <button type="button" aria-pressed={f.tipo === "pi"} onClick={() => poner({ tipo: "pi" })}>PI · indicador de proceso</button>
        </div>

        <div className="fi-grid">
          <label className="ancho"><span>Indicador</span><input value={f.nombre} onChange={(e) => poner({ nombre: e.target.value })} placeholder="Ej.: DCBL — descuadre de bodega" autoFocus /></label>
          <label><span>Código</span><input value={f.codigo} onChange={(e) => poner({ codigo: e.target.value })} placeholder="Automático (KPI-002)" /></label>
          {f.tipo === "pi" && (
            <label><span>KPI al que explica</span>
              <select value={f.padre_id} onChange={(e) => { const k = indicadores.find((i) => i.id === e.target.value); poner({ padre_id: e.target.value, proceso_id: k?.proceso_id ?? f.proceso_id }) }}>
                <option value="">— escoge —</option>
                {kpis.map((k) => <option key={k.id} value={k.id}>{k.codigo} · {k.nombre}</option>)}
              </select>
            </label>
          )}
          <label><span>Área</span>
            <select value={f.proceso_id} onChange={(e) => poner({ proceso_id: e.target.value })}>
              <option value="">Sin área</option>
              {procesos.filter((p) => p.activo || p.id === f.proceso_id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label><span>Responsable</span><input value={f.responsable} onChange={(e) => poner({ responsable: e.target.value })} placeholder="Quién responde por él" /></label>
          <label><span>Reunión</span>
            <select value={f.nivel_reunion} onChange={(e) => poner({ nivel_reunion: Number(e.target.value) === 2 ? 2 : 1 })}>
              <option value={1}>Nivel 1</option><option value={2}>Nivel 2</option>
            </select>
          </label>
        </div>

        <h3>Meta</h3>
        <div className="fi-grid">
          <div className="ancho fi-meta">
            <select value={f.meta_op} onChange={(e) => poner({ meta_op: e.target.value as Op })} aria-label="Operador">
              {OPERADORES.map((o) => <option key={o.k} value={o.k}>{o.t}</option>)}
            </select>
            <input inputMode="decimal" value={f.meta_valor} onChange={(e) => poner({ meta_valor: e.target.value })} placeholder="Valor" aria-label="Valor de la meta" />
            <input value={f.unidad} onChange={(e) => poner({ unidad: e.target.value })} placeholder="Unidad" aria-label="Unidad" className="u" />
            <select value={f.decimales} onChange={(e) => poner({ decimales: e.target.value })} aria-label="Decimales">
              {[0, 1, 2, 3, 4].map((d) => <option key={d} value={String(d)}>{d} decimal{d === 1 ? "" : "es"}</option>)}
            </select>
          </div>
        </div>

        <h3>Captura</h3>
        <div className="fi-grid">
          <label><span>Frecuencia</span>
            <select value={f.frecuencia} onChange={(e) => { const fr = e.target.value as Form["frecuencia"]; poner({ frecuencia: fr, captura: fr === "dia" ? f.captura : "unico" }) }}>
              {FRECUENCIAS.map((x) => <option key={x.k} value={x.k}>{x.nombre}</option>)}
            </select>
          </label>
          <label><span>Cómo se digita</span>
            <select value={f.captura} disabled={f.frecuencia !== "dia"} onChange={(e) => poner({ captura: e.target.value as Form["captura"] })}>
              <option value="turnos">Por turno</option><option value="unico">Un valor por día</option>
            </select>
          </label>
          {f.captura === "turnos" && f.frecuencia === "dia" && (
            <div className="ancho fi-turnos"><span>En qué turnos se mide</span>
              {tAct.map((t) => (
                <label key={t.id}><input type="checkbox" checked={f.turnos.includes(t.id)}
                  onChange={(e) => poner({ turnos: e.target.checked ? [...f.turnos, t.id] : f.turnos.filter((x) => x !== t.id) })} />
                  {t.nombre} <small>{t.hora_ini.slice(0, 5)}–{t.hora_fin.slice(0, 5)}</small></label>
              ))}
              {!tAct.length && <em>No hay turnos activos: créalos en «Turnos».</em>}
            </div>
          )}
        </div>

        <h3>Disparador</h3>
        <div className="fi-grid">
          <label className="ancho fi-chk"><input type="checkbox" checked={f.disparo_activo} onChange={(e) => poner({ disparo_activo: e.target.checked })} /> Salta cuando no cumple la meta</label>
          <div className="ancho fi-meta">
            <input type="number" min={1} max={30} value={f.disparo_consecutivos} disabled={!f.disparo_activo} onChange={(e) => poner({ disparo_consecutivos: e.target.value })} aria-label="Veces seguidas" className="n" />
            <em>{unidadN} seguido{n === 1 ? "" : "s"}</em>
          </div>
          <label><span>Orden en el tablero</span><input inputMode="numeric" value={f.orden} onChange={(e) => poner({ orden: e.target.value })} /></label>
          <label className="fi-chk"><input type="checkbox" checked={f.activo} onChange={(e) => poner({ activo: e.target.checked })} /> Activo (sale en el tablero)</label>
        </div>

        <p className="fi-previa">
          {meta == null ? "Escribe la meta. " : <>Cumple si <b>{textoMeta({ meta_op: f.meta_op, meta_valor: meta, unidad: f.unidad, decimales: dec })}</b>. </>}
          {f.disparo_activo ? <>El disparador salta cuando {textoDisparo({ disparo_consecutivos: n }).replace(/resultados?/, unidadN)}.</> : "Sin disparador."}
          {f.id && <> Lo ya capturado conserva su color: la meta nueva cuenta desde el próximo resultado.</>}
        </p>

        <div className="cf-botones fi-bot">
          {original && <>
            <button type="button" className="cf-btn plano fi-borrar" disabled={pend} onClick={eliminar}>Eliminar</button>
            <button type="button" className="cf-btn plano" disabled={pend} onClick={activar}>{original.activo ? "Desactivar" : "Activar"}</button>
          </>}
          <span className="fi-esp" />
          <button type="button" className="cf-btn plano" onClick={cerrar}>Cancelar</button>
          <button type="button" className="cf-btn" disabled={pend || !!falta} title={falta ?? undefined} onClick={guardar}>{pend ? "Guardando…" : f.id ? "Guardar" : "Crear indicador"}</button>
        </div>
      </div>
    </div>
  );
}
