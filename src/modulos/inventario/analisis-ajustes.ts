/**
 * ANÁLISIS DE DIFERENCIA · PASO 2: LOS AJUSTES.
 *
 * Sale del análisis GUARDADO de un día (la foto que se tomó al darle «Guardar»), no del que se recalcula
 * cada vez: un ajuste se discute sobre una cifra que no se mueve.
 *
 * LA COMPENSACIÓN. «El 3500162 se puede compensar con el 412644, el 3500446 con el 412671 y el 3500213 con
 * el 412707: esos NR nuevos no están en el conteo.» El envase retornable y su NR nuevo son la misma botella
 * de 330: si uno sobra y el otro falta, lo que coincide se cruza y solo se ajusta lo que queda.
 *   sobra R +X y falta NR −Y  →  se compensa min(X, Y); el R queda en X − min, el NR en −Y + min.
 * Si los dos sobran o los dos faltan, no hay nada que cruzar.
 *
 * EL AJUSTE es lo que queda después de compensar (CONTEO − SAP):
 *   positivo  = SOBRANTE: hay más de lo que dice SAP → ajuste que sube SAP.
 *   negativo  = FALTANTE: hay menos de lo que dice SAP → ajuste que baja SAP.
 */
import { createClient } from "@/lib/supabase/server";
import type { FilaAnalisis } from "./analisis-dif";

import { COMPENSA, calcularAjustes, type FilaAjuste, type Hecho, type FilaFinal } from "./compensa";
export { COMPENSA, calcularAjustes, type FilaAjuste, type FilaFinal };

export type Guardado = {
  fecha: string; guardado_en: string; guardado_por: string | null;
  sap: number; conteo: number; filas: FilaAnalisis[];
};

/** El análisis guardado de un día y sus observaciones. `faltaSql` si no se ha corrido el SQL del paso 2. */
export async function leerAjustes(fecha: string) {
  const supabase = await createClient();
  const [g, o] = await Promise.all([
    supabase.from("analisis_dif_guardado").select("*").eq("fecha", fecha).maybeSingle(),
    supabase.from("analisis_dif_obs").select("*").eq("fecha", fecha),
  ]);
  const faltaSql = [g.error, o.error].some((e) => e && /analisis_dif_(guardado|obs)|does not exist|PGRST205/i.test(`${e.code} ${e.message}`));
  const obs: Record<string, string> = {};
  const hechos: Record<string, Hecho> = {};
  for (const x of (o.data ?? []) as { codigo: string; observacion: string; comp_hecha?: boolean; ajuste_hecho?: number | null }[]) {
    obs[x.codigo] = x.observacion;
    hechos[x.codigo] = { comp: !!x.comp_hecha, ajuste: x.ajuste_hecho == null ? null : Number(x.ajuste_hecho) };
  }
  let quien: string | null = null;
  const gd = g.data as (Omit<Guardado, "filas"> & { filas: FilaAnalisis[]; final?: FilaFinal[] | null; final_en?: string | null; final_por?: string | null }) | null;
  if (gd?.guardado_por) {
    const p = await supabase.from("perfiles").select("usuario, nombre").eq("id", gd.guardado_por).maybeSingle();
    const pp = p.data as { usuario: string | null; nombre: string | null } | null;
    quien = pp?.nombre || pp?.usuario || null;
  }
  const guardado: Guardado | null = gd ? { fecha: gd.fecha, guardado_en: gd.guardado_en, filas: gd.filas, sap: Number(gd.sap), conteo: Number(gd.conteo), guardado_por: quien } : null;
  /* ¿Se corrió el SQL del paso 3? (las columnas comp_hecha/ajuste_hecho/final existen) */
  const conFinal = !!g.data && "final" in (g.data as object);
  const final = gd?.final_en ? { en: gd.final_en, filas: gd.final ?? [] } : null;
  return { guardado, filas: guardado ? calcularAjustes(guardado.filas, obs, hechos) : [], faltaSql, faltaSqlFinal: !!g.data && !conFinal, final };
}

/* ---------------- EL HISTÓRICO ---------------- */
export type DiaHistorico = {
  fecha: string; guardado_en: string; guardado_por: string | null;
  sap: number; conteo: number; diferencia: number; compensado: number;
  sobrante: number; faltante: number; neto: number;
  nSobra: number; nFalta: number; nObs: number; codigos: number;
  /** Si se guardó el análisis final: la diferencia que quedó y cuántos códigos siguen con diferencia. */
  final: { en: string; diferencia: number; pendientes: number } | null;
};
export type FilaHistorico = {
  fecha: string; familia: string; codigo: string; descripcion: string;
  sap: number; conteo: number; diferencia: number; compensa: number; ajuste: number; observacion: string;
};

/** «La hoja de históricos que se van guardando»: cada día guardado con sus totales, y código por código
 *  (para el Excel). Un día se guarda una vez; volver a guardarlo lo reemplaza. */
export async function leerHistorico(limite = 180) {
  const supabase = await createClient();
  const [g, o] = await Promise.all([
    supabase.from("analisis_dif_guardado").select("*").order("fecha", { ascending: false }).limit(limite),
    supabase.from("analisis_dif_obs").select("*").limit(20000),
  ]);
  const faltaSql = [g.error, o.error].some((e) => e && /analisis_dif_(guardado|obs)|does not exist|PGRST205/i.test(`${e.code} ${e.message}`));
  const obsPorDia = new Map<string, Record<string, string>>();
  for (const x of (o.data ?? []) as { fecha: string; codigo: string; observacion: string }[]) {
    const m = obsPorDia.get(x.fecha) ?? {}; m[x.codigo] = x.observacion; obsPorDia.set(x.fecha, m);
  }
  const filasG = (g.data ?? []) as { fecha: string; filas: FilaAnalisis[]; sap: number; conteo: number; guardado_en: string; guardado_por: string | null; final?: FilaFinal[] | null; final_en?: string | null }[];
  const ids = [...new Set(filasG.map((x) => x.guardado_por).filter(Boolean))] as string[];
  const nombres: Record<string, string> = {};
  if (ids.length) {
    const p = await supabase.from("perfiles").select("id, usuario, nombre").in("id", ids);
    for (const x of (p.data ?? []) as { id: string; usuario: string | null; nombre: string | null }[]) nombres[x.id] = x.nombre || x.usuario || "—";
  }
  const dias: DiaHistorico[] = [];
  const detalle: FilaHistorico[] = [];
  for (const x of filasG) {
    const obs = obsPorDia.get(x.fecha) ?? {};
    const aj = calcularAjustes(x.filas ?? [], obs);
    const s = (k: (f: FilaAjuste) => number) => aj.reduce((t, f) => t + k(f), 0);
    dias.push({
      fecha: x.fecha, guardado_en: x.guardado_en, guardado_por: x.guardado_por ? nombres[x.guardado_por] ?? null : null,
      sap: s((f) => f.sap), conteo: s((f) => f.conteo), diferencia: s((f) => f.diferencia),
      compensado: s((f) => Math.max(0, f.compensa)), sobrante: s((f) => Math.max(0, f.ajuste)), faltante: s((f) => Math.min(0, f.ajuste)),
      neto: s((f) => f.ajuste), nSobra: aj.filter((f) => f.ajuste > 0).length, nFalta: aj.filter((f) => f.ajuste < 0).length,
      nObs: aj.filter((f) => f.observacion.trim()).length, codigos: aj.length,
      final: x.final_en && x.final ? { en: x.final_en, diferencia: x.final.reduce((t, f) => t + (Number(f.difFinal) || 0), 0), pendientes: x.final.filter((f) => Number(f.difFinal) !== 0).length } : null,
    });
    for (const f of aj) detalle.push({ fecha: x.fecha, familia: f.familia, codigo: f.codigo, descripcion: f.descripcion, sap: f.sap, conteo: f.conteo, diferencia: f.diferencia, compensa: f.compensa, ajuste: f.ajuste, observacion: f.observacion });
  }
  return { dias, detalle, faltaSql };
}
