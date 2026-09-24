import { createClient } from "@/lib/supabase/server";

/**
 * LO QUE LEE LA RAMA DE ABI.
 *
 * TODO SALE DE `v_hallazgos`, que es donde se calcula si a un hallazgo
 * le falta la redacción y si salió tal cual de la IA. Tres pantallas
 * preguntándoselo por su cuenta son tres sitios donde se puede
 * contestar distinto el día que cambie la regla.
 *
 * `falta` NO ES UN ERROR, ES UN ESTADO. Mientras no se corra
 * `2026-09-acciones-abi-hallazgos.sql`, estas tablas no existen: las
 * pantallas tienen que poder decir QUÉ ARCHIVO correr en vez de
 * reventar con «relation does not exist», que no le dice nada a quien
 * está mirando. La rama de OL funciona igual mientras tanto.
 */

export type HallazgoEstado = "borrador" | "firme" | "cerrado" | "anulado";
export type HallazgoSeveridad = "observacion" | "hallazgo" | "critico";

export type Hallazgo = {
  id: string;
  codigo: string;
  fecha: string;
  tema: string;
  tema_nombre: string | null;
  severidad: HallazgoSeveridad;
  area: string | null;
  area_nombre: string | null;
  zona: string | null;
  zona_nombre: string | null;
  ubicacion: string | null;

  /** Como se dictó en la bodega. */
  lo_que_se_vio: string;
  /** La versión técnica aprobada: es la que sale en el informe. */
  redaccion: string | null;
  redactado_por: string | null;
  redactado_en: string | null;
  /** Lo que PROPUSO la máquina, sin aprobar. */
  ia_borrador: string | null;
  ia_en: string | null;
  recomendacion: string | null;

  estado: HallazgoEstado;
  accion_id: string | null;
  accion_codigo: string | null;
  accion_estado: string | null;

  creado_por: string | null;
  creado_en: string;
  anulado_en: string | null;
  motivo_anulacion: string | null;

  fotos: number;
  fotos_antes: number;
  fotos_despues: number;
  falta_redaccion: boolean;
  /** La redacción es idéntica al borrador de la IA: nadie la tocó. */
  tal_cual_de_la_ia: boolean;
  tiene_accion: boolean;
};

export type TemaHallazgo = {
  clave: string; nombre: string; activo: boolean; orden: number | null;
};

export type FotoHallazgo = {
  id: string;
  hallazgo_id: string;
  ruta: string;
  nota: string | null;
  /** «antes» = la evidencia del hallazgo; «despues» = cómo quedó. */
  momento: "antes" | "despues";
  tomada_en: string | null;
  lat: number | null;
  lng: number | null;
  precision_m: number | null;
  subida_por: string | null;
  subida_en: string;
};

function sinTablas(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache")
      || t.includes("could not find the");
}

export async function hallazgos(limite = 1000):
  Promise<{ hallazgos: Hallazgo[]; falta: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_hallazgos").select("*")
    /* LO MÁS NUEVO ARRIBA, y dentro del mismo día por código: dos
       hallazgos de la misma auditoría tienen la misma fecha, y sin el
       segundo criterio salen en un orden distinto en cada carga. */
    .order("fecha", { ascending: false })
    .order("codigo", { ascending: false })
    .limit(limite);
  if (error) return { hallazgos: [], falta: sinTablas(error.message) };
  return { hallazgos: (data ?? []) as Hallazgo[], falta: false };
}

export async function unHallazgo(id: string): Promise<Hallazgo | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("v_hallazgos").select("*").eq("id", id).maybeSingle();
  return (data as Hallazgo) ?? null;
}

export async function temasHallazgo(soloActivos = true): Promise<TemaHallazgo[]> {
  const supabase = await createClient();
  let q = supabase.from("acciones_hallazgos_temas").select("clave, nombre, activo, orden");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as TemaHallazgo[];
}

export async function fotosDe(ids: string[]): Promise<FotoHallazgo[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("acciones_hallazgos_fotos")
    .select("*").in("hallazgo_id", ids)
    /* PRIMERO LAS DEL ANTES. «antes» va antes que «despues» por el
       alfabeto, sí, pero se escribe explícito: el día que alguien
       agregue un tercer momento, el orden no debería depender de cómo
       se llamó. */
    .order("momento", { ascending: true })
    /* POR CUÁNDO SE TOMÓ y no por cuándo se subió: la del antes y la
       del después de la misma acción se suben juntas, y ordenar por
       subida las deja en el orden en que alguien las escogió del
       carrete, que no es ninguno. */
    .order("tomada_en", { ascending: true, nullsFirst: false })
    .limit(2000);
  return (data ?? []) as FotoHallazgo[];
}

/**
 * CUÁNTOS USAN CADA TEMA. Es lo que decide si un tema se puede borrar
 * del maestro, y se cuenta en un solo sitio por lo mismo que el resto:
 * dos pantallas contándolo por su cuenta dan distinto el día que una
 * se olvide de excluir los anulados.
 */
export async function usoDeTemas(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("acciones_hallazgos")
    .select("tema").neq("estado", "anulado").limit(5000);
  const out: Record<string, number> = {};
  for (const f of (data ?? []) as { tema: string }[]) out[f.tema] = (out[f.tema] ?? 0) + 1;
  return out;
}
