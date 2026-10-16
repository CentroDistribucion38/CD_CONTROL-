/**
 * PENDIENTE POR BAJA que se envía desde la Validación de pasivo (AG18) a la Base de pasivos.
 * Va como BAJA · «PENDIENTE BAJA» · AG18, origen «manual», para que el Informe de pasivos lo tome en AG18.
 * El Cuadre SAP y la propia Validación lo IGNORAN al leer la Base (si no, se contaría doble: ya sale de conteo − pasivo).
 */
export const ESTADO_PENDIENTE_BAJA = "BAJA";
export const CAUSAL_PENDIENTE_BAJA = "PENDIENTE BAJA";
export const ALMACEN_PENDIENTE_BAJA = "AG18";
export const NOTA_PENDIENTE_BAJA = "Enviado desde Validación de pasivo";

/** ¿Este renglón de la Base es un pendiente por baja enviado desde la Validación? */
export const esPendienteBaja = (causal: unknown) => String(causal ?? "").trim().toUpperCase() === CAUSAL_PENDIENTE_BAJA;

/**
 * EL PENDIENTE, CON SU CAUSAL REAL (Validación de pasivo · AG18). El pendiente (total conteo − pasivo) se separa por lo que de verdad es:
 *   · BAJA  · PENDIENTE BAJA       lo contado en BAJA que no está en la Base (conteo baja − lavado con baja del Casco − baja de la Base)
 *   · LAVADO· PENDIENTE LAVADO     lo contado en LAVADO que no está en la Base
 *   · BAJA  · PENDIENTE BLOQUEAR   lo contado en OTROS (u otro estado): hay que bloquearlo en SAP
 * Los tres van como «manual», AG18, y el Cuadre SAP y la Validación los IGNORAN al leer la Base (ya salen de conteo − pasivo).
 */
export const CAUSAL_PENDIENTE_LAVADO = "PENDIENTE LAVADO";
export const ESTADO_PENDIENTE_LAVADO = "LAVADO";
export const CAUSAL_PENDIENTE_BLOQUEAR = "PENDIENTE BLOQUEAR";
export const ESTADO_PENDIENTE_BLOQUEAR = "BAJA";
/** Solo AG22 (Bodega 38): el extrasucio contado que no está en la Base. Va como LAVADO · «PENDIENTE EXTRASUCIO» (igual que el EXTRASUCIO, que se guarda con estado LAVADO). */
export const CAUSAL_PENDIENTE_EXTRASUCIO = "PENDIENTE EXTRASUCIO";
export const ESTADO_PENDIENTE_EXTRASUCIO = "LAVADO";
export const ALMACEN_PENDIENTE_AG22 = "AG22";
const CAUSALES_ENVIADAS = [CAUSAL_PENDIENTE_BAJA, CAUSAL_PENDIENTE_LAVADO, CAUSAL_PENDIENTE_BLOQUEAR, CAUSAL_PENDIENTE_EXTRASUCIO];
/** ¿Este renglón de la Base lo envió la Validación (cualquiera de los tres pendientes)? */
export const esPendienteEnviado = (causal: unknown) => CAUSALES_ENVIADAS.includes(String(causal ?? "").trim().toUpperCase());
/** De cuál de los tres es. */
export const tipoPendiente = (causal: unknown): "baja" | "lavado" | "bloquear" | null => {
  const c = String(causal ?? "").trim().toUpperCase();
  return c === CAUSAL_PENDIENTE_BAJA ? "baja" : c === CAUSAL_PENDIENTE_LAVADO ? "lavado" : c === CAUSAL_PENDIENTE_BLOQUEAR ? "bloquear" : null;
};
export const CAUSALES_PENDIENTES = CAUSALES_ENVIADAS;
