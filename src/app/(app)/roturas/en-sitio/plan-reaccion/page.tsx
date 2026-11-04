import { misPermisos } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";
import "../../roturas.css";
import "./seguridad.css";
import { Seguridad } from "./Seguridad";
import type { AccionV, Colaborador, EventoV, PersonaV, ReglaV } from "@/modulos/roturas/seguridad";

export const dynamic = "force-dynamic";

const RUTA_PLAN = "/roturas/en-sitio/plan-reaccion";

const COLS_EV = "rotura_id, codigo, reportada_en, mes, estado, cajas, causa, causa_nombre, tipo, subtipo, area, severidad, responsable_id, responsable, empresa, reportante, autorreporte, cuenta_persona, n_mes, recurrente_mes_a_mes, reincidio_en_ventana, clave_condicion";
const COLS_AC = "id, rotura_id, codigo, responsable_id, responsable, accion, accion_nombre, origen_regla, vence_en, estado, vencida, hecha_tarde, hecha_en, nota";
const COLS_PE = "id, nombre, empresa, turno, activo, eventos_total, eventos_mes, meses_con_evento, ultimo_evento, recurrente_mes_a_mes, reportes, acciones_pendientes, acciones_vencidas";

/**
 * SEGURIDAD — el plan de reacción de las roturas.
 *
 * Lee lo que la base ya calculó (`v_plan_eventos`, `v_plan_acciones`, `v_plan_personas`) de los
 * últimos seis meses, y se lo da a la pantalla, que lo agrupa y lo filtra sin volver a preguntar.
 * Si falta correr el SQL, o el rol no tiene la pantalla, la base no contesta y aquí se dice, en vez
 * de pintar ceros que parecen buenas noticias.
 */
export default async function SeguridadPage() {
  const permisos = await misPermisos();
  const sb = await createClient();
  const desde = new Date(); desde.setMonth(desde.getMonth() - 6); desde.setDate(1);
  const desdeIso = desde.toISOString();

  const leer = async <T,>(tabla: string, cols: string, filtro?: (q: any) => any): Promise<{ datos: T[]; error: string | null }> => {
    const out: T[] = [];
    for (let i = 0; i < 10; i++) {
      let q: any = sb.from(tabla).select(cols);
      if (filtro) q = filtro(q);
      const { data, error } = await q.range(i * 1000, i * 1000 + 999);
      if (error) return { datos: [], error: error.message };
      out.push(...((data ?? []) as T[]));
      if ((data ?? []).length < 1000) break;
    }
    return { datos: out, error: null };
  };

  const [ev, ac, pe, rg, co] = await Promise.all([
    leer<EventoV>("v_plan_eventos", COLS_EV, (q) => q.gte("reportada_en", desdeIso).order("reportada_en", { ascending: false })),
    leer<AccionV>("v_plan_acciones", COLS_AC, (q) => q.gte("creado_en", desdeIso).order("vence_en", { ascending: true })),
    leer<PersonaV>("v_plan_personas", COLS_PE),
    sb.from("plan_reglas").select("leve_max, grave_min, verificacion_dias").order("vigente_desde", { ascending: false }).limit(1),
    sb.rpc("plan_colaboradores"),
  ]);

  const editar = permisos.manda || permisos.puedeEditar(RUTA_PLAN);

  return (
    <div className="rt">
      <Seguridad
        eventos={ev.datos.map((e) => ({ ...e, cajas: Number(e.cajas) }))}
        acciones={ac.datos}
        personas={pe.datos}
        regla={(rg.data?.[0] ?? null) as ReglaV | null}
        colaboradores={(co.data ?? []) as Colaborador[]}
        editar={editar}
        falla={ev.error}
        sinAcciones={!!ac.error}
      />
    </div>
  );
}
