"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { estadoDeCopia, fechaCorta } from "@/lib/copia-offline";

/**
 * LA FRANJA QUE DICE «ESTO ES UNA COPIA».
 *
 * Con internet no se ve. Sin internet aparece arriba, con la fecha de lo
 * que se está viendo, porque en una auditoría lo peor es que alguien crea
 * que está viendo el inventario de este momento cuando es el de ayer.
 *
 * Con internet, si la pantalla salió de la copia es porque el servidor tardó
 * muchísimo: NO se asusta a nadie. La pantalla se pone sola al día en cuanto
 * llega lo nuevo (se recarga una vez), y solo si en medio minuto no llegó
 * aparece la franja con «Ver lo de ahora».
 */
const SEGUIR_MS = 1500;
const PACIENCIA_MS = 30_000;
const LLAVE_AUTO = "cd38.autoactualizo";
export function AvisoCopia() {
  const pathname = usePathname();
  const [sinRed, setSinRed] = useState(false);
  const [copia, setCopia] = useState<{ copia: boolean; fecha: string | null } | null>(null);
  const [volvio, setVolvio] = useState(false);
  const [harta, setHarta] = useState(false);   // pasó la paciencia y la red no trajo lo nuevo

  const mirar = useCallback(async () => {
    const e = await estadoDeCopia(location.pathname + location.search);
    setCopia(e ? { copia: e.copia, fecha: e.fecha } : null);
  }, []);

  useEffect(() => {
    setSinRed(!navigator.onLine);
    void mirar();
    const sin = () => { setSinRed(true); setVolvio(false); void mirar() };
    const con = () => { setSinRed(false); setVolvio(true) };
    window.addEventListener("offline", sin);
    window.addEventListener("online", con);
    return () => { window.removeEventListener("offline", sin); window.removeEventListener("online", con) };
  }, [mirar, pathname]);

  const esCopia = copia?.copia === true;

  /* Con internet y una copia en pantalla: se espera lo nuevo y se recarga sola, una vez. */
  useEffect(() => {
    setHarta(false);
    if (sinRed || !esCopia) return;
    const t0 = Date.now();
    const reloj = setInterval(async () => {
      const e = await estadoDeCopia(location.pathname + location.search);
      if (e && e.copia === false) {
        clearInterval(reloj);
        try {
          const ult = Number(sessionStorage.getItem(LLAVE_AUTO) ?? 0);
          if (Date.now() - ult < 60_000) return;          // nunca en bucle
          sessionStorage.setItem(LLAVE_AUTO, String(Date.now()));
        } catch { /* sin sessionStorage: se recarga igual, una vez por esta espera */ }
        location.reload();
      } else if (Date.now() - t0 >= PACIENCIA_MS) { clearInterval(reloj); setHarta(true) }
    }, SEGUIR_MS);
    return () => clearInterval(reloj);
  }, [sinRed, esCopia, pathname]);

  if (!sinRed && !(esCopia && (harta || volvio))) return null;

  const de = copia?.fecha ? ` · copia del ${fechaCorta(copia.fecha)}` : "";
  return (
    <div className="sh-copia" role="status">
      {sinRed ? (
        <span><b>Sin internet</b>{de}. Puedes ver lo guardado hasta tu última conexión; no puedes realizar cambios.</span>
      ) : (
        <span><b>Esta pantalla es una copia</b>{de}. El servidor no respondió a tiempo: puedes ver lo guardado, pero no realizar cambios.</span>
      )}
      {(volvio || (!sinRed && esCopia)) && (
        <button type="button" onClick={() => location.reload()}>Ver lo de ahora</button>
      )}
    </div>
  );
}
