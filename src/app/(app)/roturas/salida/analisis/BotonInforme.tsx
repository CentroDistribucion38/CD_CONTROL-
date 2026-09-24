"use client";

import { useRef, useState } from "react";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import { dibujarInforme, nombreInforme, type DatosInforme } from "./informe";

/**
 * EL BOTÓN QUE BAJA EL INFORME.
 *
 * SOLO ESTE BOTÓN ES DE CLIENTE, y no la pantalla entera: jsPDF pesa
 * 350 KB y solo hace falta cuando alguien lo toca, así que se importa
 * ahí mismo —`await import`— junto con los dos PNG de la marca. Quien
 * entra a mirar la cifra no baja nada de eso.
 *
 * LOS COLORES SALEN DEL TEMA Y LOS LOGOS NO. Es la misma regla de la
 * hoja de rotura de línea, y se usa LA MISMA FUNCIÓN —`leerPaleta`—:
 * dos maneras de leer el tema se separan el día que alguien agregue uno.
 *
 * LOS DATOS LLEGAN YA CALCULADOS desde la pantalla. Ver la nota larga de
 * informe.ts: si el PDF sacara sus propios totales, el día que cambie
 * una regla el informe diría otra cifra y nadie se daría cuenta.
 *
 * SI FALLA, LO DICE. Un botón que no hace nada visible se toca cuatro
 * veces y después se reporta como «la app no sirve».
 */
async function comoDataUrl(url: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise<string | null>((ok) => {
      const f = new FileReader();
      f.onload = () => ok(String(f.result));
      f.onerror = () => ok(null);
      f.readAsDataURL(b);
    });
  } catch { return null }
}

export function BotonInforme({ datos }: { datos: DatosInforme }) {
  const [armando, setArmando] = useState(false);
  const [mal, setMal] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  async function bajar() {
    setMal(false); setArmando(true);
    try {
      const [{ jsPDF }, palabra, sello] = await Promise.all([
        import("jspdf"),
        comoDataUrl("/marca/logo-bavaria.png"),
        comoDataUrl("/marca/logo-b.png"),
      ]);
      const doc = dibujarInforme(jsPDF, datos, {
        generado: new Date(),
        marca: { palabra: palabra ?? undefined, sello: sello ?? undefined },
        paleta: leerPaleta(caja.current),
      });
      doc.save(nombreInforme(datos.hoy));
    } catch { setMal(true) }
    finally { setArmando(false) }
  }

  return (
    <div className="inf-bajar" ref={caja}>
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
