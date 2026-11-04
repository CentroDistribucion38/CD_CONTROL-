"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import { usePedirTexto } from "@/components/PedirTexto";
import {
  DIMS, ESCALERA, PIDE_GRAVEDAD, SEV_TXT, TIPO_TXT, claveDim, dm, dmh, estadoPersonas, mesClave, mesCorto, mesNombre,
  pareto, reaccionEvento, turnoDe,
  type AccionV, type Colaborador, type Dim, type EventoV, type Med, type PersonaV, type ReglaV,
} from "@/modulos/roturas/seguridad";
import { Pareto } from "./Pareto";
import { Diagrama } from "./Diagrama";
import { Expediente } from "./Expediente";
import { Asignar } from "./Asignar";
import { Ico, Pill } from "./piezas";

const TABLERO = "/roturas/en-sitio/tablero";
const POR_PAGINA = 12;

const sevPill = (s: EventoV["severidad"]) => <Pill tipo={s === "grave" ? "grave" : s === "intermedia" ? "int" : "leve"}>{SEV_TXT[s]}</Pill>;
const tipoPill = (t: EventoV["tipo"]) => <Pill tipo={t === "comportamiento" ? "comp" : t === "condicion" ? "cond" : "ext"}>{TIPO_TXT[t]}</Pill>;

export function Seguridad({ eventos, acciones, personas, regla, colaboradores, editar, falla, sinAcciones }: {
  eventos: EventoV[]; acciones: AccionV[]; personas: PersonaV[]; regla: ReglaV | null;
  colaboradores: Colaborador[]; editar: boolean; falla: string | null; sinAcciones: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pedirTexto, dialogoTexto] = usePedirTexto();

  const meses = useMemo(() => {
    const s = new Set(eventos.map(mesClave));
    const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7);
    s.add(hoy);
    return [...s].sort().reverse();
  }, [eventos]);
  const [mes, setMes] = useState(meses[0]);
  const [turno, setTurno] = useState("");
  const [dim, setDim] = useState<Dim>("causa");
  const [med, setMed] = useState<Med>("eventos");
  const [foco, setFoco] = useState<{ dim: Dim; k: string } | null>(null);
  const [diagrama, setDiagrama] = useState(false);
  const [persona, setPersona] = useState<string | null>(null);
  const [asignando, setAsignando] = useState<EventoV | null>(null);
  const [verAcc, setVerAcc] = useState<"abiertas" | "hechas">("abiertas");
  const [masAcc, setMasAcc] = useState(false);
  const [masEv, setMasEv] = useState(false);

  const delMes = useMemo(() => eventos.filter((e) => mesClave(e) === mes && e.estado !== "anulada"), [eventos, mes]);
  const evs = useMemo(() => (turno ? delMes.filter((e) => turnoDe(e) === turno) : delMes), [delMes, turno]);
  const evsFoco = useMemo(() => (foco ? evs.filter((e) => claveDim(e, foco.dim) === foco.k) : evs), [evs, foco]);
  const pers = useMemo(() => estadoPersonas(delMes), [delMes]);
  const par = useMemo(() => pareto(evs, dim, med), [evs, dim, med]);

  const ids = useMemo(() => new Set(delMes.map((e) => e.rotura_id)), [delMes]);
  const accMes = useMemo(() => acciones.filter((a) => ids.has(a.rotura_id) && a.estado !== "no_aplica"), [acciones, ids]);
  const abiertas = accMes.filter((a) => a.estado === "pendiente").sort((a, b) => Number(b.vencida) - Number(a.vencida) || a.vence_en.localeCompare(b.vence_en));
  const hechas = accMes.filter((a) => a.estado === "hecha").sort((a, b) => (b.hecha_en ?? "").localeCompare(a.hecha_en ?? ""));
  const lista = verAcc === "abiertas" ? abiertas : hechas;
  const venc = acciones.filter((a) => a.estado === "pendiente" && a.vencida).length;

  const k = {
    total: evs.length,
    comp: evs.filter((e) => e.tipo === "comportamiento").length,
    cond: evs.filter((e) => e.tipo === "condicion").length,
    graves: evs.filter((e) => e.severidad === "grave").length,
    reinc: pers.filter((p) => p.nivel >= 2).length,
    comite: pers.filter((p) => p.nivel === 4).length,
    sinResp: evs.filter((e) => e.tipo === "comportamiento" && !e.responsable_id).length,
  };

  const marcar = async (a: AccionV, estado: "hecha" | "no_aplica") => {
    const nota = await pedirTexto({
      titulo: estado === "hecha" ? "¿Qué se hizo?" : "¿Por qué no aplica?",
      dice: <>{a.accion_nombre} · <b>{a.codigo}</b>{a.responsable ? <> · {a.responsable}</> : null}</>,
      rotulo: estado === "hecha" ? "Lo que se hizo" : "Motivo", largo: true, minimo: 3,
      confirmar: estado === "hecha" ? "Marcar hecha" : "Dejar sin aplicar",
    });
    if (nota == null) return;
    const { error } = await createClient().rpc("plan_accion_marcar", { p_id: a.id, p_estado: estado, p_nota: nota });
    if (error) return avisar.mal(error.message);
    avisar.bien(estado === "hecha" ? "Acción marcada como hecha. Queda abierta su verificación de eficacia." : "Acción dejada sin aplicar, con su motivo.");
    router.refresh();
  };

  const personaSel = persona ? pers.find((p) => p.id === persona) ?? null : null;
  const personaV = persona ? personas.find((p) => p.id === persona) : undefined;
  const cambiarDim = (d: Dim) => { setDim(d); setFoco(null) };
  const pulsa = (k: string) => setFoco((f) => (f && f.dim === dim && f.k === k ? null : { dim, k }));

  const cabecera = (
    <header className="plr-cab">
      <Link href={TABLERO} className="plr-bt plr-atras" aria-label="Volver al Tablero" title="Volver al Tablero">{Ico.atras}</Link>
      <div className="plr-tit">
        <div className="plr-ojo">ROTURAS · EN SITIO · SEGURIDAD</div>
        <h1>Plan de reacción</h1>
        <div className="plr-sub">Qué se rompió, por quién o por qué, y qué le toca a cada caso según el diagrama.</div>
      </div>
      <div className="plr-der">
        <button type="button" className="plr-bt plr-oro" onClick={() => setDiagrama(true)} disabled={!!falla} title="Ver el diagrama del flujo con los casos del mes">
          {Ico.ojo}<span>Ver diagrama del flujo</span>
        </button>
      </div>
    </header>
  );

  if (falla) {
    return (
      <div className="plr">
        {cabecera}
        <div className="plr-falla">
          <b>El plan de reacción todavía no está disponible.</b>
          <p>Falta correr <code>2026-11-plan-reaccion-rotura.sql</code> en Supabase, o tu rol aún no tiene la pantalla «Seguridad» en Roles y permisos.</p>
          <p className="plr-falla-d">{falla}</p>
        </div>
        {avisos}
      </div>
    );
  }

  const evVista = masEv ? evsFoco : evsFoco.slice(0, POR_PAGINA);
  const accVista = masAcc ? lista : lista.slice(0, 6);

  return (
    <div className="plr">
      {cabecera}

      <div className="plr-fil">
        <div><label>MES</label>
          <div className="plr-chips">{meses.slice(0, 6).map((m) => (
            <button key={m} type="button" aria-pressed={mes === m} onClick={() => { setMes(m); setFoco(null) }}>{mesCorto(m)} {m.slice(2, 4)}</button>
          ))}</div>
        </div>
        <div><label>TURNO</label>
          <div className="plr-chips">{["", "C", "A", "B"].map((t) => (
            <button key={t} type="button" aria-pressed={turno === t} onClick={() => { setTurno(t); setFoco(null) }}>{t || "Todos"}</button>
          ))}</div>
        </div>
        {foco && (
          <button type="button" className="plr-quitar" onClick={() => setFoco(null)}>
            Filtrando por <b>{foco.k}</b> {Ico.x}
          </button>
        )}
        <p className="plr-nota">El evento n.º cuenta por persona dentro del mes. Solo el <b>comportamiento</b> suma a la persona; la <b>condición</b> se corrige en el sitio.</p>
      </div>

      <div className="plr-kpis">
        <div className="plr-kpi neg"><span>Eventos · {mesNombre(mes)}</span><b>{k.total}</b><i>{k.comp} de comportamiento · {k.cond} de condición</i></div>
        <div className="plr-kpi"><span>Graves · SIF</span><b className={k.graves ? "rojo" : ""}>{k.graves}</b><i>{regla ? `${regla.grave_min} cajas o más` : "gravedad alta"}</i></div>
        <div className="plr-kpi"><span>Con reincidencia</span><b>{k.reinc}</b><i>personas con 2.º evento o más</i></div>
        <div className="plr-kpi"><span>Al comité</span><b className={k.comite ? "rojo" : ""}>{k.comite}</b><i>4.º evento o recurrentes</i></div>
        <div className="plr-kpi"><span>Sin responsable</span><b>{k.sinResp}</b><i>{k.sinResp ? "hay que asignarlas" : "todas asignadas"}</i></div>
        <div className="plr-kpi"><span>Acciones vencidas</span><b className={venc ? "rojo" : ""}>{sinAcciones ? "—" : venc}</b><i>{sinAcciones ? "sin datos" : `de ${acciones.filter((a) => a.estado === "pendiente").length} abiertas`}</i></div>
      </div>

      <div className="plr-fila">
        <section className="plr-pan plr-ancho" aria-label="Pareto">
          <header>
            <h2>Pareto por {DIMS.find((d) => d.id === dim)!.txt.toLowerCase()}</h2>
            <div className="plr-tabs" role="group" aria-label="Agrupar por">
              {DIMS.map((d) => <button key={d.id} type="button" aria-pressed={dim === d.id} onClick={() => cambiarDim(d.id)}>{d.txt}</button>)}
            </div>
            <div className="plr-tabs" role="group" aria-label="Medir en">
              {(["eventos", "cajas"] as Med[]).map((m) => <button key={m} type="button" aria-pressed={med === m} onClick={() => setMed(m)}>{m === "eventos" ? "Eventos" : "Cajas"}</button>)}
            </div>
          </header>
          <div className="plr-in">
            <Pareto barras={par.barras} total={par.total} med={med} foco={foco && foco.dim === dim ? foco.k : null} onBarra={pulsa} />
          </div>
        </section>

        <section className="plr-pan" aria-label="Acciones">
          <header>
            <h2>Acciones del plan</h2>
            <div className="plr-tabs" role="group" aria-label="Estado de las acciones">
              <button type="button" aria-pressed={verAcc === "abiertas"} onClick={() => { setVerAcc("abiertas"); setMasAcc(false) }}>Abiertas · {abiertas.length}</button>
              <button type="button" aria-pressed={verAcc === "hechas"} onClick={() => { setVerAcc("hechas"); setMasAcc(false) }}>Hechas · {hechas.length}</button>
            </div>
          </header>
          {sinAcciones ? <p className="plr-vacio">No se pudieron leer las acciones.</p> : !lista.length ? (
            <p className="plr-vacio">{verAcc === "abiertas" ? "No hay acciones abiertas en este mes." : "Todavía no hay acciones hechas en este mes."}</p>
          ) : (
            <ul className="plr-acc">
              {accVista.map((a) => (
                <li key={a.id} className={a.vencida ? "venc" : ""}>
                  <div className="plr-acc-t">
                    <b>{a.accion_nombre}</b>
                    <span>{a.codigo}{a.responsable ? ` · ${a.responsable}` : " · de la condición"}</span>
                  </div>
                  <div className="plr-acc-d">
                    {a.estado === "hecha"
                      ? <Pill tipo={a.hecha_tarde ? "pend" : "hecha"}>{a.hecha_tarde ? "Hecha tarde" : "Hecha"}</Pill>
                      : a.vencida ? <Pill tipo="venc">Vencida · {dm(a.vence_en)}</Pill> : <Pill tipo="pend">Vence {dm(a.vence_en)}</Pill>}
                    {editar && a.estado === "pendiente" && (
                      <span className="plr-acc-b">
                        <button type="button" onClick={() => marcar(a, "hecha")}>Hecha</button>
                        <button type="button" onClick={() => marcar(a, "no_aplica")}>No aplica</button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {lista.length > 6 && <button type="button" className="plr-mas" onClick={() => setMasAcc(!masAcc)}>{masAcc ? "Ver menos" : `Ver las ${lista.length}`}</button>}
        </section>
      </div>

      <section className="plr-pan" aria-label="Reincidencia por persona">
        <header>
          <h2>Reincidencia por persona · {mesNombre(mes)}</h2>
          <span className="plr-nota-h">El peldaño sale del número de evento del mes y de la gravedad del último.</span>
        </header>
        {!pers.length ? <p className="plr-vacio">{k.sinResp ? "Aún no hay personas: asigna el responsable de los eventos de comportamiento (abajo)." : "Nadie con eventos de comportamiento en este mes."}</p> : (
          <ul className="plr-per">
            {pers.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setPersona(p.id)} aria-label={`Abrir el expediente de ${p.nombre}`}>
                  <span className="plr-esc" aria-hidden>{[1, 2, 3, 4].map((i) => <i key={i} className={i <= p.nivel ? (p.nivel === 4 ? "r" : "on") : ""} />)}</span>
                  <span className="plr-per-n"><b>{p.nombre}</b><em>{p.n} {p.n === 1 ? "evento" : "eventos"} · {p.cajas} cajas</em></span>
                  <span className="plr-per-r">{p.recurrente && <Pill tipo="venc">Recurrente</Pill>}<em>{p.nivel === 4 ? ESCALERA[4].leve : p.reaccion}</em></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="plr-pan" aria-label="Los eventos">
        <header>
          <h2>Los eventos{foco ? ` · ${foco.k}` : ""}</h2>
          <span className="plr-nota-h">{evsFoco.length} {evsFoco.length === 1 ? "evento" : "eventos"}</span>
        </header>
        {!evsFoco.length ? <p className="plr-vacio">No hay eventos con estos filtros.</p> : (
          <div className="plr-tabla">
            <table>
              <thead><tr><th>Fecha</th><th>Rotura</th><th className="r">Cajas</th><th>Tipo</th><th>Gravedad</th><th>Causa · responsable</th><th>Evento n.º</th><th>Reacción</th>{editar && <th />}</tr></thead>
              <tbody>
                {evVista.map((e) => (
                  <tr key={e.rotura_id}>
                    <td>{dmh(e.reportada_en)}<em> · turno {turnoDe(e)}</em></td>
                    <td className="mono">{e.codigo}</td>
                    <td className="r"><b>{e.cajas}</b></td>
                    <td>{tipoPill(e.tipo)}</td>
                    <td>{sevPill(e.severidad)}</td>
                    <td>
                      <span className="plr-causa">{e.causa_nombre ?? e.causa ?? "—"}</span>
                      {e.tipo === "comportamiento" && (e.responsable_id
                        ? <button type="button" className="plr-link" onClick={() => setPersona(e.responsable_id)}>{e.responsable}</button>
                        : <em className="plr-sin">Sin responsable</em>)}
                      {e.reportante && <em className="plr-rep"> · reportó {e.reportante}</em>}
                    </td>
                    <td>{e.cuenta_persona && e.n_mes ? <>{e.n_mes}.º {e.recurrente_mes_a_mes && <Pill tipo="venc">Recurrente</Pill>}</> : <em>—</em>}</td>
                    <td className="plr-reac">{reaccionEvento(e)}{PIDE_GRAVEDAD[e.severidad] && <em>{PIDE_GRAVEDAD[e.severidad]}</em>}</td>
                    {editar && <td className="r">{e.tipo === "comportamiento" && <button type="button" className="plr-mini" onClick={() => setAsignando(e)}>{e.responsable_id ? "Cambiar" : "Asignar"}</button>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {evsFoco.length > POR_PAGINA && <button type="button" className="plr-mas" onClick={() => setMasEv(!masEv)}>{masEv ? "Ver menos" : `Ver los ${evsFoco.length}`}</button>}
      </section>

      <p className="plr-pie">
        {regla ? <>Leve hasta <b>{regla.leve_max}</b> cajas · intermedia de {regla.leve_max + 1} a {regla.grave_min - 1} · grave desde <b>{regla.grave_min}</b>. Las cajas son rotas más contaminadas. La eficacia de cada acción se verifica a los {regla.verificacion_dias} días. </> : null}
        Las reglas viven en la base (tablas <code>plan_reglas</code> y <code>plan_acciones_regla</code>), no en el código.
      </p>

      {diagrama && <Diagrama delMes={delMes} personas={pers} mes={mes} regla={regla} cerrar={() => setDiagrama(false)} abrirPersona={(id) => { setDiagrama(false); setPersona(id) }} />}
      {personaSel && (
        <Expediente p={personaSel} v={personaV} acciones={acciones} editar={editar}
                    cerrar={() => setPersona(null)} marcar={marcar} />
      )}
      {asignando && (
        <Asignar evento={asignando} colaboradores={colaboradores} cerrar={() => setAsignando(null)}
                 listo={(m) => { setAsignando(null); avisar.bien(m); router.refresh() }} falla={(m) => avisar.mal(m)} />
      )}
      {avisos}{dialogoTexto}
    </div>
  );
}
