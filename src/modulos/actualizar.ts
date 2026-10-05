/**
 * ACTUALIZAR SIN PERDER LO QUE SE ESTÁ HACIENDO
 * ------------------------------------------------------------------
 * El botón flotante actualiza cuando la persona lo toca, siempre. La
 * actualización AUTOMÁTICA (cada minuto) es más delicada: refrescar una
 * pantalla donde alguien está digitando le puede pisar el trabajo. Por
 * eso solo corre en pantallas de CONSULTA —tableros, tránsito,
 * seguimiento…— y se salta el turno si la persona está escribiendo, hay
 * un cuadro abierto o la pestaña no se está viendo.
 */

/** Cada cuánto se actualiza sola una pantalla de consulta. */
export const CADA_MS = 60_000;

/** Pantallas donde se mira, no se digita: la última parte de la dirección. */
const CONSULTA = new Set([
  "inicio", "tablero", "analisis", "transito", "seguimiento", "informe",
  "hallazgos", "base", "mias", "todas", "verificar", "ai",
]);

export function esDeConsulta(pathname: string): boolean {
  const partes = pathname.split("/").filter(Boolean);
  if (partes.length === 0) return false;
  /* «/admin/inicio» es la portada de administración: ahí no hay nada que se actualice solo. */
  if (partes[0] === "admin") return false;
  return CONSULTA.has(partes[partes.length - 1]);
}

export type Estado = {
  pathname: string;
  /** La pestaña se está viendo. */
  visible: boolean;
  /** El cursor está en un campo de texto, lista o área editable. */
  escribiendo: boolean;
  /** Hay un cuadro de diálogo abierto. */
  dialogo: boolean;
  /** Ya hay una actualización en curso. */
  ocupado: boolean;
};

export function puedeActualizarSola(e: Estado): boolean {
  return esDeConsulta(e.pathname) && e.visible && !e.escribiendo && !e.dialogo && !e.ocupado;
}

/** «hace 5 s», «hace 2 min»: lo que dice el botón al pasar el mouse. */
export function haceCuanto(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "ahora mismo";
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`;
}
