"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Accion, Carga } from "@/modulos/acciones/datos";

/**
 * ASIGNAR RESPONSABLE — pantalla propia, y no un cajón dentro de la lista.
 *
 * Es la decisión más importante del módulo y la que más fácil se toma
 * mal: se le da al primero que aparece. Tiene pantalla propia porque una
 * decisión que hay que pensar no se toma bien en un panel de 200 px con
 * el resto de la lista distrayendo alrededor.
 *
 * LO QUE SE MIRA ANTES DE DECIDIR es la carga de cada quien: cuántas
 * tiene abiertas y cuántas vencidas, ordenado por quién tiene menos
 * encima. Doce acciones en la misma persona no se cierran: se acumulan, y
 * el plazo pasa a ser una promesa que el sistema ya sabe que no se va a
 * cumplir. Por eso el aviso de saturado dice eso con esas palabras, en
 * vez de un "atención" que nadie lee.
 *
 * EL PLAZO VA ARRIBA A LA DERECHA, grande y en amarillo, antes de que
 * nadie escoja a nadie: 48 horas cambia a quién tiene sentido asignarle.
 * Dicho después, es un dato; dicho antes, es parte de la decisión.
 */
export function Asignar({ accion, carga, nombres, saturado, equipos }: {
  accion: Accion;
  carga: Carga[];
  nombres: Record<string, string>;
  saturado: number;
  equipos: { clave: string; nombre: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  /* LA PERSONA ES EL CAMINO NORMAL. El equipo es para el caso en que se
     le pasa a un operador logístico y todavía no se sabe a quién de
     adentro le va a tocar; si el contratista tiene usuario propio, se le
     asigna directo y el equipo sobra. Ninguno de los dos manda sobre el
     otro, y el bloque de equipos ni siquiera se pinta si el maestro está
     vacío. */
  const [equipo, setEquipo] = useState<string | null>(accion.equipo);
  const [escogido, setEscogido] = useState<string | null>(accion.responsable);
  const [mandando, setMandando] = useState(false);

  const tope = Math.max(saturado, ...carga.map((c) => c.abiertas), 1);
  const el = carga.find((c) => c.id === escogido);

  async function asignar(eq: string | null, a: string | null) {
    setMandando(true);
    const { error } = await supabase.rpc("accion_asignar", {
      p_id: accion.id, p_equipo: eq, p_responsable: a,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    /* El aviso se deja puesto y se vuelve a la lista: la confirmación se
       lee allá, que es donde la persona sigue trabajando. */
    router.push("/acciones");
    router.refresh();
  }

  const hace = (() => {
    const m = Math.floor((Date.now() - new Date(accion.reportada_en).getTime()) / 60000);
    if (m < 60) return `HACE ${m} MINUTO${m === 1 ? "" : "S"}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `HACE ${h} HORA${h === 1 ? "" : "S"}`;
    const d = Math.floor(h / 24);
    return `HACE ${d} DÍA${d === 1 ? "" : "S"}`;
  })();

  const vence = new Date(accion.vence_en).toLocaleString("es-CO", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

  return (
    <>
      {avisos}

      <section className="cabeza">
        <div>
          <p className="ojo">ACCIÓN {accion.codigo} · GENERADA {hace}</p>
          <h1>Asignar responsable</h1>
          <p className="sub">
            Antes de asignar, mira cuánto tiene encima cada quien. Doce acciones en la misma
            persona no se cierran: se acumulan.
          </p>
        </div>

        <div className={"ac-plazo " + accion.prioridad}>
          <div className="corte" />
          <div className="rot">PLAZO SEGÚN PRIORIDAD {accion.prioridad.toUpperCase()}</div>
          <div className="num">{accion.plazo ?? "—"}</div>
          <div className="pie">vence el <b>{vence}</b></div>
        </div>
      </section>

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{accion.titulo}</h2>
            <p>
              {accion.area_nombre}
              {accion.zona_proceso ? ` · ${accion.zona_proceso}` : ""}
              {" · reportada por "}
              {accion.reportada_por ? (nombres[accion.reportada_por] ?? "—") : "—"}
              {accion.zona ? ` desde ${accion.zona_nombre} (${accion.zona})` : ` en ${accion.ubicacion}`}
            </p>
          </div>
        </div>

        <div className="rueda">
          {carga.length === 0 && (
            <div className="vacio">
              <b>No hay a quién asignarle</b>
              No hay usuarios activos en la plataforma.
            </div>
          )}
          {carga.map((c) => (
            <button key={c.id} type="button"
                    className={"quien" + (escogido === c.id ? " on" : "") + (c.saturado ? " sat" : "")}
                    onClick={() => setEscogido(c.id)}>
              <span className="ini">
                {(c.nombre || c.usuario || "?").split(/\s+/).slice(0, 2)
                  .map((p) => p[0]).join("").toUpperCase()}
              </span>
              <span>
                <span className="n">{c.nombre || c.usuario}</span>
                <span className="c">{c.rol}</span>
              </span>
              <span className="barra">
                <i style={{ width: `${Math.min(100, (c.abiertas / tope) * 100)}%` }} />
              </span>
              <span className="num">
                <b>{c.abiertas}</b>
                abiertas
                {c.vencidas > 0 && <span className="v"> {c.vencidas} vencidas</span>}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* EL EQUIPO, DESPUÉS DE LAS PERSONAS Y SOLO SI EXISTE ALGUNO.
          Es para el caso en que se le pasa a un OL y todavía no se sabe
          a quién de adentro le toca. Si el maestro está vacío —que es lo
          normal— esta caja no aparece y asignar es escoger a alguien,
          como siempre. */}
      {equipos.length > 0 && (
        <section className="caja">
          <div className="cab">
            <div>
              <h2>¿O se lo pasamos a un equipo?</h2>
              <p>
                Cuando responde un operador logístico y todavía no se sabe a quién de adentro le
                va a tocar. Si la persona ya tiene usuario, con escogerla arriba alcanza.
              </p>
            </div>
          </div>
          <div className="ac-equipos">
            {equipos.map((e) => (
              <button key={e.clave} type="button"
                      className={"ac-eq" + (equipo === e.clave ? " on" : "")}
                      onClick={() => setEquipo(equipo === e.clave ? null : e.clave)}>
                {e.nombre}
              </button>
            ))}
          </div>
        </section>
      )}

      {el?.saturado && (
        <div className="aviso rojo">
          <b>{el.nombre || el.usuario} está saturado.</b>{" "}
          {el.abiertas} acciones abiertas
          {el.vencidas > 0 ? ` y ${el.vencidas} vencidas` : ""}. Si le asignas esta, el plazo de{" "}
          {accion.plazo} es una promesa que el sistema ya sabe que no se va a cumplir.
        </div>
      )}

      <div className="ac-pie">
        <button type="button" className="btn si"
                disabled={mandando || (!escogido && !equipo)}
                onClick={() => asignar(equipo, escogido)}>
          {mandando ? "Asignando…"
            : !escogido && !equipo ? "Escoge a alguien"
            : escogido
              ? `Asignar a ${carga.find((c) => c.id === escogido)?.nombre
                  ?? carga.find((c) => c.id === escogido)?.usuario}`
                + (equipo ? ` · ${equipos.find((e) => e.clave === equipo)?.nombre}` : "")
              : `Asignar a ${equipos.find((e) => e.clave === equipo)?.nombre}`}
        </button>
        {equipo && !escogido && (
          <span className="sub" style={{ alignSelf: "center" }}>
            Sin persona está bien: el equipo responde, y ya le pondrán nombre.
          </span>
        )}
        <button type="button" className="btn plano" disabled={mandando}
                onClick={() => asignar(null, null)}>
          Dejar sin asignar
        </button>
      </div>
    </>
  );
}
