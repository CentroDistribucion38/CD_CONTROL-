"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { estadoDeCopia, fechaCorta, sondear } from "@/lib/copia-offline";

/**
 * LA FRANJA QUE DICE «ESTO ES UNA COPIA» —y la que la quita sola—.
 *
 * Sin internet aparece arriba, con la fecha de lo que se está viendo, porque
 * en una auditoría lo peor es que alguien crea que está viendo el inventario
 * de este momento cuando es el de ayer. Con internet no se ve.
 *
 * «SIN INTERNET» SE MIDE, NO SE SUPONE. El navegador dice «conectado» con el
 * wifi prendido aunque no salga nada a internet, y entonces la pantalla
 * parpadeaba recargándose una y otra vez hasta que volvía la señal. Aquí
 * se pregunta de verdad (sondear: un pedido diminuto al servidor) cada pocos
 * segundos y SOLO mientras hace falta (hay corte o la pantalla es una copia):
 *
 *   · si la sonda falla, es un corte: la franja sale y se queda quieta, y NO
 *     se recarga nada;
 *   · cuando la sonda responde BUENAS veces seguidas, recién ahí se recarga
 *     sola con lo de ahora (sin botón), una vez;
 *   · si ya hay internet firme y la recarga sigue saliendo de la copia, reintenta
 *     hasta REINTENTOS veces y solo entonces ofrece «Ver lo de ahora».
 * Lo único que frena la recarga es que la persona esté escribiendo algo.
 */
const TIC_MS = 3000;            // cada cuánto se mide, cuando hace falta
const MALAS = 2;                // mediciones malas seguidas para dar el corte por real (≈ 3-6 s: un parpadeo no cuenta)
const BUENAS = 2;               // mediciones buenas seguidas para dar el internet por firme (≈ 3-6 s)
const FIRME_MS = 8000;          // sin NINGÚN corte en este rato, para dar el internet por firme (con un parpadeo no se levanta la franja)
const REINTENTOS = 5;
const VENTANA_MS = 120_000;     // pasado esto, los reintentos vuelven a empezar
const LLAVE_AUTO = "cd38.autoactualizo";

/** Recarga si todavía quedan intentos. true = la recarga salió. */
function recargar(): boolean {
  let n = 0, t = 0;
  try { const v = JSON.parse(sessionStorage.getItem(LLAVE_AUTO) ?? "null"); if (v) { n = v.n; t = v.t } } catch { /* sin memoria: un intento y ya */ }
  if (Date.now() - t > VENTANA_MS) n = 0;
  if (n >= REINTENTOS) return false;
  try { sessionStorage.setItem(LLAVE_AUTO, JSON.stringify({ n: n + 1, t: n === 0 ? Date.now() : t })) } catch { /* igual se recarga */ }
  location.reload();
  return true;
}
const limpiarIntentos = () => { try { sessionStorage.removeItem(LLAVE_AUTO) } catch { /* nada */ } };
/** ¿hay algo escrito a medias? No se recarga encima de eso. */
function escribiendo(): boolean {
  const a = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && typeof a.value === "string" && a.value.length > 0 && a.type !== "search";
}

export function AvisoCopia() {
  const pathname = usePathname();
  const [sinRed, setSinRed] = useState(false);
  const [copia, setCopia] = useState<{ copia: boolean; fecha: string | null } | null>(null);
  const [harta, setHarta] = useState(false);   // hay internet firme, se acabaron los intentos y la red no trajo lo nuevo

  const mirar = useCallback(async () => {
    const e = await estadoDeCopia(location.pathname + location.search);
    setCopia(e ? { copia: e.copia, fecha: e.fecha } : null);
  }, []);

  const sinRedRef = useRef(false);
  const esCopia = copia?.copia === true;
  const corteEn = useRef(0);                 // cuándo fue el último corte que avisó el navegador
  const esCopiaRef = useRef(false);
  esCopiaRef.current = esCopia;

  /* Al abrir cada pantalla: ¿qué estoy viendo y hay internet? */
  useEffect(() => {
    sinRedRef.current = !navigator.onLine;
    setSinRed(!navigator.onLine);
    setHarta(false);
    void mirar();
  }, [mirar, pathname]);

  /* El reloj que mide, solo cuando hace falta. */
  useEffect(() => {
    let vivo = true, ocupado = false, buenas = 0, malas = 0;
    const paso = async () => {
      if (ocupado || !vivo) return;
      const hayCorte = sinRedRef.current || !navigator.onLine;
      if (!hayCorte && !esCopiaRef.current) { buenas = 0; malas = 0; return }   // todo normal: no se gasta ni un pedido
      ocupado = true;
      const ok = await sondear();
      ocupado = false;
      if (!vivo) return;
      if (!ok) {
        buenas = 0; malas++;
        if (malas >= MALAS && !sinRedRef.current) { sinRedRef.current = true; setSinRed(true); void mirar() }
        return;
      }
      malas = 0; buenas++;
      if (buenas < BUENAS) return;
      if (Date.now() - corteEn.current < FIRME_MS) return;   // hubo un corte hace nada: todavía no es firme
      /* Internet firme. */
      if (sinRedRef.current) { sinRedRef.current = false; setSinRed(false) }
      if (esCopiaRef.current && !escribiendo()) { if (!recargar()) setHarta(true) }
      else if (sinRedRef.current === false && !esCopiaRef.current && hayCorte && !escribiendo()) recargar();   // volvió y lo que se ve pudo quedar viejo
    };
    const reloj = setInterval(() => void paso(), TIC_MS);
    const alCambiar = () => { void mirar() };
    const alCortar = () => { corteEn.current = Date.now(); void mirar() };
    window.addEventListener("offline", alCortar);
    window.addEventListener("online", alCambiar);
    return () => { vivo = false; clearInterval(reloj); window.removeEventListener("offline", alCortar); window.removeEventListener("online", alCambiar) };
  }, [mirar]);

  /* Con internet y la pantalla ya al día: los intentos se olvidan. */
  useEffect(() => { if (!sinRed && copia?.copia === false) limpiarIntentos() }, [sinRed, copia]);

  if (!sinRed && !(esCopia && harta)) return null;

  const de = copia?.fecha ? ` · copia del ${fechaCorta(copia.fecha)}` : "";
  return (
    <div className="sh-copia" role="status">
      {sinRed ? (
        <span><b>Sin internet</b>{de}. Puedes ver lo guardado hasta tu última conexión; no puedes realizar cambios.</span>
      ) : (
        <span><b>Esta pantalla es una copia</b>{de}. No se pudo traer lo de ahora: puedes ver lo guardado, pero no realizar cambios.</span>
      )}
      {!sinRed && (
        <button type="button" onClick={() => location.reload()}>Ver lo de ahora</button>
      )}
    </div>
  );
}
