/**
 * SIDER CERTIFICADO — lo que no toca la base de datos.
 *
 * Constantes y formas, y nada más. Vive aparte de datos.ts porque
 * datos.ts importa el cliente de servidor de Supabase, que a su vez
 * importa next/headers: cualquier componente de CLIENTE que quisiera
 * el nombre de un mes se llevaba todo eso al navegador y el build se
 * caía con "You're importing a component that needs next/headers".
 *
 * La regla: si no lee ni escribe, va aquí.
 */

export const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
/* =====================================================================
   CÓMO SE LLAMA UN RANGO DE FECHAS
   Una sola función, usada por el título, por el KPI, por el nombre del
   archivo de Excel y por el campo del calendario: si cada sitio armara
   su propio texto, el mismo rango se llamaría de tres formas distintas
   en la misma pantalla.
   ===================================================================== */

/** Del 1 al último día de ese mes. */
export function mesCompleto(aaaamm: string): { desde: string; hasta: string } {
  const [a, m] = aaaamm.split("-").map(Number);
  const fin = new Date(a, m, 0).getDate();
  return { desde: `${aaaamm}-01`, hasta: `${aaaamm}-${String(fin).padStart(2, "0")}` };
}

/** ¿El rango es exactamente un mes completo? */
export function esMesCompleto(desde: string, hasta: string): boolean {
  if (desde.slice(0, 7) !== hasta.slice(0, 7)) return false;
  const m = mesCompleto(desde.slice(0, 7));
  return desde === m.desde && hasta === m.hasta;
}

/** ¿El rango es exactamente un año completo? */
export function esAnioCompleto(desde: string, hasta: string): boolean {
  const a = desde.slice(0, 4);
  return hasta.slice(0, 4) === a && desde === `${a}-01-01` && hasta === `${a}-12-31`;
}

/**
 * El nombre del rango, dicho como lo diría una persona:
 *   un día        "11 de agosto de 2026"
 *   un mes        "agosto 2026"
 *   un año        "todo 2026"
 *   dentro de un mes  "3 al 17 de agosto de 2026"
 *   a caballo     "28 de julio al 4 de agosto de 2026"
 *   entre años    "15 de diciembre de 2025 al 3 de enero de 2026"
 */
export function nombreRango(desde: string, hasta: string): string {
  if (!desde || !hasta) return "—";
  const d = desde.split("-").map(Number), h = hasta.split("-").map(Number);
  const mesDe = (i: number) => MESES_LARGO[i - 1];
  if (desde === hasta) return `${d[2]} de ${mesDe(d[1])} de ${d[0]}`;
  if (esAnioCompleto(desde, hasta)) return `todo ${d[0]}`;
  if (esMesCompleto(desde, hasta)) return `${mesDe(d[1])} ${d[0]}`;
  if (d[0] === h[0] && d[1] === h[1]) return `${d[2]} al ${h[2]} de ${mesDe(d[1])} de ${d[0]}`;
  if (d[0] === h[0]) return `${d[2]} de ${mesDe(d[1])} al ${h[2]} de ${mesDe(h[1])} de ${d[0]}`;
  return `${d[2]} de ${mesDe(d[1])} de ${d[0]} al ${h[2]} de ${mesDe(h[1])} de ${h[0]}`;
}

export const MESES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio",
                            "agosto","septiembre","octubre","noviembre","diciembre"];

export type Origen = {
  planta: string;
  cd_origen: string;
  activo: boolean;
  orden: number | null;
};

export type Sku = {
  sku: string;
  descripcion: string;
  clase: string | null;
  cajas_x_estiba: number | null;
  unidades_x_caja: number | null;
  hl_x_unidad: number | null;
  activo: boolean;
};

export type Viaje = {
  id: string;
  placa: string;
  planta: string;
  cd_origen: string;
  cd_destino: string;
  sku: string;
  descripcion: string;
  tipo_envase: string | null;
  estibas: number;
  estado: "en_transito" | "recibido" | "anulado";
  /** Vino de un archivo, no de una certificación: no tiene evidencia. */
  importado: boolean;
  observacion: string | null;
  creado_por: string | null;
  creado_en: string;
  fecha: string;
  num_mes: number;
  semana: number;
  anio: number;
  sider: number;
  cajas: number | null;
  unidades: number | null;
  hl: number | null;
  faltan_factores: boolean;
  cert_salida_id: string | null;
  salida_en: string | null;
  salida_lat: number | null;
  salida_lng: number | null;
  salida_precision: number | null;
  salida_direccion: string | null;
  cert_llegada_id: string | null;
  llegada_en: string | null;
  llegada_lat: number | null;
  llegada_lng: number | null;
  llegada_precision: number | null;
  llegada_direccion: string | null;
  fotos_salida: number;
  fotos_llegada: number;
  en_camino: string | null;
};

export type FilaSeguimiento = {
  mes: string;
  cd_origen: string;
  planta: string | null;
  aplica_sider: boolean;
  fuera_del_maestro: boolean;
  /* Bloque de VEHÍCULOS. En el Excel eran las columnas L a O.
     Vehículos EQUIVALENTES: estibas ÷ 36, de los dos lados. Comparar
     renglones contra vehículos daría un porcentaje sin significado. */
  vh_recibidos: number;
  vh_bu_mtd: number;
  vh_real_mtd: number;
  pct_cumplimiento_vh: number | null;
  /* Bloque de HECTOLITROS. En el Excel eran dos bloques (P a S y T a W)
     con las mismas tres primeras columnas y solo el porcentaje distinto:
     aquí van las tres una vez y los dos porcentajes al lado. */
  hl_recibido: number;
  bu_mtd: number;
  real_mtd: number;
  /** Real contra la META. Dice si se llegó a lo que tocaba. */
  pct_cumplimiento: number | null;
  /** Real contra lo RECIBIDO. Es el número del informe. */
  pct_certificacion: number | null;
  viajes: number;
  estibas: number;
  lineas_zlde: number;
  meta: number;
};

export type FotoGuardada = {
  ranura: "costado_izq" | "costado_der" | "placa";
  ruta: string;
  url: string | null;
  bytes: number | null;
  ancho: number | null;
  alto: number | null;
  subida_en: string;
};

export type Certificacion = {
  id: string;
  punta: "salida" | "llegada";
  lat: number;
  lng: number;
  precision_m: number | null;
  ubicado_en: string | null;
  direccion: string | null;
  nota: string | null;
  hecha_por: string | null;
  hecha_en: string;
  fotos: FotoGuardada[];
};

export const ORDEN_RANURA = ["costado_izq", "costado_der", "placa"] as const;

export const NOMBRE_RANURA: Record<string, string> = {
  costado_izq: "Costado izquierdo",
  costado_der: "Costado derecho",
  placa: "Placa",
};
