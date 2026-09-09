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
import type { Origen, Sku, Viaje, FilaSeguimiento, FotoGuardada, Certificacion } from "./comun";
import { ORDEN_RANURA } from "./comun";

/* Se re-exporta para no obligar a nadie a cambiar de import; lo nuevo
   que sea de cliente debe tomarlo de ./comun directamente. */
export * from "./comun";
export type { Origen, Sku, Viaje, FilaSeguimiento, FotoGuardada, Certificacion };





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

/* =====================================================================
   SEGUIMIENTO — el informe de tres tablas
   ===================================================================== */


/** Los meses que tienen algo: ZLDE cargado o viajes certificados. */
/**
 * QUÉ DÍAS TIENEN ALGO.
 *
 * El calendario los necesita para apagar los vacíos: uno que deja tocar
 * cualquier día y después contesta "no hay nada" obliga a buscar a
 * ciegas. Se traen las dos puntas por separado —un día puede tener ZLDE
 * y no viajes, o al revés— porque las dos cosas son información.
 */
export async function diasConDatos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_dias")
    .select("fecha, hl_zlde, viajes")
    .order("fecha", { ascending: false })
    .limit(4000);
  return { dias: (data ?? []) as unknown as DiaConDatos[], falta: !!error };
}

export type DiaConDatos = { fecha: string; hl_zlde: number; viajes: number };

/**
 * El informe de un RANGO de fechas, las dos puntas incluidas.
 *
 * Era una vista clavada al mes. Una vista no recibe parámetros, así que
 * el mes era el único corte posible; ahora es una función y el corte lo
 * elige quien mira: un día, del 3 al 17, un mes, un año.
 */
export async function seguimientoSider(desde: string, hasta: string) {
  const supabase = await createClient();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const cli = supabase as any;
  const { data, error } = await cli.rpc("sider_seguimiento", { p_desde: desde, p_hasta: hasta });
  const filas = (data ?? []) as unknown as FilaSeguimiento[];
  /* La función no ordena: ordenar en SQL obliga a materializar todo el
     resultado del lado del servidor para nada, siendo quince filas. */
  filas.sort((a, b) => Number(b.hl_recibido) - Number(a.hl_recibido));
  return { filas, falta: !!error };
}

/**
 * El ZLDE crudo del rango, sin filtrar: una fila por CD, planta y clase.
 *
 * La pantalla lo filtra por planta y por clase igual que los
 * segmentadores del pivote. El informe NO usa esto: usa la función, que
 * se queda clavada en Barranquilla y EER porque eso ES el indicador.
 *
 * Viene por día y se suma aquí por CD, planta y clase: la tabla de la
 * pantalla es un pivote por CD, y traer los días para volver a sumarlos
 * en el navegador sería traer cien veces lo que se necesita.
 */
export async function zldeDelRango(desde: string, hasta: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sider_zlde")
    .select("cd_origen, planta, clase, hl, vh_recibidos, lineas")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .limit(20000);

  const m = new Map<string, FilaZldeCruda>();
  for (const f of (data ?? []) as unknown as FilaZldeCruda[]) {
    const k = `${f.cd_origen}\u0000${f.planta}\u0000${f.clase}`;
    const a = m.get(k) ?? { ...f, hl: 0, vh_recibidos: 0, lineas: 0 };
    a.hl += Number(f.hl);
    a.vh_recibidos += Number(f.vh_recibidos);
    a.lineas += Number(f.lineas);
    m.set(k, a);
  }
  const filas = [...m.values()].sort((a, b) => b.hl - a.hl);
  return { filas, falta: !!error };
}

export type FilaZldeCruda = {
  cd_origen: string; planta: string; clase: string;
  hl: number; vh_recibidos: number; lineas: number;
};

/* =====================================================================
   LA EVIDENCIA DE UN VIAJE — el ojito
   ===================================================================== */



/**
 * Las dos puntas de un viaje con sus fotos, listas para mostrar.
 *
 * El bucket es privado a propósito —son placas con hora y coordenadas—
 * así que las fotos no tienen URL fija: se firma una que vale un rato.
 * Diez minutos alcanza para mirarlas y no alcanza para que el enlace
 * ande circulando por WhatsApp una semana después.
 */
const MINUTOS_FIRMA = 10;

export async function evidenciaDeViaje(viajeId: string) {
  const supabase = await createClient();

  const { data: certs, error } = await supabase
    .from("sider_certificaciones")
    .select("id, punta, lat, lng, precision_m, ubicado_en, direccion, nota, hecha_por, hecha_en")
    .eq("viaje_id", viajeId)
    .order("hecha_en");
  if (error) return { puntas: [] as Certificacion[], falta: true };

  const ids = (certs ?? []).map((c: { id: string }) => c.id);
  const { data: fotos } = ids.length
    ? await supabase
        .from("sider_fotos")
        .select("certificacion_id, ranura, ruta, bytes, ancho, alto, subida_en")
        .in("certificacion_id", ids)
    : { data: [] };

  type FilaFoto = {
    certificacion_id: string; ranura: FotoGuardada["ranura"]; ruta: string;
    bytes: number | null; ancho: number | null; alto: number | null; subida_en: string;
  };
  const lista = (fotos ?? []) as FilaFoto[];

  /* Una sola llamada para todas las rutas en vez de una por foto: seis
     fotos son seis viajes de ida y vuelta que se sienten al abrir. */
  const firmadas = new Map<string, string>();
  if (lista.length) {
    const { data: urls } = await supabase.storage
      .from("sider")
      .createSignedUrls(lista.map((f) => f.ruta), MINUTOS_FIRMA * 60);
    for (const u of (urls ?? []) as { path: string | null; signedUrl: string }[]) {
      if (u.path) firmadas.set(u.path, u.signedUrl);
    }
  }

  const puntas = ((certs ?? []) as Omit<Certificacion, "fotos">[]).map((c) => ({
    ...c,
    fotos: lista
      .filter((f) => f.certificacion_id === c.id)
      .map((f) => ({
        ranura: f.ranura, ruta: f.ruta, bytes: f.bytes, ancho: f.ancho, alto: f.alto,
        subida_en: f.subida_en, url: firmadas.get(f.ruta) ?? null,
      }))
      /* Siempre en el mismo orden —izquierdo, derecho, placa— y no en el
         que las subieron: comparar dos viajes es imposible si las fotos
         cambian de sitio. */
      .sort((a, b) => ORDEN_RANURA.indexOf(a.ranura) - ORDEN_RANURA.indexOf(b.ranura)),
  }));

  return { puntas, falta: false };
}

