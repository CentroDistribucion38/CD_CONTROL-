"use client";

import { useState } from "react";
import { informeSalidaPdf, type DatosInforme } from "./informe";

/**
 * EL BOTÓN QUE BAJA EL INFORME.
 *
 * SOLO ESTE BOTÓN ES DE CLIENTE, y no la pantalla entera: jsPDF pesa y
 * solo hace falta cuando alguien lo toca, así que se importa ahí mismo
 * —`await import`— y no se le carga a nadie que entre a mirar la cifra.
 *
 * LOS DATOS LLEGAN YA CALCULADOS desde la pantalla. Ver la nota larga de
 * informe.ts: si el PDF sacara sus propios totales, el día que cambie
 * una regla el informe diría otra cifra y nadie se daría cuenta.
 *
 * SI FALLA, LO DICE. Un botón que no hace nada visible se toca cuatro
 * veces y después se reporta como «la app no sirve».
 */
export function BotonInforme({ datos }: { datos: DatosInforme }) {
  const [armando, setArmando] = useState(false);
  const [mal, setMal] = useState(false);

  async function bajar() {
    setMal(false); setArmando(true);
    try { await informeSalidaPdf(datos) }
    catch { setMal(true) }
    finally { setArmando(false) }
  }

  return (
    <div className="inf-bajar">
      <button type="button" className="inf-bt" onClick={bajar} disabled={armando}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
        </svg>
        {armando ? "Armando…" : "Informe PDF"}
      </button>
      {mal && <p className="inf-mal">No se pudo armar el informe. Recarga la página y vuelve a intentar.</p>}
    </div>
  );
}
