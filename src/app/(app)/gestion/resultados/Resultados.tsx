"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import {
  enTurno, estadoDe, etiquetaPeriodo, inicioPeriodo, sumarDias, textoMeta,
  type Indicador, type Proceso, type Resultado, type Turno,
} from "@/modulos/gestion/semaforo";
import { guardarResultados, type FilaResultado } from "../actions";
import { Semaforo, SoloVer } from "../comunes";

const aNumero = (t: string): number | null => {
  const s = t.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "" || !/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
};
const texto = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

export function Resultados({ fecha, hoy, turnoInicial, turnos, procesos, indicadores, resultados, puedeEditar }: {
  fecha: string; hoy: string; turnoInicial: string | null; turnos: Turno[]; procesos: Proceso[];
  indicadores: Indicador[]; resultados: Resultado[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pend, start] = useTransition();
  const activos = useMemo(() => turnos.filter((t) => t.activo), [turnos]);
  const [turnoId, setTurnoId] = useState<string | null>(turnoInicial ?? activos[0]?.id ?? null);
  /* Lo que se ha escrito y todavía no se guarda, por indicador y turno. */
  const [edits, setEdits] = useState<Record<string, { v?: string; c?: string }>>({});
  const nombreProceso = useMemo(() => new Map(procesos.map((p) => [p.id, p.nombre])), [procesos]);

  const clave = (i: Indicador, tId: string | null) => `${i.id}|${i.captura === "turnos" && i.frecuencia === "dia" ? tId ?? "" : ""}`;
  const existente = (i: Indicador, tId: string | null) => {
    const ini = inicioPeriodo(fecha, i.frecuencia);
    const t = i.captura === "turnos" && i.frecuencia === "dia" ? tId : null;
    return resultados.find((r) => r.indicador_id === i.id && r.fecha === ini && (r.turno_id ?? null) === (t ?? null));
  };

  const act = useMemo(() => indicadores.filter((i) => i.activo), [indicadores]);
  const delTurno = useMemo(() => (turnoId ? act.filter((i) => enTurno(i, turnoId)) : []), [act, turnoId]);
  const unicos = useMemo(() => act.filter((i) => !(i.captura === "turnos" && i.frecuencia === "dia")), [act]);

  const valorDe = (i: Indicador) => edits[clave(i, turnoId)]?.v ?? texto(existente(i, turnoId)?.valor);
  const comDe = (i: Indicador) => edits[clave(i, turnoId)]?.c ?? existente(i, turnoId)?.comentario ?? "";
  const poner = (i: Indicador, campo: "v" | "c", x: string) =>
    setEdits((e) => ({ ...e, [clave(i, turnoId)]: { ...e[clave(i, turnoId)], [campo]: x } }));

  const capturados = (xs: Indicador[]) => xs.filter((i) => aNumero(valorDe(i)) != null).length;
  const cambios = [...delTurno, ...unicos].filter((i) => edits[clave(i, turnoId)] !== undefined);

  const guardar = () => {
    const filas: FilaResultado[] = cambios.map((i) => ({ indicador_id: i.id, valor: aNumero(valorDe(i)), comentario: comDe(i) }));
    start(async () => {
      const r = await guardarResultados(fecha, turnoId, filas);
      if (r.error) { avisar.mal(r.error); return }
      setEdits({});
      avisar.bien(`Guardado: ${r.guardados} resultado${r.guardados === 1 ? "" : "s"}.`);
      if (r.disparados) avisar.info(`Saltó ${r.disparados} disparador${r.disparados === 1 ? "" : "es"}: míralo en Disparadores.`);
      router.refresh();
    });
  };

  const ir = (f: string) => { setEdits({}); router.push(f === hoy ? "/gestion/resultados" : `/gestion/resultados?fecha=${f}`) };

  const fila = (i: Indicador) => {
    const v = aNumero(valorDe(i));
    const ya = existente(i, turnoId);
    const sucio = edits[clave(i, turnoId)] !== undefined;
    return (
      <tr key={clave(i, turnoId)} className={sucio ? "sucio" : ""}>
        <td className="mono">{i.codigo}</td>
        <td>
          <span className={"gs-tipo " + i.tipo}>{i.tipo === "kpi" ? "KPI" : "PI"}</span>
          <span className="gs-nom">{i.nombre}</span>
          <small className="gs-sub">
            {i.proceso_id ? nombreProceso.get(i.proceso_id) : "Sin proceso"}
            {i.frecuencia !== "dia" ? ` · ${etiquetaPeriodo(fecha, i.frecuencia)}` : ""}
          </small>
        </td>
        <td className="gs-meta">{textoMeta(i)}</td>
        <td>
          <div className="gs-campo">
            <input
              inputMode="decimal" value={valorDe(i)} placeholder="—" disabled={!puedeEditar || pend}
              onChange={(e) => poner(i, "v", e.target.value)} aria-label={`Resultado de ${i.nombre}`}
            />
            {i.unidad && <span>{i.unidad}</span>}
          </div>
        </td>
        <td><Semaforo estado={v == null ? null : estadoDe(i, v)} corto /></td>
        <td>
          <input className="gs-com" value={comDe(i)} placeholder={ya ? "Comentario" : "Comentario (opcional)"} disabled={!puedeEditar || pend}
                 onChange={(e) => poner(i, "c", e.target.value)} aria-label={`Comentario de ${i.nombre}`} />
        </td>
        <td className="gs-ya">{ya && !sucio ? "Guardado" : sucio ? "Sin guardar" : ""}</td>
      </tr>
    );
  };

  const tabla = (xs: Indicador[]) => (
    <div className="gs-scroll">
      <table className="gs-t gs-cap">
        <thead><tr><th>Código</th><th>Indicador</th><th>Meta</th><th>Resultado</th><th>Estado</th><th>Comentario</th><th /></tr></thead>
        <tbody>{xs.map(fila)}</tbody>
      </table>
    </div>
  );

  return (
    <>
      {avisos}
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · RESULTADO POR TURNO</p>
          <h1>Resultado por turno</h1>
          <p className="sub">
            Digita el número de cada indicador al cierre del turno. El semáforo se ve mientras escribes; al guardar, la app revisa si
            saltó algún disparador según la regla de cada indicador.
          </p>
        </div>
      </section>

      {!puedeEditar && <SoloVer />}

      <div className="gs-barra">
        <div className="gs-fecha">
          <button type="button" onClick={() => ir(sumarDias(fecha, -1))} aria-label="Día anterior">‹</button>
          <input type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && ir(e.target.value)} aria-label="Día" />
          <button type="button" onClick={() => ir(sumarDias(fecha, 1))} disabled={fecha >= hoy} aria-label="Día siguiente">›</button>
          {fecha !== hoy && <button type="button" className="gs-hoy" onClick={() => ir(hoy)}>Hoy</button>}
        </div>
        <div className="gs-turnos" role="group" aria-label="Turno">
          {activos.map((t) => (
            <button key={t.id} type="button" className={t.id === turnoId ? "on" : ""} onClick={() => setTurnoId(t.id)}>
              {t.nombre}<small>{t.hora_ini.slice(0, 5)}–{t.hora_fin.slice(0, 5)}</small>
            </button>
          ))}
        </div>
      </div>

      {!act.length && <p className="gs-vacio">No hay indicadores activos. Créalos en el Maestro.</p>}

      {turnoId && (
        <section className="gs-proceso">
          <h2>Del turno<small>{capturados(delTurno)} de {delTurno.length} capturados</small></h2>
          {delTurno.length ? tabla(delTurno) : <p className="gs-vacio">Ningún indicador se captura en este turno.</p>}
        </section>
      )}

      {unicos.length > 0 && (
        <section className="gs-proceso">
          <h2>Valor único<small>{capturados(unicos)} de {unicos.length} capturados · diarios sin turno, semanales y mensuales</small></h2>
          {tabla(unicos)}
        </section>
      )}

      {puedeEditar && (
        <div className="gs-guardar">
          <span>{cambios.length ? `${cambios.length} cambio${cambios.length === 1 ? "" : "s"} sin guardar` : "Todo está guardado"}</span>
          <button type="button" className="btn" disabled={pend || !cambios.length} onClick={guardar}>{pend ? "Guardando…" : "Guardar resultados"}</button>
        </div>
      )}
    </>
  );
}
