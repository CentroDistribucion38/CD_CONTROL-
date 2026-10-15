/**
 * AVERÍAS · ACCIONES DEL CONTEO — las cuentas, sin base ni pantalla.
 *
 * Cada novedad del conteo guardado (avería, PNC, módulo mezclado, módulo sin acceso) es UNA acción.
 * La base la entrega renglón por foto (`averias_acciones_conteo`); aquí se junta en una sola acción
 * con todas sus fotos y se le pega lo que ya se hizo con ella (`averias_acciones`). Sin registro = Abierta.
 */
import type { Novedad, TipoNovedad } from "@/modulos/inventario/evidencias";

export type EstadoAccion = "abierta" | "en_gestion" | "cerrada";

export const ESTADOS: { k: EstadoAccion; nombre: string }[] = [
  { k: "abierta", nombre: "Abierta" },
  { k: "en_gestion", nombre: "En gestión" },
  { k: "cerrada", nombre: "Cerrada" },
];

/** «Qué se hizo» al cerrar. `doc` = exige N° de documento; `coment` = exige comentario. */
export const CIERRES: { k: string; nombre: string; doc?: boolean; coment?: boolean }[] = [
  { k: "baja_documento", nombre: "Dada de baja con documento", doc: true },
  { k: "reacomodada", nombre: "Reacomodada / reubicada" },
  { k: "no_procede", nombre: "No procede / error de conteo", coment: true },
];
export const CIERRE = Object.fromEntries(CIERRES.map((c) => [c.k, c])) as Record<string, (typeof CIERRES)[number]>;

/** Lo que se guarda de cada acción (tabla `averias_acciones`). */
export type RegistroAccion = {
  clave: string; tipo: TipoNovedad; conteo_id: string | null; linea_id: string | null; ubicacion_id: string | null;
  estado: EstadoAccion; que_se_hizo: string | null; documento: string | null; comentario: string | null;
  gestion_por: string | null; gestion_en: string | null; cerrada_por: string | null; cerrada_en: string | null;
  actualizado_en: string | null;
};

export type Accion = Omit<Novedad, "ruta"> & {
  clave: string;
  rutas: string[];
  estado: EstadoAccion;
  reg: RegistroAccion | null;
};

/** La llave de una acción: el renglón contado, o (las de módulo) el conteo y la ubicación. */
export function claveDe(n: Pick<Novedad, "tipo" | "linea_id" | "conteo_id" | "ubicacion_id">): string {
  return n.linea_id ? `${n.tipo}:${n.linea_id}` : `${n.tipo}:${n.conteo_id}:${n.ubicacion_id ?? "-"}`;
}

export function armarAcciones(novs: Novedad[], regs: RegistroAccion[]): Accion[] {
  const r = new Map(regs.map((x) => [x.clave, x]));
  const m = new Map<string, Accion>();
  for (const n of novs) {
    const clave = claveDe(n);
    const ya = m.get(clave);
    if (ya) { if (n.ruta && !ya.rutas.includes(n.ruta)) ya.rutas.push(n.ruta); continue }
    const { ruta, ...resto } = n;
    const reg = r.get(clave) ?? null;
    m.set(clave, { ...resto, clave, rutas: ruta ? [ruta] : [], reg, estado: reg?.estado ?? "abierta" });
  }
  /* Lo abierto primero, y dentro de cada estado lo más viejo arriba (es lo que hay que cerrar ya). */
  const peso: Record<EstadoAccion, number> = { abierta: 0, en_gestion: 1, cerrada: 2 };
  return [...m.values()].sort((a, b) =>
    peso[a.estado] - peso[b.estado] ||
    (a.estado === "cerrada"
      ? String(b.reg?.cerrada_en ?? "").localeCompare(String(a.reg?.cerrada_en ?? ""))
      : String(a.hora).localeCompare(String(b.hora))));
}

/** Días enteros entre una fecha-hora y ahora. */
export function diasDesde(iso: string | null | undefined, ahora = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 86400000));
}

export function resumen(xs: Accion[], ahora = Date.now()) {
  const ab = xs.filter((a) => a.estado === "abierta");
  const ge = xs.filter((a) => a.estado === "en_gestion");
  const ce = xs.filter((a) => a.estado === "cerrada");
  const pend = [...ab, ...ge];
  const vieja = pend.reduce((m, a) => Math.max(m, diasDesde(a.hora, ahora)), 0);
  return { abiertas: ab.length, gestion: ge.length, cerradas: ce.length, vieja, hayPend: pend.length > 0 };
}
