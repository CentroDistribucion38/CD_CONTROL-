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

export type Bodega = { id: string; codigo: string; nombre: string };

export type Renglon = {
  id: string;
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
  total_cajas: number;
  total_estibas: number;
  /* Los tres pedazos como se teclearon, aparte de la fecha armada: son
     los que hay que devolver a las casillas DD/MM/AA al corregir. */
  venc_dia: number | null;
  venc_mes: number | null;
  venc_anio: number | null;
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
    /* `*` y no la lista de columnas: pegar la lista con `+` rompe el
       tipado de supabase-js —el tipo sale de la CADENA LITERAL, y una
       concatenación ya no lo es— y el build revienta con un error que no
       dice eso. Las columnas de más son costo y stock mínimo: nada al
       lado de traer 494 filas. */
    supabase.from("productos").select("*").order("sku").limit(5000),
    supabase.from("ubicaciones").select("*")
      .order("calle").order("modulo").order("lado", { nullsFirst: true }).limit(5000),
    supabase.from("bodegas").select("id, codigo, nombre").eq("activo", true).order("codigo"),
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
