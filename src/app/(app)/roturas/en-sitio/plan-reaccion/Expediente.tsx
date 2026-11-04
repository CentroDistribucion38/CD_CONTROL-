"use client";

import { ESCALERA, SEV_TXT, dm, dmh, reaccionEvento, type AccionV, type EstadoPersona, type PersonaV } from "@/modulos/roturas/seguridad";
import { Pill, Ventana } from "./piezas";

/**
 * EL EXPEDIENTE DE UNA PERSONA: qué ha causado en el mes, en qué peldaño de la escalera está,
 * qué le toca ahora y qué acciones ya se le hicieron. Para citarla o llevarla a comité con todo a la mano.
 */
export function Expediente({ p, v, acciones, editar, cerrar, marcar }: {
  p: EstadoPersona; v?: PersonaV; acciones: AccionV[]; editar: boolean; cerrar: () => void;
  marcar: (a: AccionV, estado: "hecha" | "no_aplica") => void;
}) {
  const ids = new Set(p.eventos.map((e) => e.rotura_id));
  const accs = acciones.filter((a) => ids.has(a.rotura_id) && a.estado !== "no_aplica")
    .sort((a, b) => Number(b.vencida) - Number(a.vencida) || a.vence_en.localeCompare(b.vence_en));
  const venc = accs.filter((a) => a.vencida).length;
  const col = p.ultimo.severidad === "grave" ? "grave" : "leve";
  return (
    <Ventana ojo="ROTURAS · EN SITIO · SEGURIDAD · EXPEDIENTE" titulo={p.nombre} sub={[p.empresa, p.recurrente ? "Recurrente mes a mes" : null].filter(Boolean).join(" · ") || undefined} cerrar={cerrar} ancho={980}>
      <div className="plr-ex">
        <div className="plr-kpis plr-kpis-4">
          <div className="plr-kpi neg"><span>Eventos este mes</span><b>{p.n}</b><i>{p.cajas} cajas</i></div>
          <div className="plr-kpi"><span>Peldaño</span><b>{p.nivel === 4 ? "4+" : p.nivel + "º"}</b><i>{p.nivel === 4 ? ESCALERA[4].nom : ESCALERA[p.nivel].nom}</i></div>
          <div className="plr-kpi"><span>Reportes que hizo</span><b>{v ? v.reportes : "—"}</b><i>con su PIN; no cuentan en su contra</i></div>
          <div className="plr-kpi"><span>Acciones vencidas</span><b className={venc ? "rojo" : ""}>{venc}</b><i>de {accs.filter((a) => a.estado === "pendiente").length} abiertas</i></div>
        </div>

        <div className="plr-ex-ahora">
          <span className="plr-ex-et">AHORA LE TOCA</span>
          <p>{p.nivel === 4 ? ESCALERA[4].leve : p.reaccion}</p>
          <small>{p.nivel === 4
            ? (p.recurrente ? "Tuvo eventos también el mes anterior: va a Comité Safety Compliance." : "Es su cuarto evento del mes: va a Comité Safety Compliance.")
            : `Su último evento (${p.ultimo.codigo}) fue ${SEV_TXT[p.ultimo.severidad].toLowerCase()}, así que le corresponde la columna de falta ${col}.`}</small>
        </div>

        <ol className="plr-esc4" aria-label="La escalera de la persona">
          {([1, 2, 3, 4] as const).map((i) => (
            <li key={i} className={i < p.nivel ? "paso" : i === p.nivel ? "aqui" : ""}>
              <b>{i === 4 ? "Recurrente" : ESCALERA[i].nom}</b>
              <span>{i === 4 ? ESCALERA[4].leve : ESCALERA[i][col]}</span>
            </li>
          ))}
        </ol>

        <section className="plr-pan" aria-label="Sus eventos">
          <header><h2>Sus eventos del mes</h2></header>
          <div className="plr-tabla"><table>
            <thead><tr><th>N.º</th><th>Fecha</th><th>Rotura</th><th className="r">Cajas</th><th>Gravedad</th><th>Causa</th><th>Reacción</th></tr></thead>
            <tbody>{p.eventos.map((e) => (
              <tr key={e.rotura_id}>
                <td><b>{e.n_mes}.º</b></td><td>{dmh(e.reportada_en)}</td><td className="mono">{e.codigo}</td><td className="r"><b>{e.cajas}</b></td>
                <td><Pill tipo={e.severidad === "grave" ? "grave" : e.severidad === "intermedia" ? "int" : "leve"}>{SEV_TXT[e.severidad]}</Pill></td>
                <td>{e.causa_nombre ?? "—"}</td><td className="plr-reac">{reaccionEvento(e)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>

        <section className="plr-pan" aria-label="Sus acciones">
          <header><h2>Sus acciones</h2></header>
          {!accs.length ? <p className="plr-vacio">Todavía no tiene acciones generadas.</p> : (
            <ul className="plr-acc">{accs.map((a) => (
              <li key={a.id} className={a.vencida ? "venc" : ""}>
                <div className="plr-acc-t"><b>{a.accion_nombre}</b><span>{a.codigo}{a.nota ? ` · ${a.nota}` : ""}</span></div>
                <div className="plr-acc-d">
                  {a.estado === "hecha" ? <Pill tipo={a.hecha_tarde ? "pend" : "hecha"}>{a.hecha_tarde ? "Hecha tarde" : "Hecha"}</Pill>
                    : a.vencida ? <Pill tipo="venc">Vencida · {dm(a.vence_en)}</Pill> : <Pill tipo="pend">Vence {dm(a.vence_en)}</Pill>}
                  {editar && a.estado === "pendiente" && (
                    <span className="plr-acc-b"><button type="button" onClick={() => marcar(a, "hecha")}>Hecha</button><button type="button" onClick={() => marcar(a, "no_aplica")}>No aplica</button></span>
                  )}
                </div>
              </li>
            ))}</ul>
          )}
        </section>

        {v && <p className="plr-pie">Historial: {v.eventos_total} {v.eventos_total === 1 ? "evento" : "eventos"} en {v.meses_con_evento} {v.meses_con_evento === 1 ? "mes" : "meses"}{v.ultimo_evento ? `, el último el ${dm(v.ultimo_evento)}` : ""}.</p>}
      </div>
    </Ventana>
  );
}
