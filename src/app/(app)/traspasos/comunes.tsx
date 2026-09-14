"use client";

/**
 * LO QUE COMPARTEN LAS PANTALLAS DE TRASPASOS.
 *
 * Las funciones de formato viven en modulos/traspasos/formato.ts y aquí
 * solo se reexportan: este archivo es "use client", y lo que se importe
 * de él desde una página del servidor llegaría como referencia y no como
 * función.
 */

import { useEffect, useRef, useState } from "react";
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
          {/* CORREGIDO SE DICE, no se esconde. Un viaje reescrito por un
              administrador se veía igual que uno recién registrado, y
              entonces el rastro que se guarda no le sirve a nadie:
              nadie sabe que hay algo que mirar. */}
          {v.ediciones > 0 && (
            <span className="eti corregido" title={`Corregido por ${quien(nombres, v.editado_por)}`}>
              CORREGIDO{v.ediciones > 1 ? ` ×${v.ediciones}` : ""}
            </span>
          )}
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

/* =====================================================================
   UN DESPLEGABLE QUE SÍ SE PUEDE PEINAR
   ---------------------------------------------------------------------
   El <select> nativo dibuja su lista el sistema operativo: el azul, el
   tipo de letra y el alto de cada renglón no los pone el CSS, y no hay
   propiedad que los cambie. En medio de una pantalla con su propia
   paleta se ve como lo que es — una ventana de otro programa.

   Así que la lista se dibuja aquí. Lo que hay que reponer a mano,
   porque el nativo lo traía gratis:

     · teclado: flechas, Enter, Escape, Home y End
     · cerrar al tocar por fuera
     · el que está escogido se ve escogido, y la lista abre en él
     · aria-* para que un lector de pantalla lo anuncie como lista

   Y UN FILTRO CUANDO HAY MUCHAS. Con siete placas sobra; con cuarenta,
   buscar con la rueda del mouse es peor que teclear tres letras. Sale
   solo a partir de ocho, no siempre: un campo de búsqueda sobre una
   lista de cinco es ruido.
   ===================================================================== */

export type Opcion = { valor: string; texto: string; nota?: string | null };

export function Desplegable({ valor, opciones, vacio, extra, alEscoger, alExtra,
                              grande, ariaLabel, disparoRef }: {
  valor: string;
  opciones: Opcion[];
  /** Lo que dice el botón cuando no hay nada escogido. */
  vacio: string;
  /** El renglón de abajo, el de "＋ Otra placa…". Opcional. */
  extra?: string;
  alEscoger: (v: string) => void;
  alExtra?: () => void;
  /** La placa se lee un punto más grande y espaciada. */
  grande?: boolean;
  ariaLabel: string;
  disparoRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState("");
  const [marcado, setMarcado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const conFiltro = opciones.length >= 8;
  const vistas = busca.trim()
    ? opciones.filter((o) =>
        (o.texto + " " + (o.nota ?? "")).toLowerCase().includes(busca.trim().toLowerCase()))
    : opciones;
  const elegida = opciones.find((o) => o.valor === valor);

  /* Al abrir, el cursor arranca en la que está escogida y no en la
     primera: bajar cuarenta veces para llegar a la que ya estaba es
     exactamente lo que el nativo no hacía. */
  useEffect(() => {
    if (!abierto) { setBusca(""); return }
    const i = vistas.findIndex((o) => o.valor === valor);
    setMarcado(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  /* La marcada siempre a la vista. Sin esto, bajar con la flecha más
     allá del borde mueve una selección que nadie puede ver. */
  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector('[data-marcada="1"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [abierto, marcado]);

  function escoger(v: string) { setAbierto(false); alEscoger(v) }

  function teclas(e: React.KeyboardEvent) {
    if (!abierto) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault(); setAbierto(true);
      }
      return;
    }
    const tope = vistas.length + (extra ? 1 : 0) - 1;
    if (e.key === "Escape")      { e.preventDefault(); setAbierto(false) }
    else if (e.key === "ArrowDown") { e.preventDefault(); setMarcado((i) => Math.min(i + 1, tope)) }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setMarcado((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Home")      { e.preventDefault(); setMarcado(0) }
    else if (e.key === "End")       { e.preventDefault(); setMarcado(tope) }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (extra && marcado === vistas.length) { setAbierto(false); alExtra?.() }
      else if (vistas[marcado]) escoger(vistas[marcado].valor);
    }
  }

  return (
    <div className={"desple" + (grande ? " grande" : "")} ref={caja}>
      <button type="button" ref={disparoRef} className="disparo"
              aria-haspopup="listbox" aria-expanded={abierto} aria-label={ariaLabel}
              onClick={() => setAbierto((v) => !v)} onKeyDown={teclas}>
        <span className={elegida ? "puesto" : "sin"}>
          {elegida ? elegida.texto : vacio}
          {elegida?.nota && <i>{elegida.nota}</i>}
        </span>
        <svg className="flecha" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div className="opciones" role="listbox" aria-label={ariaLabel} onKeyDown={teclas}>
          {conFiltro && (
            <div className="filtro">
              <input value={busca} autoFocus placeholder="Buscar…" aria-label="Buscar"
                     onChange={(e) => { setBusca(e.target.value); setMarcado(0) }}
                     onKeyDown={teclas} />
            </div>
          )}

          <div className="rollo" ref={lista}>
            {vistas.length === 0 && <div className="nada">Nada con «{busca}»</div>}

            {vistas.map((o, i) => (
              <button key={o.valor} type="button" role="option"
                      aria-selected={o.valor === valor}
                      data-marcada={i === marcado ? "1" : undefined}
                      className={(o.valor === valor ? "elegida" : "")
                                 + (i === marcado ? " marcada" : "")}
                      onPointerEnter={() => setMarcado(i)}
                      onClick={() => escoger(o.valor)}>
                <svg className="tic" viewBox="0 0 24 24" aria-hidden>
                  <path d="M5 13l4 4L19 7" />
                </svg>
                <span>{o.texto}{o.nota && <i>{o.nota}</i>}</span>
              </button>
            ))}

            {extra && (
              <button type="button" className={"mas" + (marcado === vistas.length ? " marcada" : "")}
                      data-marcada={marcado === vistas.length ? "1" : undefined}
                      onPointerEnter={() => setMarcado(vistas.length)}
                      onClick={() => { setAbierto(false); alExtra?.() }}>
                <span>＋ {extra}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
