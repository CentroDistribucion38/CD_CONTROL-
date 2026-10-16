import { createClient } from "@/lib/supabase/server";
import type { Accion, Analisis, Disparador, Indicador, Proceso, Resultado, Turno } from "./semaforo";

/**
 * LO QUE LEE EL MÓDULO DE GESTIÓN: turnos, procesos, indicadores, resultados y disparadores.
 * Si falta correr el SQL, se devuelve `falta` para que la pantalla lo diga en vez de quedar en blanco.
 */
export type DatosGestion = {
  turnos: Turno[]; procesos: Proceso[]; indicadores: Indicador[];
  resultados: Resultado[]; disparadores: Disparador[];
  falta: boolean; error: string | null;
};

const num = (v: unknown) => (v == null ? null : Number(v));

function indicador(r: Record<string, unknown>): Indicador {
  return {
    ...(r as unknown as Indicador),
    decimales: Number(r.decimales ?? 0), meta_valor: Number(r.meta_valor ?? 0),
    amarillo_valor: num(r.amarillo_valor), rojo_valor: num(r.rojo_valor),
    nivel_reunion: Number(r.nivel_reunion ?? 1) === 2 ? 2 : 1,
    turnos: Array.isArray(r.turnos) ? (r.turnos as string[]) : [],
    disparo_consecutivos: Number(r.disparo_consecutivos ?? 1),
  };
}

/**
 * Los resultados se piden por rango de fechas (y no todos): un tablero necesita el día y la última semana.
 * Los disparadores van todos (activos y cerrados), que son pocos.
 */
export async function leerGestion(desde: string, hasta: string): Promise<DatosGestion> {
  const supabase = await createClient();
  const [t, p, i, r, d] = await Promise.all([
    supabase.from("gestion_turnos").select("*").order("orden").order("nombre"),
    supabase.from("gestion_procesos").select("*").order("orden").order("nombre"),
    supabase.from("gestion_indicadores").select("*").order("orden").order("codigo"),
    supabase.from("gestion_resultados").select("*").gte("fecha", desde).lte("fecha", hasta).limit(20000),
    supabase.from("gestion_disparadores").select("*").order("creado_en", { ascending: false }).limit(2000),
  ]);
  const err = t.error ?? p.error ?? i.error ?? r.error ?? d.error;
  if (err) {
    return {
      turnos: [], procesos: [], indicadores: [], resultados: [], disparadores: [],
      falta: /does not exist|schema cache|Could not find/i.test(err.message), error: err.message,
    };
  }
  return {
    turnos: (t.data ?? []) as Turno[],
    procesos: (p.data ?? []) as Proceso[],
    indicadores: (i.data ?? []).map((x) => indicador(x as Record<string, unknown>)),
    resultados: (r.data ?? []).map((x) => ({ ...(x as Resultado), valor: Number((x as Resultado).valor), estado: (x as Resultado).estado === "verde" ? "verde" as const : "rojo" as const })),
    disparadores: (d.data ?? []).map((x) => ({ ...(x as Disparador), valor: Number((x as Disparador).valor) })),
    falta: false, error: null,
  };
}

/**
 * El 5 Why y el plan de acción de los disparadores. Van aparte de leerGestion a propósito: si todavía no se corrió
 * 2026-10-gestion-5why-plan.sql, el resto de Gestión sigue funcionando y solo esta parte avisa que falta.
 */
export async function leerAnalisis(): Promise<{ analisis: Analisis[]; acciones: Accion[]; falta: boolean }> {
  const supabase = await createClient();
  const [a, c] = await Promise.all([
    supabase.from("gestion_analisis").select("*").limit(5000),
    supabase.from("gestion_acciones").select("*").order("fecha_limite").limit(20000),
  ]);
  if (a.error || c.error) return { analisis: [], acciones: [], falta: true };
  return { analisis: (a.data ?? []) as Analisis[], acciones: (c.data ?? []) as Accion[], falta: false };
}
