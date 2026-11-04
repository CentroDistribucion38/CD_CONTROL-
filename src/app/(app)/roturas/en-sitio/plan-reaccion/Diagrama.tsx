"use client";

import { useMemo, useState } from "react";
import {
  CONDICIONES, ESCALERA, SEV_TXT, colSev, dmh, mesNombre, nivelDe,
  type EstadoPersona, type EventoV, type ReglaV,
} from "@/modulos/roturas/seguridad";
import { Pill, Ventana } from "./piezas";

/**
 * EL DIAGRAMA «PLAN DE REACCIÓN ROTURA», vivo: cada recuadro dice cuántos casos del mes caen ahí y,
 * al tocarlo, los enseña. Es el mismo diagrama oficial —condición a la izquierda, comportamiento
 * con su escalera a la derecha— pero con los números de este mes encima.
 */
export function Diagrama({ delMes, personas, mes, regla, cerrar, abrirPersona }: {
  delMes: EventoV[]; personas: EstadoPersona[]; mes: string; regla: ReglaV | null;
  cerrar: () => void; abrirPersona: (id: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const leve = regla?.leve_max ?? 5, grave = regla?.grave_min ?? 30;

  const d = useMemo(() => {
    const celdas = new Map<string, EventoV[]>();
    const push = (k: string, e: EventoV) => { const l = celdas.get(k); if (l) l.push(e); else celdas.set(k, [e]) };
    let sinResp = 0, sinRama = 0;
    const sev = { leve: 0, intermedia: 0, grave: 0 };
    for (const e of delMes) {
      sev[e.severidad]++;
      if (e.tipo === "condicion") {
        const c = CONDICIONES.find((x) => e.clave_condicion && x.claves.includes(e.clave_condicion));
        if (c) push("c:" + c.id, e); else sinRama++;
      } else if (e.tipo === "comportamiento") {
        if (!e.responsable_id) { sinResp++; push("sin", e) }
        else push(`${nivelDe(e.n_mes ?? 1)}:${colSev(e.severidad)}`, e);
      }
    }
    return { celdas, sinResp, sinRama, sev };
  }, [delMes]);

  const n = (k: string) => d.celdas.get(k)?.length ?? 0;
  const nodo = (k: string, cls: string, children: React.ReactNode, cuenta: number, unidad = "casos") => (
    <button type="button" className={`plr-nodo ${cls}` + (sel === k ? " on" : "")} aria-pressed={sel === k}
            onClick={() => setSel(sel === k ? null : k)} disabled={!cuenta}>
      <span>{children}</span><b>{cuenta}<i>{cuenta === 1 ? unidad.replace(/s$/, "") : unidad}</i></b>
    </button>
  );
  const accion = (t: string, comite = false) => <div className={"plr-acc-nodo" + (comite ? " comite" : "")}>{t}</div>;

  const detalle = sel ? (sel.startsWith("p4") ? null : d.celdas.get(sel) ?? []) : null;
  const personas4 = personas.filter((p) => p.nivel === 4);
  const titDetalle = sel === "sin" ? "Sin responsable"
    : sel?.startsWith("c:") ? CONDICIONES.find((c) => "c:" + c.id === sel)?.nom
    : sel === "p4" ? "Recurrentes / cuarta falta"
    : sel ? `${ESCALERA[Number(sel[0]) as 1 | 2 | 3].nom} · ${sel.endsWith("grave") ? "falta grave" : "falta leve"}` : "";

  return (
    <Ventana ojo={`ROTURAS · EN SITIO · SEGURIDAD`} titulo="Diagrama del plan de reacción" sub={`Los casos de ${mesNombre(mes)} puestos donde caen. Toca un recuadro para verlos.`} cerrar={cerrar} ancho={1180}>
      <div className="plr-dg">
        <div className="plr-dg-cima">
          <div className="plr-raiz">PLAN DE REACCIÓN<br />ROTURA</div>
          <ul className="plr-reglas">
            <li><b>≤ {leve} cajas</b> por comportamiento: se lleva la reincidencia en la base de roturas. <Pill tipo="leve">{d.sev.leve} este mes</Pill></li>
            <li><b>De {leve + 1} a {grave - 1} cajas</b> por comportamiento: se reporta en guardián, se hacen los 5 porqués y se clasifica como ISL. <Pill tipo="int">{d.sev.intermedia} este mes</Pill></li>
            <li><b>{grave} cajas o más</b>: se reporta como ISL SIF precursor y se analiza el evento. <Pill tipo="grave">{d.sev.grave} este mes</Pill></li>
          </ul>
          <div className="plr-afectan">Eventos como ISL e ISL SIF precursor afectan</div>
        </div>

        <div className="plr-dg-ramas">
          <section className="plr-rama" aria-label="Condición">
            <h3 className="plr-rama-t">CONDICIÓN</h3>
            <p className="plr-rama-n">No se le carga a la persona: se corrige el sitio o el equipo.</p>
            {CONDICIONES.map((c) => (
              <div key={c.id} className="plr-cond">
                {nodo("c:" + c.id, "cond", c.nom, n("c:" + c.id), "eventos")}
                {accion(c.texto)}
              </div>
            ))}
            {d.sinRama > 0 && <p className="plr-rama-n">{d.sinRama} {d.sinRama === 1 ? "evento de condición" : "eventos de condición"} sin rama: falta decir cuál es en la configuración de causas.</p>}
          </section>

          <section className="plr-rama" aria-label="Comportamiento">
            <h3 className="plr-rama-t">COMPORTAMIENTO</h3>
            {d.sinResp > 0 && <div className="plr-cond">{nodo("sin", "sin", "Sin responsable: aún no entran a la escalera", d.sinResp, "eventos")}</div>}
            {([1, 2, 3] as const).map((i) => (
              <div key={i} className={"plr-peldano s" + i}>
                <div className="plr-pel-n">{ESCALERA[i].nom.toUpperCase()}</div>
                <div className="plr-pel-c">
                  <div className="plr-via">
                    {nodo(`${i}:leve`, "leve l" + i, <>Falta leve<small>Rotura ≤ {leve} cajas</small></>, n(`${i}:leve`), "eventos")}
                    <span className="plr-flecha" aria-hidden />
                    {accion(ESCALERA[i].leve)}
                  </div>
                  <div className="plr-via">
                    {nodo(`${i}:grave`, "grave", <>Falta grave<small>Rotura ≥ {grave} cajas</small></>, n(`${i}:grave`), "eventos")}
                    <span className="plr-flecha" aria-hidden />
                    {accion(ESCALERA[i].grave, i === 3)}
                  </div>
                </div>
              </div>
            ))}
            <div className="plr-peldano s4">
              <div className="plr-pel-n">RECURRENTES POR EVENTO ROTURA</div>
              <div className="plr-pel-c">
                <div className="plr-via">
                  {nodo("p4", "p4", <>{ESCALERA[4].criterio}</>, personas4.length, "personas")}
                  <span className="plr-flecha" aria-hidden />
                  {accion(ESCALERA[4].leve, true)}
                </div>
              </div>
            </div>
          </section>
        </div>

        {sel && (
          <section className="plr-dg-det" aria-live="polite">
            <h3>{titDetalle}</h3>
            {sel === "p4" ? (
              <ul>{personas4.map((p) => (
                <li key={p.id}><button type="button" className="plr-link" onClick={() => abrirPersona(p.id)}>{p.nombre}</button>
                  <span>{p.n} {p.n === 1 ? "evento" : "eventos"} este mes</span>{p.recurrente && <Pill tipo="venc">Recurrente mes a mes</Pill>}</li>
              ))}</ul>
            ) : (
              <ul>{(detalle ?? []).map((e) => (
                <li key={e.rotura_id}>
                  <span className="mono">{e.codigo}</span><span>{dmh(e.reportada_en)}</span><b>{e.cajas} cajas</b>
                  {e.tipo === "comportamiento" && e.responsable_id
                    ? <button type="button" className="plr-link" onClick={() => abrirPersona(e.responsable_id!)}>{e.responsable}</button>
                    : <span>{e.causa_nombre ?? e.causa ?? "—"}</span>}
                  <Pill tipo={e.severidad === "grave" ? "grave" : e.severidad === "intermedia" ? "int" : "leve"}>{SEV_TXT[e.severidad]}</Pill>
                </li>
              ))}</ul>
            )}
          </section>
        )}
      </div>
    </Ventana>
  );
}
