import { createClient } from "@/lib/supabase/server";

/**
 * FEFO — lo que las pantallas necesitan leer.
 *
 * Todo sale de las tablas y las vistas del módulo. Las cuentas —total
 * cajas, días para vencer, días para salir— NO se rehacen aquí: las hace
 * `v_fefo_lineas` con las mismas fórmulas del Excel. Si cada pantalla
 * calculara las suyas, bastaría con que una redondeara distinto para que
 * el informe y el conteo dijeran cosas diferentes del mismo día.
 */

export type Material = {
  codigo: number;
  descripcion: string;
  unidades_por_caja: number | null;
  cajas_por_estiba: number | null;
  unidades_por_estiba: number | null;
  contenido: number | null;
  familia: string | null;
  presentacion: string | null;
  vida_util: number | null;
  dias_minimo: number;
  origen: string | null;
  foraneo: string | null;
  tipo: "PRODUCTO" | "ENVASE";
  activo: boolean;
};

export type Ubicacion = {
  clave: string;
  calle: string;
  modulo: string;
  lado: "IZQ" | "DER" | null;
  familia: string | null;
  capacidad: number | null;
  activa: boolean;
};

/* Se reconoce que falta correr el SQL por el error de Postgres, no por
   una bandera: así la pantalla dice qué archivo correr en vez de salir
   vacía y dejar a alguien preguntándose si es que no hay datos. */
const sinTablas = (m: string) =>
  m.includes("does not exist") || m.includes("schema cache") || m.includes("fefo_");

/**
 * EL MAESTRO ENTERO, DE UNA.
 *
 * 494 materiales y 428 ubicaciones caben de sobra en una consulta, y
 * traerlos todos es lo que permite que el buscador de la pantalla filtre
 * SIN ir al servidor en cada tecla — que es lo que se siente lento en un
 * celular con señal de bodega.
 *
 * PERO OJO CON EL TOPE DE PostgREST: por defecto contesta 1.000 filas y
 * no avisa. Hoy sobra, pero el día que el maestro pase de mil, esto
 * empezaría a mentir en silencio. Por eso el `limit` va escrito: si
 * alguna vez el número que vuelve es exactamente el del límite, se sabe
 * dónde mirar.
 */
export async function maestroFefo() {
  const supabase = await createClient();
  const [m, u] = await Promise.all([
    supabase.from("fefo_materiales").select("*").order("codigo").limit(5000),
    supabase.from("fefo_ubicaciones").select("*")
      .order("calle").order("modulo").order("lado", { nullsFirst: true }).limit(5000),
  ]);

  if (m.error) {
    return { falta: sinTablas(m.error.message), materiales: [] as Material[], ubicaciones: [] as Ubicacion[] };
  }
  return {
    falta: false,
    materiales: (m.data ?? []) as Material[],
    ubicaciones: (u.data ?? []) as Ubicacion[],
  };
}
