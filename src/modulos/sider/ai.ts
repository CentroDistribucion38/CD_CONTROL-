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


/* =====================================================================
   SORTING — LA MISMA REVISIÓN, HECHA POR DENTRO
   ---------------------------------------------------------------------
   Vive en la misma tabla que la AI y se lee por vistas APARTE
   (`v_sider_sorting*`), no filtrando `v_sider_ai` aquí: las de AI ya
   traen solo AI, y por eso el informe del cobro al socio no puede
   sumar un Sorting ni por descuido de quien escriba la próxima
   pantalla. Ver 2026-09-sider-sorting.sql.

   Un Sorting es de operarios, no del cobro: nada de lo de abajo toca
   el índice que viaja a SAP.
   ===================================================================== */

/** Un camión que ya llegó, pidió Sorting y nadie ha cerrado. */
export type PendienteSorting = {
  viaje_id: string; placa: string; planta: string; sku: string; estibas: number;
  fecha: string; llego_en: string | null;
  sorting_pedido_en: string | null; sorting_pedido_por: string | null;
  pedido_nombre: string | null;
};

/**
 * LA LISTA DE TRABAJO DE LOS MUCHACHOS: los que llegaron y pidieron
 * Sorting. Más viejo primero, porque el que lleva más esperando es el
 * que se atiende antes: un camión descargado que sigue sin clasificar es
 * envase que está ocupando sitio y que nadie sabe en qué estado está.
 */
export async function sortingPendientes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_sorting_pendientes").select("*")
    .order("llego_en", { ascending: true, nullsFirst: false }).limit(200);
  if (error) return { falta: sinTablas(error.message), pendientes: [] as PendienteSorting[] };
  return { falta: false, pendientes: (data ?? []) as PendienteSorting[] };
}

/** Los Sorting ya cerrados, de más nuevo a más viejo. */
export async function sortingHechos(limite = 40) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_sorting").select("*")
    .order("revisado_en", { ascending: false }).limit(limite);
  if (error) return { falta: sinTablas(error.message), hechos: [] as Revision[] };
  return { falta: false, hechos: (data ?? []) as Revision[] };
}

/** Un Sorting con su detalle, para corregirlo. */
export async function sortingDe(viajeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_sorting").select("*").eq("viaje_id", viajeId).maybeSingle();
  if (error || !data) return { revision: null, detalle: [] as DetalleAi[] };
  const { data: det } = await supabase
    .from("v_sider_sorting_detalle").select("*")
    .eq("revision_id", (data as Revision).id).order("orden");
  return { revision: data as Revision, detalle: (det ?? []) as DetalleAi[] };
}
