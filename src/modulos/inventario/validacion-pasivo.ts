import { armarCuadre } from "@/modulos/inventario/cuadre";
import { leerPasivos } from "@/modulos/pasivos/datos";
import { esPendienteEnviado, tipoPendiente } from "@/modulos/pasivos/pendiente-baja";

/**
 * CASCO PARA CARNAVAL · AG18 — lista simple por SKU de lo que está FÍSICO en la fábrica y ya tiene baja en SAP (no está en el sistema):
 * el casco (+ ajustes) de Baja y Lavado · Fábrica, o sea lo que el Cuadre SAP resta a lo contado para llegar al Balance de materiales.
 * Es solo visual: no envía nada a la Base de pasivos.
 */
export type FilaCasco = { codigo: string; material: string; unidades: number; cajas: number; estibas: number | null };
export type DatosCasco = { fecha: string | null; dias: string[]; filas: FilaCasco[]; avisos: string[]; error: string | null };
export async function cascoCarnaval(pedida?: string | null): Promise<DatosCasco> {
  const c = await armarCuadre(pedida, "AG18");
  if (!c.fecha || c.error) return { fecha: c.fecha, dias: c.dias, filas: [], avisos: c.avisos, error: c.error };
  const filas: FilaCasco[] = [];
  for (const f of c.filas) {
    if (f.grupo !== "ENVASE") continue;
    const u = Math.round(-f.lavadoBaja);
    if (u <= 0) continue;
    const cajas = f.upc > 1 ? u / f.upc : u;
    filas.push({ codigo: f.codigo, material: f.material, unidades: u, cajas: Math.round(cajas), estibas: f.cpe ? Math.round((cajas / f.cpe) * 10) / 10 : null });
  }
  filas.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  return { fecha: c.fecha, dias: c.dias, filas, avisos: c.avisos, error: null };
}

/**
 * VALIDACIÓN DE PASIVO · AG18 — una hoja aparte para validar; desde aquí se ENVÍA el pendiente por baja a la Base de pasivos.
 *
 * Por cada envase de AG18, en unidades:
 *   CONTEO FÍSICO        lo contado en la fábrica (el «Conteo fábrica» del Cuadre SAP).
 *   PASIVO               lo que está en el informe de pasivo: Baja + Lavado de AG18 del día (sin lo ya enviado desde aquí).
 *   TOTAL CONTEO         el del Cuadre SAP: el Balance de materiales (conteo físico menos la dif. de Baja y Lavado · Fábrica) (+ Andina). Es lo que SAP debe tener.
 *   PENDIENTE            total conteo − pasivo.            (231.270 − 113.520 = 117.750). SE SEPARA por lo que de verdad es:
 *     · POR BAJA     conteo en BAJA (− lavado con baja del Casco) − baja de la Base
 *     · POR LAVADO   conteo en LAVADO − lavado de la Base
 *     · POR BLOQUEAR lo contado en OTROS: no está en la Base y hay que bloquearlo en SAP
 *     (los tres suman el pendiente; lo de Andina / almacén que suma el Cuadre va con baja)
 *   EXISTENCIA FINAL SAP la del Cuadre SAP AG18: lo que dice SAP + lo ya movido con el 311.
 *   VALIDA               pasivo + pendiente por baja debe dar la existencia final de SAP.
 * Lo ya enviado (PENDIENTE BAJA / LAVADO / BLOQUEAR) no cuenta como pasivo aquí: así el pendiente no cambia al enviarlo.
 */
export type EstadoValidacion = "cuadra" | "falta" | "sobra" | "sin_sap";
export type FilaValidacion = {
  codigo: string; material: string;
  conteo: number;
  /** Dif. del Balance (negativo): lo contado de más frente al Balance de materiales (Baja y Lavado · Fábrica); SAP no lo tiene en AG18. */
  lavadoCasco: number;
  /** Total conteo del Cuadre SAP (el que se compara con SAP). */
  total: number;
  baja: number; lavado: number; pasivo: number;
  /** total conteo − pasivo. Negativo = el pasivo es mayor que lo contado. */
  pendiente: number;
  /** Lo contado por estado del conteo (unidades): BAJA, LAVADO y OTROS (lo que hay que bloquear). */
  conteoBaja: number; conteoLavado: number; conteoOtros: number;
  /** El pendiente separado por su causal real: pendBaja + pendLavado + pendBloquear = pendiente. */
  pendBaja: number; pendLavado: number; pendBloquear: number;
  /** Lo ya enviado a la Base de pasivos de este material ese día, por causal. */
  enviadoBaja: number; enviadoLavado: number; enviadoBloquear: number;
  /** Total enviado (los tres). */
  enviado: number;
  upc: number;
  /** Cajas del pendiente por baja (null si no hay unidades por caja). */
  pendienteCajas: number | null;
  /** SAP + lo movido con el 311 (null si no hay ZEXI guardada). */
  existencia: number | null;
  /** existencia final − (pasivo + pendiente) = existencia final − total conteo. 0 = cuadra. */
  dif: number | null;
  estado: EstadoValidacion;
};
export type DatosValidacion = {
  fecha: string | null; dias: string[]; filas: FilaValidacion[]; hayZexi: boolean;
  /** Ya se envió algo de este día a la Base. */
  yaEnviado: boolean;
  /** El día está cargado del Excel (histórico): no se envía. */
  historico: boolean;
  avisos: string[]; error: string | null;
};

const EPS = 0.5;
const r2 = (v: number) => Math.round(v * 100) / 100;

export async function validacionPasivo(pedida?: string | null): Promise<DatosValidacion> {
  const c = await armarCuadre(pedida, "AG18");
  const vacio: DatosValidacion = { fecha: c.fecha, dias: c.dias, filas: [], hayZexi: false, yaEnviado: false, historico: false, avisos: c.avisos, error: c.error };
  if (!c.fecha || c.error || c.faltaSql) return { ...vacio, error: c.error ?? (c.faltaSql ? "Falta crear las tablas del Cuadre SAP." : null) };

  const pas = await leerPasivos(c.fecha, c.fecha);
  if (pas.error) return { ...vacio, avisos: [...c.avisos, `No pude leer Pasivos: ${pas.error}`] };

  const baja = new Map<string, number>(), lavado = new Map<string, number>();
  const enviado = { baja: new Map<string, number>(), lavado: new Map<string, number>(), bloquear: new Map<string, number>() };
  const enviadoTotal = (k: string) => (enviado.baja.get(k) ?? 0) + (enviado.lavado.get(k) ?? 0) + (enviado.bloquear.get(k) ?? 0);
  let hayEnviado = false;
  const historico = pas.data.some((f) => f.origen === "historico");
  for (const f of pas.data) {
    if (f.almacen !== "AG18") continue;
    const e = String(f.estado).toUpperCase(), k = String(f.codigo), u = Number(f.unidades) || 0;
    /* Lo que esta pantalla ya envió NO es pasivo para validar (si no, el pendiente se contaría dos veces). */
    const tp = tipoPendiente(f.causal);
    if (tp) { enviado[tp].set(k, (enviado[tp].get(k) ?? 0) + u); hayEnviado = true; continue }
    if (e === "BAJA") baja.set(k, (baja.get(k) ?? 0) + u);
    else if (e === "LAVADO") lavado.set(k, (lavado.get(k) ?? 0) + u);
  }

  const hayZexi = !!c.guardado?.zexi?.length;
  const filas: FilaValidacion[] = [];
  const vistos = new Set<string>();
  for (const f of c.filas) {
    if (f.grupo !== "ENVASE") continue;
    vistos.add(f.codigo);
    const b = baja.get(f.codigo) ?? 0, l = lavado.get(f.codigo) ?? 0, pasivo = r2(b + l);
    if (!f.conteo && !f.total && !pasivo) continue;
    /* El pendiente se saca del TOTAL CONTEO del Cuadre (ya sin el lavado con baja del Casco): así pasivo + pendiente = lo que SAP debe tener. */
    const pendiente = r2(f.total - pasivo);
    /* SEPARADO POR SU CAUSAL REAL. El lavado con baja del Casco (negativo) sale de lo contado en BAJA; lo que suma el Cuadre
       además del conteo (Andina, almacén) va con la baja. Lo contado en OTROS no está en la Base: hay que bloquearlo. */
    const ce = f.conteoEstado ?? { baja: f.conteo, lavado: 0, otros: 0 };
    const pendLavado = r2(ce.lavado - (f.difLavado ?? 0) - l), pendBloquear = r2(ce.otros);
    const pendBaja = r2(pendiente - pendLavado - pendBloquear);
    const existencia = f.sapDespues ?? f.sap;
    const dif = existencia == null ? null : r2(existencia - (pasivo + pendiente));
    filas.push({
      codigo: f.codigo, material: f.material, conteo: f.conteo, lavadoCasco: r2(f.lavadoBaja), total: r2(f.total), baja: r2(b), lavado: r2(l), pasivo, pendiente,
      conteoBaja: r2(ce.baja), conteoLavado: r2(ce.lavado), conteoOtros: r2(ce.otros), pendBaja, pendLavado, pendBloquear,
      enviadoBaja: r2(enviado.baja.get(f.codigo) ?? 0), enviadoLavado: r2(enviado.lavado.get(f.codigo) ?? 0), enviadoBloquear: r2(enviado.bloquear.get(f.codigo) ?? 0),
      enviado: r2(enviadoTotal(f.codigo)), upc: f.upc,
      pendienteCajas: f.upc > 1 ? r2(pendiente / f.upc) : null, existencia, dif,
      estado: dif == null ? "sin_sap" : Math.abs(dif) < EPS ? "cuadra" : dif < 0 ? "falta" : "sobra",
    });
  }
  /* Un pasivo de un código que el Cuadre no listó (nada contado): también se valida. */
  for (const k of new Set([...baja.keys(), ...lavado.keys()])) {
    if (vistos.has(k)) continue;
    const b = baja.get(k) ?? 0, l = lavado.get(k) ?? 0, pasivo = r2(b + l);
    if (!pasivo) continue;
    filas.push({ codigo: k, material: pas.data.find((x) => String(x.codigo) === k)?.descripcion ?? k, conteo: 0, lavadoCasco: 0, total: 0, baja: r2(b), lavado: r2(l), pasivo,
      pendiente: r2(-pasivo), conteoBaja: 0, conteoLavado: 0, conteoOtros: 0, pendBaja: r2(-b), pendLavado: r2(-l), pendBloquear: 0,
      enviadoBaja: r2(enviado.baja.get(k) ?? 0), enviadoLavado: r2(enviado.lavado.get(k) ?? 0), enviadoBloquear: r2(enviado.bloquear.get(k) ?? 0),
      enviado: r2(enviadoTotal(k)), upc: 1, pendienteCajas: null, existencia: null, dif: null, estado: "sin_sap" });
  }
  filas.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  return { fecha: c.fecha, dias: c.dias, filas, hayZexi, yaEnviado: hayEnviado, historico, avisos: c.avisos, error: null };
}

/* ============================================================================================================
 * VALIDACIÓN DE PASIVO · AG22 (Bodega 38) — lo contado en el conteo contra la Base de pasivos de AG22, SIN la rotura de línea.
 *
 *   CONTEO   lo contado en Bodega 38 (todo lo que no es FABRICA_…), por estado del conteo: BAJA, LAVADO, EXTRASUCIO y OTROS.
 *   BASE     Pasivos AG22 del día: BAJA = PRESORTING + BAJA PROYECTADA · LAVADO · EXTRASUCIO.
 *            ROTURA DE LINEA no se cuenta físicamente: se muestra aparte y NO entra a la comparación.
 *   PENDIENTE  conteo − base, por estado (positivo = se contó más de lo que dice la Base; negativo = la Base tiene más).
 *            Lo contado en OTROS no está en la Base: es lo que hay que bloquear.
 * Desde aquí se ENVÍA el pendiente (conteo − base) a la Base de AG22 con su causal real; la Base y el Cuadre lo ignoran al leer (no se cuenta doble).
 * ========================================================================================================== */
export type FilaValidacionAG22 = {
  codigo: string; material: string; upc: number;
  conteoBaja: number; conteoLavado: number; conteoExtra: number; conteoOtros: number;
  baseBaja: number; baseLavado: number; baseExtra: number;
  /** ROTURA DE LINEA de la Base: fuera de la comparación. */
  rotura: number;
  pendBaja: number; pendLavado: number; pendExtra: number; pendBloquear: number;
  estado: "cuadra" | "dif";
};
export type DatosValidacionAG22 = { fecha: string | null; dias: string[]; filas: FilaValidacionAG22[]; yaEnviado: boolean; historico: boolean; avisos: string[]; error: string | null };

export async function validacionPasivoAG22(pedida?: string | null): Promise<DatosValidacionAG22> {
  const c = await armarCuadre(pedida, "AG18");
  const vacio: DatosValidacionAG22 = { fecha: c.fecha, dias: c.dias, filas: [], yaEnviado: false, historico: false, avisos: c.avisos, error: c.error };
  if (!c.fecha || c.error || c.faltaSql) return { ...vacio, error: c.error ?? (c.faltaSql ? "Falta crear las tablas del Cuadre SAP." : null) };
  const b = await armarCuadre(c.fecha, "AG22");
  if (b.error) return { ...vacio, error: b.error };
  const pas = await leerPasivos(c.fecha, c.fecha);
  const yaEnviado = pas.data.some((f) => f.almacen === "AG22" && esPendienteEnviado(f.causal));
  const historico = pas.data.some((f) => f.origen === "historico");

  const base = new Map<string, { material: string; upc: number; partes: Record<string, number> }>();
  for (const f of b.filas) if (f.grupo === "ENVASE") base.set(f.codigo, { material: f.material, upc: f.upc, partes: f.partes ?? {} });
  const cont = new Map(c.conteoBodega.map((x) => [x.codigo, x]));
  const filas: FilaValidacionAG22[] = [];
  for (const k of new Set([...base.keys(), ...cont.keys()])) {
    const bs = base.get(k), ct = cont.get(k);
    const p = bs?.partes ?? {};
    const baseBaja = r2((p["PRESORTING"] ?? 0) + (p["BAJA PROYECTADA"] ?? 0)), baseLavado = r2(p["LAVADO"] ?? 0), baseExtra = r2(p["EXTRASUCIO"] ?? 0), rotura = r2(p["ROTURA DE LINEA"] ?? 0);
    const conteoBaja = r2(ct?.baja ?? 0), conteoLavado = r2(ct?.lavado ?? 0), conteoExtra = r2(ct?.extrasucio ?? 0), conteoOtros = r2(ct?.otros ?? 0);
    if (![conteoBaja, conteoLavado, conteoExtra, conteoOtros, baseBaja, baseLavado, baseExtra, rotura].some((v) => Math.abs(v) > 0.005)) continue;
    const pendBaja = r2(conteoBaja - baseBaja), pendLavado = r2(conteoLavado - baseLavado), pendExtra = r2(conteoExtra - baseExtra), pendBloquear = conteoOtros;
    filas.push({
      codigo: k, material: bs?.material ?? ct?.material ?? k, upc: bs?.upc ?? 1,
      conteoBaja, conteoLavado, conteoExtra, conteoOtros, baseBaja, baseLavado, baseExtra, rotura,
      pendBaja, pendLavado, pendExtra, pendBloquear,
      estado: [pendBaja, pendLavado, pendExtra, pendBloquear].every((v) => Math.abs(v) < EPS) ? "cuadra" : "dif",
    });
  }
  filas.sort((a, z) => a.codigo.localeCompare(z.codigo, "es", { numeric: true }));
  return { fecha: c.fecha, dias: c.dias, filas, yaEnviado, historico, avisos: [...c.avisos, ...b.avisos.filter((a) => !c.avisos.includes(a))], error: null };
}
