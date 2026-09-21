import Link from "next/link";
import type { HojaGuardada } from "@/modulos/rotlinea/datos";
import { resumirHojas } from "@/modulos/rotlinea/historial";
import { FilaHoja } from "./FilaHoja";

const fmt = (n: number) => Math.round(n).toLocaleString("es-CO");
const dia = (f: string) =>
  new Date(Date.parse(f + "T12:00:00")).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

/* Cuántas filas se pintan: un año entero serían cientos, y aquí se busca
   la de esta semana. Las demás se abren desde el día, en Registrar. */
const MAX_FILAS = 30;
const MAX_PENDIENTES = 8;

/**
 * HOJAS DEL DÍA GENERADAS — cerrado, con la respuesta en el renglón.
 *
 * Lo que se busca al entrar es «¿falta alguna?»; eso va en el resumen.
 * La lista de PDF está dentro, para quien vaya a abrir uno.
 */
export function HojasGeneradas({ hojas, dias, conLinea, falta, puedeAnular = false }: {
  hojas: HojaGuardada[];
  dias: { fecha: string; und: number }[];
  conLinea: boolean;
  falta: boolean;
  /** Quien administra anula hojas, con motivo. Nadie las borra. */
  puedeAnular?: boolean;
}) {
  if (falta) {
    return (
      <section className="rl-tarj rl-hojas">
        <p className="rl-hojas-falta">
          Las hojas generadas se listan aquí cuando se corra{" "}
          <code>supabase/migraciones/2026-09-rotura-linea-hojas.sql</code>.
        </p>
      </section>
    );
  }

  const r = resumirHojas(hojas, dias, { conLinea });
  const pend = r.sinHoja.length;
  const cambiaron = r.cambio.size;
  const ojo = pend > 0 || cambiaron > 0;

  return (
    <details className={`rl-tarj rl-hojas${ojo ? " ojo" : ""}`}>
      <summary>
        <span className="rl-hojas-tit">Hojas del día generadas</span>
        <span className="rl-hojas-dice">
          <b>{r.total}</b> {r.total === 1 ? "hoja" : "hojas"} de {r.dias} {r.dias === 1 ? "día" : "días"}
          {pend > 0 && <> · <em>{pend} {pend === 1 ? "día" : "días"} sin hoja</em></>}
          {cambiaron > 0 && <> · <em>{cambiaron} {cambiaron === 1 ? "cambió" : "cambiaron"} después</em></>}
          {!ojo && r.total > 0 && <> · ninguna pendiente</>}
          {r.anuladas > 0 && <> · {r.anuladas} {r.anuladas === 1 ? "anulada" : "anuladas"}</>}
        </span>
      </summary>

      {pend > 0 && (
        <div className="rl-lista-firma">
          {r.sinHoja.slice(0, MAX_PENDIENTES).map((d) => (
            <Link key={d.fecha} className="rl-chip-firma" href={`/quiebra/rotura?d=${d.fecha}&hoja=1`}>
              <b>{dia(d.fecha)}</b>
              <span>Generar la hoja</span>
              <i>{fmt(d.und)} und</i>
            </Link>
          ))}
          {pend > MAX_PENDIENTES && <span className="rl-mas-firma">y {pend - MAX_PENDIENTES} más</span>}
        </div>
      )}

      {r.total + r.anuladas === 0 ? (
        <p className="rl-hojas-vacio">Todavía no se ha generado ninguna hoja en este período.</p>
      ) : (
        <div className="rl-tabla-env">
          <table className="rl-tabla rl-hojas-tabla">
            <thead>
              <tr>
                <th>Día</th>
                <th>Generó</th>
                <th>Supervisor</th>
                <th className="cen">Unidades</th>
                <th className="cen">PDF</th>
                {puedeAnular && <th className="cen"><span className="rl-oculto">Anular</span></th>}
              </tr>
            </thead>
            <tbody>
              {r.ordenadas.slice(0, MAX_FILAS).map((h) => (
                <FilaHoja key={h.id} h={h} vieja={!r.esUltima(h)} cambio={r.cambio.has(h.id)}
                          puedeAnular={puedeAnular} />
              ))}
            </tbody>
          </table>
          {r.ordenadas.length > MAX_FILAS && (
            <p className="rl-hojas-vacio">
              Se ven las {MAX_FILAS} más recientes de {r.ordenadas.length}. Las demás se abren desde su día en
              Registrar.
            </p>
          )}
        </div>
      )}
    </details>
  );
}
