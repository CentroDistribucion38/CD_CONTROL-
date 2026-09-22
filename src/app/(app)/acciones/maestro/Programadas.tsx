"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Carga, Motivo, Programada, Zona } from "@/modulos/acciones/datos";

/**
 * PREVENTIVAS PROGRAMADAS — «revisar extintores cada mes».
 *
 * Se programa una vez: qué, dónde, cada cuánto y a quién. El día que le
 * toca, la acción preventiva se crea sola con su plazo y su dueño. La
 * lista dice cuándo sale la próxima de cada una.
 */
const CADA = [
  { v: "dia", t: "Cada día" }, { v: "semana", t: "Cada semana" }, { v: "quincena", t: "Cada 15 días" },
  { v: "mes", t: "Cada mes" }, { v: "trimestre", t: "Cada 3 meses" },
] as const;
const hoyLocal = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
const vacia = () => ({ id: null as string | null, titulo: "", motivo: "", zona: "", ubicacion: "", prioridad: "media",
  equipo: "", responsable: "", cada: "mes", proxima: hoyLocal(), activo: true });

export function Programadas({ lista, zonas, motivos, equipos, gente, puedeEditar }: {
  lista: Programada[] | null; zonas: Zona[]; motivos: Motivo[];
  equipos: { clave: string; nombre: string }[]; gente: Carga[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState<ReturnType<typeof vacia> | null>(null);
  const [mal, setMal] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);
  const pon = (k: string, v: string | boolean) => setF((x) => (x ? { ...x, [k]: v } : x));
  const nZona = (c: string | null) => zonas.find((z) => z.codigo === c)?.nombre ?? c ?? "";
  const nMot = (c: string) => motivos.find((m) => m.clave === c)?.nombre ?? c;
  const nQuien = (p: Programada) =>
    (p.responsable && (gente.find((g) => g.id === p.responsable)?.nombre ?? "—")) ||
    (p.equipo && (equipos.find((e) => e.clave === p.equipo)?.nombre ?? p.equipo)) || "Sin dueño";

  async function guardar() {
    if (!f) return;
    setMandando(true); setMal(null);
    const { error } = await supabase.rpc("acciones_programada_guardar", {
      p_id: f.id, p_titulo: f.titulo, p_motivo: f.motivo, p_zona: f.zona || null, p_ubicacion: f.ubicacion || null,
      p_prioridad: f.prioridad, p_equipo: f.equipo || null, p_responsable: f.responsable || null,
      p_cada: f.cada, p_proxima: f.proxima, p_activo: f.activo,
    });
    setMandando(false);
    if (error) { setMal(error.message); return }
    setF(null); router.refresh();
  }
  async function borrar(id: string) {
    setMandando(true);
    const { error } = await supabase.rpc("acciones_programada_borrar", { p_id: id });
    setMandando(false);
    if (error) { setMal(error.message); return }
    setF(null); router.refresh();
  }

  const listo = !!f && f.titulo.trim().length >= 3 && !!f.motivo && (!!f.zona || f.ubicacion.trim() !== "") && !!f.proxima;

  return (
    <section className="caja ac-prog">
      <div className="cab">
        <div>
          <h2>Preventivas programadas</h2>
          <p>Se programan una vez y se crean solas el día que les toca, con su plazo y su dueño.</p>
        </div>
        {puedeEditar && lista && !f && <button type="button" className="btn si" onClick={() => setF(vacia())}>Programar una</button>}
      </div>

      {lista === null ? (
        <div className="aviso" style={{ margin: 12 }}>
          Falta correr <code>supabase/migraciones/2026-09-acciones-programadas.sql</code> en Supabase.
        </div>
      ) : (
        <>
          {f && (
            <div className="ac-prog-form">
              <label className="ancho"><span>Qué hay que hacer</span>
                <input value={f.titulo} onChange={(e) => pon("titulo", e.target.value)} placeholder="Revisar extintores del pasillo 3" /></label>
              <label><span>Motivo</span>
                <select value={f.motivo} onChange={(e) => pon("motivo", e.target.value)}>
                  <option value="">Escoge…</option>
                  {motivos.map((m) => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
                </select></label>
              <label><span>Cada cuánto</span>
                <select value={f.cada} onChange={(e) => pon("cada", e.target.value)}>
                  {CADA.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}
                </select></label>
              <label><span>Primera vez</span>
                <input type="date" value={f.proxima} onChange={(e) => pon("proxima", e.target.value)} /></label>
              <label><span>Zona</span>
                <select value={f.zona} onChange={(e) => pon("zona", e.target.value)}>
                  <option value="">Sin zona (escribe dónde)</option>
                  {zonas.map((z) => <option key={z.codigo} value={z.codigo}>{z.codigo} · {z.nombre}</option>)}
                </select></label>
              <label><span>Dónde, más preciso</span>
                <input value={f.ubicacion} onChange={(e) => pon("ubicacion", e.target.value)} placeholder={f.zona ? "Opcional" : "Obligatorio sin zona"} /></label>
              <label><span>Prioridad</span>
                <select value={f.prioridad} onChange={(e) => pon("prioridad", e.target.value)}>
                  <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
                </select></label>
              <label><span>Responsable</span>
                <select value={f.responsable} onChange={(e) => pon("responsable", e.target.value)}>
                  <option value="">—</option>
                  {gente.map((g) => <option key={g.id} value={g.id}>{g.nombre || g.usuario}</option>)}
                </select></label>
              <label><span>O un equipo</span>
                <select value={f.equipo} onChange={(e) => pon("equipo", e.target.value)}>
                  <option value="">—</option>
                  {equipos.map((e) => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
                </select></label>
              <label className="chk"><input type="checkbox" checked={f.activo} onChange={(e) => pon("activo", e.target.checked)} /> Activa</label>
              {mal && <p className="ac-prog-mal" role="alert">{mal}</p>}
              <div className="ac-prog-bot">
                <button type="button" className="btn si" disabled={!listo || mandando} onClick={guardar}>
                  {mandando ? "Guardando…" : f.id ? "Guardar cambios" : "Programar"}</button>
                <button type="button" className="btn" onClick={() => { setF(null); setMal(null) }}>Cancelar</button>
                {f.id && <button type="button" className="btn mal" disabled={mandando} onClick={() => borrar(f.id!)}>Borrar</button>}
              </div>
            </div>
          )}

          {lista.length === 0 && !f ? (
            <p className="ac-prog-vacio">Nada programado todavía. Ejemplos: revisar extintores cada mes, orden y aseo cada semana, montacargas cada 15 días.</p>
          ) : (
            <ul className="ac-prog-lista">
              {lista.map((p) => (
                <li key={p.id} className={p.activo ? "" : "apagada"}>
                  <div className="q">
                    <b>{p.titulo}</b>
                    <span>{nMot(p.motivo)} · {p.zona ? `${p.zona} ${nZona(p.zona)}` : p.ubicacion} · {nQuien(p)}</span>
                  </div>
                  <span className="cada">{CADA.find((c) => c.v === p.cada)?.t}</span>
                  <span className="prox">{p.activo ? <>próxima <b>{new Date(p.proxima + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</b></> : "pausada"}</span>
                  {puedeEditar && (
                    <button type="button" className="btn" onClick={() => setF({ id: p.id, titulo: p.titulo, motivo: p.motivo, zona: p.zona ?? "",
                      ubicacion: p.ubicacion ?? "", prioridad: p.prioridad, equipo: p.equipo ?? "", responsable: p.responsable ?? "",
                      cada: p.cada, proxima: p.proxima, activo: p.activo })}>Editar</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
