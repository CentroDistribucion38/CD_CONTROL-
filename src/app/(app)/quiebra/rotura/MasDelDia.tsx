"use client";

import { useState, type ReactNode } from "react";

/**
 * «MÁS DEL DÍA» — la columna de la derecha, plegada en el celular.
 *
 * En el PC va al lado de la rejilla y no estorba. En el celular quedaba
 * debajo y empujaba la hoja del día tres pantallazos más abajo; plegada
 * es un renglón, y lo que trae —el día por línea, lo que falta dar de
 * baja— está a un toque. El botón solo existe en pantallas angostas
 * (rotura.css): en el PC la columna se ve siempre.
 */
export function MasDelDia({ pendientes, children }: { pendientes: number; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <aside className={"rl-lado" + (abierto ? "" : " cerrado")}>
      <button type="button" className="rl-mas-dia-btn" aria-expanded={abierto}
              onClick={() => setAbierto((v) => !v)}>
        Más del día
        <span>
          por línea · {pendientes > 0 ? `${pendientes} sin dar de baja` : "sin dar de baja"}
          {abierto ? " ▴" : " ›"}
        </span>
      </button>
      {children}
    </aside>
  );
}
