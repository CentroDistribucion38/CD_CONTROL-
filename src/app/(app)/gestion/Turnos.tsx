"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import type { Turno } from "@/modulos/gestion/semaforo";
import { guardarTurno } from "./actions";

type Fila = { id?: string; nombre: string; hora_ini: string; hora_fin: string; activo: boolean; llave: string };

/**
 * LOS TURNOS DEL TABLERO (gestion_turnos): nombre, horario, orden (↑ ↓ = el orden de las columnas, C · A · B) y activo.
 * Un turno no se elimina (tiene resultados): se desactiva y deja de salir como columna.
 */
export function Turnos({ turnos, cerrar }: { turnos: Turno[]; cerrar: () => void }) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pend, start] = useTransition();
  const [filas, setFilas] = useState<Fila[]>(() => [...turnos].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((t) => ({ id: t.id, nombre: t.nombre, hora_ini: t.hora_ini.slice(0, 5), hora_fin: t.hora_fin.slice(0, 5), activo: t.activo, llave: t.id })));
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [cerrar]);

  const poner = (k: number, c: Partial<Fila>) => setFilas((x) => x.map((f, j) => (j === k ? { ...f, ...c } : f)));
  const mover = (k: number, d: -1 | 1) => setFilas((x) => {
    const y = [...x], j = k + d;
    if (j < 0 || j >= y.length) return x;
    [y[k], y[j]] = [y[j], y[k]];
    return y;
  });
  const agregar = () => setFilas((x) => [...x, { nombre: "", hora_ini: "06:00", hora_fin: "14:00", activo: true, llave: "n" + Math.random().toString(36).slice(2) }]);
  const guardar = () => start(async () => {
    if (filas.some((f) => !f.nombre.trim())) { avisar.mal("Hay un turno sin nombre."); return }
    for (const [k, f] of filas.entries()) {
      const r = await guardarTurno({ id: f.id, nombre: f.nombre, hora_ini: f.hora_ini, hora_fin: f.hora_fin, orden: k + 1, activo: f.activo });
      if (r.error) { avisar.mal(`${f.nombre}: ${r.error}`); return }
    }
    avisar.bien("Turnos guardados."); router.refresh(); cerrar();
  });

  return (
    <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="tu-t" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      {avisos}
      <div className="cf-caja ar-caja tu-caja">
        <h2 id="tu-t">Turnos del tablero</h2>
        <p className="cf-dice">El orden de aquí es el orden de las columnas de cada día. Un turno que termina antes de empezar (22:00 a 06:00) cruza la medianoche.</p>
        <ul className="ar-lista tu-lista">
          {filas.map((f, k) => (
            <li key={f.llave} className={f.activo ? "" : "off"}>
              <span className="ar-mover">
                <button type="button" disabled={k === 0} onClick={() => mover(k, -1)} aria-label={`Subir ${f.nombre}`}>↑</button>
                <button type="button" disabled={k === filas.length - 1} onClick={() => mover(k, 1)} aria-label={`Bajar ${f.nombre}`}>↓</button>
              </span>
              <input value={f.nombre} onChange={(e) => poner(k, { nombre: e.target.value })} aria-label="Nombre del turno" placeholder="Turno A" />
              <input type="time" value={f.hora_ini} onChange={(e) => poner(k, { hora_ini: e.target.value })} aria-label="Desde" />
              <input type="time" value={f.hora_fin} onChange={(e) => poner(k, { hora_fin: e.target.value })} aria-label="Hasta" />
              <label className="ar-act"><input type="checkbox" checked={f.activo} onChange={(e) => poner(k, { activo: e.target.checked })} /> Activo</label>
            </li>
          ))}
          {!filas.length && <li className="ar-vacio">Todavía no hay turnos.</li>}
        </ul>
        <div className="ar-nueva"><button type="button" className="cf-btn plano" onClick={agregar}>+ Agregar turno</button></div>
        <div className="cf-botones">
          <button type="button" className="cf-btn plano" onClick={cerrar}>Cancelar</button>
          <button type="button" className="cf-btn" disabled={pend} onClick={guardar}>{pend ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
