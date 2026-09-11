import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ASIGNAR UNA ACCIÓN. UN SOLO CAMINO PARA TODAS LAS PANTALLAS.
 *
 * La función de la base cambió de forma: antes era
 * accion_asignar(p_id, p_responsable) y ahora es
 * accion_asignar(p_id, p_equipo, p_responsable). Mientras la base no
 * esté actualizada, llamar la nueva devuelve "no existe esa función" —
 * un error que no le dice nada a quien solo quería asignarle algo a
 * alguien, y que además aparece DESPUÉS de haber escogido a la persona.
 *
 * Así que se intenta la nueva y, si la base todavía es la vieja, se
 * llama la vieja. La única diferencia real es el equipo, que en la
 * versión vieja no existía: si venía un equipo, ahí sí hay que correr
 * el SQL y se dice con esas palabras.
 *
 * Esto no es para siempre. El día que la base esté al día, la primera
 * llamada funciona y la segunda nunca se ejecuta.
 */

/** "Esa función no existe con esos argumentos" en los dos idiomas en que
 *  lo puede decir: el de PostgREST (PGRST202) y el de Postgres (42883). */
function faltaLaFuncion(e: { code?: string; message?: string } | null) {
  if (!e) return false;
  if (e.code === "PGRST202" || e.code === "42883") return true;
  const t = (e.message ?? "").toLowerCase();
  return t.includes("could not find the function")
      || t.includes("does not exist")
      || t.includes("schema cache");
}

export async function asignarAccion(
  supabase: SupabaseClient,
  id: string,
  equipo: string | null,
  responsable: string | null,
): Promise<{ error: string | null }> {
  const nueva = await supabase.rpc("accion_asignar", {
    p_id: id, p_equipo: equipo, p_responsable: responsable,
  });
  if (!nueva.error) return { error: null };
  if (!faltaLaFuncion(nueva.error)) return { error: nueva.error.message };

  /* La base todavía es la vieja. Sin equipos no se puede fingir que se
     guardó uno: se dice qué archivo falta y no se asigna a medias. */
  if (equipo) {
    return {
      error: "Para asignar por equipo falta correr supabase/modulos/acciones.sql "
           + "en Supabase. Mientras tanto se puede asignar a una persona.",
    };
  }

  const vieja = await supabase.rpc("accion_asignar", {
    p_id: id, p_responsable: responsable,
  });
  if (vieja.error) return { error: vieja.error.message };
  return { error: null };
}
