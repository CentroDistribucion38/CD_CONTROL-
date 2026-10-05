"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { estadoDeCopia, fechaCorta } from "@/lib/copia-offline";

/**
 * LA FRANJA QUE DICE «ESTO ES UNA COPIA».
 *
 * Con internet no se ve. Sin internet —o con una red tan mala que la
 * pantalla salió de la copia— aparece arriba, con la fecha de lo que se
 * está viendo, porque en una auditoría lo peor es que alguien crea que
 * está viendo el inventario de este momento cuando es el de ayer.
 */
export function AvisoCopia() {
  const pathname = usePathname();
  const [sinRed, setSinRed] = useState(false);
  const [copia, setCopia] = useState<{ copia: boolean; fecha: string | null } | null>(null);
  const [volvio, setVolvio] = useState(false);

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
  if (!sinRed && !esCopia) return null;

  const de = copia?.fecha ? ` · copia del ${fechaCorta(copia.fecha)}` : "";
  return (
    <div className="sh-copia" role="status">
      {sinRed ? (
        <span><b>Sin internet</b>{de}. Puedes ver lo guardado hasta tu última conexión; no puedes realizar cambios.</span>
      ) : (
        <span><b>Esta pantalla es una copia</b>{de}. La red no respondió: puedes ver lo guardado, pero no realizar cambios.</span>
      )}
      {(volvio || (!sinRed && esCopia)) && (
        <button type="button" onClick={() => location.reload()}>Ver lo de ahora</button>
      )}
    </div>
  );
}
