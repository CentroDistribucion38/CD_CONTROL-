import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * LA PARTE DE SEGURIDAD DEL CIERRE — lo que el Plan de reacción sabe de las roturas del cierre.
 *
 * NO CALCULA LA RECURRENCIA: la calcula la base (`v_plan_eventos`, `v_plan_acciones`; ver
 * `2026-11-plan-reaccion-rotura.sql`). Aquí solo se leen y se juntan con las filas del cierre.
 * Si la persona no tiene la pantalla «Plan de reacción», o el SQL no se ha corrido, `leerPlan`
 * devuelve null y la imagen lo dice en vez de inventar ceros.
 */
export type TipoEvento = "comportamiento" | "condicion" | "externa" | "sin_clasificar";
export type EventoPlan = {
  rotura_id: string; codigo: string; estado: string; cajas: number;
  causa_nombre: string | null; tipo: TipoEvento; subtipo: string | null;
  severidad: "leve" | "intermedia" | "grave";
  responsable_id: string | null; responsable: string | null; reportante: string | null;
  autorreporte: boolean; cuenta_persona: boolean;
  n_mes: number | null; recurrente_mes_a_mes: boolean; reincidio_en_ventana: boolean;
};
export type AccionPlan = {
  rotura_id: string; accion: string; accion_nombre: string;
  estado: "pendiente" | "hecha" | "no_aplica"; vencida: boolean; hecha_tarde: boolean;
};
export type ReglaPlan = { leve_max: number; grave_min: number; verificacion_dias: number };
export type PlanDatos = {
  eventos: Map<string, EventoPlan>;
  acciones: Map<string, AccionPlan[]>;
  regla: ReglaPlan | null;
};

const LOTE = 120;

export async function leerPlan(sb: SupabaseClient, ids: string[]): Promise<PlanDatos | null> {
  const eventos = new Map<string, EventoPlan>();
  const acciones = new Map<string, AccionPlan[]>();
  try {
    for (let i = 0; i < ids.length; i += LOTE) {
      const parte = ids.slice(i, i + LOTE);
      const ev = await sb.from("v_plan_eventos")
        .select("rotura_id, codigo, estado, cajas, causa_nombre, tipo, subtipo, severidad, responsable_id, responsable, reportante, autorreporte, cuenta_persona, n_mes, recurrente_mes_a_mes, reincidio_en_ventana")
        .in("rotura_id", parte);
      if (ev.error) return null;
      for (const e of (ev.data ?? []) as EventoPlan[]) eventos.set(e.rotura_id, { ...e, cajas: Number(e.cajas) });
      const ac = await sb.from("v_plan_acciones")
        .select("rotura_id, accion, accion_nombre, estado, vencida, hecha_tarde")
        .in("rotura_id", parte).neq("estado", "no_aplica").order("vence_en");
      if (ac.error) return null;
      for (const a of (ac.data ?? []) as AccionPlan[]) {
        const l = acciones.get(a.rotura_id); if (l) l.push(a); else acciones.set(a.rotura_id, [a]);
      }
    }
    if (ids.length && !eventos.size) return null; // sin permiso o sin datos: no se pinta un cero falso
    let regla: ReglaPlan | null = null;
    const rg = await sb.from("plan_reglas").select("leve_max, grave_min, verificacion_dias")
      .order("vigente_desde", { ascending: false }).limit(1);
    if (!rg.error && rg.data?.[0]) regla = rg.data[0] as ReglaPlan;
    return { eventos, acciones, regla };
  } catch { return null }
}

export type ResumenSeg = {
  eventos: number;
  comportamiento: number; condicion: number; externa: number; sinClasificar: number;
  /** Comportamiento sin responsable: son las que hay que asignar para que cuenten a una persona. */
  sinResponsable: number;
  leves: number; intermedias: number; graves: number;
  accionesPendientes: number; accionesVencidas: number;
  reincidentes: { nombre: string; eventos: number; maxN: number; recurrente: boolean }[];
};

export function resumenSeguridad(idsVivos: string[], plan: PlanDatos): ResumenSeg {
  const r: ResumenSeg = {
    eventos: 0, comportamiento: 0, condicion: 0, externa: 0, sinClasificar: 0, sinResponsable: 0,
    leves: 0, intermedias: 0, graves: 0, accionesPendientes: 0, accionesVencidas: 0, reincidentes: [],
  };
  const porPersona = new Map<string, { nombre: string; eventos: number; maxN: number; recurrente: boolean }>();
  for (const id of idsVivos) {
    const e = plan.eventos.get(id); if (!e) continue;
    r.eventos++;
    if (e.tipo === "comportamiento") r.comportamiento++;
    else if (e.tipo === "condicion") r.condicion++;
    else if (e.tipo === "externa") r.externa++;
    else r.sinClasificar++;
    if (e.tipo === "comportamiento" && !e.responsable_id) r.sinResponsable++;
    if (e.severidad === "grave") r.graves++; else if (e.severidad === "intermedia") r.intermedias++; else r.leves++;
    for (const a of plan.acciones.get(id) ?? []) {
      if (a.estado === "pendiente") { r.accionesPendientes++; if (a.vencida) r.accionesVencidas++ }
    }
    if (e.cuenta_persona && e.responsable_id) {
      const p = porPersona.get(e.responsable_id) ?? { nombre: e.responsable ?? "—", eventos: 0, maxN: 0, recurrente: false };
      p.eventos++; p.maxN = Math.max(p.maxN, e.n_mes ?? 0); p.recurrente = p.recurrente || e.recurrente_mes_a_mes;
      porPersona.set(e.responsable_id, p);
    }
  }
  r.reincidentes = [...porPersona.values()].filter((p) => p.maxN >= 2 || p.recurrente)
    .sort((a, b) => Number(b.recurrente) - Number(a.recurrente) || b.maxN - a.maxN || b.eventos - a.eventos);
  return r;
}
