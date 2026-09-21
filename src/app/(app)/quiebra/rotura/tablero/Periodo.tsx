"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Linea } from "@/modulos/rotlinea/datos";

/**
 * EL PERÍODO Y LA LÍNEA.
 *
 * VIVEN EN LA DIRECCIÓN, no en el estado de la pantalla. Es lo que
 * permite mandar por chat «mira la línea 2 de agosto» y que al otro le
 * abra exactamente eso, y lo que hace que el botón de atrás deshaga el
 * filtro en vez de salirse del módulo.
 *
 * LOS ATAJOS ANTES QUE LAS FECHAS. «Lo que va del año» es lo que se
 * mira nueve de cada diez veces; las dos fechas sueltas están para la
 * décima. Al revés, todo el mundo teclearía dos fechas para pedir lo
 * que hay un botón que pide.
 *
 * ------------------------------------------------------------------
 * POR QUÉ ESTO NO ES UN `onClick` A SECAS
 *
 * Cambiar de período vuelve a dibujar la pantalla EN EL SERVIDOR: se
 * piden los datos otra vez y se manda el HTML nuevo. Eso toma lo que
 * toma. Con un onClick pelado, entre el clic y el cambio no pasaba
 * NADA visible —el botón seguía apagado, el otro seguía encendido— y
 * la pantalla se sentía trabada; el remedio de todo el mundo es volver
 * a hacer clic, que es pedir el mismo trabajo dos veces.
 *
 * Dos cosas lo arreglan, y hacen falta las dos:
 *
 *   EL BOTÓN SE ENCIENDE DE UNA. useTransition dice si la navegación
 *   está en curso, y mientras tanto el botón que se acaba de tocar se
 *   pinta como escogido. La respuesta es inmediata aunque los datos no
 *   hayan llegado: se ve que la orden se recibió.
 *
 *   Y LOS DATOS SE VAN PIDIENDO ANTES. router.prefetch deja listo el
 *   contenido de los atajos apenas se abre la pantalla —y el de
 *   cualquiera al posar el cursor encima—, así que cuando se hace clic
 *   muchas veces ya está. Prefetch sin el aviso visual seguiría
 *   sintiéndose trabado la primera vez; el aviso sin prefetch seguiría
 *   tardando. Juntos, no.
 */
export function Periodo({ desde, hasta, linea, hoy, lineas,
                          base = "/quiebra/rotura/tablero", conLinea = true }: {
  desde: string; hasta: string; linea?: number; hoy: string; lineas: Linea[];
  /** A qué pantalla lleva: el tablero o la hoja de informes generados. */
  base?: string;
  /** Los informes son del día entero, no de una línea: allá no se ofrece. */
  conLinea?: boolean;
}) {
  const router = useRouter();
  const [cargando, empezar] = useTransition();
  /* CUÁL SE ACABA DE PEDIR. Hace falta aparte del período de verdad:
     `desde`/`hasta` llegan del servidor y no cambian hasta que la
     pantalla nueva está lista, así que mientras carga seguirían
     encendiendo el botón VIEJO. Esto enciende el que se tocó, ya. */
  const [pedido, setPedido] = useState<string | null>(null);

  const dir = (d: string, h: string, l?: number) => {
    const p = new URLSearchParams({ desde: d, hasta: h });
    if (l) p.set("linea", String(l));
    return `${base}?${p.toString()}`;
  };
  /* La navegación va dentro de la transición: sin esto, `cargando`
     nunca se pone en true y el botón no se entera de nada. */
  const ir = (d: string, h: string, l?: number) => {
    setPedido(`${d}|${h}`);
    empezar(() => router.push(dir(d, h, l)));
  };

  const menos = (n: number) =>
    new Date(Date.parse(hoy + "T12:00:00") - n * 86400_000).toISOString().slice(0, 10);

  const anio = hoy.slice(0, 4);
  const mes = hoy.slice(0, 7);
  const ATAJOS: [string, string, string][] = [
    [`Lo que va de ${anio}`, `${anio}-01-01`, hoy],
    ["Este mes", `${mes}-01`, hoy],
    ["Últimos 30 días", menos(29), hoy],
    ["Últimos 7 días", menos(6), hoy],
  ];

  /* Los cuatro atajos se piden apenas se abre la pantalla. Son cuatro
     y son los que se usan; pedirlos de más cuesta menos que hacer
     esperar en el clic. */
  useEffect(() => { if (!cargando) setPedido(null) }, [cargando]);

  useEffect(() => {
    for (const [, d, h] of ATAJOS) router.prefetch(dir(d, h, linea));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoy, linea]);

  return (
    <div className={"rl-periodo" + (cargando ? " cargando" : "")}>
      <div className="rl-atajos">
        {ATAJOS.map(([r, d, h]) => {
          /* Mientras carga manda lo que se pidió; ya cargado, lo que
             de verdad está puesto. Si la navegación se pierde, el
             servidor tiene la última palabra y el botón se corrige. */
          const puesto = cargando && pedido
            ? pedido === `${d}|${h}`
            : desde === d && hasta === h;
          return (
            <button key={r} type="button"
                    className={puesto ? "on" : ""}
                    aria-current={puesto ? "true" : undefined}
                    onMouseEnter={() => router.prefetch(dir(d, h, linea))}
                    onFocus={() => router.prefetch(dir(d, h, linea))}
                    onClick={() => ir(d, h, linea)}>{r}</button>
          );
        })}
      </div>

      <div className="rl-fechas">
        <label>
          <span>Desde</span>
          <input type="date" value={desde} max={hasta}
                 onChange={(e) => e.target.value && ir(e.target.value, hasta, linea)} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" value={hasta} min={desde}
                 onChange={(e) => e.target.value && ir(desde, e.target.value, linea)} />
        </label>
        {conLinea && <label>
          <span>Línea</span>
          <select value={linea ?? ""}
                  onChange={(e) => ir(desde, hasta, Number(e.target.value) || undefined)}>
            <option value="">Todas las líneas</option>
            {lineas.map((l) => (
              <option key={l.linea} value={l.linea}>Línea {l.linea} · {l.tren}</option>
            ))}
          </select>
        </label>}
      </div>
    </div>
  );
}
