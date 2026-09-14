"use client";

/**
 * LO QUE COMPARTEN LAS PANTALLAS DE TRASPASOS.
 *
 * Las funciones de formato viven en modulos/traspasos/formato.ts y aquí
 * solo se reexportan: este archivo es "use client", y lo que se importe
 * de él desde una página del servidor llegaría como referencia y no como
 * función.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Viaje } from "@/modulos/traspasos/datos";
import { hora, quien, TURNOS } from "@/modulos/traspasos/formato";

export { hora, quien, TURNOS };

/**
 * MANTIENE LA PANTALLA AL DÍA SIN HACERLA LENTA.
 *
 * El problema que resuelve tiene dos caras y son la misma:
 *
 *   La app guarda 30 segundos lo que ya trajo (staleTimes en
 *   next.config). Eso es lo que hace que ir y volver entre pantallas sea
 *   instantáneo — y también lo que hacía que las cifras salieran viejas.
 *   Bajar los 30 a cero arregla lo segundo y rompe lo primero.
 *
 * Así que no se escoge: se pinta lo guardado de una —la pantalla aparece
 * al instante— y en cuanto aparece se pide la versión nueva por detrás.
 * Quien mira ve números en el primer parpadeo y los ve corregirse solos
 * un momento después, si es que cambiaron.
 *
 * TAMBIÉN AL VOLVER A LA PESTAÑA. Un tablero de turno vive abierto en
 * una pantalla de la oficina: si solo se refrescara al entrar, a las
 * tres horas estaría mostrando la mañana. Y solo cuando la pestaña está
 * VISIBLE: refrescar una pestaña que nadie está mirando es gastar una
 * consulta por gusto.
 *
 * `cada` es opcional y va en segundos. Solo tiene sentido en las
 * pantallas que alguien deja puestas.
 */
export function AlDia({ cada = 0 }: { cada?: number }) {
  const router = useRouter();

  useEffect(() => {
    /* No remonta con cada refresco: router.refresh() vuelve a pedir los
       componentes del servidor sin tumbar el estado del cliente, así que
       este efecto no se vuelve a disparar y no hay bucle. */
    router.refresh();

    const siSeVe = () => { if (document.visibilityState === "visible") router.refresh() };
    document.addEventListener("visibilitychange", siSeVe);
    window.addEventListener("focus", siSeVe);

    const reloj = cada > 0 ? setInterval(siSeVe, cada * 1000) : undefined;

    return () => {
      document.removeEventListener("visibilitychange", siSeVe);
      window.removeEventListener("focus", siSeVe);
      if (reloj) clearInterval(reloj);
    };
  }, [router, cada]);

  return null;
}

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
