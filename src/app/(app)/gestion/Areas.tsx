"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import { useConfirmar } from "@/components/Confirmar";
import type { Indicador, Proceso } from "@/modulos/gestion/semaforo";
import { eliminarArea, guardarAreas } from "./actions";

type Fila = { id?: string; nombre: string; activo: boolean; llave: string };
const pelado = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * LAS ÁREAS DEL TABLERO (tabla gestion_procesos en Supabase): agregar, renombrar, ordenar (↑ ↓), activar y eliminar.
 * Eliminar solo si ningún indicador cuelga del área; si tiene, se desactiva (deja de salir en el tablero y en Maestro).
 * «Traer de Roturas» agrega las que ya usa el registro de roturas (T1, Líneas, Traspaso…) y todavía no están aquí.
 */
export function Areas({ procesos, indicadores, deRoturas, cerrar }: {
  procesos: Proceso[]; indicadores: Indicador[]; deRoturas: string[]; cerrar: () => void;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pedir, dialogo] = useConfirmar();
  const [pend, start] = useTransition();
  const orig = () => [...procesos].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo, llave: p.id }));
  const [filas, setFilas] = useState<Fila[]>(orig);
  const [nueva, setNueva] = useState("");
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape" && !dialogo) cerrar() };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [cerrar, dialogo]);

  const usos = (id?: string) => (id ? indicadores.filter((i) => i.proceso_id === id).length : 0);
  const faltan = deRoturas.filter((n) => !filas.some((f) => pelado(f.nombre) === pelado(n)));
  const base = orig();
  const sucio = filas.length !== base.length || filas.some((f, k) => !f.id || f.id !== base[k]?.id || f.nombre !== base[k].nombre || f.activo !== base[k].activo);

  const poner = (k: number, c: Partial<Fila>) => setFilas((x) => x.map((f, j) => (j === k ? { ...f, ...c } : f)));
  const mover = (k: number, d: -1 | 1) => setFilas((x) => {
    const y = [...x], j = k + d;
    if (j < 0 || j >= y.length) return x;
    [y[k], y[j]] = [y[j], y[k]];
    return y;
  });
  const agregar = (nombres: string[]) => {
    const limpios = nombres.map((n) => n.trim()).filter((n) => n && !filas.some((f) => pelado(f.nombre) === pelado(n)));
    if (!limpios.length) { if (nombres.length === 1 && nombres[0].trim()) avisar.mal(`«${nombres[0].trim()}» ya está.`); return }
    setFilas((x) => [...x, ...limpios.map((n) => ({ nombre: n, activo: true, llave: "n" + Math.random().toString(36).slice(2) }))]);
    setNueva("");
  };
  const quitar = async (k: number) => {
    const f = filas[k];
    if (!f.id) { setFilas((x) => x.filter((_, j) => j !== k)); return }
    const n = usos(f.id);
    if (n) { avisar.mal(`«${f.nombre}» tiene ${n} indicador${n === 1 ? "" : "es"}: desactívala, o pásalos a otra área en Maestro antes de eliminarla.`); return }
    if (!(await pedir({ titulo: `¿Eliminar «${f.nombre}»?`, dice: "Se borra de Supabase. Ningún indicador cuelga de ella.", confirmar: "Eliminar", peligro: true }))) return;
    start(async () => {
      const r = await eliminarArea(f.id!);
      if (r.error) { avisar.mal(r.error); return }
      setFilas((x) => x.filter((y) => y.id !== f.id));
      avisar.bien(`«${f.nombre}» eliminada.`); router.refresh();
    });
  };
  const guardar = () => start(async () => {
    const r = await guardarAreas(filas.map((f, k) => ({ id: f.id, nombre: f.nombre, activo: f.activo, orden: k + 1 })));
    if (r.error) { avisar.mal(r.error); return }
    avisar.bien("Áreas guardadas."); router.refresh(); cerrar();
  });

  return (
    <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="ar-t" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      {avisos}{dialogo}
      <div className="cf-caja ar-caja">
        <h2 id="ar-t">Áreas del tablero</h2>
        <p className="cf-dice">Se guardan en Supabase y son las mismas de Maestro. El orden de aquí es el orden de los botones.</p>
        <ul className="ar-lista">
          {filas.map((f, k) => {
            const n = usos(f.id);
            return (
              <li key={f.llave} className={f.activo ? "" : "off"}>
                <span className="ar-mover">
                  <button type="button" disabled={k === 0} onClick={() => mover(k, -1)} aria-label={`Subir ${f.nombre}`}>↑</button>
                  <button type="button" disabled={k === filas.length - 1} onClick={() => mover(k, 1)} aria-label={`Bajar ${f.nombre}`}>↓</button>
                </span>
                <input value={f.nombre} onChange={(e) => poner(k, { nombre: e.target.value })} aria-label="Nombre del área" />
                <small>{f.id ? `${n} ind.` : "nueva"}</small>
                <label className="ar-act" title="Desactivada no sale en el tablero"><input type="checkbox" checked={f.activo} onChange={(e) => poner(k, { activo: e.target.checked })} /> Activa</label>
                <button type="button" className="ar-quitar" disabled={pend} onClick={() => quitar(k)} aria-label={`Eliminar ${f.nombre}`} title={n ? "Tiene indicadores: desactívala" : "Eliminar"}>✕</button>
              </li>
            );
          })}
          {!filas.length && <li className="ar-vacio">Todavía no hay áreas.</li>}
        </ul>
        <div className="ar-nueva">
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva área (ej. Sorting)"
                 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar([nueva]) } }} aria-label="Nueva área" />
          <button type="button" className="cf-btn plano" disabled={!nueva.trim()} onClick={() => agregar([nueva])}>+ Agregar</button>
        </div>
        {faltan.length > 0 && (
          <button type="button" className="ar-traer" onClick={() => agregar(faltan)}>
            Traer de Roturas: <b>{faltan.join(" · ")}</b>
          </button>
        )}
        <div className="cf-botones">
          <button type="button" className="cf-btn plano" onClick={cerrar}>Cancelar</button>
          <button type="button" className="cf-btn" disabled={pend || !sucio || filas.some((f) => !f.nombre.trim())} onClick={guardar}>{pend ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
