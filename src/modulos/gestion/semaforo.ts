/**
 * GESTIÓN — las reglas, sin base ni pantalla (se usan en el servidor y en el navegador).
 *
 * Un INDICADOR es un KPI (el resultado) o un PI (indicador de proceso: lo que explica o maneja el KPI).
 * Cada uno tiene su META (con su operador) y un DISPARADOR. Solo hay dos estados: CUMPLE la meta o NO CUMPLE.
 * Nada intermedio. El disparador salta cuando no se cumple la meta N resultados seguidos.
 * (Las columnas amarillo/rojo y disparo_en siguen en la base pero ya no se usan.)
 *
 * Todo lo que aquí se decide viene de los datos del indicador: no hay una cifra escrita a mano en el código.
 */

/** El SQL que crea las tablas de Gestión (lo que se le dice a quien abre una pantalla sin haberlo corrido). */
export const SQL_GESTION = "supabase/modulos/gestion.sql";

export type Op = ">" | ">=" | "<" | "<=" | "=";
export const OPERADORES: { k: Op; t: string }[] = [
  { k: ">=", t: "≥ mayor o igual" },
  { k: ">", t: "> mayor que" },
  { k: "<=", t: "≤ menor o igual" },
  { k: "<", t: "< menor que" },
  { k: "=", t: "= igual a" },
];
export const SIMBOLO: Record<Op, string> = { ">=": "≥", ">": ">", "<=": "≤", "<": "<", "=": "=" };

export type Estado = "verde" | "amarillo" | "rojo";
/** Solo dos estados a la vista: cumple o no cumple («amarillo» quedó de antes y se lee como no cumple). */
export const ESTADOS: { k: Estado; nombre: string }[] = [
  { k: "verde", nombre: "Cumple" },
  { k: "rojo", nombre: "No cumple" },
];
/** Lo guardado con el semáforo viejo: lo intermedio cuenta como no cumple. */
export const aEstado = (e: string | null | undefined): Estado => (e === "verde" ? "verde" : "rojo");
/** De mejor a peor: sirve para quedarse con el peor estado de un día. */
export const PESO: Record<Estado, number> = { verde: 0, amarillo: 2, rojo: 2 };

export type Frecuencia = "dia" | "semana" | "mes";
export const FRECUENCIAS: { k: Frecuencia; nombre: string }[] = [
  { k: "dia", nombre: "Diaria" },
  { k: "semana", nombre: "Semanal" },
  { k: "mes", nombre: "Mensual" },
];
export type Captura = "turnos" | "unico";

export type Turno = { id: string; nombre: string; hora_ini: string; hora_fin: string; orden: number; activo: boolean };
export type Proceso = { id: string; nombre: string; orden: number; activo: boolean };

export type Indicador = {
  id: string; codigo: string; nombre: string; tipo: "kpi" | "pi"; padre_id: string | null; proceso_id: string | null;
  nivel_reunion: 1 | 2; unidad: string; decimales: number;
  meta_op: Op; meta_valor: number;
  amarillo_op: Op | null; amarillo_valor: number | null;
  rojo_op: Op | null; rojo_valor: number | null;
  frecuencia: Frecuencia; captura: Captura; turnos: string[];
  responsable: string | null;
  disparo_activo: boolean; disparo_en: "rojo" | "amarillo"; disparo_consecutivos: number;
  orden: number; activo: boolean;
};

/** El 5 Why de un disparador (uno por disparador): responsable, los cinco por qué y la causa raíz. */
export type Analisis = {
  disparador_id: string; responsable: string;
  porque1: string; porque2: string; porque3: string; porque4: string; porque5: string;
  causa_raiz: string; iniciado_en: string; actualizado_en: string;
};
/** Una acción del plan de un disparador. */
export type Accion = {
  id: string; disparador_id: string; accion: string; responsable: string; fecha_limite: string;
  estado: "abierta" | "hecha"; hecha_en: string | null; creado_en: string;
};
/** Dónde va un disparador: PENDIENTE (sin análisis) → EN ANÁLISIS (tomado) → CERRADO; o DESCARTADO. */
export type Etapa = "pendiente" | "analisis" | "cerrado" | "descartado";
export const etapaDe = (d: Pick<Disparador, "estado">, tieneAnalisis: boolean): Etapa =>
  d.estado === "cerrado" ? "cerrado" : d.estado === "descartado" ? "descartado" : tieneAnalisis ? "analisis" : "pendiente";

export type Resultado = {
  id: string; indicador_id: string; fecha: string; turno_id: string | null;
  valor: number; estado: Estado; comentario: string | null; capturado_en: string;
};

export type Disparador = {
  id: string; indicador_id: string; resultado_id: string | null; fecha: string; turno_id: string | null;
  valor: number; meta: string | null; regla: string | null;
  estado: "activo" | "cerrado" | "descartado"; nota: string | null;
  creado_en: string; cerrado_en: string | null;
};

export function comparar(v: number | null, op: Op | null, ref: number | null): boolean {
  if (v == null || op == null || ref == null) return false;
  switch (op) {
    case ">": return v > ref;
    case ">=": return v >= ref;
    case "<": return v < ref;
    case "<=": return v <= ref;
    case "=": return v === ref;
  }
}

type ConReglas = Pick<Indicador, "meta_op" | "meta_valor">;

/** EL ESTADO DE UN NÚMERO: cumple la meta (verde) o no la cumple (rojo). Nada en medio. */
export function estadoDe(i: ConReglas, valor: number): Estado {
  return comparar(valor, i.meta_op, i.meta_valor) ? "verde" : "rojo";
}

const nf = (d: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: d });
export const fmt = (v: number | null | undefined, decimales = 0) => (v == null ? "—" : nf(decimales).format(v));
export const conUnidad = (v: number | null | undefined, i: Pick<Indicador, "decimales" | "unidad">) =>
  v == null ? "—" : `${fmt(v, i.decimales)}${i.unidad ? (/^%|°/.test(i.unidad) ? "" : " ") + i.unidad : ""}`;

/** «≥ 95 %» — la meta como se lee. */
export function textoMeta(i: Pick<Indicador, "meta_op" | "meta_valor" | "unidad" | "decimales">): string {
  return `${SIMBOLO[i.meta_op]} ${fmt(i.meta_valor, i.decimales)}${i.unidad ? (/^%|°/.test(i.unidad) ? "" : " ") + i.unidad : ""}`;
}
export function textoRegla(op: Op | null, valor: number | null, i: Pick<Indicador, "unidad" | "decimales">): string | null {
  if (op == null || valor == null) return null;
  return `${SIMBOLO[op]} ${fmt(valor, i.decimales)}${i.unidad ? (/^%|°/.test(i.unidad) ? "" : " ") + i.unidad : ""}`;
}

/**
 * ¿SALTA EL DISPARADOR? Se mira lo más reciente: los últimos N resultados (el más nuevo primero) tienen que ser todos
 * «no cumple». Con menos de N resultados no salta.
 */
export function dispara(i: Pick<Indicador, "disparo_activo" | "disparo_consecutivos">, recientes: Estado[]): boolean {
  if (!i.disparo_activo) return false;
  const n = Math.max(1, i.disparo_consecutivos);
  if (recientes.length < n) return false;
  return recientes.slice(0, n).every((e) => e !== "verde");
}
export function textoDisparo(i: Pick<Indicador, "disparo_consecutivos">): string {
  return i.disparo_consecutivos <= 1 ? "no cumple la meta en un resultado" : `no cumple la meta ${i.disparo_consecutivos} resultados seguidos`;
}

/* ---------- fechas (día de Bogotá, texto AAAA-MM-DD) ---------- */
export const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const ms = (f: string) => Date.parse(f + "T12:00:00Z");
export const sumarDias = (f: string, d: number) => new Date(ms(f) + d * 86400000).toISOString().slice(0, 10);
/** El primer día del periodo al que pertenece la fecha: el mismo día, el lunes de esa semana o el día 1 del mes. */
export function inicioPeriodo(fecha: string, frecuencia: Frecuencia): string {
  if (frecuencia === "dia") return fecha;
  if (frecuencia === "mes") return fecha.slice(0, 8) + "01";
  const dow = new Date(ms(fecha)).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((dow + 6) % 7));
}
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const diaCorto = (f: string) => { const d = new Date(ms(f)); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` };
export function etiquetaPeriodo(fecha: string, frecuencia: Frecuencia): string {
  if (frecuencia === "dia") return diaCorto(fecha);
  if (frecuencia === "semana") return `Semana del ${diaCorto(inicioPeriodo(fecha, "semana"))}`;
  const d = new Date(ms(fecha));
  return `${["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** El turno que corre a esta hora (HH:MM). Maneja el que cruza la medianoche (22:00 → 06:00). */
export function turnoDeLaHora(turnos: Turno[], hhmm: string): Turno | undefined {
  const activos = turnos.filter((t) => t.activo);
  return activos.find((t) => {
    const a = t.hora_ini.slice(0, 5), b = t.hora_fin.slice(0, 5);
    return a <= b ? hhmm >= a && hhmm < b : hhmm >= a || hhmm < b;
  }) ?? activos[0];
}
export const horaBogota = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

/** ¿Este indicador se captura en este turno? (el valor único y los semanales/mensuales no dependen de turno) */
export const enTurno = (i: Indicador, turnoId: string) =>
  i.captura === "turnos" && i.frecuencia === "dia" && (i.turnos.length === 0 || i.turnos.includes(turnoId));
