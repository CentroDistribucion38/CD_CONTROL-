import { turnoYDia } from "./cierre";

/**
 * LA PANTALLA DE SEGURIDAD — la lógica que no es de pintar.
 *
 * NO CALCULA LA RECURRENCIA NI EL NÚMERO DE EVENTO: los calcula la base (`v_plan_eventos`; ver
 * `2026-11-plan-reaccion-rotura.sql`). Aquí solo se agrupa lo que la base ya dijo, y se escribe el
 * diagrama «PLAN DE REACCIÓN ROTURA» tal cual, para dibujarlo y para decir qué le toca a cada caso.
 */
export type TipoEv = "comportamiento" | "condicion" | "externa" | "sin_clasificar";
export type Sev = "leve" | "intermedia" | "grave";

export type EventoV = {
  rotura_id: string; codigo: string; reportada_en: string; mes: string; estado: string; cajas: number;
  causa: string | null; causa_nombre: string | null; tipo: TipoEv; subtipo: string | null; area: string | null;
  severidad: Sev; responsable_id: string | null; responsable: string | null; empresa: string | null;
  reportante: string | null; autorreporte: boolean; cuenta_persona: boolean;
  n_mes: number | null; recurrente_mes_a_mes: boolean; reincidio_en_ventana: boolean; clave_condicion: string | null;
};
export type AccionV = {
  id: string; rotura_id: string; codigo: string; responsable_id: string | null; responsable: string | null;
  accion: string; accion_nombre: string; origen_regla: string | null; vence_en: string;
  estado: "pendiente" | "hecha" | "no_aplica"; vencida: boolean; hecha_tarde: boolean; hecha_en: string | null; nota: string | null;
};
export type PersonaV = {
  id: string; nombre: string; empresa: string | null; turno: string | null; activo: boolean;
  eventos_total: number; eventos_mes: number; meses_con_evento: number; ultimo_evento: string | null;
  recurrente_mes_a_mes: boolean; reportes: number; acciones_pendientes: number; acciones_vencidas: number;
};
export type Colaborador = { id: string; nombre: string; empresa: string | null; turno: string | null };
export type ReglaV = { leve_max: number; grave_min: number; verificacion_dias: number };

/** LA ESCALERA DEL DIAGRAMA, por número de evento de la persona en el mes y gravedad de ESE evento. */
export const ESCALERA: Record<1 | 2 | 3 | 4, { nom: string; criterio?: string; leve: string; grave: string }> = {
  1: { nom: "Primer evento",
       leve: "Se realiza abordaje al colaborador (trazabilidad)",
       grave: "Se realiza reentrenamiento en escuela FLT + evaluación teórica y práctica" },
  2: { nom: "Segundo evento",
       leve: "Se realiza llamado de atención e ingresa a reentrenamiento FLT",
       grave: "Se aplica gestión de consecuencias · Suspensión 5 días" },
  3: { nom: "Tercer evento",
       leve: "Se aplica gestión de consecuencias · Suspensión 3 días",
       grave: "Comité Safety Compliance" },
  4: { nom: "Recurrentes por evento rotura", criterio: "Cuarta falta leve / Recurrente mes a mes",
       leve: "Comité Safety Compliance", grave: "Comité Safety Compliance" },
};

/** LAS RAMAS DE CONDICIÓN: no se le carga a la persona; se corrige el sitio o el equipo. */
export const CONDICIONES: { id: string; nom: string; claves: string[]; texto: string }[] = [
  { id: "equipo_flt", nom: "Equipo FLT", claves: ["equipo_flt"], texto: "Verificar condiciones en el preoperacional y llevar a taller" },
  { id: "vehiculo", nom: "Vehículo en atención", claves: ["vehiculo"], texto: "Verificar BPM y mínimos vitales de vehículo" },
  { id: "locativo", nom: "Locativo", claves: ["locativo"], texto: "Validar condición, reportar al dueño de territorio y llevar a la matriz de condiciones" },
  { id: "estiba", nom: "Estiba en mal estado", claves: ["estiba_transporte", "estiba_zona_cd"],
    texto: "Transporte: revisar el origen de las estibas y notificar a transporte. Zona de almacenamiento CD: validar el tiempo de permanencia de los lotes" },
];

/** LO QUE PIDE LA GRAVEDAD, además de la escalera de la persona. */
export const PIDE_GRAVEDAD: Record<Sev, string | null> = {
  leve: null,
  intermedia: "Guardián · 5 porqués · se clasifica como ISL",
  grave: "ISL SIF precursor + análisis del evento",
};

export const SEV_TXT: Record<Sev, string> = { leve: "Leve", intermedia: "Intermedia", grave: "Grave" };
export const TIPO_TXT: Record<TipoEv, string> = { comportamiento: "Comportamiento", condicion: "Condición", externa: "Externa", sin_clasificar: "Sin clasificar" };
export const colSev = (s: Sev): "leve" | "grave" => (s === "grave" ? "grave" : "leve");
export const nivelDe = (n: number): 1 | 2 | 3 | 4 => (Math.min(Math.max(n, 1), 4) as 1 | 2 | 3 | 4);

export const mesClave = (e: { mes: string }) => e.mes.slice(0, 7);
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const mesNombre = (k: string) => MESES[Number(k.slice(5, 7)) - 1] ?? k;
export const mesCorto = (k: string) => mesNombre(k).slice(0, 3);
export const turnoDe = (e: { reportada_en: string }) => turnoYDia(e.reportada_en).turno;

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", ...o });
export const dm = (iso: string) => fmt(iso, { day: "2-digit", month: "2-digit" });
export const dmh = (iso: string) => fmt(iso, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

/** Qué le toca a UN evento, en una frase (la columna «Reacción»). */
export function reaccionEvento(e: EventoV): string {
  if (e.tipo === "externa") return "Falla ajena: no se le carga a nadie";
  if (e.tipo === "condicion") {
    const c = CONDICIONES.find((x) => e.clave_condicion && x.claves.includes(e.clave_condicion));
    return c ? `${c.nom}: ${c.texto.split(". ")[0]}` : "Corregir la condición del sitio o equipo";
  }
  if (e.tipo === "sin_clasificar") return "Clasificar la causa";
  if (!e.responsable_id) return "Asignar responsable para que cuente a una persona";
  if (e.recurrente_mes_a_mes) return ESCALERA[4].leve;
  const n = nivelDe(e.n_mes ?? 1);
  return ESCALERA[n][colSev(e.severidad)];
}

export type EstadoPersona = {
  id: string; nombre: string; empresa: string | null;
  n: number; nivel: 1 | 2 | 3 | 4; recurrente: boolean; antes: boolean;
  ultimo: EventoV; reaccion: string; eventos: EventoV[]; cajas: number;
};

/** Cada persona con eventos de comportamiento en el mes, en qué peldaño está y qué le toca. */
export function estadoPersonas(delMes: EventoV[]): EstadoPersona[] {
  const m = new Map<string, EventoV[]>();
  for (const e of delMes) {
    if (e.estado === "anulada" || !e.cuenta_persona || !e.responsable_id) continue;
    const l = m.get(e.responsable_id); if (l) l.push(e); else m.set(e.responsable_id, [e]);
  }
  const out: EstadoPersona[] = [];
  for (const [id, evs] of m) {
    evs.sort((a, b) => a.reportada_en.localeCompare(b.reportada_en));
    const ultimo = evs[evs.length - 1];
    const recurrente = evs.some((e) => e.recurrente_mes_a_mes);
    const n = evs.length;
    const nivel: 1 | 2 | 3 | 4 = recurrente || n >= 4 ? 4 : nivelDe(n);
    out.push({
      id, nombre: ultimo.responsable ?? "—", empresa: ultimo.empresa, n, nivel, recurrente, antes: recurrente,
      ultimo, eventos: evs, cajas: evs.reduce((s, e) => s + e.cajas, 0),
      reaccion: ESCALERA[nivel][colSev(ultimo.severidad)],
    });
  }
  return out.sort((a, b) => b.nivel - a.nivel || b.n - a.n || a.nombre.localeCompare(b.nombre));
}

export type Dim = "causa" | "persona" | "area" | "turno" | "tipo";
export type Med = "eventos" | "cajas";
export const DIMS: { id: Dim; txt: string }[] = [
  { id: "causa", txt: "Causa" }, { id: "persona", txt: "Persona" }, { id: "area", txt: "Área" },
  { id: "turno", txt: "Turno" }, { id: "tipo", txt: "Tipo" },
];
export const claveDim = (e: EventoV, d: Dim): string => {
  switch (d) {
    case "causa": return e.causa_nombre ?? e.causa ?? "Sin causa";
    case "persona": return e.tipo === "comportamiento" ? (e.responsable ?? "Sin responsable") : "No es de persona";
    case "area": return e.area || "Sin área";
    case "turno": return "Turno " + turnoDe(e);
    case "tipo": return TIPO_TXT[e.tipo];
  }
};
export const medidaDe = (e: EventoV, m: Med) => (m === "eventos" ? 1 : e.cajas);

export type Barra = { k: string; v: number; ac: number; dom: TipoEv; otros?: boolean };
export function pareto(evs: EventoV[], d: Dim, m: Med, maxBarras = 8): { barras: Barra[]; total: number } {
  const acc = new Map<string, { v: number; tipo: Map<TipoEv, number> }>();
  for (const e of evs) {
    const k = claveDim(e, d); const x = acc.get(k) ?? { v: 0, tipo: new Map() };
    const v = medidaDe(e, m); x.v += v; x.tipo.set(e.tipo, (x.tipo.get(e.tipo) ?? 0) + v); acc.set(k, x);
  }
  const arr = [...acc.entries()].map(([k, x]) => ({ k, v: x.v, dom: [...x.tipo.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.v - a.v || a.k.localeCompare(b.k));
  const total = arr.reduce((s, x) => s + x.v, 0);
  let top = arr.slice(0, maxBarras);
  const resto = arr.slice(maxBarras);
  if (resto.length) top = [...top, { k: `Otros (${resto.length})`, v: resto.reduce((s, x) => s + x.v, 0), dom: "externa" as TipoEv }];
  let run = 0;
  const barras: Barra[] = top.map((x, i) => { run += x.v; return { ...x, ac: total ? run / total : 0, otros: !!resto.length && i === top.length - 1 } });
  return { barras, total };
}
