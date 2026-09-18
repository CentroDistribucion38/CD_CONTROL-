import { createClient } from "@/lib/supabase/server";

/**
 * LO QUE LEE EL MÓDULO DE TRASPASOS.
 *
 * Los viajes entre puntos: lo que se planea mover en un turno y lo que
 * de verdad se movió.
 *
 * EL CUMPLIDO NO SE LEE DE NINGÚN CAMPO: lo cuenta la vista
 * v_traspasos_seguimiento sobre los viajes registrados. Por eso aquí no
 * hay —ni puede haber— una función que "guarde el cumplido": si la
 * hubiera, volvería el problema del que salimos, dos números que hablan
 * de lo mismo y pueden contradecirse.
 *
 * `falta: true` significa que todavía no se corrió traspasos.sql. Se
 * devuelve en vez de reventar para que la pantalla pueda decir qué
 * hacer en vez de mostrar un error de Postgres.
 */

export type TipoViaje = {
  clave: string; nombre: string; activo: boolean; orden: number | null;
};

export type Punto = {
  clave: string; nombre: string; externo: boolean;
  activo: boolean; orden: number | null;
  /** El subtítulo: "Bodega propia", "Planta", "Zona interna". Lo que
   *  distingue dos puntos parecidos sin meterlo dentro del nombre. */
  descripcion: string | null;
};

export type Viaje = {
  id: string;
  codigo: string | null;
  fecha: string;
  turno: string;
  turno_orden: number;
  tipo: string | null;
  tipo_nombre: string | null;
  placa: string | null;
  /** El documento del papel que va con el vehículo. Obligatorio en los
   *  viajes con carga y sin repetir: dos veces el mismo número son dos
   *  viajes contados donde hubo uno. Un vacío no lleva. */
  documento: string | null;
  /** Viaje con carga, registrado y sin documento: es de antes de que la
   *  regla existiera. No es una columna guardada — se calcula. */
  sin_documento: boolean;
  origen: string | null;
  origen_nombre: string | null;
  destino: string | null;
  destino_nombre: string | null;
  /** El punto todavía no está en el maestro: se escribió a mano. */
  origen_suelto: boolean;
  destino_suelto: boolean;
  /** Cuántos viajes representa la línea. Casi siempre 1. */
  viajes: number;
  vacio: boolean;
  /** La carga, opcional: el plan se mide en viajes, no en canastas. */
  carga: number | null;
  unidad: string | null;
  nota: string | null;
  hora: string;
  registrado_por: string | null;
  registrado_en: string;
  /** Cuántos días después de su fecha se digitó el viaje, contados en
   *  días de Barranquilla. 0 = se registró en su propio día. */
  dias_atras: number;
  /** El viaje se metió después de su día. No es una columna guardada:
   *  sale de comparar la fecha con el día en que se digitó. */
  atrasado: boolean;
  /** Cuántas veces lo corrigió un administrador. 0 = tal como se registró. */
  ediciones: number;
  editado_en: string | null;
  editado_por: string | null;
  estado: "registrado" | "anulado";
  vale: boolean;
  motivo_anulacion: string | null;
  anulado_en: string | null;
  anulado_por: string | null;
};

export type Control = {
  fecha: string;
  turno: string;
  turno_orden: number;
  tipo: string;
  tipo_nombre: string;
  tipo_orden: number | null;
  plan_id: string | null;
  planeado: number;
  vacios_planeados: number;
  nota: string | null;
  /** Contado sobre los viajes registrados. Nadie lo escribe. */
  cumplido: number;
  registros: number;
  carga: number;
  placas: number;
  /** De lo PLANEADO, cuánto se hizo. Nunca pasa del plan. */
  adheridos: number;
  /** Lo que se pasó del plan o no estaba en él. */
  adicionales: number;
  faltan: number;
  /** Se movió y nadie lo había planeado. */
  sin_planear: boolean;
  /** Mide si el PLAN se cumplió. Tope 100%. */
  adherencia: number | null;
  /** Mide si se movió lo que había que mover, adicionales incluidos. */
  cumplimiento: number | null;
};

/**
 * UN SITIO ESCRITO A MANO EN EL REGISTRO.
 *
 * Viene con la mitad que faltaba: si se parece a un punto que YA está
 * en el maestro (`parecido`), no es un sitio nuevo sino el mismo mal
 * escrito, y el botón que hay que ofrecer es "unir", no "agregar".
 */
/** Una placa del maestro. La clave ES la placa, ya normalizada. */
export type PlacaM = {
  placa: string; nota: string | null; activo: boolean; orden: number | null;
};

export type PuntoFaltante = {
  texto: string;
  veces: number;
  /** De los últimos siete días. Es la cifra que pesa: "19 veces esta
   *  semana" mueve a alguien; "19 veces desde siempre", no. */
  veces_semana: number;
  ultima: string;
  parecido: string | null;
  parecido_nombre: string | null;
  parecido_viajes: number | null;
};

function sinTablas(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache");
}

/** Hoy en hora de Colombia. El servidor está en UTC: sin esto, después
 *  de las 7 p. m. la pantalla propondría la fecha de mañana. */
export function hoyLocal() {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}

export async function tipos(soloActivos = true) {
  const supabase = await createClient();
  let q = supabase.from("traspasos_tipos").select("clave, nombre, activo, orden");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q.order("orden", { ascending: true, nullsFirst: false });
  if (error) return { tipos: [] as TipoViaje[], falta: sinTablas(error.message) };
  return { tipos: (data ?? []) as TipoViaje[], falta: false };
}

export async function puntos(soloActivos = true) {
  const supabase = await createClient();
  /* `*` y no la lista de columnas a propósito: `descripcion` la agrega
     una migración posterior, y pedirla por nombre haría que el módulo
     entero se viera vacío hasta que se corra. La tabla es el maestro
     —decenas de filas, no miles—, así que traer una columna de más no
     cuesta nada. */
  let q = supabase.from("traspasos_puntos").select("*");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Punto[];
}

/**
 * Los viajes de un día. Se pide POR FECHA y no las últimas N: la
 * pregunta de esta pantalla es siempre "qué se movió hoy", y traer las
 * últimas 500 sin filtro obligaría a bajar semanas de viajes para
 * mostrar un turno.
 */
export async function viajesDelDia(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_viajes").select("*")
    .eq("fecha", fecha)
    .order("hora", { ascending: false });
  if (error) return { viajes: [] as Viaje[], falta: sinTablas(error.message) };
  return { viajes: (data ?? []) as Viaje[], falta: false };
}

/** El plan contra lo real, de un día. Es la pantalla del turno. */
export async function control(fecha: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_control").select("*")
    .eq("fecha", fecha)
    .order("turno_orden", { ascending: true })
    .order("tipo_orden", { ascending: true, nullsFirst: false });
  if (error) return { filas: [] as Control[], falta: sinTablas(error.message) };
  return { filas: (data ?? []) as Control[], falta: false };
}

/** Un rango, para el control. Mismo criterio: se filtra en la base. */
export async function controlRango(desde: string, hasta: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_control").select("*")
    .gte("fecha", desde).lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("turno_orden", { ascending: true })
    .order("tipo_orden", { ascending: true, nullsFirst: false });
  if (error) return { filas: [] as Control[], falta: sinTablas(error.message) };
  return { filas: (data ?? []) as Control[], falta: false };
}

/** Los viajes vacíos de un rango. Van aparte porque no llevan tipo:
 *  un viaje sin carga no mueve un material. */
export async function vaciosRango(desde: string, hasta: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_traspasos_viajes").select("fecha, turno, viajes")
    .eq("vacio", true).eq("estado", "registrado")
    .gte("fecha", desde).lte("fecha", hasta);
  return ((data ?? []) as { fecha: string; turno: string; viajes: number }[])
    .reduce((a, v) => a + v.viajes, 0);
}

/**
 * LOS PUNTOS QUE SE ESCRIBIERON A MANO PORQUE NO ESTABAN EN LA LISTA.
 *
 * Es lo que convierte el texto suelto en maestro: lo que alguien
 * escribió nueve veces esta semana es un punto real que hay que
 * agregar. Sin esta lista, el "se puede escribir otro" sería una
 * puerta por la que el maestro se vacía solo.
 */
export async function puntosFaltantes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_puntos_faltantes").select("*")
    .order("veces", { ascending: false });
  if (error) return [] as PuntoFaltante[];
  return (data ?? []).map((f) => ({
    texto: f.texto as string,
    veces: (f.veces ?? 0) as number,
    /* La vista vieja no traía estas tres. Si todavía es la que está
       corriendo, la pantalla se ve completa igual: sin semana y sin
       pareja, que es exactamente lo que había antes. */
    veces_semana: (f.veces_semana ?? 0) as number,
    ultima: f.ultima as string,
    parecido: (f.parecido ?? null) as string | null,
    parecido_nombre: (f.parecido_nombre ?? null) as string | null,
    parecido_viajes: (f.parecido_viajes ?? null) as number | null,
  })) as PuntoFaltante[];
}

/**
 * CUÁNTOS VIAJES LLEVA CADA COSA DEL MAESTRO.
 *
 * Decide si un punto o un tipo se puede borrar o solo desactivar, y es
 * la cifra que se ve en cada renglón.
 *
 * LA CUENTA LA HACE LA BASE, no el navegador. La versión anterior
 * bajaba tres columnas de la tabla de viajes entera para contarlas
 * aquí: con cincuenta mil viajes eran varios megabytes por cada vez
 * que alguien abría el Maestro. La vista devuelve una fila por clave.
 */
export async function usoDelMaestro() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_traspasos_uso").select("clase, clave, viajes, ultima");

  const tipos: Record<string, number> = {};
  const pts: Record<string, number> = {};
  const placas: Record<string, number> = {};
  const rutas: Record<string, number> = {};
  const ultima: Record<string, string> = {};

  if (error) return { tipos, puntos: pts, placas, rutas, ultima, falta: true };

  /* UNA RAMA POR CLASE, no "tipo o lo demás". La vista ganó las clases
     `placa` y `ruta`, y un `else` que lo metiera todo en puntos haría
     que una placa contara como punto: el Maestro diría que Ag01 tiene
     viajes que no son suyos, y ofrecería borrar lo que no debe. */
  for (const f of (data ?? []) as
       { clase: string; clave: string; viajes: number; ultima: string }[]) {
    if (f.clase === "tipo")       tipos[f.clave]  = f.viajes;
    else if (f.clase === "punto") pts[f.clave]    = f.viajes;
    else if (f.clase === "placa") placas[f.clave] = f.viajes;
    else if (f.clase === "ruta")  rutas[f.clave]  = f.viajes;
    ultima[f.clase + ":" + f.clave] = f.ultima;
  }
  return { tipos, puntos: pts, placas, rutas, ultima, falta: false };
}

/**
 * EL MAESTRO DE PLACAS.
 *
 * Antes las placas salían de lo ya registrado. Ayudaba, pero una
 * equivocación tecleada una vez entraba en la lista y se volvía a
 * ofrecer para siempre. Un maestro es lo que corta ese círculo.
 */
export async function placasMaestro(soloActivas = true) {
  const supabase = await createClient();
  let q = supabase.from("traspasos_placas").select("placa, nota, activo, orden");
  if (soloActivas) q = q.eq("activo", true);
  const { data, error } = await q.order("orden", { ascending: true, nullsFirst: false });
  if (error) return { placas: [] as PlacaM[], falta: sinTablas(error.message) };
  return { placas: (data ?? []) as PlacaM[], falta: false };
}


export type PlanLinea = {
  id: string; fecha: string; turno: string; tipo: string;
  planeado: number; publicado: boolean;
};

/**
 * EL PLAN DE UN DÍA, publicado y borrador por separado.
 *
 * Van aparte y no mezclados porque la pantalla tiene que poder decir
 * "esto es lo que está vigente" y "esto es lo que estás armando". Si
 * llegaran juntos, la rejilla tendría que adivinar cuál pinta.
 */
export async function planDelDia(fecha: string) {
  const supabase = await createClient();
  const [pl, vac] = await Promise.all([
    supabase.from("traspasos_plan")
      .select("id, fecha, turno, tipo, planeado, publicado")
      .eq("fecha", fecha).eq("estado", "registrado"),
    supabase.from("traspasos_plan_vacios").select("turno, vacios").eq("fecha", fecha),
  ]);
  const lineas = (pl.data ?? []) as PlanLinea[];
  return {
    falta: !!pl.error && sinTablas(pl.error.message),
    publicadas: lineas.filter((l) => l.publicado),
    borrador: lineas.filter((l) => !l.publicado),
    vacios: (vac.data ?? []) as { turno: string; vacios: number }[],
  };
}

/** Las placas de los últimos siete días, la más reciente primero. Es lo
 *  que convierte teclear una placa en tocar un botón. */
export async function placasRecientes(limite = 8) {
  const supabase = await createClient();
  const { data } = await supabase.from("v_traspasos_placas")
    .select("placa, veces, ultima").order("ultima", { ascending: false }).limit(limite);
  return (data ?? []) as { placa: string; veces: number; ultima: string }[];
}

/** Las rutas que más se repiten en el último mes. */
export async function rutasFrecuentes(limite = 6) {
  const supabase = await createClient();
  const { data } = await supabase.from("v_traspasos_rutas")
    .select("origen, destino, veces").order("veces", { ascending: false }).limit(limite);
  return (data ?? []) as { origen: string; destino: string; veces: number }[];
}

/**
 * EL PROMEDIO DE LO QUE DE VERDAD SALIÓ el mismo día de la semana, en
 * las últimas cuatro semanas.
 *
 * Es lo REAL y no lo planeado a propósito: el plan de los lunes
 * anteriores puede haber estado mal, y copiar un plan malo cuatro veces
 * seguidas es como se institucionaliza un error.
 */
export async function promedioDelDia(fecha: string) {
  const supabase = await createClient();
  /* getUTCDay sobre el mediodía: la fecha suelta se interpreta como
     medianoche UTC, que en Colombia es el día anterior. */
  const d = new Date(fecha + "T12:00:00").getUTCDay();
  const iso = d === 0 ? 7 : d;
  const { data } = await supabase.from("v_traspasos_promedio")
    .select("turno, tipo, promedio, dias").eq("dia_semana", iso);
  return (data ?? []) as { turno: string; tipo: string; promedio: number; dias: number }[];
}

/* =====================================================================
   ¿ESTÁ ABIERTO EL DÍA DE ESA FECHA?

   LA CUENTA NO SE HACE AQUÍ: se le pregunta a la base. Es la misma
   función que usa el candado —`traspaso_dia_abierto`— y ese es todo el
   punto: si la pantalla tuviera su propia versión de «hasta cuándo se
   puede tocar», bastaría con que una de las dos se corrija y la otra no
   para que el botón se vea habilitado y el guardado reviente. Un
   rechazo que llega DESPUÉS de tocar el botón se lee como un fallo de
   la aplicación, no como una regla.

   SI LA FUNCIÓN TODAVÍA NO ESTÁ —falta correr la migración— se contesta
   ABIERTO. Es a propósito: una pantalla que se cierra sola porque le
   falta un archivo de SQL deja a la bodega sin poder registrar y sin
   ninguna pista de por qué. Abierto es como funcionaba ayer, y el
   candado de la base sigue siendo el que manda el día que exista.
   ===================================================================== */
export async function diaAbierto(fecha: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("traspaso_dia_abierto", { p_fecha: fecha });
  if (error) return true;
  return data !== false;
}

/* =====================================================================
   EL CRUCE CONTRA SAP
   ===================================================================== */
export type LineaCruce = {
  documento: string;
  estado: "falta" | "sobra" | "cuadra";
  sap_fecha: string | null;
  sap_hora: string | null;
  sap_neto: number | null;
  sap_movimientos: number | null;
  sap_descripcion: string | null;
  viaje_id: string | null;
  viaje: string | null;
  sis_fecha: string | null;
  sis_turno: string | null;
  sis_placa: string | null;
  registrado_por: string | null;
  dia_distinto: boolean;
};

/* EL TOPE VA ESCRITO. PostgREST contesta 1.000 filas por defecto y NO
   AVISA: un corte de una semana entera pasa de mil documentos sin
   despeinarse, y la lista llegaría corta sin que nada lo diga. */
const TOPE_DIA = 5000;

/* =====================================================================
   EL CRUCE DE UN DÍA — lo que se pinta al pie del tablero.

   NO HAY PANTALLA DE CRUCE. Importar solo sube el corte; las diferencias
   salen donde se miran los números del día, que es Control. Un cruce en
   su propia pantalla obliga a que alguien se acuerde de ir a verlo, y lo
   que nadie abre no existe.

   POR QUÉ DOS FECHAS EN EL MISMO FILTRO. Un documento que FALTA solo
   tiene fecha de SAP; uno que SOBRA solo tiene la del viaje registrado.
   Filtrar por una sola dejaría fuera justo el montón contrario —y los
   que sobran son los dedazos, que es lo que hay que ir a corregir—.

   UN DOCUMENTO CON EL DÍA CAMBIADO SALE EN LOS DOS DÍAS, a propósito:
   descuadra el cumplido de los dos a la vez, y quien mire cualquiera de
   los dos tiene que poder verlo.
   ===================================================================== */
export async function cruceDelDia(fecha: string) {
  const supabase = await createClient();
  const [c, pri, ult] = await Promise.all([
    supabase.from("v_traspasos_cruce").select("*")
      .or(`sap_fecha.eq.${fecha},sis_fecha.eq.${fecha}`)
      .order("sap_hora").limit(TOPE_DIA),
    /* DE LOS MOVIMIENTOS, que es donde vive el corte desde que se guarda
       fila por fila. La tabla agrupada de antes quedó jubilada como
       `traspasos_sap_viejo` y ya no se actualiza: leerla daría un rango
       congelado en el día de la migración, sin dar error. */
    supabase.from("traspasos_sap_mov").select("fecha")
      .order("fecha", { ascending: true }).limit(1),
    supabase.from("traspasos_sap_mov").select("fecha")
      .order("fecha", { ascending: false }).limit(1),
  ]);

  if (c.error) {
    return {
      falta: /does not exist|schema cache/i.test(c.error.message),
      lineas: [] as LineaCruce[], tope: false,
      hayCorte: false, desde: null as string | null, hasta: null as string | null,
    };
  }

  /* HASTA DÓNDE LLEGA EL CORTE IMPORTADO. Sin esto, un día que nadie ha
     importado se vería como «ningún documento sin registrar» — que es
     peor que no decir nada: se lee como que todo cuadra. */
  const desde = (pri.data?.[0]?.fecha ?? null) as string | null;
  const hasta = (ult.data?.[0]?.fecha ?? null) as string | null;

  return {
    falta: false,
    lineas: (c.data ?? []) as LineaCruce[],
    tope: (c.data ?? []).length === TOPE_DIA,
    hayCorte: desde != null && hasta != null && desde <= fecha && fecha <= hasta,
    desde, hasta,
  };
}

/* =====================================================================
   LAS IMPORTACIONES ANTERIORES

   «Se subió el corte a tal hora, trajo tantos documentos, tantos siguen
   sin registrar.» Es lo único que la pantalla de Importar necesita
   mostrar de lo que ya pasó: si el de esta mañana ya se subió, y si el
   de la semana pasada dejó algo pendiente.

   `sin_registrar` LO CALCULA LA VISTA CONTRA LO DE AHORA, no contra lo
   que había al importar: si alguien registró el viaje que faltaba, el
   renglón de esa importación baja solo.
   ===================================================================== */
export type Importacion = {
  cuando: string;
  documentos: number;
  movimientos: number;
  anulados: number;
  desde: string | null;
  hasta: string | null;
  quien: string | null;
  sin_registrar: number;
};

export async function importacionesSap(cuantas = 8) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_traspasos_sap_importaciones")
    .select("*").order("cuando", { ascending: false }).limit(cuantas);
  if (error) {
    return {
      falta: /does not exist|schema cache/i.test(error.message),
      lista: [] as Importacion[],
    };
  }
  return { falta: false, lista: (data ?? []) as Importacion[] };
}
