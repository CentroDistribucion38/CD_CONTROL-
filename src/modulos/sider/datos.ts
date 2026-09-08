/**
 * SIDER CERTIFICADO — lectura.
 *
 * Lo que se guarda son las cinco cosas que alguien teclea: placa, origen,
 * SKU, estibas y cuándo. Las once columnas restantes de la hoja son
 * fórmulas y las calcula la vista v_sider_viajes, no esta capa: si se
 * calcularan aquí, mañana habría dos sitios donde arreglar la misma
 * cuenta y uno de los dos se quedaría sin arreglar.
 */

import { createClient } from "@/lib/supabase/server";

export const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
export const MESES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio",
                            "agosto","septiembre","octubre","noviembre","diciembre"];

export type Origen = {
  planta: string;
  cd_origen: string;
  activo: boolean;
  orden: number | null;
};

export type Sku = {
  sku: string;
  descripcion: string;
  clase: string | null;
  cajas_x_estiba: number | null;
  unidades_x_caja: number | null;
  hl_x_unidad: number | null;
  activo: boolean;
};

export type Viaje = {
  id: string;
  placa: string;
  planta: string;
  cd_origen: string;
  cd_destino: string;
  sku: string;
  descripcion: string;
  tipo_envase: string | null;
  estibas: number;
  estado: "en_transito" | "recibido" | "anulado";
  observacion: string | null;
  creado_por: string | null;
  creado_en: string;
  fecha: string;
  num_mes: number;
  semana: number;
  anio: number;
  sider: number;
  cajas: number | null;
  unidades: number | null;
  hl: number | null;
  faltan_factores: boolean;
  cert_salida_id: string | null;
  salida_en: string | null;
  salida_lat: number | null;
  salida_lng: number | null;
  salida_precision: number | null;
  salida_direccion: string | null;
  cert_llegada_id: string | null;
  llegada_en: string | null;
  llegada_lat: number | null;
  llegada_lng: number | null;
  llegada_precision: number | null;
  llegada_direccion: string | null;
  fotos_salida: number;
  fotos_llegada: number;
  en_camino: string | null;
};

/** El maestro: es lo que llena las listas desplegables del formulario. */
export async function maestroSider() {
  const supabase = await createClient();
  const [origenes, skus, parametros] = await Promise.all([
    supabase.from("sider_origenes").select("planta, cd_origen, activo, orden").order("planta"),
    supabase.from("sider_skus")
      .select("sku, descripcion, clase, cajas_x_estiba, unidades_x_caja, hl_x_unidad, activo")
      .order("descripcion"),
    supabase.from("sider_parametros").select("clave, valor, nota"),
  ]);
  return {
    origenes: (origenes.data ?? []) as Origen[],
    skus: (skus.data ?? []) as Sku[],
    parametros: (parametros.data ?? []) as { clave: string; valor: number; nota: string | null }[],
    /** Si la tabla no existe todavía, la consulta falla y hay que decirlo. */
    falta: !!origenes.error,
  };
}

/** Los viajes, ya con las once derivadas resueltas. */
export async function viajesSider(limite = 500) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_viajes")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(limite);
  return { viajes: (data ?? []) as unknown as Viaje[], falta: !!error };
}

/**
 * Los que van en camino. Se filtra en la base y no aquí: traer todos los
 * viajes para descartar el 90% en el navegador es trabajo que alguien
 * paga en espera, y el día que haya diez mil filas se nota.
 *
 * Ordenados por hora de salida ASCENDENTE a propósito: el que salió
 * primero es el que está por llegar, y ese es el que se busca al abrir
 * esta pantalla. El más reciente no le sirve a nadie aquí.
 */
export async function viajesEnTransito() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_viajes")
    .select("*")
    .eq("estado", "en_transito")
    .order("salida_en", { ascending: true, nullsFirst: false })
    .limit(500);
  return { viajes: (data ?? []) as unknown as Viaje[], falta: !!error };
}

/** Quién creó cada viaje: cuando una cifra no cuadra, esa es la pregunta. */
export async function nombresDe(ids: (string | null)[]) {
  const limpios = [...new Set(ids.filter(Boolean))] as string[];
  if (!limpios.length) return {} as Record<string, string>;
  const supabase = await createClient();
  const { data } = await supabase.from("perfiles").select("id, usuario, nombre").in("id", limpios);
  const out: Record<string, string> = {};
  for (const p of (data ?? []) as { id: string; usuario: string | null; nombre: string | null }[]) {
    out[p.id] = p.usuario || p.nombre || "—";
  }
  return out;
}
