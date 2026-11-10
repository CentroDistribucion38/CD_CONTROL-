"use server";

import { informeAi } from "@/modulos/sider/informe-ai";

/** Lo que necesita el cierre de turno: las revisiones del día y de los turnos escogidos, y sus defectos. */
export async function cierreAiDia(dia: string, turnos: string[], tipo: "ai" | "sorting" | "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { error: "Falta el día." as const };
  const ok = turnos.filter((t) => t === "T1" || t === "T2" || t === "T3");
  const inf = await informeAi({ desde: dia, hasta: dia, turnos: ok.length && ok.length < 3 ? ok : undefined, tipo: tipo || undefined });
  if (inf.falta) return { error: "Falta preparar la revisión AI en Supabase." as const };
  return { revisiones: inf.revisiones, defectos: inf.defectos };
}
