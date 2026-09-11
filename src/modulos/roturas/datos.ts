import { createClient } from "@/lib/supabase/server";

/**
 * LO QUE LEE EL MÓDULO DE ROTURAS.
 *
 * Dos submódulos que miden cosas distintas y no se mezclan: EN SITIO
 * cuenta unidades por causa y proceso; SALIDA pesa kilos de vidrio. No
 * hay una sola función aquí que sume las dos — cuadrarlas sería
 * inventar un factor de conversión que no existe.
 */

export type Rotura = {
  id: string;
  codigo: string;
  material: string;
  material_nombre: string;
  tipo: "producto_terminado" | "eer";
  color: "ambar" | "flint" | "green" | null;
  unidades: number;
  botellas: number | null;
  unidades_vidrio: number;
  proceso: string;
  proceso_nombre: string;
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
  le_falta_foto: boolean;
  minutos: number;
};

export type Salida = {
  id: string;
  codigo: string;
  estado: "abierta" | "cerrada" | "anulada";
  observacion: string | null;
  creada_por: string | null;
  creada_en: string;
  supervisora_por: string | null;
  supervisora_en: string | null;
  verificador_por: string | null;
  verificador_en: string | null;
  validador_por: string | null;
  validador_en: string | null;
  tolvas: number;
  bruto_kg: number;
  tara_kg: number;
  neto_kg: number;
  firmas: number;
  completa: boolean;
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
export type Causa = {
  clave: string; nombre: string;
  grupo: "asumida" | "no_asumida";
  exige_foto: boolean; activo: boolean; orden: number | null;
};
export type Tolva = {
  codigo: string; modelo: string; tara_kg: number; activo: boolean; orden: number | null;
};

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
export async function porRevisar(limite = 300) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_roturas").select("*")
    .eq("estado", "esperando")
    .order("reportada_en", { ascending: true })
    .limit(limite);
  if (error) return { roturas: [] as Rotura[], falta: sinTablas(error.message) };
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

export async function procesos(soloActivos = true) {
  const supabase = await createClient();
  let q = supabase.from("roturas_procesos").select("clave, nombre, activo, orden");
  if (soloActivos) q = q.eq("activo", true);
  const { data } = await q.order("orden", { ascending: true, nullsFirst: false });
  return (data ?? []) as Proceso[];
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
 * Se cuenta en memoria sobre lo que ya se trajo y no con cuatro
 * consultas de group by: el maestro son decenas de filas, no millones.
 */
export async function usoDeMaestros() {
  const supabase = await createClient();
  const [r, t] = await Promise.all([
    supabase.from("roturas").select("material, proceso, causa"),
    supabase.from("roturas_salida_tolvas").select("tolva"),
  ]);

  const vacio = () => ({} as Record<string, number>);
  const uso = {
    materiales: vacio(), procesos: vacio(), causas: vacio(), tolvas: vacio(),
  };
  for (const f of (r.data ?? []) as { material: string; proceso: string; causa: string }[]) {
    uso.materiales[f.material] = (uso.materiales[f.material] ?? 0) + 1;
    uso.procesos[f.proceso] = (uso.procesos[f.proceso] ?? 0) + 1;
    uso.causas[f.causa] = (uso.causas[f.causa] ?? 0) + 1;
  }
  for (const f of (t.data ?? []) as { tolva: string }[]) {
    uso.tolvas[f.tolva] = (uso.tolvas[f.tolva] ?? 0) + 1;
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
