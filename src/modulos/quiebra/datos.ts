import { createClient } from "@/lib/supabase/server";

export type Baja = {
  fecha: string;
  causal: string;
  almacen: string | null;
  material: string | null;
  denominacion: string | null;
  cantidad: number;
};

export type Produccion = {
  fecha: string;
  linea: number | null;
  cantidad: number;
};

export type Meta = { anio: number; mes: number; meta: number };

export type Carga = {
  archivo: string | null;
  desde: string;
  hasta: string;
  filas_bajas: number;
  filas_produccion: number;
  cargado_en: string;
};

/**
 * Supabase corta en 1000 filas por consulta. Aquí se pagina hasta traer
 * todo, porque el tablero filtra en el navegador y necesita el detalle.
 */
async function traerTodo<T>(
  tabla: string,
  columnas: string,
  orden: string
): Promise<T[]> {
  const supabase = await createClient();
  const paso = 1000;
  let desde = 0;
  const filas: T[] = [];

  for (;;) {
    const { data, error } = await supabase
      .from(tabla)
      .select(columnas)
      .order(orden)
      .range(desde, desde + paso - 1);

    if (error || !data || data.length === 0) break;
    filas.push(...(data as unknown as T[]));
    if (data.length < paso) break;
    desde += paso;
    if (desde > 200_000) break; // tope de seguridad
  }
  return filas;
}

export async function datosQuiebra() {
  const supabase = await createClient();

  const [bajas, produccion, metas, cargas] = await Promise.all([
    traerTodo<Baja>(
      "quiebra_bajas",
      "fecha, causal, almacen, material, denominacion, cantidad",
      "fecha"
    ),
    traerTodo<Produccion>("quiebra_produccion", "fecha, linea, cantidad", "fecha"),
    supabase.from("quiebra_metas").select("anio, mes, meta").order("mes"),
    supabase
      .from("quiebra_cargas")
      .select("archivo, desde, hasta, filas_bajas, filas_produccion, cargado_en")
      .order("cargado_en", { ascending: false })
      .limit(1),
  ]);

  return {
    bajas,
    produccion,
    metas: (metas.data ?? []) as Meta[],
    ultimaCarga: (cargas.data?.[0] ?? null) as Carga | null,
  };
}
