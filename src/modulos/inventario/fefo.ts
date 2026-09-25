import { createClient } from "@/lib/supabase/server";

/**
 * INVENTARIO · lo que leen el maestro y la plantilla de conteo.
 *
 * Las cuentas —total cajas, vencimiento, días para vencer, días para
 * salir— NO se rehacen aquí: las hace `v_conteo_fefo` con las mismas
 * fórmulas del Excel. Si cada pantalla calculara las suyas, bastaría con
 * que una redondeara distinto para que el informe y el conteo dijeran
 * cosas diferentes del mismo día.
 */

export type Material = {
  id: string;
  sku: string;
  nombre: string;
  unidades_por_caja: number | null;
  cajas_por_estiba: number | null;
  unidades_por_estiba: number | null;
  contenido: number | null;
  familia: string | null;
  presentacion: string | null;
  vida_util: number | null;
  f_limite_desp: number | null;
  dias_minimo: number;
  origen: string | null;
  foraneo: string | null;
  tipo_material: "PRODUCTO" | "ENVASE";
  /** Sale de entrada en el desplegable de Quiebra en sitio. */
  en_sitio: boolean;
  activo: boolean;
};

export type Ubicacion = {
  id: string;
  bodega_id: string;
  clave: string;
  calle: string;
  modulo: string;
  lado: "IZQ" | "DER" | null;
  familia: string | null;
  capacidad: number | null;
  activa: boolean;
};

export type Bodega = {
  id: string; codigo: string; nombre: string; direccion: string | null; activo: boolean;
};

export type Renglon = {
  id: string;
  /* DE QUÉ RECORRIDO VIENE ESTE RENGLÓN. La pantalla de contar no lo
     necesitaba —todos sus renglones son del recorrido abierto— pero la
     base junta los de muchos, y sin esto no hay cómo decir de cuál es
     cada fila ni separar lo enviado de lo que se está contando ahora. */
  conteo_id: string;
  conteo: string;
  /* El estado DEL RECORRIDO, no del envase: 'cerrado' es lo firmado,
     'en_proceso' lo que alguien tiene abierto en este momento. */
  estado: string;
  codigo: string;
  material: string;
  tipo_material: "PRODUCTO" | "ENVASE";
  familia: string | null;
  factor_estibado: number | null;
  ubicacion: string | null;
  calle: string | null;
  modulo: string | null;
  lado: string | null;
  estibas: number | null;
  cajas: number | null;
  /* LA TERCERA CANTIDAD. Un saldo es lo que queda en una estiba
     incompleta; se guarda aparte de `cajas` —las sueltas— porque en el
     piso son dos cosas distintas y, una vez sumadas, no hay manera de
     volverlas a separar. Las tres caen en `total_cajas`. */
  saldo: number | null;
  total_cajas: number;
  total_estibas: number;
  /* La capacidad del módulo, en estibas, como la trae el maestro. Viene
     en el renglón —no se busca aparte— porque la vista ya hace el join
     con `ubicaciones` y buscarla otra vez en la pantalla sería tener dos
     versiones de la misma cifra. */
  capacidad: number | null;
  /* Los tres pedazos como se teclearon, aparte de la fecha armada: son
     los que hay que devolver a las casillas DD/MM/AA al corregir. */
  venc_dia: number | null;
  venc_mes: number | null;
  venc_anio: number | null;
  /* La de FÁBRICA, cuando fue la que se tecleó. El vencimiento se
     calcula de ella con la vida útil y se guarda aparte; esta se guarda
     para poder recontar contra lo que dice el cartón. */
  fab_dia: number | null;
  fab_mes: number | null;
  fab_anio: number | null;
  fabricacion: string | null;
  vencimiento: string | null;
  dias_para_vencer: number | null;
  dias_para_salir: number | null;
  rotacion: boolean | null;
  averia: boolean;
  pnc: boolean;
  estado_envase: string | null;
  nota: string | null;
  ubicacion_combinada: string | null;
  conto: string | null;
  contado_en: string | null;
  /* Los dos que hacen falta para volver a abrir el renglón en el
     formulario tal como se guardó: sin ellos, corregir una fila exige
     adivinar qué ubicación y qué material eran. */
  producto_id: string;
  ubicacion_id: string | null;
};

/* Se reconoce que falta correr el SQL por el error de Postgres, no por
   una bandera: así la pantalla dice QUÉ ARCHIVO correr en vez de salir
   vacía y dejar a alguien preguntándose si es que no hay datos. */
const sinTablas = (m: string) =>
  m.includes("does not exist") || m.includes("schema cache") ||
  m.includes("ubicaciones") || m.includes("tipo_material");

/**
 * EL MAESTRO ENTERO, DE UNA.
 *
 * 494 materiales y 428 ubicaciones caben de sobra en una consulta, y
 * traerlos todos es lo que permite que el buscador filtre SIN ir al
 * servidor en cada tecla — que es lo que se siente lento en un celular
 * con señal de bodega.
 *
 * OJO CON EL TOPE DE PostgREST: por defecto contesta 1.000 filas y no
 * avisa. Hoy sobra, pero el día que el maestro pase de mil esto
 * empezaría a mentir en silencio. Por eso el `limit` va escrito: si
 * alguna vez el número que vuelve es exactamente el del límite, se sabe
 * dónde mirar.
 */
export async function maestroInventario() {
  const supabase = await createClient();
  const [m, u, b, e] = await Promise.all([
    /* LA LISTA DE COLUMNAS, Y NO `*`. Aquí decía `*` con un comentario
       mío que afirmaba que las columnas de más «no eran nada al lado de
       traer 494 filas». Medido: `productos` tiene 28 columnas, la
       pantalla usa 16, y la diferencia son 134 KB POR CARGA. Con
       treinta personas abriendo la pantalla al empezar el turno son
       cinco megas de más sobre el wifi de una bodega, cada vez.

       Va escrita como CADENA LITERAL de una pieza: el tipo de
       supabase-js sale de esa literal, así que partirla con `+` para
       que quepa en la línea rompe el tipado y el build revienta con un
       error que no dice eso. */
    supabase.from("productos").select(
      "id,sku,nombre,unidades_por_caja,cajas_por_estiba,unidades_por_estiba,contenido,familia,presentacion,vida_util,f_limite_desp,dias_minimo,origen,foraneo,tipo_material,en_sitio,activo"
    ).order("sku").limit(5000),
    supabase.from("ubicaciones").select(
      "id,bodega_id,clave,calle,modulo,lado,familia,capacidad,activa"
    ).order("calle").order("modulo").order("lado", { nullsFirst: true }).limit(5000),
    /* LAS BODEGAS COMPLETAS Y TAMBIÉN LAS APAGADAS: el maestro las
       edita, y un maestro que esconde lo inactivo no deja volver a
       encenderlo. La pantalla de contar se queda con las activas. */
    supabase.from("bodegas").select("*").order("codigo"),
    supabase.from("envase_estados").select("clave").eq("activo", true).order("orden"),
  ]);

  if (m.error || u.error) {
    const msg = m.error?.message ?? u.error?.message ?? "";
    return {
      falta: sinTablas(msg),
      materiales: [] as Material[], ubicaciones: [] as Ubicacion[],
      bodegas: [] as Bodega[], estados: [] as string[],
    };
  }
  return {
    falta: false,
    materiales: (m.data ?? []) as Material[],
    ubicaciones: (u.data ?? []) as Ubicacion[],
    bodegas: (b.data ?? []) as Bodega[],
    estados: (e.data ?? []).map((x) => x.clave as string),
  };
}

/**
 * EL CONTEO ABIERTO DE QUIEN ESTÁ ADELANTE, con sus renglones.
 *
 * No lo abre: solo mira si hay uno. Abrirlo desde aquí crearía un conteo
 * cada vez que alguien entra a curiosear, y la lista de conteos del mes
 * se llenaría de recorridos vacíos.
 */
export async function miConteoFefo(bodegaId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !bodegaId) return { conteo: null, renglones: [] as Renglon[] };

  const { data: c } = await supabase
    .from("conteos")
    .select("id, codigo, estado, iniciado_en, enviado_en")
    .eq("responsable_id", user.id).eq("tipo", "fefo")
    .eq("bodega_id", bodegaId).eq("estado", "en_proceso")
    .order("creado_en", { ascending: false }).limit(1).maybeSingle();

  if (!c) return { conteo: null, renglones: [] as Renglon[] };

  /* Los últimos primero: en el celular lo que se acaba de anotar tiene
     que quedar arriba, que es donde se mira para confirmar que entró. */
  const { data: r } = await supabase
    .from("v_conteo_fefo").select("*")
    .eq("conteo_id", c.id)
    .order("contado_en", { ascending: false }).limit(2000);

  return { conteo: c, renglones: (r ?? []) as Renglon[] };
}


/**
 * LO QUE HAY QUE VALIDAR DESPUÉS DE CONTAR.
 *
 * ES PARA LO QUE EL CONTEO EXISTE: saber qué se despacha primero y qué
 * ya se pasó de su fecha de salida. Sale de `v_conteo_fefo`, que ya trae
 * las seis cuentas con las fórmulas del Excel — aquí no se recalcula
 * nada, solo se agrupa.
 *
 * SOLO LO ENVIADO. Un borrador a medio caminar diría que la calle E está
 * vacía porque todavía no se ha llegado, y sobre eso alguien podría
 * decidir un despacho. Lo firmado es lo único que se puede afirmar.
 */
export async function tableroFefo(bodegaId: string | null, desde?: string, hasta?: string) {
  const supabase = await createClient();
  const vacio = {
    falta: false, lineas: [] as Renglon[], conteos: [] as ConteoFefo[],
    ultimo: null as ConteoFefo | null, sinContar: [] as SinContar[], faltaSinContar: false,
  };
  if (!bodegaId) return vacio;

  let q = supabase.from("v_conteos_fefo").select("*")
    .eq("bodega_id", bodegaId).order("enviado_en", { ascending: false }).limit(200);
  if (desde) q = q.gte("fecha_analisis", desde);
  if (hasta) q = q.lte("fecha_analisis", hasta);
  const { data: c, error } = await q;
  if (error) return { ...vacio, falta: sinTablas(error.message) };

  const enviados = (c ?? []).filter((x) => x.estado === "cerrado");
  if (enviados.length === 0) return { ...vacio, conteos: enviados as ConteoFefo[] };

  /* Los renglones de esos conteos, de una. El `in` va con los ids que ya
     se filtraron arriba: pedir todo y filtrar aquí sería traer la
     bodega entera para mostrar una semana. */
  const { data: l } = await supabase.from("v_conteo_fefo").select("*")
    .in("conteo_id", enviados.map((x) => x.id)).limit(5000);

  /* ===============================================================
     LO QUE QUEDÓ SIN CONTAR EN EL ÚLTIMO RECORRIDO.

     «Faltaría una tabla o algo que les muestre si quedó algún módulo
     sin contar; necesito información con la que yo pueda tener alertas
     y la visual.»

     DEL ÚLTIMO Y NO DE TODOS JUNTOS. Un módulo que se contó la semana
     pasada y no ayer no está «sin contar» en la historia — está sin
     contar en el recorrido de ayer, que es el que se acaba de cerrar y
     sobre el que alguien va a decidir hoy. Sumando todos los
     recorridos, la lista sale casi vacía siempre y no avisa de nada.

     `enviados` viene ordenado por `enviado_en` descendente, así que el
     primero es el último que se cerró.

     SI LA FUNCIÓN NO ESTÁ —falta correr la migración— no se revienta
     la pantalla entera: el tablero contesta otra pregunta y la tiene
     que poder seguir contestando. Se devuelve la lista vacía y un
     `faltaSinContar` para poder decirlo donde corresponde. */
  const ultimo = enviados[0] ?? null;
  const sc = ultimo
    ? await supabase.rpc("conteo_sin_contar", { p_conteo: ultimo.id })
    : { data: [], error: null };

  return {
    falta: false,
    lineas: (l ?? []) as Renglon[],
    conteos: enviados as ConteoFefo[],
    ultimo: ultimo as ConteoFefo | null,
    sinContar: (sc.data ?? []) as SinContar[],
    faltaSinContar: !!sc.error && sinTablas(sc.error.message),
  };
}

/** Una posición activa que el último recorrido no tocó. */
export type SinContar = {
  ubicacion_id: string;
  clave: string;
  calle: string | null;
  modulo: string | null;
  lado: string | null;
  familia: string | null;
  capacidad: number | null;
  /** Cuándo se contó por última vez, en cualquier otro recorrido. */
  ultimo_en: string | null;
  /** Días desde esa última vez. Null = nunca se ha contado. */
  dias_sin_contar: number | null;
};

export type ConteoFefo = {
  id: string; codigo: string; estado: string; bodega: string;
  responsable: string | null; fecha_analisis: string;
  enviado_en: string | null; envio_nombre: string | null;
  renglones: number; ubicaciones: number; total_cajas: number;
};

/* =====================================================================
   LA BASE — TODO LO CONTADO, TAL CUAL

   El tablero contesta UNA pregunta —qué se despacha primero— y para eso
   recorta: solo lo enviado, solo lo que tiene fecha, agrupado. Esto es
   lo otro: el registro completo, renglón por renglón y con todas sus
   columnas, para cuadrar contra la hoja y para buscar cualquier cosa.

   VIENEN DOS MONTONES Y NO SE MEZCLAN:

     · LA BASE son los recorridos ENVIADOS. Están firmados con nombre,
       fecha y hora, y ya no se pueden corregir. Es lo único sobre lo que
       se puede afirmar algo.

     · LOS BORRADORES son los recorridos que alguien tiene abiertos en
       este momento, de cualquiera. Se traen SOLO PARA MIRAR —qué se
       está contando ahora mismo, sin llamar a preguntar— y no entran en
       la base ni suman en ningún total.

   Juntarlos en una sola lista sería el error caro: un renglón a medio
   contar sumando en un total del que alguien despacha.

   EL TOPE VA ESCRITO Y SE DICE CUANDO SE TOCA.
   PostgREST contesta 1.000 filas por defecto y NO AVISA: la lista
   llegaría corta y se vería perfectamente normal. Aquí se pide un tope
   alto a propósito y, si lo que vuelve es EXACTAMENTE el tope, se
   devuelve `tope: true` para que la pantalla lo diga en vez de dejar a
   alguien cuadrando contra una lista incompleta.
   ===================================================================== */
const TOPE_BASE = 20000;
const TOPE_RECORRIDOS = 500;

export async function baseFefo(bodegaId: string | null) {
  const vacio = {
    falta: false, enviadas: [] as Renglon[], abiertas: [] as Renglon[],
    conteos: [] as ConteoFefo[], tope: false,
  };
  if (!bodegaId) return vacio;
  const supabase = await createClient();

  const { data: c, error } = await supabase.from("v_conteos_fefo").select("*")
    .eq("bodega_id", bodegaId)
    /* Por fecha de análisis y no por envío: los abiertos todavía no
       tienen envío, y ordenar por una columna nula los mandaba al final
       —que es justo donde no se ven los que están pasando ahora—. */
    .order("fecha_analisis", { ascending: false })
    .limit(TOPE_RECORRIDOS);
  if (error) return { ...vacio, falta: sinTablas(error.message) };

  const conteos = (c ?? []) as ConteoFefo[];
  /* ANULADO NO ES NI LO UNO NI LO OTRO: se descarta a propósito. Un
     recorrido anulado se anuló por algo, y arrastrarlo «para tener la
     visual» es exactamente cómo vuelve a contarse. */
  const enviados = conteos.filter((x) => x.estado === "cerrado");
  const abiertos = conteos.filter((x) => x.estado === "en_proceso" || x.estado === "borrador");

  /* Los renglones de los dos montones en UNA consulta y separados
     después: son dos listas para la pantalla, pero una sola ida al
     servidor. Dos consultas costaban el doble de espera para partir por
     una columna que ya viene en cada fila. */
  const ids = [...enviados, ...abiertos].map((x) => x.id);
  if (ids.length === 0) return { ...vacio, conteos };

  const { data: l } = await supabase.from("v_conteo_fefo").select("*")
    .in("conteo_id", ids).limit(TOPE_BASE);
  const lineas = (l ?? []) as Renglon[];

  const deEnviados = new Set(enviados.map((x) => x.id));
  return {
    falta: false,
    conteos,
    enviadas: lineas.filter((r) => deEnviados.has(r.conteo_id)),
    abiertas: lineas.filter((r) => !deEnviados.has(r.conteo_id)),
    tope: lineas.length === TOPE_BASE,
  };
}
