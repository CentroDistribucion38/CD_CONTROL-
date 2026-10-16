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
