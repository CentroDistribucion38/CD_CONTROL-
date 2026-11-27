/**
 * 5S — LO COMÚN (servidor y pantalla): las cinco S, los tipos y la cuenta del cumplimiento.
 *
 * La cuenta es la misma que hace la base en s5_guardar: el peso de lo que cumple sobre el peso de lo evaluado
 * (lo que no es N/A). Aquí se repite solo para mostrarla EN VIVO mientras se inspecciona; la que queda es la de la base.
 */

/** La clave de una SECCIÓN del checklist. En 5S son las cinco S; otros formatos (PTL…) traen las suyas (2026-11-cinco-s-6). */
export type ClaveS = string;

/** LAS CINCO S, en su orden. El número es el que se dice en planta («la 3S»); el japonés va pequeño. */
export const LAS_S: { clave: ClaveS; n: number; nombre: string; jp: string; que: string }[] = [
  { clave: "clasificar", n: 1, nombre: "Clasificar", jp: "Seiri", que: "Solo lo que se usa" },
  { clave: "ordenar", n: 2, nombre: "Ordenar", jp: "Seiton", que: "Un lugar para cada cosa" },
  { clave: "limpiar", n: 3, nombre: "Limpiar", jp: "Seiso", que: "Limpio y sin fuentes de suciedad" },
  { clave: "estandarizar", n: 4, nombre: "Estandarizar", jp: "Seiketsu", que: "Lo visual y lo acordado, al día" },
  { clave: "disciplina", n: 5, nombre: "Disciplina", jp: "Shitsuke", que: "Que se sostenga" },
];
export const NOMBRE_S = Object.fromEntries(LAS_S.map((s) => [s.clave, s])) as Record<string, (typeof LAS_S)[number]>;

/* ---------- FORMATOS: qué se evalúa (5S, PTL…) y sus secciones ---------- */
export type Seccion5S = { clave: string; nombre: string; corto: string; que: string | null; jp: string | null; orden: number };
export type Formato5S = { id: string; clave: string; nombre: string; descripcion: string | null; meta: number | null; activo: boolean; orden: number; secciones: Seccion5S[] };

/** El formato 5S de siempre, para cuando el SQL de formatos aún no se ha corrido (id vacío = «el de 5S»). */
export const FORMATO_5S: Formato5S = {
  id: "", clave: "5s", nombre: "5S · Orden y aseo", descripcion: null, meta: null, activo: true, orden: 1,
  secciones: LAS_S.map((s) => ({ clave: s.clave, nombre: s.nombre, corto: `${s.n}S`, que: s.que, jp: s.jp, orden: s.n })),
};

/** Todas las secciones de todos los formatos por su clave (la clave es única en toda la base). */
export function mapaSecciones(formatos: Formato5S[]): Map<string, Seccion5S> {
  const m = new Map<string, Seccion5S>(FORMATO_5S.secciones.map((x) => [x.clave, x]));
  for (const f of formatos) for (const x of f.secciones) m.set(x.clave, x);
  return m;
}
/** La ficha corta de una sección («1S», «UBI»); si no se conoce, la clave. */
export const cortoDe = (m: Map<string, Seccion5S>, clave: string) => m.get(clave)?.corto ?? clave;
/** El formato de una inspección o de un punto; sin formato = 5S. */
export function formatoDe(formatos: Formato5S[], id: string | null | undefined): Formato5S {
  return formatos.find((f) => f.id === id) ?? formatos.find((f) => f.clave === "5s") ?? FORMATO_5S;
}

export type Resultado = "cumple" | "no_cumple" | "na";
export type Severidad = "baja" | "media" | "alta";
export const SEVERIDADES: { v: Severidad; t: string }[] = [
  { v: "baja", t: "Baja" }, { v: "media", t: "Media" }, { v: "alta", t: "Alta" },
];

/** Un usuario activo de CONTROL: también se puede escoger como responsable o auditor en la inspección. */
export type UsuarioApp = { id: string; nombre: string; cargo?: string | null };
export type Responsable5S = { id: string; nombre: string; cedula: string | null; cargo: string | null; activo: boolean };
export type Area5S = { id: string; nombre: string; descripcion: string | null; responsable_id: string | null; meta: number | null; activa: boolean; orden: number };
export type Zona5S = { id: string; area_id: string; nombre: string; activa: boolean; orden: number };
export type EstadoProg = "programada" | "en_curso" | "hecha" | "vencida" | "cancelada";
export type Prioridad = "baja" | "media" | "alta";
/** Una auditoría programada. El estado lo calcula la base: «hecha» = hay una inspección del área en esas fechas. */
export type Programada5S = {
  id: string; area_id: string; area: string; auditor_id: string | null; auditor: string | null; actividad: string;
  desde: string; hasta: string; prioridad: Prioridad; nota: string | null; cancelada: boolean; estado: EstadoProg;
  inspeccion_id: string | null; hecha_el: string | null; cumplimiento: number | null; meta: number | null;
};
export const ESTADOS: Record<EstadoProg, string> = {
  programada: "Programada", en_curso: "En curso", hecha: "Hecha", vencida: "Vencida", cancelada: "Cancelada",
};
export type Punto5S = { id: string; formato_id: string; area_id: string | null; s: ClaveS; pregunta: string; peso: number; exige_foto: boolean; orden: number; activo: boolean };

export type Inspeccion5S = {
  id: string; fecha: string; area_id: string | null; area: string; responsable: string | null;
  formato_id?: string | null; formato?: string | null;
  /* El cargo de quien se escogió ese día (paso 10; antes de su SQL no viene). */
  responsable_cargo?: string | null; auditor_cargo?: string | null;
  auditor_nombre: string | null; cumplimiento: number; meta: number; evaluados: number; no_cumple: number;
  nota: string | null; creado: string; por_s: Partial<Record<ClaveS, number | null>>; fotos: number;
  /* Quién firma el informe (paso 3; antes de su SQL no vienen). */
  firma_ol_id?: string | null; firma_ol?: string | null; firma_abi_id?: string | null; firma_abi?: string | null;
};
export type ItemInspeccion = {
  id: string; orden: number; s: ClaveS; pregunta: string; peso: number; resultado: Resultado;
  severidad: Severidad | null; observacion: string | null; zona: string | null;
  /* El plan de acción del hallazgo (paso 3). */
  accion?: string | null; accion_resp?: string | null; accion_fecha?: string | null;
  cerrada_el?: string | null; cerrada_por?: string | null; cierre_nota?: string | null;
};

/** Un «no cumple» con su plan y su estado calculado en la base (v_s5_hallazgos). */
export type EstadoHallazgo = "vencida" | "sin_plan" | "abierta" | "cerrada";
export const ESTADOS_H: Record<EstadoHallazgo, string> = { vencida: "Vencido", sin_plan: "Sin plan", abierta: "En curso", cerrada: "Cerrado" };
export type Hallazgo5S = {
  id: string; inspeccion_id: string; fecha: string; area_id: string | null; area: string; area_responsable: string | null;
  orden: number; s: ClaveS; pregunta: string; severidad: Severidad | null; observacion: string | null; zona: string | null;
  accion: string | null; accion_resp_id: string | null; accion_resp: string | null; accion_fecha: string | null;
  cerrada_el: string | null; cerrada_por: string | null; cierre_nota: string | null;
  estado: EstadoHallazgo; dias: number; fotos_antes: number; fotos_despues: number;
  formato_id?: string | null; formato?: string | null;
};

/** Los puntos que se le preguntan a un área en un formato: los generales (sin área) y los suyos, activos, por sección y orden. */
export function checklistDe(puntos: Punto5S[], areaId: string | null, formato: Formato5S = FORMATO_5S): Punto5S[] {
  const iS = (s: ClaveS) => { const i = formato.secciones.findIndex((x) => x.clave === s); return i < 0 ? 99 : i };
  return puntos
    .filter((p) => p.activo && (p.area_id === null || p.area_id === areaId) && (!formato.id || !p.formato_id || p.formato_id === formato.id))
    .sort((a, b) => iS(a.s) - iS(b.s) || a.orden - b.orden || a.pregunta.localeCompare(b.pregunta));
}

/** El cumplimiento ponderado: lo que cumple sobre lo evaluado. null = no hay nada evaluado todavía. */
export function cumplimiento(items: { peso: number; resultado: Resultado | null }[]): number | null {
  let ev = 0, ok = 0;
  for (const i of items) {
    if (!i.resultado || i.resultado === "na") continue;
    ev += i.peso; if (i.resultado === "cumple") ok += i.peso;
  }
  return ev > 0 ? Math.round((1000 * ok) / ev) / 10 : null;
}

export const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(v)} %`;

/** La semana ISO, como se dice en el CD: «S47». */
export function semanaIso(fecha: string): number {
  const d = new Date(fecha + "T12:00:00Z");
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primero = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - primero.getTime()) / 86400000 - 3 + ((primero.getUTCDay() + 6) % 7)) / 7);
}

/** «mar 18 nov 2026» */
export const fechaLarga = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(/\./g, "");

export const hoyCo = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
