"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validacionPasivo } from "@/modulos/inventario/validacion-pasivo";
import {
  ALMACEN_PENDIENTE_BAJA, CAUSAL_PENDIENTE_BAJA, ESTADO_PENDIENTE_BAJA, NOTA_PENDIENTE_BAJA,
} from "@/modulos/pasivos/pendiente-baja";

const esDia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * ENVIAR A LA BASE DE PASIVOS — el pendiente por baja (conteo − pasivo) de AG18, tal cual se ve, como BAJA · PENDIENTE BAJA.
 * Se recalcula aquí (no se confía en lo que manda la pantalla). Solo los que tienen pendiente MAYOR a 0.
 * Volver a enviar el mismo día REEMPLAZA lo enviado antes desde esta pantalla; no toca nada más de la Base.
 */
export async function enviarPendienteBaja(fecha: string) {
  if (!esDia(fecha)) return { error: "Escoge el día." };
  const supabase = await createClient();
  /* Un día cargado tal cual el Excel (HISTÓRICO) no se toca: quedaría doble. */
  const { count: hist } = await supabase.from("pasivos_base").select("id", { count: "exact", head: true }).eq("fecha", fecha).eq("origen", "historico");
  if (hist) return { error: `El ${fecha.split("-").reverse().join("/")} ya está cargado tal cual tu Excel (histórico). No se envía para no duplicar.` };

  const v = await validacionPasivo(fecha);
  if (v.error) return { error: v.error };
  if (v.fecha !== fecha) return { error: `No hay conteo enviado el ${fecha}.` };
  const filas = v.filas
    .map((f) => ({ codigo: f.codigo, unidades: Math.round(f.pendiente) }))
    .filter((f) => f.unidades > 0);

  const { error: eD } = await supabase.from("pasivos_base").delete()
    .eq("fecha", fecha).eq("almacen", ALMACEN_PENDIENTE_BAJA).eq("estado", ESTADO_PENDIENTE_BAJA)
    .eq("causal", CAUSAL_PENDIENTE_BAJA).eq("origen", "manual");
  if (eD) return { error: eD.message };
  if (filas.length) {
    const { error: eI } = await supabase.from("pasivos_base").insert(filas.map((f) => ({
      fecha, estado: ESTADO_PENDIENTE_BAJA, causal: CAUSAL_PENDIENTE_BAJA, codigo: f.codigo, unidades: f.unidades,
      almacen: ALMACEN_PENDIENTE_BAJA, origen: "manual", nota: NOTA_PENDIENTE_BAJA,
    })));
    if (eI) return { error: /row-level security|policy/i.test(eI.message) ? "No tienes permiso de editar la Base de pasivos." : eI.message };
  }
  revalidatePath("/inventario/balance/validacion");
  revalidatePath("/inventario/balance/pasivos");
  revalidatePath("/inventario/balance/pasivos/informe");
  return { ok: true, filas: filas.length, unidades: filas.reduce((s, f) => s + f.unidades, 0) };
}
