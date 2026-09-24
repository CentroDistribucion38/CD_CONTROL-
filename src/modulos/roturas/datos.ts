import { createClient } from "@/lib/supabase/server";

/**
 * LO QUE LEE EL MÓDULO DE ROTURAS.
 *
 * Dos submódulos que miden cosas distintas y no se mezclan: EN SITIO
 * cuenta unidades por causa y proceso; SALIDA pesa kilos de vidrio. No
 * hay una sola función aquí que sume las dos — cuadrarlas sería
 * inventar un factor de conversión que no existe.
 */

/**
 * EN QUÉ PARTE DE LA CADENA VA UNA ROTURA.
 *
 *   espera_ol   registrada; Easy todavía no contesta.
 *   desacuerdo  Easy objetó, con motivo y evidencia. La mira ABI.
 *   cobro       se cobra —por acuerdo o porque ABI lo sostuvo—.
 *   no_cuenta   ABI le dio la razón a Easy.
 *
 * LA CALCULA LA VISTA, no la pantalla: tres pantallas preguntándose
 * «¿esta a quién le toca?» por su cuenta son tres sitios donde se
 * puede contestar distinto.
 */
export type Etapa = "espera_ol" | "desacuerdo" | "cobro" | "no_cuenta" | "anulada";

export type Rotura = {
  id: string;
  codigo: string;
  material: string;
  material_nombre: string;
  tipo: "producto_terminado" | "eer";
  color: "ambar" | "flint" | "green" | null;
  unidades: number;
  /** Solo en producto terminado: la botella quedó entera y solo se da de
   *  baja el líquido. No cuenta como vidrio roto. */
  contaminadas: number | null;
  botellas: number | null;
  /** Rotas + contaminadas. Las dos pierden el líquido. Cero en EER. */
  unidades_liquido: number;
  /** Botellas rotas (PT) o unidades (EER). Las contaminadas NO entran. */
  unidades_vidrio: number;
  proceso: string;
  proceso_nombre: string;
  /** Opcionales: lo registrado antes de que existiera el campo no tiene
   *  área, y no se le puede inventar una. */
  area?: string | null;
  area_nombre?: string | null;
  causa: string;
  causa_nombre: string;
  grupo: "asumida" | "no_asumida";
  exige_foto: boolean;
  descripcion: string | null;
  lat: number | null;
  lng: number | null;
  precision_m: number | null;
  estado: "esperando" | "cuenta" | "no_cuenta" | "anulada";
  esperando: boolean;
  cuenta: boolean;
  reportada_por: string | null;
  reportada_en: string;
  decidida_por: string | null;
  decidida_en: string | null;
  nota_decision: string | null;
  fotos: number;
  /* Opcionales porque la vista no los trae hasta que se corra
     2026-09-roturas-visto-bueno-easy.sql. Sin ellos la pantalla se
     comporta como antes en vez de reventar. */
  ol_respuesta?: "acepta" | "rechaza" | null;
  ol_por?: string | null;
  ol_en?: string | null;
  ol_nota?: string | null;
  etapa?: Etapa;
  cobro_por?: "acuerdo" | "abi" | "antes" | null;
  fotos_descargo?: number;
  le_falta_foto: boolean;
  minutos: number;
};

export type Salida = {
  id: string;
  codigo: string;
  placa: string;
  estado: "abierta" | "cerrada" | "anulada";
  observacion: string | null;
  creada_por: string | null;
  creada_en: string;
  supervisora_por: string | null;
  supervisora_en: string | null;
  supervisora_nota: string | null;
  verificador_por: string | null;
  verificador_en: string | null;
  verificador_nota: string | null;
  validador_por: string | null;
  validador_en: string | null;
  validador_nota: string | null;
  tolvas: number;
  bruto_kg: number;
  tara_kg: number;
  neto_kg: number;
  firmas: number;
  completa: boolean;
  /** Las dos firmas son de la misma persona. Solo lo puede hacer
   *  un administrador; a los demás la base se lo impide. No bloquea nada
   *  —es un dato para que la pantalla lo diga. */
  mismo_firmante: boolean;

  /* EL DESPACHO: en qué viaje de traspaso se fue el vidrio.
     Va opcional —con `?`— a propósito: si la migración del vidrio
     todavía no se ha corrido, la vista no trae estas columnas y las
     pantallas tienen que seguir pintándose. Exigirlas convertiría un
     «falta correr un SQL» en una pantalla en blanco. */
  despachada_en?: string | null;
  despachada_por?: string | null;
  /** El viaje de traspaso en el que salió. */
  viaje?: string | null;
  /** Las que facturación contó frente al Vh. Hoy tienen que ser las
   *  mismas que se pesaron; queda escrito igual. */
  tolvas_contadas?: number | null;
  viaje_codigo?: string | null;
  viaje_documento?: string | null;

  /* EL RASTRO DE LAS CORRECCIONES. Opcionales por lo mismo que las de
     arriba: si `2026-09-salida-reabrir-y-anular.sql` no se ha corrido,
     la vista no las trae y la pantalla tiene que seguir pintándose. */
  reabierta_por?: string | null;
  reabierta_en?: string | null;
  reabierta_nota?: string | null;
  reaperturas?: number | null;
};

export type TolvaPesada = {
  id: string;
  salida_id: string;
  tolva: string;
  color: "ambar" | "flint" | "green";
  bruto_kg: number;
  tara_kg: number;
  pesada_por: string | null;
  pesada_en: string;
};

export type Material = {
  clave: string; nombre: string;
  tipo: "producto_terminado" | "eer";
  color: "ambar" | "flint" | "green" | null;
  botellas_x_empaque: number | null;
  activo: boolean; orden: number | null;
};
export type Proceso = { clave: string; nombre: string; activo: boolean; orden: number | null };
/** EN QUÉ PARTE DE LA BODEGA pasó. No es el proceso: el proceso es la
 *  operación de la que salió la rotura, el área es el sitio. Se parecen
 *  en los nombres porque la bodega está organizada por lo que se hace en
 *  cada sitio, pero una rotura de Traspasos puede pasar en la Plazoleta. */
export type Area = { clave: string; nombre: string; activo: boolean; orden: number | null };
export type Causa = {
  clave: string; nombre: string;
  grupo: "asumida" | "no_asumida";
  exige_foto: boolean; activo: boolean; orden: number | null;
};
export type Tolva = {
  codigo: string; modelo: string; tara_kg: number; activo: boolean; orden: number | null;
};

/**
 * UN OPERARIO OPM. No es un usuario de la app: no entra, no tiene
 * pantalla, no tiene clave. Se identifica con cuatro dígitos delante de
 * quien registra la rotura, y eso es todo lo que hace.
 *
 * `roturas` es cuántas ha reportado — lo único que dice si el PIN se
 * está usando de verdad o si se cargó y nadie lo tocó nunca.
 */
export type Operario = {
  id: string; pin: string; nombre: string; empresa: string;
  turno: string | null; activo: boolean; nota: string | null; roturas: number;
};

/**
 * EL MAESTRO DE OPERARIOS, POR FUNCIÓN Y NO POR TABLA.
 *
 * La tabla NO se le da a la aplicación: `revoke all ... from
 * authenticated`. Si se leyera directo, cualquiera con la sesión
 * abierta podría bajarse la lista entera de PIN desde el navegador, y
 * entonces el PIN no probaría nada — que es justo para lo que existe.
 *
 * `operarios_listar()` solo contesta a quien MANDA, y a los demás les
 * devuelve vacío. Por eso aquí una lista vacía no es un error: es la
 * respuesta correcta para quien no debería verla.
 */
export async function operarios(): Promise<{ lista: Operario[]; sinTabla: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("operarios_listar");
  if (error) return { lista: [], sinTabla: sinTablas(error.message) };
  return { lista: (data ?? []) as Operario[], sinTabla: false };
}

function sinTablas(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache");
}

export async function roturas(limite = 500) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_roturas").select("*")
    .order("reportada_en", { ascending: false })
    .limit(limite);
  if (error) return { roturas: [] as Rotura[], falta: sinTablas(error.message) };
  return { roturas: (data ?? []) as Rotura[], falta: false };
}

/** La bandeja de ABI: lo que espera visto bueno, lo más viejo primero. */
/**
 * LA BANDEJA DE EASY: lo registrado que todavía no ha contestado.
 *
 * SE FILTRA POR `etapa` Y NO POR `estado`, y eso importa: desde que la
 * cadena se invirtió, `estado = 'esperando'` son DOS montones —lo que
 * espera a Easy y lo que Easy ya objetó y espera a ABI—. Filtrar por
 * estado le pondría a Easy en la bandeja las que ella misma rechazó.
 *
 * SI LA COLUMNA NO EXISTE —porque falta correr el SQL— se cae al
 * filtro viejo en vez de reventar: una pantalla en blanco no le dice a
 * nadie que falta una migración.
 */
export async function porRevisar(limite = 300) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_roturas").select("*")
    .eq("etapa", "espera_ol")
    .order("reportada_en", { ascending: true })
    .limit(limite);
  if (!error) return { roturas: (data ?? []) as Rotura[], falta: false, vieja: false };

  const viejo = await supabase
    .from("v_roturas").select("*")
    .eq("estado", "esperando")
    .order("reportada_en", { ascending: true })
    .limit(limite);
  if (viejo.error) {
    return { roturas: [] as Rotura[], falta: sinTablas(viejo.error.message), vieja: false };
  }
  /* `vieja` lo dice la pantalla: mientras el SQL no esté corrido, la
     bandeja mezcla los dos montones y hay que avisarlo, no disimularlo. */
  return { roturas: (viejo.data ?? []) as Rotura[], falta: false, vieja: true };
}

/**
 * LA BANDEJA DE ABI: SOLO lo que Easy objetó.
 *
 * Es la mitad de la razón de invertir la cadena. Antes ABI tenía que
 * mirar las cien roturas del mes; ahora mira las que alguien objetó,
 * que son las únicas donde su criterio cambia algo.
 */
export async function enDesacuerdo(limite = 300) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_roturas").select("*")
    .eq("etapa", "desacuerdo")
    .order("ol_en", { ascending: true })
    .limit(limite);
  if (error) return { roturas: [] as Rotura[], falta: true };
  return { roturas: (data ?? []) as Rotura[], falta: false };
}

export async function salidas(limite = 200) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_roturas_salidas").select("*")
    .order("creada_en", { ascending: false })
    .limit(limite);
  if (error) return { salidas: [] as Salida[], falta: sinTablas(error.message) };
  return { salidas: (data ?? []) as Salida[], falta: false };
}

/**
 * LAS LÍNEAS DE VARIAS SALIDAS, para poder filtrar el análisis por
 * tolva y por color.
 *
 * VA APARTE Y NO DENTRO DE `salidas()`: la inmensa mayoría de las
 * pantallas solo necesitan el total de cada salida, y bajarles todas
 * las líneas les costaría en cada carga sin que nadie las mire.
 */
export async function lineasDeSalidas(ids: string[]) {
  if (ids.length === 0) return [] as TolvaPesada[];
  const supabase = await createClient();
  const { data } = await supabase
    .from("roturas_salida_tolvas").select("*")
    .in("salida_id", ids);
  return (data ?? []) as TolvaPesada[];
}

export async function unaSalida(id: string) {
  const supabase = await createClient();
  const [s, t] = await Promise.all([
    supabase.from("v_roturas_salidas").select("*").eq("id", id).maybeSingle(),
    supabase.from("roturas_salida_tolvas").select("*").eq("salida_id", id)
      .order("pesada_en", { ascending: true }),
  ]);
  return {
    salida: (s.data ?? null) as Salida | null,
    tolvas: (t.data ?? []) as TolvaPesada[],
    falta: s.error ? sinTablas(s.error.message) : false,
  };
}

export async function materiales(soloActivos = true) {
  const supabase = await createClient();
  let q = supabase.from("roturas_materiales")
    .select("clave, nombre, tipo, color, botellas_x_empaque, activo, orden");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Material[];
}

/**
 * EL MAESTRO DE MATERIALES, DESDE INVENTARIO.
 *
 * «Tenemos un maestro de producto y envase; esa data la necesito también
 *  para el desplegable de Quiebra en sitio.»
 *
 * CAE AL MAESTRO VIEJO SI LA VISTA NO EXISTE. Mientras
 * `2026-09-roturas-maestro-unico-y-opm.sql` no se haya corrido, la
 * pantalla tiene que seguir funcionando con los siete de siempre:
 * dejarla sin desplegable convertiría un «falta correr un SQL» en no
 * poder registrar una rotura que ya ocurrió.
 */
export async function materialesMaestro(): Promise<{ materiales: Material[]; delInventario: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_roturas_materiales_maestro")
    .select("clave, nombre, tipo, color, botellas_x_empaque")
    .order("nombre");
  if (error || !data) return { materiales: await materiales(), delInventario: false };
  return {
    materiales: (data as Material[]).map((m) => ({ ...m, activo: true, orden: null })),
    delInventario: true,
  };
}

export async function procesos(soloActivos = true) {
  const supabase = await createClient();
  let q = supabase.from("roturas_procesos").select("clave, nombre, activo, orden");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Proceso[];
}

export async function areas(soloActivas = true) {
  const supabase = await createClient();
  let q = supabase.from("roturas_areas").select("clave, nombre, activo, orden");
  if (soloActivas) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Area[];
}

export async function causas(soloActivas = true) {
  const supabase = await createClient();
  let q = supabase.from("roturas_causas")
    .select("clave, nombre, grupo, exige_foto, activo, orden");
  if (soloActivas) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Causa[];
}

export async function tolvas(soloActivas = true) {
  const supabase = await createClient();
  let q = supabase.from("roturas_tolvas").select("codigo, modelo, tara_kg, activo, orden");
  if (soloActivas) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Tolva[];
}

/**
 * CUÁNTAS VECES SE HA USADO CADA CLAVE DEL MAESTRO.
 *
 * Es lo que decide si en el maestro sale el botón de borrar. La base lo
 * rechazaría igual por la llave foránea, pero "violates foreign key
 * constraint" no le explica nada a quien está mirando la pantalla:
 * decirlo antes —"usado en 43"— sí.
 *
 * LA CUENTA LA HACE LA BASE. Antes se traían TODAS las roturas —sin
 * tope siquiera— para contar cuatro cosas en memoria. Con decenas de
 * filas daba igual; con decenas de miles es traerse la tabla por la red
 * para devolver una docena de números.
 */
export async function usoDeMaestros() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_roturas_uso").select("tipo, clave, usos");

  const vacio = () => ({} as Record<string, number>);
  const uso = {
    materiales: vacio(), procesos: vacio(), areas: vacio(), causas: vacio(), tolvas: vacio(),
  };
  for (const f of (data ?? []) as { tipo: string; clave: string; usos: number }[]) {
    if (f.tipo === "material") uso.materiales[f.clave] = f.usos;
    else if (f.tipo === "proceso") uso.procesos[f.clave] = f.usos;
    else if (f.tipo === "area") uso.areas[f.clave] = f.usos;
    else if (f.tipo === "causa") uso.causas[f.clave] = f.usos;
    else if (f.tipo === "tolva") uso.tolvas[f.clave] = f.usos;
  }
  return uso;
}

/** Las fotos de una rotura, firmadas. Se piden al abrirla, no con la lista. */
export async function fotosDeRotura(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("roturas_fotos")
    .select("ruta, tomada_en, lat, lng, precision_m, subida_por, subida_en")
    .eq("rotura_id", id).order("subida_en");
  const filas = (data ?? []) as {
    ruta: string; tomada_en: string | null; lat: number | null; lng: number | null;
    precision_m: number | null; subida_por: string | null; subida_en: string;
  }[];
  const urls = await Promise.all(filas.map(async (f) => {
    const { data: u } = await supabase.storage.from("roturas").createSignedUrl(f.ruta, 600);
    return u?.signedUrl ?? null;
  }));
  return filas.map((f, i) => ({ ...f, url: urls[i] }));
}
