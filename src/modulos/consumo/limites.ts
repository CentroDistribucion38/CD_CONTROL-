/**
 * LO QUE INCLUYE CADA PLAN. Son las cuotas publicadas por Supabase y Vercel (oct 2026): si cambian,
 * se cambian AQUÍ y el panel las toma. El plan se escoge con CONSUMO_PLAN_SUPABASE (free | pro | team)
 * y CONSUMO_PLAN_VERCEL (hobby | pro).
 */
export type PlanSupabase = "free" | "pro" | "team";
export type PlanVercel = "hobby" | "pro";

const GB = 1024 ** 3;

export const SUPABASE: Record<PlanSupabase, { bd: number; almacenamiento: number; usuarios: number; salida: number }> = {
  free: { bd: 0.5 * GB, almacenamiento: 1 * GB, usuarios: 50_000, salida: 5 * GB },
  pro: { bd: 8 * GB, almacenamiento: 100 * GB, usuarios: 100_000, salida: 250 * GB },
  team: { bd: 8 * GB, almacenamiento: 100 * GB, usuarios: 100_000, salida: 250 * GB },
};

/** Los contadores de Vercel con tope en Hobby. `tipo` dice en qué unidad se compara. */
export const VERCEL_HOBBY: { re: RegExp; titulo: string; limite: number; unidad: string; tipo: "gb" | "n" | "h" | "gbh" }[] = [
  { re: /fast data transfer/i, titulo: "Transferencia rápida de datos", limite: 100, unidad: "GB", tipo: "gb" },
  { re: /fast origin transfer/i, titulo: "Transferencia al origen", limite: 10, unidad: "GB", tipo: "gb" },
  { re: /(cdn|edge) requests?/i, titulo: "Peticiones a la red de Vercel", limite: 1_000_000, unidad: "", tipo: "n" },
  { re: /invocations?/i, titulo: "Invocaciones de funciones", limite: 1_000_000, unidad: "", tipo: "n" },
  { re: /active cpu/i, titulo: "CPU activa de funciones", limite: 4, unidad: "h", tipo: "h" },
  { re: /provisioned memory/i, titulo: "Memoria de funciones", limite: 360, unidad: "GB·h", tipo: "gbh" },
  { re: /image transformations?/i, titulo: "Imágenes optimizadas", limite: 5_000, unidad: "", tipo: "n" },
];

/** En Pro, Vercel da un crédito mensual de uso (USD). */
export const CREDITO_PRO_USD = 20;
