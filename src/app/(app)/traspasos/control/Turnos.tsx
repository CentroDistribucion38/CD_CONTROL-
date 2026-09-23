"use client";

/**
 * LOS TRES ANILLOS DE TURNO Y EL PANEL DEL DÍA — ahora se abren, y se
 * pueden juntar.
 *
 * «Que en el tablero de control pueda tener un icono y visualizar el
 * cierre por turno o del día.»  Y después: «que en los turnos haya un
 * icono que seleccione los 3 para generar el cierre de los tres turnos,
 * o dos, y así.»
 *
 * DOS GESTOS DISTINTOS SOBRE LA MISMA TARJETA:
 *
 *   TOCAR EL ANILLO ......... abre el cierre de ESE turno. Es lo que
 *                             se hace el 90% de las veces y por eso es
 *                             el gesto grande, sin nada que aprender.
 *   TOCAR LA CASILLA ........ lo suma a una selección. Con uno o más
 *                             marcados aparece abajo un botón que abre
 *                             el cierre de TODOS ellos en una sola
 *                             ficha — no dos fichas, una.
 *
 * LA CASILLA VA EN LA ESQUINA Y ES PEQUEÑA a propósito: lo que manda en
 * esta pantalla es el porcentaje. Pero mide 28 px y su zona tocable
 * llega a 44, que es lo que necesita un dedo con guante.
 *
 * ESTE COMPONENTE NO CALCULA NADA. Recibe los anillos ya hechos y las
 * filas que el tablero está pintando, y se las pasa a la ficha. Es lo
 * que hace imposible que el cierre diga un número y el tablero otro.
 */

import { useEffect, useState } from "react";
import type { Control } from "@/modulos/traspasos/datos";
import { Cierre } from "./Cierre";

export type Anillo = {
  turno: string; planeado: number; adheridos: number; pct: number; hay: boolean;
};

export function Turnos({ anillos, filas, desde, hasta, rotulo, adherencia, adheridos, planeado }: {
  anillos: Anillo[];
  filas: Control[];
  desde: string;
  hasta: string;
  rotulo: string;
  /** Las cifras del panel grande, ya calculadas arriba. */
  adherencia: number;
  adheridos: number;
  planeado: number;
}) {
  /* null = cerrado; [] = el día entero; ["A","B"] = esos turnos. */
  const [abierto, setAbierto] = useState<string[] | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);

  /* EL BOTÓN DE ARRIBA ABRE ESTA MISMA FICHA. Vive en otra parte de la
     pantalla —la barra del encabezado— y no puede llamar a este estado
     directamente sin subir la ficha entera hasta la página. Un aviso
     suelto los conecta sin mover nada de sitio. */
  useEffect(() => {
    const abrir = () => setAbierto([]);
    window.addEventListener("tp:cierre-dia", abrir);
    return () => window.removeEventListener("tp:cierre-dia", abrir);
  }, []);

  const R = 34, C = 2 * Math.PI * R;
  const color = (p: number | null) =>
    p == null ? "var(--tp-gris)" : p >= 100 ? "var(--tp-bien)"
      : p > 0 ? "var(--tp-ojo)" : "var(--tp-mal)";

  /* En el orden de la bodega, no en el orden en que se tocaron: un
     cierre de «B y A» se lee como si alguien se hubiera equivocado. */
  const orden = (l: string[]) => anillos.map((a) => a.turno).filter((t) => l.includes(t));
  const marcar = (t: string) =>
    setMarcados((m) => (m.includes(t) ? m.filter((x) => x !== t) : [...m, t]));
  const letras = (l: string[]) =>
    l.length > 1 ? l.slice(0, -1).join(", ") + " y " + l[l.length - 1] : l[0] ?? "";

  const sel = orden(marcados);
  const plan = anillos.filter((a) => sel.includes(a.turno)).reduce((s, a) => s + a.planeado, 0);
  const hecho = anillos.filter((a) => sel.includes(a.turno)).reduce((s, a) => s + a.adheridos, 0);

  /* TODO ESTO VA EN UNA SOLA CAJA. El medidor de la pantalla es una
     rejilla de DOS columnas —el avance y los turnos—: sueltos, la barra
     de la selección se iba a la columna de al lado y el botón del día
     debajo del avance. Un contenedor los deja donde tienen que estar y
     los apila. */
  return (
    <div className="tp-turnos-caja">
      <div className="turnos">
        {anillos.map((x) => {
          const on = marcados.includes(x.turno);
          return (
            <div className={"turno" + (on ? " marcado" : "")} key={x.turno}>
              {/* LA CASILLA VA PRIMERO EN EL ORDEN DEL TECLADO: con el
                  tabulador se recorre marcar A, abrir A, marcar B… que
                  es como se arma una selección sin ratón. */}
              <button type="button" className="tp-marca" aria-pressed={on}
                      onClick={() => marcar(x.turno)}
                      aria-label={`${on ? "Quitar" : "Sumar"} el turno ${x.turno} a la selección`}>
                <i aria-hidden>
                  {on && <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                </i>
              </button>

              <button type="button" className="tp-abrir" onClick={() => setAbierto([x.turno])}
                      aria-label={`Ver el cierre del turno ${x.turno}`}>
                <svg viewBox="0 0 86 86" aria-hidden>
                  <circle cx="43" cy="43" r={R} fill="none" stroke="var(--tp-fondo)" strokeWidth="10" />
                  <circle cx="43" cy="43" r={R} fill="none" stroke={color(x.hay ? x.pct : null)}
                          strokeWidth="10" strokeLinecap="butt"
                          strokeDasharray={`${(Math.min(x.pct, 100) / 100) * C} ${C}`}
                          transform="rotate(-90 43 43)" />
                  <text x="43" y="49" textAnchor="middle" fontFamily="Archivo" fontWeight="900"
                        fontSize="20" fill="var(--tp-tinta)">
                    {x.hay ? `${x.pct}%` : "—"}
                  </text>
                </svg>
                <b>Turno {x.turno}</b>
                <span>{x.hay ? `${x.adheridos} de ${x.planeado}` : "sin plan"}</span>
                <i className="tp-ver" aria-hidden>
                  <svg viewBox="0 0 24 24"><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></svg>
                </i>
              </button>
            </div>
          );
        })}
      </div>

      {/* LO QUE SE ESCOGIÓ, Y CÓMO VA. Sale solo cuando hay algo
          marcado: una barra vacía esperando es una barra que estorba. */}
      {sel.length > 0 && (
        <div className="tp-sel">
          <span className="q">
            Turno{sel.length === 1 ? "" : "s"} <b>{letras(sel)}</b>
            <em>{hecho} de {plan} del plan</em>
          </span>
          <button type="button" className="limpiar" onClick={() => setMarcados([])}>Quitar</button>
          <button type="button" className="btn si" onClick={() => setAbierto(sel)}>
            Ver el cierre de {sel.length === 1 ? "este turno" : letras(sel)}
          </button>
        </div>
      )}

      {/* EL CIERRE DEL DÍA ENTERO, debajo de los tres. No va escondido
          dentro de un turno porque no es de ningún turno: es la suma. */}
      <button type="button" className="tp-cierre-dia" onClick={() => setAbierto([])}>
        <span className="q">Ver el cierre {desde === hasta ? "del día" : "del período"}</span>
        <span className="d">{adherencia}% · {adheridos} de {planeado} del plan</span>
        <i className="tp-ver" aria-hidden>
          <svg viewBox="0 0 24 24"><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></svg>
        </i>
      </button>

      {abierto !== null && (
        <Cierre filas={filas} desde={desde} hasta={hasta} rotulo={rotulo}
                turnos={abierto} cerrar={() => setAbierto(null)} />
      )}
    </div>
  );
}
