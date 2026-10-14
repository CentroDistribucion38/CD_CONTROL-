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

import { COMPENSA } from "./compensa";
export { COMPENSA };

export type FilaAjuste = {
  familia: string; codigo: string; descripcion: string;
  sap: number; conteo: number; diferencia: number;
  /** Con qué código se cruza y cuánto se le aplicó a ESTA fila (con signo). */
  par: string | null; parDescripcion: string | null; compensa: number;
  /** Lo que queda por ajustar (CONTEO − SAP después de compensar). */
  ajuste: number;
  observacion: string;
};

export type Guardado = {
  fecha: string; guardado_en: string; guardado_por: string | null;
  sap: number; conteo: number; filas: FilaAnalisis[];
};

export function calcularAjustes(filas: FilaAnalisis[], obs: Record<string, string>): FilaAjuste[] {
  const por = new Map(filas.map((f) => [f.codigo, f]));
  const comp = new Map<string, { par: string; aplica: number }>();
  for (const [r, nr] of COMPENSA) {
    const a = por.get(r), b = por.get(nr);
    if (!a || !b) continue;
    const da = a.diferencia, db = b.diferencia;
    /* Solo si uno sobra y el otro falta. */
    if (!(da > 0 && db < 0) && !(da < 0 && db > 0)) {
      comp.set(r, { par: nr, aplica: 0 }); comp.set(nr, { par: r, aplica: 0 });
      continue;
    }
    const m = Math.min(Math.abs(da), Math.abs(db));
    comp.set(r, { par: nr, aplica: -Math.sign(da) * m });
    comp.set(nr, { par: r, aplica: -Math.sign(db) * m });
  }
  return filas.map((f) => {
    const c = comp.get(f.codigo);
    const compensa = c?.aplica ?? 0;
    return {
      familia: f.familia, codigo: f.codigo, descripcion: f.descripcion,
      sap: f.sap, conteo: f.conteo, diferencia: f.diferencia,
      par: c?.par ?? null, parDescripcion: c ? por.get(c.par)?.descripcion ?? null : null,
      compensa, ajuste: f.diferencia + compensa,
      observacion: obs[f.codigo] ?? "",
    };
  });
}

/** El análisis guardado de un día y sus observaciones. `faltaSql` si no se ha corrido el SQL del paso 2. */
export async function leerAjustes(fecha: string) {
  const supabase = await createClient();
  const [g, o] = await Promise.all([
    supabase.from("analisis_dif_guardado").select("fecha, filas, sap, conteo, guardado_en, guardado_por").eq("fecha", fecha).maybeSingle(),
    supabase.from("analisis_dif_obs").select("codigo, observacion").eq("fecha", fecha),
  ]);
  const faltaSql = [g.error, o.error].some((e) => e && /analisis_dif_(guardado|obs)|does not exist|PGRST205/i.test(`${e.code} ${e.message}`));
  const obs: Record<string, string> = {};
  for (const x of (o.data ?? []) as { codigo: string; observacion: string }[]) obs[x.codigo] = x.observacion;
  let quien: string | null = null;
  const gd = g.data as (Omit<Guardado, "filas"> & { filas: FilaAnalisis[] }) | null;
  if (gd?.guardado_por) {
    const p = await supabase.from("perfiles").select("usuario, nombre").eq("id", gd.guardado_por).maybeSingle();
    const pp = p.data as { usuario: string | null; nombre: string | null } | null;
    quien = pp?.nombre || pp?.usuario || null;
  }
  const guardado: Guardado | null = gd ? { ...gd, sap: Number(gd.sap), conteo: Number(gd.conteo), guardado_por: quien } : null;
  return { guardado, filas: guardado ? calcularAjustes(guardado.filas, obs) : [], faltaSql };
}
