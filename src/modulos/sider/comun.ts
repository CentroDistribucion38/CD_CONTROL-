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
