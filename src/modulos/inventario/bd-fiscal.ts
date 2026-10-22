/**
 * LA BD DEL FISCAL (pura, sin leer la base).
 *
 * Junta lo que contó cada persona de una hoja (renglón por renglón, con quién, la hora y la foto) con el cruce y las
 * revisiones del fiscal, y lo agrupa por MÓDULO y por CÓDIGO de material para leerlo lado a lado: operador a la izquierda,
 * Bavaria a la derecha. El estado de un módulo sale de lo que pasó con él:
 *   contando · coincide · compensado · difiere · en validación · respondieron (decide el fiscal) · aprobado.
 * Se compara por módulo y código (sin lado, sin vencimiento): igual que el cruce.
 */
import { compensarCruce, type FilaCruce } from "./fiscal-cruce";

/** Un renglón tal cual lo devuelve `inv_fiscal_bd_hoja`. */
export type RenglonBdBD = {
  id: string; equipo: string; persona: string | null; contado_en: string | null; ubicacion_id: string; ubicacion: string; modulo: string;
  sku: string; material: string; venc_dia: number | null; venc_mes: number | null; venc_anio: number | null;
  estibas: number | string | null; saldo: number | string | null; cajas: number | string | null; cajas_por_estiba: number | string | null;
  total_cajas: number | string | null; estado_envase: string | null; averia: boolean | null; pnc: boolean | null; nota: string | null;
  ruta: string | null; en_base: boolean | null;
};
export type RenglonBd = {
  id: string; equipo: "OL" | "BAVARIA"; persona: string; contadoEn: string | null; ubicacionId: string; ubicacion: string; modulo: string;
  sku: string; material: string; vencDia: number | null; vencMes: number | null; vencAnio: number | null;
  estibas: number; saldo: number; cajas: number; cajasPorEstiba: number; total: number;
  estadoEnvase: string | null; averia: boolean; pnc: boolean; nota: string | null; ruta: string | null; enBase: boolean;
};
const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 };
export function renglonDesdeBD(r: RenglonBdBD): RenglonBd {
  return {
    id: r.id, equipo: r.equipo === "BAVARIA" ? "BAVARIA" : "OL", persona: r.persona || "—", contadoEn: r.contado_en, ubicacionId: r.ubicacion_id,
    ubicacion: r.ubicacion, modulo: r.modulo, sku: r.sku, material: r.material, vencDia: r.venc_dia, vencMes: r.venc_mes, vencAnio: r.venc_anio,
    estibas: n(r.estibas), saldo: n(r.saldo), cajas: n(r.cajas), cajasPorEstiba: n(r.cajas_por_estiba), total: n(r.total_cajas),
    estadoEnvase: r.estado_envase ?? null, averia: !!r.averia, pnc: !!r.pnc, nota: r.nota?.trim() ? r.nota.trim() : null, ruta: r.ruta ?? null, enBase: !!r.en_base,
  };
}

export type EstadoMod = "contando" | "coincide" | "compensado" | "difiere" | "validando" | "respondida" | "aprobado";
export const TEXTO_MOD: Record<EstadoMod, string> = {
  contando: "Contando", coincide: "Coincide", compensado: "Compensado", difiere: "Difiere",
  validando: "En validación", respondida: "Respondieron · decide el fiscal", aprobado: "Aprobado",
};
/** Lo mínimo de una revisión que esta lógica necesita (RevisionBD lo cumple). */
export type RevMin = { numero: number; ubicacion: string; estado: "A_VALIDAR" | "APROBADA"; ol_envio: boolean; bavaria_envio: boolean; ronda: number; adoptado?: "OL" | "BAVARIA" | null; compensado?: boolean };

export type SkuMod = {
  sku: string; material: string; ol: RenglonBd[]; bav: RenglonBd[]; sumOl: number; sumBav: number; dif: number; compensado: boolean;
  /** Solo lo anotó una de las dos personas. */
  solo: "OL" | "BAVARIA" | null;
};
export type Modulo = {
  clave: string; ubicacionId: string | null; skus: SkuMod[]; sumOl: number; sumBav: number; dif: number;
  estado: EstadoMod; aprobadoCon: "OL" | "BAVARIA" | null; compensadoAlAprobar: boolean; ronda: number;
};

const orden = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
export const moduloDeClave = (clave: string) => clave.replace(/_(IZQ|DER)$/i, "");

/**
 * Agrupa por módulo y código.
 * @param filas      el cruce de la hoja (para saber qué se compensa); null = la hoja aún no se cruza
 * @param compensando el fiscal pulsó «Compensar» en esta hoja
 */
export function armarModulos(raw: RenglonBd[], filas: FilaCruce[] | null, revs: RevMin[], numero: number, compensando: boolean): Modulo[] {
  const comp = new Set<string>();
  if (compensando && filas) for (const f of compensarCruce(filas).filas) if (f.compensada) comp.add(`${moduloDeClave(f.ubicacion)}|${f.sku}`);
  const idDe = new Map<string, string>();
  if (filas) for (const f of filas) if (f.ubicacionId && !idDe.has(moduloDeClave(f.ubicacion))) idDe.set(moduloDeClave(f.ubicacion), f.ubicacionId);
  const porMod = new Map<string, RenglonBd[]>();
  for (const r of raw) { const l = porMod.get(r.modulo) ?? []; l.push(r); porMod.set(r.modulo, l) }
  const out: Modulo[] = [];
  for (const [clave, rs] of porMod) {
    const porSku = new Map<string, RenglonBd[]>();
    for (const r of rs) { const l = porSku.get(r.sku) ?? []; l.push(r); porSku.set(r.sku, l) }
    const skus: SkuMod[] = [...porSku].map(([sku, l]) => {
      const ol = l.filter((r) => r.equipo === "OL"), bav = l.filter((r) => r.equipo === "BAVARIA");
      const sumOl = ol.reduce((t, r) => t + r.total, 0), sumBav = bav.reduce((t, r) => t + r.total, 0);
      return { sku, material: l[0].material, ol, bav, sumOl, sumBav, dif: sumOl - sumBav, compensado: comp.has(`${clave}|${sku}`),
               solo: (ol.length > 0 && bav.length === 0 ? "OL" : bav.length > 0 && ol.length === 0 ? "BAVARIA" : null) as "OL" | "BAVARIA" | null };
    }).sort((a, b) => orden(a.sku, b.sku));
    const sumOl = skus.reduce((t, s) => t + s.sumOl, 0), sumBav = skus.reduce((t, s) => t + s.sumBav, 0);
    const rv = revs.filter((r) => r.numero === numero && moduloDeClave(r.ubicacion) === clave);
    const abiertas = rv.filter((r) => r.estado === "A_VALIDAR");
    const aprobadas = rv.filter((r) => r.estado === "APROBADA");
    const hayDif = skus.some((s) => s.dif !== 0 && !s.compensado);
    const hayComp = skus.some((s) => s.dif !== 0 && s.compensado);
    let estado: EstadoMod;
    if (!filas) estado = "contando";
    else if (abiertas.length === 0 && aprobadas.length > 0) estado = "aprobado";
    else if (abiertas.length > 0) estado = !hayDif ? (hayComp ? "compensado" : "coincide") : abiertas.every((r) => r.ol_envio && r.bavaria_envio) ? "respondida" : "validando";
    else estado = hayDif ? "difiere" : hayComp ? "compensado" : "coincide";
    out.push({
      clave, ubicacionId: idDe.get(clave) ?? rs[0].ubicacionId, skus, sumOl, sumBav, dif: sumOl - sumBav, estado,
      aprobadoCon: aprobadas[0]?.adoptado ?? null, compensadoAlAprobar: aprobadas.some((r) => !!r.compensado),
      ronda: abiertas.length > 0 ? Math.max(...abiertas.map((r) => r.ronda)) : 0,
    });
  }
  return out.sort((a, b) => orden(a.clave, b.clave));
}

export const horaCorta = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
