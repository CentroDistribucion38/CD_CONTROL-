/**
 * 5S — LO COMÚN (servidor y pantalla): las cinco S, los tipos y la cuenta del cumplimiento.
 *
 * La cuenta es la misma que hace la base en s5_guardar: el peso de lo que cumple sobre el peso de lo evaluado
 * (lo que no es N/A). Aquí se repite solo para mostrarla EN VIVO mientras se inspecciona; la que queda es la de la base.
 */

export type ClaveS = "clasificar" | "ordenar" | "limpiar" | "estandarizar" | "disciplina";

/** LAS CINCO S, en su orden. El número es el que se dice en planta («la 3S»); el japonés va pequeño. */
export const LAS_S: { clave: ClaveS; n: number; nombre: string; jp: string; que: string }[] = [
  { clave: "clasificar", n: 1, nombre: "Clasificar", jp: "Seiri", que: "Solo lo que se usa" },
  { clave: "ordenar", n: 2, nombre: "Ordenar", jp: "Seiton", que: "Un lugar para cada cosa" },
  { clave: "limpiar", n: 3, nombre: "Limpiar", jp: "Seiso", que: "Limpio y sin fuentes de suciedad" },
  { clave: "estandarizar", n: 4, nombre: "Estandarizar", jp: "Seiketsu", que: "Lo visual y lo acordado, al día" },
  { clave: "disciplina", n: 5, nombre: "Disciplina", jp: "Shitsuke", que: "Que se sostenga" },
];
export const NOMBRE_S = Object.fromEntries(LAS_S.map((s) => [s.clave, s])) as Record<ClaveS, (typeof LAS_S)[number]>;

export type Resultado = "cumple" | "no_cumple" | "na";
export type Severidad = "baja" | "media" | "alta";
export const SEVERIDADES: { v: Severidad; t: string }[] = [
  { v: "baja", t: "Baja" }, { v: "media", t: "Media" }, { v: "alta", t: "Alta" },
];

export type Responsable5S = { id: string; nombre: string; cedula: string | null; cargo: string | null; activo: boolean };
export type Area5S = { id: string; nombre: string; descripcion: string | null; responsable_id: string | null; meta: number | null; activa: boolean; orden: number };
export type Punto5S = { id: string; area_id: string | null; s: ClaveS; pregunta: string; peso: number; exige_foto: boolean; orden: number; activo: boolean };

export type Inspeccion5S = {
  id: string; fecha: string; area_id: string | null; area: string; responsable: string | null;
  auditor_nombre: string | null; cumplimiento: number; meta: number; evaluados: number; no_cumple: number;
  nota: string | null; creado: string; por_s: Partial<Record<ClaveS, number | null>>; fotos: number;
};
export type ItemInspeccion = {
  id: string; orden: number; s: ClaveS; pregunta: string; peso: number; resultado: Resultado;
  severidad: Severidad | null; observacion: string | null;
};

/** Los puntos que se le preguntan a un área: los generales (sin área) y los suyos, activos, por S y por orden. */
export function checklistDe(puntos: Punto5S[], areaId: string | null): Punto5S[] {
  const iS = (s: ClaveS) => LAS_S.findIndex((x) => x.clave === s);
  return puntos
    .filter((p) => p.activo && (p.area_id === null || p.area_id === areaId))
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
