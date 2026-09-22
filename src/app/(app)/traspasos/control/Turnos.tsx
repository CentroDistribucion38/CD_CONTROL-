"use client";

/**
 * LOS TRES ANILLOS DE TURNO Y EL PANEL DEL DÍA — ahora se abren.
 *
 * «Que en el tablero de control pueda tener un icono y visualizar el
 * cierre por turno o del día.»
 *
 * EL ICONO ES SUTIL A PROPÓSITO. Lo que manda en esta pantalla es el
 * porcentaje; el acceso al cierre no puede competir con él. Así que es
 * una flecha chiquita en la esquina, casi apagada, que se prende al
 * pasar por encima o al llegar con el tabulador. LO QUE SE TOCA NO ES
 * EL ICONO SINO LA TARJETA ENTERA: en el celular un icono de 14 px no
 * se acierta, y el anillo completo mide más de cien.
 *
 * ESTE COMPONENTE NO CALCULA NADA. Recibe los anillos ya hechos y las
 * filas que el tablero está pintando, y se las pasa a la ficha. Es lo
 * que hace imposible que el cierre diga un número y el tablero otro.
 */

import { useState } from "react";
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
  /* null = cerrado; "" = el día entero; "A"|"B"|"C" = ese turno. */
  const [abierto, setAbierto] = useState<string | null>(null);

  const R = 34, C = 2 * Math.PI * R;
  const color = (p: number | null) =>
    p == null ? "var(--tp-gris)" : p >= 100 ? "var(--tp-bien)"
      : p > 0 ? "var(--tp-ojo)" : "var(--tp-mal)";

  return (
    <>
      <div className="turnos">
        {anillos.map((x) => (
          <button type="button" className="turno" key={x.turno}
                  onClick={() => setAbierto(x.turno)}
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
        ))}
      </div>

      {/* EL CIERRE DEL DÍA ENTERO, debajo de los tres. No va escondido
          dentro de un turno porque no es de ningún turno: es la suma. */}
      <button type="button" className="tp-cierre-dia" onClick={() => setAbierto("")}>
        <span className="q">Ver el cierre {desde === hasta ? "del día" : "del período"}</span>
        <span className="d">{adherencia}% · {adheridos} de {planeado} del plan</span>
        <i className="tp-ver" aria-hidden>
          <svg viewBox="0 0 24 24"><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></svg>
        </i>
      </button>

      {abierto !== null && (
        <Cierre filas={filas} desde={desde} hasta={hasta} rotulo={rotulo}
                turno={abierto === "" ? null : abierto}
                cerrar={() => setAbierto(null)} />
      )}
    </>
  );
}
