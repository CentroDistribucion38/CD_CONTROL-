/**
 * LOS RÓTULOS DEL PLAN DE ENVASE — del plan a la tarjeta, sin llenar nada.
 *
 * El plan ya dice QUÉ se envasa, QUÉ DÍA, EN QUÉ TURNO y EN QUÉ LÍNEA, y
 * el Maestro dice cuánto lleva una estiba, cuánto dura el producto y cómo
 * se arma. Con eso la tarjeta sale entera:
 *
 *   cantidad        las cajas por estiba del Maestro (estiba completa)
 *   producción      el día del plan  ·  vence = producción + vida útil
 *   línea y hora    el TREN y el turno (T1 0 h · T2 8 h · T3 16 h)
 *   número / total  la estiba N de las planeadas de ese bloque
 *   folio           lo da la base (3617-20260821-L1-T1-012)
 *
 * UN BLOQUE = día + turno + línea + SKU. Sus estibas planeadas son las
 * ENTERAS que la tabla del plan ya muestra: lo que se imprime es lo que se
 * ve, ni una más.
 */
import { vistaSemana, type Bloque, type Factores, type Pendiente } from "./plan-envase";
import { limiteDespacho, sumarDias, type Rotulo } from "./rotulo";

export type BloquePlan = {
  fecha: string; turno: 1 | 2 | 3; tren: string; sap: string; sku: string;
  /** Estibas planeadas de este bloque (enteras, las de la tabla del plan). */
  planeadas: number;
  /** Cajas por estiba del Maestro; null si falta. */
  cajas: number | null;
  horaIni: number;
  /** Lo que impide imprimirlo bien, dicho por su nombre. */
  problema: string | null;
};

export type MaterialRotulo = {
  sku: string; nombre: string;
  unidades_por_caja: number | null; cajas_por_estiba: number | null; unidades_por_estiba: number | null;
  vida_util: number | null; dias_minimo: number;
  pat_largo: number | null; pat_ancho: number | null; pat_nivel: number | null;
};

const HORA_TURNO = [0, 8, 16];

export function bloquesDelPlan(
  s: { fecha_ini: string; pendientes: Pendiente[]; bloques: Bloque[] },
  factores: Factores,
  materiales: Map<string, MaterialRotulo>,
): BloquePlan[] {
  const v = vistaSemana(s, factores, "estibas");
  const out: BloquePlan[] = [];
  for (const f of v.skus) {
    for (const d of v.dias) {
      const t = f.porDia[d]?.t;
      if (!t) continue;
      for (let k = 0; k < 3; k++) {
        if (!(t[k] > 0)) continue;
        const bl = s.bloques.find((b) => b.fecha === d && b.turno === k + 1 && b.sap === f.sap && b.tren.toUpperCase() === f.tren);
        const m = materiales.get(f.sap);
        const problema = !m ? "El SAP no está en el Maestro"
          : !f.cpe ? "Falta el factor de estibado en el Maestro"
          : null;
        out.push({ fecha: d, turno: (k + 1) as 1 | 2 | 3, tren: f.tren, sap: f.sap, sku: f.sku, planeadas: t[k], cajas: f.cpe, horaIni: bl?.hora_ini ?? HORA_TURNO[k], problema });
      }
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.turno - b.turno || a.tren.localeCompare(b.tren, "es", { numeric: true }) || a.sku.localeCompare(b.sku, "es"));
}

/** La llave de un bloque, igual para el plan y para lo impreso. */
export const llaveBloque = (b: { fecha: string; turno: number; tren: string; sap: string }) => `${b.fecha}|${b.turno}|${b.tren.toUpperCase()}|${b.sap}`;

/** El folio de la estiba `n` de un bloque. Es el MISMO armado de la función de la base (rotulos_plan_imprimir). */
export const folioDe = (b: { sap: string; fecha: string; tren: string; turno: number }, n: number) =>
  `${b.sap}-${b.fecha.replace(/-/g, "")}-L${b.tren.toUpperCase().replace(/^TREN-?/, "")}-T${b.turno}-${String(n).padStart(3, "0")}`;

/** Una tarjeta de producción lista para pintar. `numero` y `folio` los da la base. */
export function armarRotulo(o: {
  folio: string; numero: number; planeadas: number; cajas: number; fecha: string; turno: number; tren: string; horaIni?: number;
  m: MaterialRotulo; hoy?: string;
}): Rotulo {
  const { m } = o;
  const vence = m.vida_util ? sumarDias(o.fecha, m.vida_util) : null;
  const total = Math.max(o.planeadas, o.numero);
  const hh = String(o.horaIni ?? HORA_TURNO[o.turno - 1]).padStart(2, "0");
  const patron = m.pat_largo && m.pat_ancho && m.pat_nivel ? { largo: m.pat_largo, ancho: m.pat_ancho, nivel: m.pat_nivel } : null;
  return {
    folio: o.folio, tipo: "producto", sku: m.sku, nombre: m.nombre,
    cantidad: o.cajas, unidad: "cajas", arrume: o.cajas * total, numero: o.numero, total,
    ancho: null, alto: null, largo: null, patron,
    unidadesEstiba: m.unidades_por_estiba ?? null, unidadesCaja: m.unidades_por_caja ?? null, factorEstiba: m.cajas_por_estiba ?? null, vidaUtil: m.vida_util ?? null,
    ubicacion: null,
    producido: o.fecha, vence, limite: limiteDespacho(vence, m.dias_minimo),
    linea: o.tren, hora: `T${o.turno} · ${hh}:00`,
    recibido: o.hoy ?? new Date().toISOString().slice(0, 10),
  };
}

export type ResumenBloque = { fecha: string; turno: number; tren: string; sap: string; impresos: number; adicionales: number; reimpresos: number; ultima: string | null };
export type CierreBloque = { fecha: string; turno: number; tren: string; sap: string; sobrantes: number; cerrado_en: string };
export type LoteImpreso = {
  lote: string; impreso_en: string; quien: string; fecha: string; turno: number; tren: string; sap: string;
  cantidad: number; desde: number; hasta: number; reimpresion: boolean; motivo: string | null; vigentes: number; primero: string; ultimo: string;
};
