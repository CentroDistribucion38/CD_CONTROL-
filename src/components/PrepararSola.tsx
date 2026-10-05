"use client";

import { useEffect } from "react";
import { haySoporte, hayQueRenovar, prepararCopia, ultimaPreparacion } from "@/lib/copia-offline";

/**
 * LA COPIA SE PREPARA SOLA.
 *
 * Quien abre la app con internet no tiene que acordarse de «Preparar para
 * auditoría»: pasados unos segundos, y si la última copia tiene más de
 * unas horas (o no hay), se guardan en silencio las pantallas que su rol
 * puede ver. Sin internet no hace nada, y con «ahorro de datos» o una red
 * 2G tampoco: esos equipos la preparan a mano desde Mi perfil.
 *
 * Va de a dos pantallas y empieza tarde a propósito: no compite con lo
 * que la persona acaba de abrir.
 */
const ESPERA_MS = 20_000;
/* La primera vez en un equipo no hay nada guardado: se apura. */
const ESPERA_PRIMERA_MS = 4_000;
const REINTENTOS = 5;

export function PrepararSola({ rutas }: { rutas: string[] }) {
  const llave = rutas.join("|");
  useEffect(() => {
    if (!haySoporte() || !hayQueRenovar(ultimaPreparacion())) return;
    let vivo = true, intentos = 0, t: ReturnType<typeof setTimeout>;
    const intentar = async () => {
      if (!vivo) return;
      const con = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      const lenta = !!con && (con.saveData === true || con.effectiveType === "slow-2g" || con.effectiveType === "2g");
      if (lenta) return;
      if (!navigator.onLine || document.visibilityState !== "visible") {
        if (++intentos < REINTENTOS) t = setTimeout(intentar, 60_000);
        return;
      }
      try { await prepararCopia(["/inicio", "/perfil", ...rutas], () => {}) } catch { /* en silencio: se reintenta la próxima vez que abra */ }
    };
    t = setTimeout(intentar, ultimaPreparacion() ? ESPERA_MS : ESPERA_PRIMERA_MS);
    return () => { vivo = false; clearTimeout(t) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave]);
  return null;
}
