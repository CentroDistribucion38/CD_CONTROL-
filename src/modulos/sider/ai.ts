import { createClient } from "@/lib/supabase/server";

/**
 * REVISIÓN AI — lo que las pantallas necesitan saber.
 *
 * Todo sale de las vistas del módulo, nunca de las tablas en crudo: las
 * vistas ya traen los nombres puestos y ya hicieron las cuentas. Si cada
 * pantalla calculara su propio índice, bastaría que una redondeara
 * distinto para que el PDF y el tablero le cobraran cosas distintas al
 * mismo socio.
 */

export type Defecto = { clave: string; nombre: string; cobra: boolean; orden: number | null; activo: boolean };
export type EnvaseAi = { clave: string; descripcion: string | null; litros: number; activo: boolean };
export type SocioAi  = { clave: string; nombre: string; activo: boolean };
export type CanalAi  = { clave: string; nombre: string; activo: boolean };

export type Pendiente = {
  viaje_id: string; placa: string; planta: string; sku: string; estibas: number;
  fecha: string; ai_pedido_en: string | null; ai_pedido_por: string | null;
  ai_motivo: string | null; pedido_nombre: string | null; llego_en: string | null;
};

export type Revision = {
  id: string; viaje_id: string; fecha: string; planta: string; placa: string; turno: string;
  canal: string; canal_nombre: string;
  socio: string | null; socio_nombre: string | null;
  envase: string; envase_nombre: string | null; litros: number;
  certificado: boolean; recibidas: number; revisadas: number;
  zcl3: string | null; comentarios: string | null;
  revisado_por: string | null; revisado_en: string;
  editado_por: string | null; editado_en: string | null; ediciones: number;
  /** Las que cobran. */
  defectos: number;
  /** Las que se cuentan pero no cobran: mezclado, cuerpo extraño, cajas, estibas. */
  otros: number;
  marcadas: number;
  indice: number; no_abono: number; abono_sap: number; hl_defectos: number;
};

export type DetalleAi = {
  revision_id: string; defecto: string; defecto_nombre: string;
  cobra: boolean; orden: number | null; unidades: number; pct: number; hl: number;
};

const sinTablas = (m: string) =>
  m.includes("does not exist") || m.includes("schema cache") || m.includes("sider_ai_");

/** Los cuatro maestros del módulo, de una sola tanda. */
export async function maestrosAi() {
  const supabase = await createClient();
  const [d, e, s, c] = await Promise.all([
    supabase.from("sider_ai_defectos").select("*").eq("activo", true).order("orden"),
    supabase.from("sider_ai_envases").select("*").eq("activo", true).order("clave"),
    supabase.from("sider_ai_socios").select("*").eq("activo", true).order("nombre"),
    supabase.from("sider_ai_canales").select("*").eq("activo", true).order("orden"),
  ]);
  const vacio = { defectos: [] as Defecto[], envases: [] as EnvaseAi[],
                  socios: [] as SocioAi[], canales: [] as CanalAi[] };
  if (d.error) return { falta: sinTablas(d.error.message), ...vacio };
  return {
    falta: false,
    defectos: (d.data ?? []) as Defecto[],
    envases:  (e.data ?? []) as EnvaseAi[],
    socios:   (s.data ?? []) as SocioAi[],
    canales:  (c.data ?? []) as CanalAi[],
  };
}

/** Los camiones marcados que ya llegaron y nadie ha revisado. */
export async function pendientesAi() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_ai_pendientes").select("*")
    .order("llego_en", { ascending: true, nullsFirst: false }).limit(200);
  if (error) return { falta: sinTablas(error.message), pendientes: [] as Pendiente[] };
  return { falta: false, pendientes: (data ?? []) as Pendiente[] };
}

/** Las revisiones hechas, de más nueva a más vieja. */
export async function revisionesAi(desde?: string, hasta?: string) {
  const supabase = await createClient();
  let q = supabase.from("v_sider_ai").select("*");
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);
  const { data, error } = await q.order("fecha", { ascending: false }).limit(500);
  if (error) return { falta: sinTablas(error.message), revisiones: [] as Revision[] };
  return { falta: false, revisiones: (data ?? []) as Revision[] };
}

/** Una revisión con su detalle, para verla o corregirla. */
export async function revisionDe(viajeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_ai").select("*").eq("viaje_id", viajeId).maybeSingle();
  if (error || !data) return { revision: null, detalle: [] as DetalleAi[] };
  const { data: det } = await supabase
    .from("v_sider_ai_detalle").select("*").eq("revision_id", (data as Revision).id).order("orden");
  return { revision: data as Revision, detalle: (det ?? []) as DetalleAi[] };
}
