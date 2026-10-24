"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { conDescartes, leerDescartes } from "@/modulos/pasivos/datos";
import { validacionPasivo, validacionPasivoAG22 } from "@/modulos/inventario/validacion-pasivo";
import {
  ALMACEN_PENDIENTE_AG22, CAUSAL_PENDIENTE_EXTRASUCIO, ESTADO_PENDIENTE_EXTRASUCIO,
  ALMACEN_PENDIENTE_BAJA, CAUSAL_PENDIENTE_BAJA, CAUSAL_PENDIENTE_BLOQUEAR, CAUSAL_PENDIENTE_LAVADO, CAUSALES_PENDIENTES,
  ESTADO_PENDIENTE_BAJA, ESTADO_PENDIENTE_BLOQUEAR, ESTADO_PENDIENTE_LAVADO, NOTA_PENDIENTE_BAJA,
} from "@/modulos/pasivos/pendiente-baja";

const esDia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * ENVIAR A LA BASE DE PASIVOS — el pendiente (conteo − pasivo) de AG18 separado por su causal real:
 *   BAJA · PENDIENTE BAJA, LAVADO · PENDIENTE LAVADO y BAJA · PENDIENTE BLOQUEAR (lo contado en OTROS).
 * Se recalcula aquí (no se confía en lo que manda la pantalla). Solo las partes MAYORES a 0.
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
  const filas: { codigo: string; estado: string; causal: string; unidades: number }[] = [];
  for (const f of v.filas) {
    const partes: [number, string, string][] = [
      [f.pendBaja, ESTADO_PENDIENTE_BAJA, CAUSAL_PENDIENTE_BAJA],
      [f.pendLavado, ESTADO_PENDIENTE_LAVADO, CAUSAL_PENDIENTE_LAVADO],
      [f.pendBloquear, ESTADO_PENDIENTE_BLOQUEAR, CAUSAL_PENDIENTE_BLOQUEAR],
    ];
    for (const [u, estado, causal] of partes) { const unidades = Math.round(u); if (unidades > 0) filas.push({ codigo: f.codigo, estado, causal, unidades }) }
  }

  const descartes = await leerDescartes([fecha]);
  const { error: eD } = await supabase.from("pasivos_base").delete()
    .eq("fecha", fecha).eq("almacen", ALMACEN_PENDIENTE_BAJA).in("causal", CAUSALES_PENDIENTES).eq("origen", "manual");
  if (eD) return { error: eD.message };
  if (filas.length) {
    const { error: eI } = await supabase.from("pasivos_base").insert(conDescartes(filas.map((f) => ({ ...f, fecha, almacen: ALMACEN_PENDIENTE_BAJA })), descartes, "manual").map((f) => ({
      fecha, estado: f.estado, causal: f.causal, codigo: f.codigo, unidades: f.unidades,
      almacen: ALMACEN_PENDIENTE_BAJA, origen: "manual", nota: NOTA_PENDIENTE_BAJA, ...(f.descartada ? { descartada: true } : {}),
    })));
    if (eI) return { error: /row-level security|policy/i.test(eI.message) ? "No tienes permiso de editar la Base de pasivos." : eI.message };
  }
  revalidatePath("/inventario/balance/validacion");
  revalidatePath("/inventario/balance/pasivos");
  revalidatePath("/inventario/balance/pasivos/informe");
  const suma = (c: string) => filas.filter((f) => f.causal === c).reduce((s, f) => s + f.unidades, 0);
  return {
    ok: true, filas: new Set(filas.map((f) => f.codigo)).size, unidades: filas.reduce((s, f) => s + f.unidades, 0),
    baja: suma(CAUSAL_PENDIENTE_BAJA), lavado: suma(CAUSAL_PENDIENTE_LAVADO), bloquear: suma(CAUSAL_PENDIENTE_BLOQUEAR),
  };
}

/**
 * ENVIAR A LA BASE DE PASIVOS · AG22 (Bodega 38) — el pendiente (conteo − base, sin la rotura de línea) por su causal real:
 *   BAJA · PENDIENTE BAJA (conteo baja − PRESORTING − BAJA PROYECTADA), LAVADO · PENDIENTE LAVADO, LAVADO · PENDIENTE EXTRASUCIO
 *   y BAJA · PENDIENTE BLOQUEAR (lo contado en OTROS). Solo las partes MAYORES a 0: lo que ya está en la Base NO se vuelve a enviar,
 *   así que la Base queda igual a lo contado y no se duplica. Reenviar el mismo día REEMPLAZA lo enviado antes (solo AG22, solo «manual»).
 */
export async function enviarPendienteAG22(fecha: string) {
  if (!esDia(fecha)) return { error: "Escoge el día." };
  const supabase = await createClient();
  const { count: hist } = await supabase.from("pasivos_base").select("id", { count: "exact", head: true }).eq("fecha", fecha).eq("origen", "historico");
  if (hist) return { error: `El ${fecha.split("-").reverse().join("/")} ya está cargado tal cual tu Excel (histórico). No se envía para no duplicar.` };

  const v = await validacionPasivoAG22(fecha);
  if (v.error) return { error: v.error };
  if (v.fecha !== fecha) return { error: `No hay conteo enviado el ${fecha}.` };
  const filas: { codigo: string; estado: string; causal: string; unidades: number }[] = [];
  for (const f of v.filas) {
    const partes: [number, string, string][] = [
      [f.pendBaja, ESTADO_PENDIENTE_BAJA, CAUSAL_PENDIENTE_BAJA],
      [f.pendLavado, ESTADO_PENDIENTE_LAVADO, CAUSAL_PENDIENTE_LAVADO],
      [f.pendExtra, ESTADO_PENDIENTE_EXTRASUCIO, CAUSAL_PENDIENTE_EXTRASUCIO],
      [f.pendBloquear, ESTADO_PENDIENTE_BLOQUEAR, CAUSAL_PENDIENTE_BLOQUEAR],
    ];
    for (const [u, estado, causal] of partes) { const unidades = Math.round(u); if (unidades > 0) filas.push({ codigo: f.codigo, estado, causal, unidades }) }
  }

  const descartes = await leerDescartes([fecha]);
  const { error: eD } = await supabase.from("pasivos_base").delete()
    .eq("fecha", fecha).eq("almacen", ALMACEN_PENDIENTE_AG22).in("causal", CAUSALES_PENDIENTES).eq("origen", "manual");
  if (eD) return { error: eD.message };
  if (filas.length) {
    const { error: eI } = await supabase.from("pasivos_base").insert(conDescartes(filas.map((f) => ({ ...f, fecha, almacen: ALMACEN_PENDIENTE_AG22 })), descartes, "manual").map((f) => ({
      fecha, estado: f.estado, causal: f.causal, codigo: f.codigo, unidades: f.unidades,
      almacen: ALMACEN_PENDIENTE_AG22, origen: "manual", nota: NOTA_PENDIENTE_BAJA, ...(f.descartada ? { descartada: true } : {}),
    })));
    if (eI) return { error: /row-level security|policy/i.test(eI.message) ? "No tienes permiso de editar la Base de pasivos." : eI.message };
  }
  revalidatePath("/inventario/balance/validacion");
  revalidatePath("/inventario/balance/pasivos");
  revalidatePath("/inventario/balance/pasivos/informe");
  revalidatePath("/inventario/balance/cuadre");
  const suma = (c: string) => filas.filter((f) => f.causal === c).reduce((s, f) => s + f.unidades, 0);
  return {
    ok: true, filas: new Set(filas.map((f) => f.codigo)).size, unidades: filas.reduce((s, f) => s + f.unidades, 0),
    baja: suma(CAUSAL_PENDIENTE_BAJA), lavado: suma(CAUSAL_PENDIENTE_LAVADO), extra: suma(CAUSAL_PENDIENTE_EXTRASUCIO), bloquear: suma(CAUSAL_PENDIENTE_BLOQUEAR),
  };
}
