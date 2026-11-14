"use client";

/**
 * LAS IMÁGENES DE LAS LICENCIAS VACA, en una sola ventana con cuatro pestañas:
 *   Dashboard · Vencidas · Vencen en 7 días · Vencen este mes.
 * Cada lista sale sola (la foto completa con todo junto no se entendía). Copiar, compartir o descargar.
 * La usan Alertas y Dashboard licencias, para que sea la misma imagen desde las dos.
 */
import { useMemo, type RefObject } from "react";
import { logoMarca, useFotoCompartir, type TipoFoto } from "@/components/FotoCompartir";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import { armarIndicadores, armarTablero, type ConfigCert, type PersonaCert, type ValidacionHist } from "@/modulos/seguridad/certificaciones";

const LISTA = { vencidas: "vencida", semana: "critica", mes: "aviso" } as const;

export function useFotosVaca(p: { personas: PersonaCert[]; hist: ValidacionHist[]; hoy: string; config: ConfigCert; departamentos: string[]; caja: RefObject<HTMLElement | null> }) {
  const deptos = p.departamentos.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(", ").replace("Logistica", "Logística");
  const T = useMemo(() => armarTablero(p.personas, p.hoy, p.config), [p.personas, p.hoy, p.config]);
  return useFotoCompartir(async (tipo: TipoFoto) => {
    const paleta = leerPaleta(p.caja.current) ?? undefined;
    if (tipo === "vencidas" || tipo === "semana" || tipo === "mes") {
      const [{ dibujarListaCert, nombreListaCert }, logo] = await Promise.all([import("@/modulos/seguridad/foto-cert"), logoMarca()]);
      return { lienzo: dibujarListaCert(T, LISTA[tipo], { paleta, logo, deptos }), nombre: nombreListaCert(p.hoy, LISTA[tipo]) };
    }
    const [{ dibujarDashboardCert, nombreDashboardCert }, logo] = await Promise.all([import("@/modulos/seguridad/foto-dash"), logoMarca()]);
    return { lienzo: dibujarDashboardCert(armarIndicadores(p.personas, p.hist, p.hoy, p.config), T, { paleta, logo, deptos }), nombre: nombreDashboardCert(p.hoy) };
  }, "Licencias VACA", { dashboard: "Dashboard", vencidas: "Vencidas", semana: `Vencen en ${p.config.diasCriticos} días`, mes: "Vencen este mes" },
  undefined, ["dashboard", "vencidas", "semana", "mes"]);
}

/** El botón amarillo «Dashboard» (abre la ventana en el Dashboard; las listas están en las pestañas). */
export function BotonDashboard({ foto }: { foto: ReturnType<typeof useFotosVaca> }) {
  return (
    <button type="button" className="sg-bt foto" onClick={() => foto.abrir("dashboard")} disabled={foto.armando != null}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="5" /><rect x="13" y="10" width="8" height="11" /><rect x="3" y="13" width="8" height="8" /></svg>
      {foto.armando ? "Armando…" : "Dashboard"}
    </button>
  );
}
