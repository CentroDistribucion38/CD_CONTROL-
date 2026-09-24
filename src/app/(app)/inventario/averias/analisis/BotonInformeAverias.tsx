"use client";

import { useRef, useState } from "react";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import {
  dibujarInformeAverias, nombreInformeAverias, type DatosAverias,
} from "@/modulos/averias/informe";

/**
 * EL BOTÓN QUE BAJA EL INFORME DE AVERÍAS.
 *
 * Mismo patrón que el de la salida de vidrio, y a propósito: jsPDF pesa
 * 350 KB y solo hace falta cuando alguien lo toca, así que se importa
 * ahí mismo junto con los dos PNG de la marca. Quien entra a mirar la
 * cifra no baja nada de eso.
 *
 * LOS DATOS LLEGAN YA CALCULADOS desde la pantalla, incluidos los
 * hallazgos: si el PDF sacara sus propias cuentas, el día que cambie
 * una regla el papel diría una cosa y la pantalla otra, y el que está
 * en la reunión con el papel no tiene cómo saber cuál es la buena.
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

export function BotonInformeAverias({ datos }: { datos: DatosAverias }) {
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
      const doc = dibujarInformeAverias(jsPDF, datos, {
        generado: new Date(),
        marca: { palabra: palabra ?? undefined, sello: sello ?? undefined },
        paleta: leerPaleta(caja.current),
      });
      doc.save(nombreInformeAverias(datos.hoy));
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
      {mal && (
        <p className="inf-mal">
          No se pudo armar el informe. Recarga la página y vuelve a intentar.
        </p>
      )}
    </div>
  );
}
