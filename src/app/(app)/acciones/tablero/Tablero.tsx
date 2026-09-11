"use client";

import { useEffect, useState } from "react";
import type { Accion, PorArea } from "@/modulos/acciones/datos";
import { quien } from "../comunes";

/**
 * EL TABLERO DEL ARRANQUE DE TURNO — la TV.
 *
 * No es un informe: es la pantalla que se queda puesta mientras se habla,
 * y de ahí salen todas las decisiones de diseño. Fondo negro porque se ve
 * desde el otro lado de la bodega y no quema la pantalla en tres horas.
 * Cuatro cifras grandes y nada más arriba, porque en una reunión de pie
 * nadie lee un párrafo. Y las vencidas con NOMBRE: "hay que hablar de
 * estas" no funciona si no dice con quién.
 *
 * El reloj se pinta en el navegador y no en el servidor a propósito: la
 * hora del servidor es UTC y saldría cinco horas adelantada. Arranca
 * vacío y se llena al montar, que es también lo que evita que el HTML del
 * servidor y el del navegador no coincidan.
 */
export function Tablero({ acciones, areas, nombres, meta }: {
  acciones: Accion[];
  areas: PorArea[];
  nombres: Record<string, string>;
  meta: number;
}) {
  const [reloj, setReloj] = useState("");
  const [dia, setDia] = useState("");

  useEffect(() => {
    const poner = () => {
      const d = new Date();
      setReloj(d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }));
      setDia(d.toLocaleDateString("es-CO", {
        weekday: "long", day: "numeric", month: "long",
      }));
    };
    poner();
    const t = setInterval(poner, 30_000);
    return () => clearInterval(t);
  }, []);

  const vencidas = acciones.filter((a) => a.vencida)
    .sort((a, b) => a.horas_restantes - b.horas_restantes);
  const criticas = acciones.filter((a) => a.viva && a.prioridad === "alta").length;

  /* Hoy = lo que vence antes de que termine el día. Se compara contra el
     final del día en hora local y no contra "now + 24 h": algo que vence
     mañana a las 6 a. m. no es "hoy" aunque falten menos de 24 horas. */
  const finDelDia = new Date(); finDelDia.setHours(23, 59, 59, 999);
  const vencenHoy = acciones.filter(
    (a) => a.viva && !a.vencida && new Date(a.vence_en) <= finDelDia
  ).length;

  const verificadas = acciones.filter((a) => a.estado === "verificada").length;
  const efectivas = acciones.filter((a) => a.efectiva).length;
  const pct = verificadas ? Math.round((efectivas / verificadas) * 100) : null;

  const masVieja = vencidas.length ? Math.abs(Math.floor(vencidas[0].horas_restantes / 24)) : 0;

  return (
    <div className="ac-tv">
      <div className="alto">
        <div>
          <h1>Acciones correctivas</h1>
          <p className="d">CD38 Ag01 Barranquilla · arranque de turno</p>
        </div>
        <div className="reloj">
          {reloj || "—"}
          <span>{dia}</span>
        </div>
      </div>

      <div className="kpis">
        <div className={"k" + (vencidas.length ? " mal" : "")}>
          <div className="rot">VENCIDAS</div>
          <div className="n">{vencidas.length}</div>
          <div className="u">
            {vencidas.length ? `la más vieja, ${masVieja} día${masVieja === 1 ? "" : "s"}`
                             : "ninguna se pasó del plazo"}
          </div>
        </div>
        <div className={"k" + (criticas ? " mal" : "")}>
          <div className="rot">CRÍTICAS ABIERTAS</div>
          <div className="n">{criticas}</div>
          <div className="u">prioridad alta sin cerrar</div>
        </div>
        <div className="k ojo">
          <div className="rot">VENCEN HOY</div>
          <div className="n">{vencenHoy}</div>
          <div className="u">antes de las 23:59</div>
        </div>
        <div className={"k" + (pct != null && pct < meta ? " ojo" : "")}>
          <div className="rot">EFECTIVIDAD</div>
          <div className="n">{pct != null ? `${pct}%` : "—"}</div>
          <div className="u">
            {pct != null ? `meta ${meta}% · sobre lo verificado, no lo cerrado`
                         : "todavía no se ha verificado nada"}
          </div>
        </div>
      </div>

      <div className="dos">
        <div className="panel">
          <h2>Vencidas · hay que hablar de estas</h2>
          <div className="rueda">
            {vencidas.length === 0 && (
              <div style={{ padding: "22px 0", color: "rgba(255,255,255,.5)", fontSize: 14 }}>
                Ninguna vencida. Es la primera vez que esta pantalla no tiene nada que decir,
                y eso es exactamente lo que se buscaba.
              </div>
            )}
            {vencidas.slice(0, 12).map((a) => {
              const d = Math.abs(Math.floor(a.horas_restantes / 24));
              return (
                <div className="v" key={a.id}>
                  <div className="c">{a.codigo}</div>
                  <div className="t">
                    {a.titulo}
                    {a.responsable ? ` · ${quien(nombres, a.responsable)}` : " · sin asignar"}
                  </div>
                  <div className="d">
                    {d >= 1 ? d : Math.abs(a.horas_restantes)}
                    <br />{d >= 1 ? (d === 1 ? "día" : "días") : "horas"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <h2>Cumplimiento por área</h2>
          <div className="rueda">
            {areas.map((x) => (
              <div key={x.area} className={"bar" + (x.pct != null && x.pct < meta ? " mal" : "")}>
                <div className="e">{x.area_nombre}</div>
                <div className="riel"><i style={{ width: `${x.pct ?? 0}%` }} /></div>
                <div className={"p" + (x.pct == null ? " nd" : "")}>
                  {x.pct != null ? `${x.pct}%` : "—"}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,.45)", lineHeight: 1.5 }}>
              El porcentaje es <b style={{ color: "rgba(255,255,255,.75)" }}>efectivas sobre
              verificadas</b>, no cerradas sobre abiertas. Se puede cerrar todo y tener 38% si
              nada de lo que se hizo sirvió. Un guion quiere decir que en esa área todavía no se
              ha verificado nada.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
