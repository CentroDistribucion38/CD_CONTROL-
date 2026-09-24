import { createClient } from "@/lib/supabase/server";
import type { Causal } from "./hallazgos";

/**
 * LO QUE LEE LA PANTALLA DE AVERÍAS.
 *
 * Todo sale de `v_averias`, que es donde se calculan los días de la
 * baja y los que faltan para vencer. Tres pantallas calculando «se
 * vence pronto» por su cuenta son tres sitios donde se puede calcular
 * distinto, y el día que cambie la regla se arreglan dos.
 */

export type AveriaFila = {
  id: string;
  codigo: string;
  /** El día del REGISTRO, que lo pone la base. Ya no se teclea. */
  fecha: string;
  /** La hora del registro, ya en hora de Colombia: «15:10». */
  hora: string | null;
  /** 1 (06–14), 2 (14–22) o 3 (22–06). Congelado al guardar. */
  turno: number | null;
  /** Lo que alguien dice que pasó antes. Opcional y aparte de `fecha`. */
  paso_antes: string | null;
  /** El texto combinado: «A03 · M12 · IZQ». */
  ubicacion: string;
  ubicacion_id: string | null;
  ubicacion_clave: string | null;
  calle: string | null;
  modulo: string | null;
  lado: string | null;
  producto_sku: string;
  producto: string;
  cajas: number;
  unidades: number;
  vence: string | null;
  causal: Causal;
  causal_nombre: string;
  externa: boolean;
  reporto: string;
  documento: string | null;
  documento_en: string | null;
  nota: string | null;
  creado_por: string | null;
  creado_en: string;
  anulada_en: string | null;
  motivo_anulacion: string | null;
  pendiente_baja: boolean;
  dias_baja: number | null;
  dias_para_vencer: number | null;
  fotos: number;
};

export type CausalFila = {
  clave: string; nombre: string; externa: boolean; activo: boolean; orden: number | null;
};

/** El producto como lo ofrece el buscador: del maestro de inventario. */
export type ProductoFila = { sku: string; nombre: string };

/**
 * UNA UBICACIÓN DEL MAESTRO DE INVENTARIO.
 *
 * ES EL MISMO MAESTRO, no una copia. Averías lo LEE y no lo escribe:
 * las ubicaciones se dan de alta en Inventario → Maestro, que es donde
 * se ven junto a todo lo demás. Dos maestros para el mismo pasillo es
 * como una calle termina llamándose de dos formas y los dos tableros
 * dejan de cuadrar.
 */
export type UbicacionFila = {
  id: string;
  clave: string;
  calle: string;
  modulo: string;
  lado: "IZQ" | "DER" | null;
  activa: boolean;
};

function sinTablas(msg: string | undefined) {
  const t = (msg ?? "").toLowerCase();
  return t.includes("does not exist") || t.includes("schema cache");
}

export async function averias(limite = 1000):
  Promise<{ lista: AveriaFila[]; sinTabla: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_averias").select("*")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) return { lista: [], sinTabla: sinTablas(error.message) };
  return { lista: (data ?? []) as AveriaFila[], sinTabla: false };
}

export async function unaAveria(id: string): Promise<AveriaFila | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("v_averias").select("*").eq("id", id).maybeSingle();
  return (data as AveriaFila) ?? null;
}

export async function causales(soloActivas = true) {
  const supabase = await createClient();
  let q = supabase.from("averias_causales").select("clave, nombre, externa, activo, orden");
  if (soloActivas) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as CausalFila[];
}

/**
 * EL DESPLEGABLE DE PRODUCTOS SALE DEL MAESTRO DE INVENTARIO, igual que
 * el de roturas. No hay una segunda lista de productos para averías:
 * un material que existe en dos tablas se edita en una y se queda viejo
 * en la otra.
 */
export async function productosDeAverias(): Promise<ProductoFila[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("productos")
    .select("sku, nombre").eq("activo", true).order("nombre").limit(2000);
  return (data ?? []) as ProductoFila[];
}

/**
 * LAS UBICACIONES DEL MAESTRO DE INVENTARIO.
 *
 * ---------------------------------------------------------------------
 * ESTO CAMBIÓ DE OPINIÓN, Y VALE LA PENA DEJARLO ESCRITO
 * ---------------------------------------------------------------------
 * Antes aquí se leían las ubicaciones QUE YA SE HABÍAN TECLEADO, para
 * proponerlas, y el comentario decía que un maestro obligaría a dar de
 * alta la calle antes de poder registrar — y que así es como se pierde
 * el registro de algo que ya pasó.
 *
 * El argumento no era malo; la otra mitad pesa más. Con texto libre la
 * misma calle se escribe «A03 M12», «a03-m12» y «A3 · M12», y entonces
 * la concentración por calle reparte un mismo pasillo en tres y no
 * detecta nada — que es justo para lo que existe el tablero. El maestro
 * YA EXISTE con sus cientos de filas: no había que inventarlo.
 *
 * SOLO LAS ACTIVAS: una ubicación apagada es una que la bodega dejó de
 * usar, y registrar ahí es registrar en un sitio al que nadie va a ir a
 * mirar. La base lo comprueba también.
 */
export async function ubicacionesMaestro(): Promise<UbicacionFila[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("ubicaciones")
    .select("id, clave, calle, modulo, lado, activa")
    .eq("activa", true)
    /* EN EL ORDEN EN QUE SE CAMINA LA BODEGA: calle, módulo, lado. El
       orden alfabético de la clave pondría «A10» antes que «A2». */
    .order("calle").order("modulo").order("lado", { nullsFirst: true })
    .limit(5000);
  return (data ?? []) as UbicacionFila[];
}
