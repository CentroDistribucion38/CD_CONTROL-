"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Mes, bonita, diaSemana, partes, rango, useAfuera } from "./Calendario";

/**
 * APLICAR ESTA REJILLA A VARIOS DÍAS.
 *
 * El plan de un CD no cambia todos los días: la semana se parece a la
 * anterior. Pero armar la misma rejilla de nueve tipos por tres turnos,
 * un día a la vez, son treinta veces el mismo trabajo para planear un
 * mes — así que nadie planea el mes: se planea el día siguiente a las
 * corridas, y el plan deja de ser un plan.
 *
 * TRES COSAS QUE ESTA PANTALLA DICE ANTES DE ESCRIBIR NADA:
 *
 *   1. CUÁNTOS DÍAS van a quedar planeados, contando ya los días de
 *      semana destildados. Un número antes de apretar vale más que una
 *      explicación después.
 *
 *   2. CUÁLES YA TIENEN PLAN. Salen marcados en el calendario y
 *      contados abajo. No se tocan —eso lo garantiza la base, no esta
 *      pantalla—, pero enterarse al ver el calendario es distinto de
 *      enterarse por un mensaje cuando ya está hecho.
 *
 *   3. QUE SE PUBLICA, no que queda en borrador. Treinta borradores que
 *      habría que publicar uno por uno no serían un atajo.
 *
 * LOS DÍAS DE SEMANA NACEN TODOS MARCADOS y se destildan. Un CD que no
 * mueve los domingos los destilda una vez; uno que sí, no toca nada. Al
 * revés —nacer vacíos— obligaría a los siete toques a todo el mundo.
 */

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const CORTOS = ["L", "M", "M", "J", "V", "S", "D"];

type Linea = { turno: string; tipo: string; planeado: number };
type Vacio = { turno: string; vacios: number };

export function Repetir({ fecha, hoy, lineas, vacios, totalViajes, avisar }: {
  fecha: string;
  hoy: string;
  /** La rejilla que se está viendo, ya armada. */
  lineas: () => Linea[];
  vacios: () => Vacio[];
  totalViajes: number;
  avisar: { bien: (m: string) => void; mal: (m: string) => void };
}) {
  const router = useRouter();
  const supabase = createClient();

  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(fecha);
  const [hasta, setHasta] = useState("");
  const [ancla, setAncla] = useState(() => partes(fecha));
  const [semana, setSemana] = useState<boolean[]>(() => Array(7).fill(true));
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [mandando, setMandando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useAfuera(caja, () => { if (!mandando) setAbierto(false) });

  /* CUÁLES DÍAS DEL RANGO YA TIENEN PLAN. Se pregunta a la base al
     abrir y cada vez que cambia el rango: la respuesta es la que pinta
     los días marcados en el calendario. Es una sola consulta a una
     función que agrupa —no se bajan los planes. */
  useEffect(() => {
    if (!abierto || !hasta) { setOcupados(new Set()); return }
    let vivo = true;
    (async () => {
      const { data } = await supabase.rpc("traspaso_dias_con_plan",
        { p_desde: desde, p_hasta: hasta });
      if (!vivo) return;
      setOcupados(new Set(((data ?? []) as { fecha: string }[]).map((x) => x.fecha)));
    })();
    return () => { vivo = false };
  }, [abierto, desde, hasta, supabase]);

  const mover = (p: number) => setAncla((x) => {
    const m = x.m + p;
    return { ...x, a: x.a + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });

  /* El primer toque fija el inicio, el segundo el fin. Un tercero
     vuelve a empezar: es lo que hace cualquiera cuando se equivoca. */
  function tocar(f: string) {
    if (!hasta && f >= desde) { setHasta(f); return }
    setDesde(f); setHasta("");
  }

  /* Los días que de verdad van a quedar planeados: dentro del rango,
     con su día de semana marcado, y sin plan previo. */
  const todos = hasta ? rango(desde, hasta) : [desde];
  const elegidos = todos.filter((f) => semana[diaSemana(f)]);
  const libres = elegidos.filter((f) => !ocupados.has(f));
  const chocan = elegidos.length - libres.length;

  async function aplicar() {
    if (!libres.length) return;
    setMandando(true);
    const { data, error } = await supabase.rpc("traspaso_plan_a_varios", {
      p_fechas: libres,
      p_lineas: lineas(),
      p_vacios: vacios(),
    });
    setMandando(false);
    if (error) {
      avisar.mal(error.message.includes("does not exist")
        || error.message.includes("Could not find the function")
        ? "Falta correr supabase/migraciones/2026-09-traspasos-plan-varios-dias.sql en Supabase."
        : error.message);
      return;
    }
    const filas = (data ?? []) as { fecha: string; resultado: string }[];
    const hechos = filas.filter((x) => x.resultado === "planeado");
    const saltados = filas.filter((x) => x.resultado === "ya_tenia");
    setAbierto(false);
    avisar.bien(
      `${hechos.length} día${hechos.length === 1 ? "" : "s"} planeado${hechos.length === 1 ? "" : "s"}`
      + ` con ${totalViajes} viajes cada uno.`
      + (saltados.length
        ? ` ${saltados.length} se saltaron porque ya tenían plan: ${saltados.slice(0, 3).map((x) => bonita(x.fecha)).join(", ")}${saltados.length > 3 ? "…" : ""}.`
        : ""),
    );
    router.refresh();
  }

  return (
    <div className="cal-caja" ref={caja}>
      <button type="button" className="btn" aria-expanded={abierto}
              onClick={() => setAbierto((v) => !v)}>
        Aplicar a varios días
      </button>

      {abierto && (
        <div className="cal-flota ancho">
          <div className="rep-cab">
            <b>Repetir esta rejilla</b>
            <span>
              {totalViajes} viajes con carga. Toca el primer día y después el último.
            </span>
          </div>

          <Mes ancla={ancla} ini={desde} fin={hasta} hoy={hoy}
               mover={mover} tocar={tocar} ocupados={ocupados} />

          <div className="rep-sem">
            {CORTOS.map((c, i) => (
              <label key={i} className={semana[i] ? "on" : ""} title={DIAS[i]}>
                <input type="checkbox" checked={semana[i]}
                       onChange={(e) => setSemana((s) =>
                         s.map((v, j) => (j === i ? e.target.checked : v)))} />
                {c}
              </label>
            ))}
          </div>

          <div className="rep-cuenta">
            {!hasta ? (
              <span>Escoge el último día del rango.</span>
            ) : libres.length === 0 ? (
              <span className="nada">
                Ninguno de esos días queda libre. {chocan > 0
                  ? `Los ${chocan} ya tienen plan publicado.`
                  : "Revisa los días de semana marcados."}
              </span>
            ) : (
              <>
                <b>{libres.length}</b> día{libres.length === 1 ? "" : "s"} se van a planear
                {chocan > 0 && (
                  <span className="saltan">
                    · {chocan} se salta{chocan === 1 ? "" : "n"}: ya tiene{chocan === 1 ? "" : "n"} plan
                  </span>
                )}
              </>
            )}
          </div>

          <div className="rep-pie">
            <button type="button" className="btn si"
                    disabled={!libres.length || mandando || totalViajes === 0}
                    onClick={aplicar}>
              {mandando ? "Aplicando…"
                : totalViajes === 0 ? "La rejilla está vacía"
                : `Publicar en ${libres.length} día${libres.length === 1 ? "" : "s"}`}
            </button>
            <span className="rep-nota">
              Se publica de una: el turno lo ve enseguida. Los días que ya tienen
              plan no se tocan.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
