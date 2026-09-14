"use client";

/**
 * LO QUE COMPARTEN LAS PANTALLAS DE TRASPASOS.
 *
 * Las funciones de formato viven en modulos/traspasos/formato.ts y aquí
 * solo se reexportan: este archivo es "use client", y lo que se importe
 * de él desde una página del servidor llegaría como referencia y no como
 * función.
 */

import type { Viaje } from "@/modulos/traspasos/datos";
import { hora, quien, TURNOS } from "@/modulos/traspasos/formato";

export { hora, quien, TURNOS };

/** Un punto que se escribió a mano se ve distinto: es lo que hay que
 *  agregar al maestro, no un sitio más de la lista. */
export function Punto({ nombre, suelto }: { nombre: string | null; suelto: boolean }) {
  if (!nombre) return <span>—</span>;
  return <span className={suelto ? "suelto" : undefined}>{nombre}</span>;
}

/** Una fila de viaje. La PLACA va primero y grande: es lo que quien
 *  busca en la lista tiene en la cabeza —"¿ya registré el de la ABC123?"—
 *  y encontrarla de un vistazo es lo que evita el registro duplicado. */
export function FilaViaje({ v, nombres, derecha }: {
  v: Viaje;
  nombres: Record<string, string>;
  derecha?: React.ReactNode;
}) {
  return (
    <div className={"fila" + (v.estado === "anulado" ? " anulada" : "")}>
      {/* EL VACÍO NO TIENE PLACA NI RUTA, y no se le inventa una: es un
          número de viajes del turno, no un vehículo. En su sitio va el
          número, que es el dato que lleva. */}
      <div className="placa">{v.vacio ? v.viajes : v.placa}</div>

      <div>
        <div className="ruta">
          {v.vacio ? (
            <>Viajes vacíos <span className="eti vacio-eti">SIN CARGA</span></>
          ) : (
            <>
              <Punto nombre={v.origen_nombre} suelto={v.origen_suelto} />
              <span className="fl" aria-hidden>→</span>
              <Punto nombre={v.destino_nombre} suelto={v.destino_suelto} />
            </>
          )}
        </div>

        <div className="meta">
          {v.tipo_nombre && <span>{v.tipo_nombre}</span>}
          {/* Cuántos VIAJES vale la línea. Solo se dice si no es uno:
              "1 viaje" en cada renglón es ruido. */}
          {v.viajes > 1 && (
            <>
              <span className="cant">{v.viajes}</span>
              <span>viajes</span>
            </>
          )}
          {v.carga != null && (
            <span>{v.carga.toLocaleString("es-CO")} {v.unidad ?? "unidades"}</span>
          )}
          <span>Turno {v.turno}</span>
          <span>{hora(v.hora)}</span>
          <span>{quien(nombres, v.registrado_por)}</span>
          {v.codigo && <span>{v.codigo}</span>}
        </div>

        {v.nota && <div className="meta"><span>{v.nota}</span></div>}

        {v.estado === "anulado" && (
          <div className="meta">
            <span className="eti mal">ANULADO</span>
            <span>{v.motivo_anulacion}</span>
          </div>
        )}
      </div>

      <div className="der">{derecha}</div>
    </div>
  );
}

/** El mensaje de cuando falta correr el SQL. Dice qué archivo, no "error". */
export function SinTablas() {
  return (
    <section className="sin-tablas">
      <h2>Falta crear el módulo en Supabase</h2>
      <p>
        Abre el SQL Editor de Supabase y ejecuta <code>supabase/modulos/traspasos.sql</code>.
        Ese archivo crea las tablas, siembra los tipos de viaje y deja el maestro de puntos
        vacío para que lo llenes con los de este centro. Se puede correr varias veces sin
        romper nada.
      </p>
    </section>
  );
}
