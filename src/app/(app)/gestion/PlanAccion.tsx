"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import type { Accion, Disparador, Indicador, Turno } from "@/modulos/gestion/semaforo";
import { marcarAccion } from "./disparadores/actions";

type Ver = "abiertas" | "vencidas" | "hechas" | "todas";
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/**
 * LA OTRA HOJA DEL TABLERO: todas las acciones que salen de los 5W, correctivas y preventivas, con responsable,
 * fecha y estado. Se marcan hechas aquí mismo; el código del 5W abre su hoja.
 */
export function PlanAccion({ acciones, disparadores, indicadores, turnos, hoy, enArea, puede, abrir }: {
  acciones: Accion[]; disparadores: Disparador[]; indicadores: Map<string, Indicador>; turnos: Map<string, Turno>; hoy: string;
  enArea: (i?: Indicador) => boolean; puede: boolean; abrir: (disparadorId: string) => void;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pend, start] = useTransition();
  const [ver, setVer] = useState<Ver>("abiertas");
  const disp = useMemo(() => new Map(disparadores.map((d) => [d.id, d])), [disparadores]);

  const delArea = acciones.filter((a) => { const d = disp.get(a.disparador_id); return !!d && d.estado !== "descartado" && enArea(indicadores.get(d.indicador_id)) });
  const vencida = (a: Accion) => a.estado === "abierta" && a.fecha_limite < hoy;
  const n: Record<Ver, number> = {
    abiertas: delArea.filter((a) => a.estado === "abierta").length,
    vencidas: delArea.filter(vencida).length,
    hechas: delArea.filter((a) => a.estado === "hecha").length,
    todas: delArea.length,
  };
  const lista = delArea
    .filter((a) => ver === "todas" || (ver === "abiertas" ? a.estado === "abierta" : ver === "vencidas" ? vencida(a) : a.estado === "hecha"))
    .sort((a, b) => (a.estado === b.estado ? a.fecha_limite.localeCompare(b.fecha_limite) : a.estado === "abierta" ? -1 : 1));

  const marcar = (a: Accion, hecha: boolean) => start(async () => {
    const r = await marcarAccion(a.id, hecha);
    if (r.error) { avisar.mal(r.error); return }
    avisar.bien(hecha ? "Acción hecha." : "Acción reabierta."); router.refresh();
  });

  return (
    <section className="tb-plan">
      {avisos}
      <div className="tb-atajos" role="group" aria-label="Estado">
        {([["abiertas", "Abiertas"], ["vencidas", "Vencidas"], ["hechas", "Hechas"], ["todas", "Todas"]] as [Ver, string][]).map(([k, t]) => (
          <button key={k} type="button" className={(ver === k ? "on" : "") + (k === "vencidas" && n.vencidas ? " mal" : "")} onClick={() => setVer(k)}>{t} · {n[k]}</button>
        ))}
      </div>
      {!lista.length ? (
        <p className="gs-vacio">{n.todas ? "Nada en ese estado." : "Todavía no hay acciones. Se registran desde el 5W de cada ocurrencia, en la hoja Tablero."}</p>
      ) : (
        <div className="tb-scroll">
          <table className="tb-o tb-p">
            <thead><tr><th>Hecha</th><th>Tipo</th><th>Acción</th><th>Del 5W</th><th>Responsable</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.map((a) => {
                const d = disp.get(a.disparador_id)!, i = indicadores.get(d.indicador_id), t = d.turno_id ? turnos.get(d.turno_id) : undefined;
                const tipo = a.tipo ?? "correctiva", v = vencida(a);
                return (
                  <tr key={a.id} className={a.estado + (v ? " vencida" : "")}>
                    <td><input type="checkbox" checked={a.estado === "hecha"} disabled={!puede || pend || d.estado !== "activo"} onChange={(e) => marcar(a, e.target.checked)} aria-label={`Marcar «${a.accion}» como hecha`} /></td>
                    <td><span className={"tb-tipo " + tipo}>{tipo === "preventiva" ? "Preventiva" : "Correctiva"}</span></td>
                    <td className="acc">{a.accion}</td>
                    <td className="nw"><button type="button" className="tb-link" onClick={() => abrir(d.id)}>{i?.codigo ?? "—"} · {ddmm(d.fecha)}{t ? ` ${t.nombre.replace(/^Turno\s*/i, "")}` : ""}</button></td>
                    <td>{a.responsable}</td>
                    <td className="nw">{ddmm(a.fecha_limite)}</td>
                    <td><span className={"tb-pill " + (a.estado === "hecha" ? "ok" : v ? "mal" : "va")}>{a.estado === "hecha" ? "Hecha" : v ? "Vencida" : "Abierta"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
