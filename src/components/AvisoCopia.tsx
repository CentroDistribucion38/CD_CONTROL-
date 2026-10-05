"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { estadoDeCopia, fechaCorta } from "@/lib/copia-offline";

/**
 * LA FRANJA QUE DICE «ESTO ES UNA COPIA» —y la que la quita sola—.
 *
 * Con internet no se ve. Sin internet aparece arriba, con la fecha de lo
 * que se está viendo, porque en una auditoría lo peor es que alguien crea
 * que está viendo el inventario de este momento cuando es el de ayer.
 *
 * NADIE TIENE QUE TOCAR NADA PARA VOLVER A LO DE AHORA: en cuanto el equipo
 * detecta internet, la pantalla se recarga sola con lo nuevo. Si la red
 * todavía no está firme y la recarga vuelve a salir de la copia, reintenta
 * cada pocos segundos (hasta REINTENTOS veces); solo si no hay manera
 * aparece la franja con el botón «Ver lo de ahora». Lo único que frena la
 * recarga es que la persona esté escribiendo algo, para no tirárselo.
 */
const SEGUIR_MS = 1500;
const ENTRE_MS = 6000;          // con una copia en pantalla y internet, cada cuánto se reintenta
const REINTENTOS = 5;
const VENTANA_MS = 120_000;     // pasado esto, los reintentos vuelven a empezar
const LLAVE_AUTO = "cd38.autoactualizo";
/* UN INTERNET QUE SE VA Y VUELVE A CADA RATO («parpadea»): no se reacciona a cada golpe.
   El corte solo se avisa si dura SIN_MS seguidos, y solo se da por terminado cuando el
   internet lleva ESTABLE_MS seguidos: ni franja que titila ni recargas en cadena. */
const SIN_MS = 2500;
const ESTABLE_MS = 5000;

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
  const [harta, setHarta] = useState(false);   // se acabaron los intentos y la red no trajo lo nuevo

  const mirar = useCallback(async () => {
    const e = await estadoDeCopia(location.pathname + location.search);
    setCopia(e ? { copia: e.copia, fecha: e.fecha } : null);
  }, []);

  const sinRedRef = useRef(false);
  useEffect(() => {
    sinRedRef.current = !navigator.onLine;
    setSinRed(!navigator.onLine);
    void mirar();
    let caida: ReturnType<typeof setTimeout> | undefined;     // espera para dar el corte por real
    let firme: ReturnType<typeof setTimeout> | undefined;     // espera para dar el internet por firme
    const sin = () => {
      if (firme) { clearTimeout(firme); firme = undefined }   // volvió y se fue otra vez: a esperar de nuevo
      if (caida || sinRedRef.current) { void mirar(); return }
      caida = setTimeout(() => { caida = undefined; if (!navigator.onLine) { sinRedRef.current = true; setSinRed(true); void mirar() } }, SIN_MS);
    };
    const con = () => {
      if (caida) { clearTimeout(caida); caida = undefined }   // fue un parpadeo: ni se avisó, ni se hace nada
      if (!sinRedRef.current || firme) return;
      firme = setTimeout(() => {
        firme = undefined;
        if (!navigator.onLine) return;                        // se volvió a ir: el próximo «online» reinicia la espera
        sinRedRef.current = false; setSinRed(false);
        if (!escribiendo()) recargar();                       // lo de ahora, sin tocar nada
      }, ESTABLE_MS);
    };
    window.addEventListener("offline", sin);
    window.addEventListener("online", con);
    return () => { if (caida) clearTimeout(caida); if (firme) clearTimeout(firme); window.removeEventListener("offline", sin); window.removeEventListener("online", con) };
  }, [mirar, pathname]);

  const esCopia = copia?.copia === true;

  /* Con internet y la pantalla ya al día: los intentos se olvidan. */
  useEffect(() => { if (!sinRed && copia?.copia === false) limpiarIntentos() }, [sinRed, copia]);

  /* Con internet y una copia en pantalla: en cuanto lo nuevo está listo, o cada ENTRE_MS, se recarga sola. */
  useEffect(() => {
    setHarta(false);
    if (sinRed || !esCopia) return;
    const t0 = Date.now();
    let preguntando = false, hecho = false;
    const reloj = setInterval(async () => {
      if (preguntando || hecho || escribiendo()) return;   // una pregunta a la vez: nunca dos recargas
      preguntando = true;
      const e = await estadoDeCopia(location.pathname + location.search);
      preguntando = false;
      if (hecho) return;
      const listo = e?.copia === false, cansada = Date.now() - t0 >= ENTRE_MS;
      if (listo || cansada) {
        hecho = true; clearInterval(reloj);
        if (!recargar()) setHarta(true);
      }
    }, SEGUIR_MS);
    return () => { hecho = true; clearInterval(reloj) };
  }, [sinRed, esCopia, pathname]);

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
