"use client";

import { useEffect } from "react";
import { sondear, CICLO_MIN, edadesGuardadas, elegirPantallas, haySoporte, prepararCopia, todasLasRutas } from "@/lib/copia-offline";

/**
 * LA COPIA SE VA HACIENDO SOLA.
 *
 * Mientras CONTROL está abierto con internet, cada pocos minutos se revisa
 * qué pantallas faltan o tienen la copia vieja y se vuelven a guardar, de a
 * pocas y empezando por la que se está mirando: si el internet se va, todo
 * abre con lo último que se guardó (ver elegirPantallas en copia-offline.ts).
 * Sin internet no hace nada y se retoma sola cuando vuelve; con «ahorro de
 * datos» o red 2G tampoco corre: esos equipos la preparan desde Mi perfil.
 */
const PRIMERA_MS = 4_000;
const AL_VOLVER_MS = 3_000;
/* Con un internet que parpadea no se arranca a copiar a cada «online»: hay que llevar este rato seguido con señal. */
const FIRME_MS = 8_000;

export function PrepararSola({ rutas }: { rutas: string[] }) {
  const llave = rutas.join("|");
  useEffect(() => {
    if (!haySoporte()) return;
    let vivo = true, corriendo = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const ciclo = async () => {
      if (!vivo || corriendo) return;
      const con = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (con && (con.saveData === true || con.effectiveType === "slow-2g" || con.effectiveType === "2g")) return;
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      corriendo = true;
      try {
        if (!(await sondear())) { corriendo = false; return }     // «conectado» sin salida a internet: no se intenta copiar
        const edades = await edadesGuardadas();
        /* Se lee en cada ciclo: las pantallas descubiertas en el anterior entran ya a este. */
        const lote = elegirPantallas(todasLasRutas(rutas), edades, Date.now(), location.pathname + location.search);
        if (lote.length > 0) await prepararCopia(lote, () => {});
      } catch { /* en silencio: se reintenta en el siguiente ciclo */ }
      corriendo = false;
    };
    const luego = (ms: number) => { const t = setTimeout(() => { timers.delete(t); void ciclo() }, ms); timers.add(t) };

    luego(PRIMERA_MS);
    const reloj = setInterval(() => void ciclo(), CICLO_MIN * 60_000);
    let firme: ReturnType<typeof setTimeout> | undefined;
    const alVolver = () => {
      if (firme) clearTimeout(firme);
      firme = setTimeout(() => { firme = undefined; if (navigator.onLine) luego(AL_VOLVER_MS) }, FIRME_MS);
    };
    const alIrse = () => { if (firme) { clearTimeout(firme); firme = undefined } };
    const alVer = () => { if (document.visibilityState === "visible") luego(AL_VOLVER_MS) };
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alIrse);
    document.addEventListener("visibilitychange", alVer);
    return () => {
      vivo = false; clearInterval(reloj); timers.forEach(clearTimeout); if (firme) clearTimeout(firme);
      window.removeEventListener("online", alVolver); window.removeEventListener("offline", alIrse); document.removeEventListener("visibilitychange", alVer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave]);
  /* La copia es invisible: no hay mensaje ni franja. Quien quiera ver cuántas hay guardadas lo ve en Mi perfil. */
  return null;
}
