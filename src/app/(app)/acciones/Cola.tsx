"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { pendientes, vaciar, type Pendiente } from "@/modulos/acciones/cola";

/**
 * EL AVISO DE LO QUE ESTÁ ESPERANDO SALIR.
 *
 * Va en el cascarón del módulo, así que se ve desde cualquier pantalla de
 * Acciones. Solo aparece cuando hay algo: una barra que dice "0
 * pendientes" es ruido permanente.
 *
 * Intenta vaciar la cola SOLO cuando el navegador dice que volvió la red,
 * y una vez al abrir. No se reintenta cada X segundos a propósito: sin
 * red, reintentar es gastar batería para fallar, y el evento "online" es
 * exactamente la señal que se está esperando.
 *
 * Y deja un botón para intentarlo a mano, porque "online" miente seguido:
 * el teléfono se conecta al wifi de la bodega, dice que hay red, y el
 * wifi no llega a internet.
 */
export function Cola() {
  const router = useRouter();
  const supabase = createClient();

  const [lista, setLista] = useState<Pendiente[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [dicho, setDicho] = useState<string | null>(null);

  const revisar = useCallback(async () => {
    setLista(await pendientes());
  }, []);

  const intentar = useCallback(async () => {
    setEnviando(true);
    setDicho(null);
    const r = await vaciar(supabase);
    setEnviando(false);
    await revisar();

    if (r.rechazados.length) {
      /* Un rechazo con motivo NO se reintenta y por eso hay que decirlo:
         si se callara, la persona creería que quedó reportado y el
         hallazgo se perdería igual que sin cola. */
      setDicho(`No se pudo con ${r.rechazados.length}: ${r.rechazados[0]}`);
    } else if (r.salieron) {
      setDicho(`Se enviaron ${r.salieron}.`);
      router.refresh();
    } else if (r.quedan) {
      setDicho("Todavía no hay red. Sigue guardado.");
    }
  }, [supabase, revisar, router]);

  useEffect(() => {
    revisar();
    const alVolver = () => { intentar(); };
    window.addEventListener("online", alVolver);
    /* Un intento al abrir, por si la red volvió mientras la app estaba
       cerrada: el evento "online" no se dispara en ese caso. */
    if (typeof navigator === "undefined" || navigator.onLine) intentar();
    return () => window.removeEventListener("online", alVolver);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!lista.length && !dicho) return null;

  return (
    <div className="ac-cola" role="status">
      <span className="punto" />
      <span className="txt">
        {lista.length > 0 ? (
          <>
            <b>{lista.length} {lista.length === 1 ? "reporte guardado" : "reportes guardados"}</b>{" "}
            en este teléfono, esperando red. Se {lista.length === 1 ? "envía" : "envían"} solo
            {lista.length === 1 ? "" : "s"} cuando vuelva.
          </>
        ) : dicho}
        {lista.length > 0 && dicho && <> · {dicho}</>}
      </span>
      {lista.length > 0 && (
        <button type="button" onClick={intentar} disabled={enviando}>
          {enviando ? "Intentando…" : "Intentar ahora"}
        </button>
      )}
    </div>
  );
}
