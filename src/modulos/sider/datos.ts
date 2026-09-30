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
import type { Origen, Sku, Viaje, FilaSeguimiento, FotoGuardada, Certificacion, Ficha } from "./comun";
import { ORDEN_RANURA, unirMarcasSorting } from "./comun";

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
  /* LAS MARCAS VIENEN EN CONSULTAS APARTE, no dentro de la vista.
     v_sider_viajes es la vista más grande del módulo y la leen cinco
     pantallas; meterle columnas para una casilla que solo mira Tránsito
     obliga a recrearla entera en una migración y a que todas las demás
     carguen lo que no usan.

     Y CADA UNA FALLA SOLA: si una columna todavía no existe —falta
     correr una migración— esa consulta devuelve error y las demás siguen.
     Media pantalla es mejor que una pantalla que perdió lo que ya tenía.

     Las tres van en la MISMA tanda, y traen unas pocas columnas de las
     decenas de filas que hay en tránsito. Se cruzan por id aquí, que es
     exactamente lo que haría el join.

     YA NO SE PIDEN LOS «AI PENDIENTES» que llegaron: la revisión AI dejó
     de hacerse dentro de Tránsito. Un camión que llegó sale de esta lista
     y espera su revisión en la pantalla «Revisión AI». */
  const [{ data, error }, ai, sort, inter] = await Promise.all([
    supabase.from("v_sider_viajes").select("*")
      .eq("estado", "en_transito")
      .order("salida_en", { ascending: true, nullsFirst: false })
      .limit(500),
    supabase.from("sider_viajes")
      .select("id, requiere_ai, ai_motivo, ai_pedido_por, ai_pedido_en")
      .eq("estado", "en_transito").eq("requiere_ai", true).limit(500),
    supabase.from("sider_viajes").select("id")
      .eq("estado", "en_transito").eq("requiere_sorting", true).limit(500),
    supabase.from("sider_viajes").select("id")
      .eq("estado", "en_transito").eq("interno", true).limit(500),
  ]);

  type M = { id: string; requiere_ai: boolean; ai_motivo: string | null;
             ai_pedido_por: string | null; ai_pedido_en: string | null };
  const marcas = new Map<string, M>();
  if (!ai.error) for (const m of (ai.data ?? []) as M[]) marcas.set(m.id, m);

  const ids = (r: { error: unknown; data: unknown }) =>
    new Set<string>(r.error ? [] : ((r.data ?? []) as { id: string }[]).map((x) => x.id));
  const conSorting = ids(sort);
  const internos = ids(inter);

  const enCamino = ((data ?? []) as unknown as Viaje[]).map((v) => {
    const m = marcas.get(v.id);
    const base = m ? { ...v, requiere_ai: true, ai_motivo: m.ai_motivo,
                       ai_pedido_por: m.ai_pedido_por, ai_pedido_en: m.ai_pedido_en }
                   : { ...v, requiere_ai: false };
    return { ...base, requiere_sorting: conSorting.has(v.id), interno: internos.has(v.id) };
  });

  /* LOS INTERNOS NO TIENEN SALIDA, y el orden de arriba pone primero los
     que salieron antes: los internos no tienen hora de salida y caerían
     al final aunque lleven horas esperando. Se ordenan por lo que sí
     tienen —cuándo se crearon— y se mezclan con los demás. */
  const hora = (v: Viaje) => v.salida_en ?? v.creado_en;
  enCamino.sort((a, b) => Date.parse(hora(a)) - Date.parse(hora(b)));

  return { viajes: enCamino, falta: !!error };
}

/**
 * QUÉ CAMIONES CREÓ CONTROL CON EL «+», para marcarlos en Fuente principal.
 *
 * APARTE DE `viajesSider()` por lo mismo de arriba: esa función la leen
 * cinco pantallas y solo esta necesita la marca; y si todavía no se corrió
 * 2026-09-sider-revision-ai-interna.sql la columna no existe, la consulta
 * falla sola y la pantalla sale igual, sin marcas.
 */
export async function idsInternos(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sider_viajes").select("id")
    .eq("interno", true).limit(5000);
  return error ? [] : ((data ?? []) as { id: string }[]).map((x) => x.id);
}

/**
 * QUÉ CAMIONES PIDIERON SORTING Y CUÁLES YA LO HICIERON, para la marca de
 * Fuente principal: «Sorting pendiente» o «Sorting hecho».
 *
 * APARTE DE `viajesSider()` Y NO DENTRO. Esa función la leen cinco
 * pantallas —seguimiento, libro, exportar…— y solo esta necesita la
 * marca: meterla ahí le cobraría dos consultas a las otras cuatro por
 * algo que no pintan. Y aparte también por lo que pasa si falta correr
 * `2026-09-sider-sorting.sql`: estas consultas fallan solas y la fuente
 * principal sale igual, sin marcas. Metidas en la de viajes, el error se
 * llevaría la lista entera.
 *
 * NO HAY UNA TERCERA CATEGORÍA. Todo Sorting hecho salió de un camión que
 * lo pidió —la base no deja guardarlo si no—, así que «pidió» y «no hizo»
 * es «pendiente», y «hizo» es «hecho».
 */
export async function marcasSorting(): Promise<Record<string, "pendiente" | "hecho">> {
  const supabase = await createClient();
  const [pidio, hizo] = await Promise.all([
    supabase.from("sider_viajes").select("id").eq("requiere_sorting", true).limit(5000),
    supabase.from("v_sider_sorting").select("viaje_id").limit(5000),
  ]);
  /* Si no se pudo saber quién lo PIDIÓ, no hay marcas: sin esa lista, un
     «hecho» no tiene a quién colgarse. Si solo falló el «hizo», todo lo
     pedido queda «pendiente», que es lo prudente: mejor un camión de más
     por revisar que uno hecho dado por pendiente en silencio. */
  if (pidio.error) return {};
  return unirMarcasSorting(
    ((pidio.data ?? []) as { id: string }[]).map((r) => r.id),
    hizo.error ? [] : ((hizo.data ?? []) as { viaje_id: string | null }[]).map((r) => r.viaje_id),
  );
}

/**
 * TODOS LOS NOMBRES, DE UNA.
 *
 * nombresDe() de abajo pide los nombres de UNA lista de ids, así que hay
 * que tener la lista antes de llamarla: primero se traen los viajes,
 * SE ESPERA, y recién ahí se pregunta por sus autores. Son dos viajes al
 * servidor uno detrás del otro, y el segundo no empieza hasta que
 * termina el primero.
 *
 * Esta se puede pedir sin saber nada, así que sale al mismo tiempo que
 * los datos y no después. La tabla de perfiles es la gente de la bodega
 * —decenas, no miles— y son tres columnas: traerla entera cuesta menos
 * que el viaje extra que evita.
 */
export async function nombresTodos() {
  const supabase = await createClient();
  const { data } = await supabase.from("perfiles").select("id, usuario, nombre").limit(2000);
  const out: Record<string, string> = {};
  for (const p of (data ?? []) as { id: string; usuario: string | null; nombre: string | null }[]) {
    out[p.id] = p.usuario || p.nombre || "—";
  }
  return out;
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


/* ==================== NOVEDADES ====================
   La bandeja de lo que sale mal. Se trae la vista y no la tabla: ya
   viene con el nombre del motivo y con lo que se sepa del viaje, así la
   pantalla no tiene que cruzar tres listas para pintar una fila.
   ==================================================== */
export type Novedad = {
  id: string;
  tramo: "t1" | "t2";
  tipo: "viaje" | "entrega";
  motivo: string;
  motivo_nombre: string;
  viaje_id: string | null;
  placa: string;
  fecha: string;
  /** La hora, cuando se supo. En un día entran varios camiones del mismo
   *  origen: sin hora, dos novedades del mismo día no se distinguen. */
  hora: string | null;
  /** Copiados del viaje al reportar, o tecleados si no hay viaje. Se
   *  copian y no se leen del viaje cada vez: una novedad ya mandada
   *  tiene que seguir diciendo lo que decía cuando se mandó. */
  factura: string | null;
  lote: string | null;
  sku: string | null;
  /** Cuánto vino mal, y en qué. Sin esto la novedad dice QUÉ pasó pero
   *  no CUÁNTO hay que cobrar. */
  cantidad: number | null;
  unidad: "estibas" | "cajas" | "unidades" | null;
  descripcion: string | null;
  foto_ruta: string | null;
  cd_responsable: string | null;
  compromiso: string | null;
  fecha_compromiso: string | null;
  estado: "abierta" | "cerrada";
  que_se_hizo: string | null;
  cerrada_por: string | null;
  cerrada_en: string | null;
  creada_por: string | null;
  creada_en: string;
  cd_origen: string | null;
  material: string | null;
  estado_viaje: string | null;
  pegada_a_viaje: boolean;
  /** Días que lleva abierta, o los que estuvo si ya se cerró. */
  dias: number;
  /** Abierta y pasada de la fecha que prometieron. */
  vencida: boolean;
  respuestas: number;
};

/** Una respuesta del hilo. No se edita ni se borra. */
export type RespuestaNovedad = {
  id: string;
  novedad_id: string;
  texto: string;
  desde: string | null;
  escrita_por: string | null;
  escrita_en: string;
};

export type MotivoNovedad = {
  clave: string;
  nombre: string;
  /** null = sirve para los dos tramos. */
  tramo: "t1" | "t2" | null;
  tipo: "viaje" | "entrega";
  orden: number;
};

/** Las novedades, las abiertas primero y dentro de cada grupo lo más
 *  reciente arriba: lo que hay que atender no se busca, se ve. */
export async function novedadesSider(limite = 400) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sider_novedades")
    .select("*")
    .order("estado", { ascending: true })   // 'abierta' antes que 'cerrada'
    .order("fecha", { ascending: false })
    .order("creada_en", { ascending: false })
    .limit(limite);
  /* Si la tabla todavía no existe —falta correr la migración— la
     pantalla sale vacía en vez de reventar, y el aviso de arriba lo
     explica. */
  if (error) return [] as Novedad[];
  return (data ?? []) as Novedad[];
}

export async function motivosNovedad() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sider_novedad_motivos")
    .select("clave, nombre, tramo, tipo, orden")
    .eq("activo", true)
    .order("orden");
  if (error) return [] as MotivoNovedad[];
  return (data ?? []) as MotivoNovedad[];
}

/** El hilo de todas las novedades de una vez. Son pocas líneas por
 *  novedad: una consulta por fila serían cuatrocientas para pintar una
 *  lista, y abrirlas de a una deja al que revisa haciendo clics. */
export async function hiloNovedades(ids: string[]) {
  if (ids.length === 0) return [] as RespuestaNovedad[];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sider_novedad_hilo")
    .select("id, novedad_id, texto, desde, escrita_por, escrita_en")
    .in("novedad_id", ids)
    .order("escrita_en");
  if (error) return [] as RespuestaNovedad[];
  return (data ?? []) as RespuestaNovedad[];
}


/**
 * Las fichas que esperan su factura. La base ya filtra por quién puede
 * verlas: quien tiene «Dar salida» ve todas, los demás solo las suyas.
 * `soloDe` estrecha todavía más —«Mis fichas» en Certificar—, porque el
 * facturador que también certifica no quiere ver las de todos ahí.
 * `falta` = la tabla no existe: no se ha corrido
 * 2026-09-sider-fichas-de-salida.sql.
 */
export async function fichasPendientes(soloDe?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("sider_fichas")
    .select("id, placa, planta, lote, nota, direccion, creado_por, creado_en, sider_ficha_lineas(sku, estibas), sider_ficha_fotos(id)")
    .eq("estado", "pendiente")
    .order("creado_en", { ascending: true });
  if (soloDe) q = q.eq("creado_por", soloDe);
  const { data, error } = await q;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const fichas: Ficha[] = ((data ?? []) as any[]).map((f) => ({
    id: f.id, placa: f.placa, planta: f.planta, lote: f.lote, nota: f.nota, direccion: f.direccion,
    creado_por: f.creado_por, creado_en: f.creado_en,
    lineas: (f.sider_ficha_lineas ?? []).map((l: { sku: string; estibas: number | string }) => ({ sku: l.sku, estibas: Number(l.estibas) })),
    fotos: (f.sider_ficha_fotos ?? []).length,
  }));
  return { fichas, falta: !!error };
}
