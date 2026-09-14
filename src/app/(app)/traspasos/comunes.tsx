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
      <div className="placa">{v.placa}</div>

      <div>
        <div className="ruta">
          <Punto nombre={v.origen_nombre} suelto={v.origen_suelto} />
          <span className="fl" aria-hidden>→</span>
          <Punto nombre={v.destino_nombre} suelto={v.destino_suelto} />
        </div>

        <div className="meta">
          <span>{v.tipo_nombre}</span>
          {/* EL VACÍO NO LLEVA CIFRA. Poner "0 canastas" haría que la
              vista rápida lo lea como un viaje que movió poco, cuando
              lo que pasó es que no movió nada a propósito. */}
          {v.vacio
            ? <span className="eti vacio-eti">VA VACÍO</span>
            : (
              <>
                <span className="cant">{v.cantidad.toLocaleString("es-CO")}</span>
                <span>{v.unidad ?? "unidades"}</span>
              </>
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
