"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import { conUnidad, diaCorto, type Disparador, type Indicador, type Proceso, type Turno } from "@/modulos/gestion/semaforo";
import { descartarDisparador } from "../actions";
import { SoloVer } from "../comunes";

type Vista = "activos" | "cerrados" | "todos";
const NOMBRE = { activo: "Activo", cerrado: "Cerrado", descartado: "Descartado" } as const;
const hace = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`;
};

export function Disparadores({ turnos, procesos, indicadores, disparadores, puedeEditar }: {
  turnos: Turno[]; procesos: Proceso[]; indicadores: Indicador[]; disparadores: Disparador[]; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pend, start] = useTransition();
  const [vista, setVista] = useState<Vista>("activos");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const ind = useMemo(() => new Map(indicadores.map((i) => [i.id, i])), [indicadores]);
  const tur = useMemo(() => new Map(turnos.map((t) => [t.id, t])), [turnos]);
  const pro = useMemo(() => new Map(procesos.map((p) => [p.id, p.nombre])), [procesos]);

  const activos = disparadores.filter((d) => d.estado === "activo");
  const lista = disparadores.filter((d) => (vista === "todos" ? true : vista === "activos" ? d.estado === "activo" : d.estado !== "activo"));

  const descartar = (id: string) => start(async () => {
    const r = await descartarDisparador(id, motivo);
    if (r.error) { avisar.mal(r.error); return }
    avisar.bien("Disparador descartado.");
    setAbierto(null); setMotivo("");
    router.refresh();
  });

  return (
    <>
      {avisos}
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · DISPARADORES</p>
          <h1>Disparadores</h1>
          <p className="sub">
            Lo que saltó porque un indicador se desvió según su propia regla. Cada disparador activo es una pregunta abierta que pide
            su 5 Why. Hay uno solo por indicador: si sigue mal no se abre otro encima.
          </p>
        </div>
      </section>

      {!puedeEditar && <SoloVer />}

      <div className="gs-cifras c3">
        <div className={"gs-cif" + (activos.length ? " mal" : " bien")}><span>Activos</span><b>{activos.length}</b></div>
        <div className="gs-cif"><span>Descartados</span><b>{disparadores.filter((d) => d.estado === "descartado").length}</b></div>
        <div className="gs-cif"><span>Cerrados</span><b>{disparadores.filter((d) => d.estado === "cerrado").length}</b></div>
      </div>

      <div className="gs-chips" role="group" aria-label="Ver">
        {([["activos", "Activos"], ["cerrados", "Cerrados y descartados"], ["todos", "Todos"]] as [Vista, string][]).map(([k, t]) => (
          <button key={k} type="button" className={vista === k ? "on" : ""} onClick={() => setVista(k)}>{t}</button>
        ))}
      </div>

      {!lista.length && (
        <p className="gs-vacio">
          {vista === "activos" ? "No hay disparadores activos. Cuando un indicador se desvíe según su regla, aparece aquí." : "Nada por mostrar."}
        </p>
      )}

      <div className="gs-disps">
        {lista.map((d) => {
          const i = ind.get(d.indicador_id);
          const t = d.turno_id ? tur.get(d.turno_id) : undefined;
          return (
            <article key={d.id} className={"gs-disp-card " + d.estado}>
              <header>
                <span className={"gs-est " + d.estado}>{NOMBRE[d.estado]}</span>
                <b className="mono">{i?.codigo ?? "—"}</b>
                <h3>{i?.nombre ?? "Indicador eliminado"}</h3>
                <small>{i?.proceso_id ? pro.get(i.proceso_id) : "Sin proceso"} · saltó {hace(d.creado_en)}</small>
              </header>
              <dl>
                <div><dt>Resultado</dt><dd className="mal">{i ? conUnidad(d.valor, i) : d.valor}</dd></div>
                <div><dt>Meta</dt><dd>{d.meta ?? "—"}</dd></div>
                <div><dt>Cuándo</dt><dd>{diaCorto(d.fecha)}{t ? ` · ${t.nombre}` : ""}</dd></div>
                <div><dt>Regla</dt><dd>{d.regla ?? "—"}</dd></div>
              </dl>
              {d.estado !== "activo" && d.nota && <p className="gs-nota"><b>{NOMBRE[d.estado]}:</b> {d.nota}</p>}
              {d.estado === "activo" && puedeEditar && (
                abierto === d.id ? (
                  <div className="gs-descarte">
                    <input value={motivo} placeholder="¿Por qué se descarta?" onChange={(e) => setMotivo(e.target.value)} autoFocus />
                    <button type="button" className="btn" disabled={pend} onClick={() => descartar(d.id)}>Descartar</button>
                    <button type="button" className="btn plano" onClick={() => { setAbierto(null); setMotivo("") }}>Cancelar</button>
                  </div>
                ) : (
                  <footer>
                    <button type="button" className="btn plano" onClick={() => { setAbierto(d.id); setMotivo("") }}>No procede · descartar</button>
                  </footer>
                )
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
