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

import type { TipoRevision } from "./comun";
export { NOMBRE_TIPO, NOMBRE_TIPO_LARGO } from "./comun";
export type { TipoRevision } from "./comun";

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
  /** 'ai' = Revisión AI certificada, 'sorting' = Revisión AI normal. Falta
   *  mientras no se haya corrido 2026-09-sider-revision-ai-interna.sql,
   *  y sin él todo lo que hay es certificada. */
  tipo?: TipoRevision;
};

export type DetalleAi = {
  revision_id: string; defecto: string; defecto_nombre: string;
  cobra: boolean; orden: number | null; unidades: number; pct: number; hl: number;
};

const sinTablas = (m: string) =>
  m.includes("does not exist") || m.includes("schema cache") || m.includes("sider_ai_");

/** Los cuatro maestros juntos, como los reciben las pantallas. */
export type MaestrosAi = {
  falta: boolean;
  defectos: Defecto[]; envases: EnvaseAi[]; socios: SocioAi[]; canales: CanalAi[];
};

/** Los cuatro maestros del módulo, de una sola tanda. */
export async function maestrosAi(): Promise<MaestrosAi> {
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

/* `pendientesAi()` se fue de aquí. Lo que hacía —listar los que
   llegaron y siguen sin revisar— ahora lo hace `viajesEnTransito()`,
   porque esos vehículos ya no viven en una pantalla aparte: se quedan
   en Tránsito, en morado, hasta que alguien cuente la muestra. La vista
   `v_sider_ai_pendientes` sigue siendo la misma; cambió quién la lee.

   Las dos de abajo se quedan: son las del tablero —índice por socio,
   por envase, tendencia—, que es lo que sigue. */

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

/** Una revisión con su detalle, para verla o corregirla. Un camión puede
 *  tener las dos clases, así que se pide por (viaje, tipo): sin el tipo,
 *  `maybeSingle` fallaría con dos filas. */
export async function revisionDe(viajeId: string, tipo: TipoRevision = "ai") {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_ai").select("*").eq("viaje_id", viajeId).eq("tipo", tipo).maybeSingle();
  if (error || !data) return { revision: null, detalle: [] as DetalleAi[] };
  const { data: det } = await supabase
    .from("v_sider_ai_detalle").select("*").eq("revision_id", (data as Revision).id).order("orden");
  return { revision: data as Revision, detalle: (det ?? []) as DetalleAi[] };
}


/* =====================================================================
   LA PANTALLA «REVISIÓN AI»: LO QUE HAY POR HACER Y LO YA HECHO

   Las dos clases viven en la misma pantalla y en la misma lista, cada una
   con su marca: la CERTIFICADA (el camión llegó certificado por Sider y
   el administrador pidió la muestra) y la NORMAL (el camión lo creó
   alguien de control con el «+» de Revisión AI). Las dos se hacen con el
   mismo formulario y las dos entran al Informe AI.

   LA LISTA LA ARMA LA BASE (`v_sider_revision_pendientes`) y no esta capa,
   para que la pantalla y la función que guarda no puedan discrepar sobre
   qué es «ya llegó». Ver 2026-09-sider-revision-ai-interna.sql.
   ===================================================================== */

/** Un camión que ya llegó, pidió una revisión y nadie ha cerrado. */
export type PendienteRevision = {
  viaje_id: string; tipo: TipoRevision;
  placa: string; planta: string; sku: string; estibas: number; fecha: string;
  pedido_en: string | null; pedido_por: string | null; motivo: string | null;
  /** Lo creó control con el «+»: no lo certificó Sider. */
  interno: boolean;
  pedido_nombre: string | null; llego_en: string | null;
  /** Lo que el Vh Interno ya dijo al crearse, y el envase que le toca al
   *  material: el formulario los trae puestos. Faltan (undefined) mientras
   *  no se corra 2026-09-sider-vh-interno-canal-socio.sql. */
  canal?: string | null; socio?: string | null; envase?: string | null;
};

/**
 * Los que esperan, del que lleva MÁS tiempo llegado al que acaba de
 * llegar: el que espera hace días es el que hay que atender.
 */
export async function revisionesPendientes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_revision_pendientes").select("*")
    .order("llego_en", { ascending: true, nullsFirst: false }).limit(200);
  if (error) return { falta: sinTablas(error.message) || error.message.includes("v_sider_revision"),
                      pendientes: [] as PendienteRevision[] };
  return { falta: false, pendientes: (data ?? []) as PendienteRevision[] };
}

/** Las ya cerradas, de más nueva a más vieja, de las dos clases. Las
 *  importadas del Excel no traen viaje y no son de esta pantalla. */
export async function revisionesHechas(limite = 40) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_ai").select("*").not("viaje_id", "is", null)
    .order("revisado_en", { ascending: false }).limit(limite);
  if (error) return { falta: sinTablas(error.message), hechas: [] as Revision[] };
  return { falta: false, hechas: (data ?? []) as Revision[] };
}
