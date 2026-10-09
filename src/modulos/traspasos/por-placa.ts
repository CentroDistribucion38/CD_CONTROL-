import type { Viaje } from "./datos";
import { placaClave } from "./formato";

/**
 * TRASPASOS POR PLACA. «Quiero por placa poder evaluar Traspasos.»
 *
 * Cada placa con sus viajes en ORDEN LÓGICO (día y hora), la carga movida, y los SALTOS: un viaje
 * que sale de un sitio distinto a donde llegó el anterior de esa placa (falta un viaje por
 * registrar, o la ruta quedó mal). Los anulados no entran.
 *
 * Lo usan el cierre del turno y la sección «Por placa» del tablero: una sola cuenta.
 */
export type GrupoPlaca = {
  clave: string;
  placa: string;
  vs: Viaje[];
  carga: number;
  /** Por viaje: dónde había llegado el anterior cuando no coincide con de dónde sale este; si no, null. */
  saltos: (string | null)[];
  nSaltos: number;
};

export const enOrdenLogico = (vs: Viaje[]) => [...vs].sort((a, b) =>
  a.fecha.localeCompare(b.fecha) || (a.hora ?? "").localeCompare(b.hora ?? "")
  || (a.codigo ?? "").localeCompare(b.codigo ?? "", "es", { numeric: true }));

export function armarPorPlaca(viajes: Viaje[]): GrupoPlaca[] {
  const m = new Map<string, { placa: string; vs: Viaje[] }>();
  for (const v of enOrdenLogico(viajes)) {
    if (v.estado !== "registrado") continue;
    const k = placaClave(v.placa) || "SIN PLACA";
    (m.get(k) ?? m.set(k, { placa: v.placa?.trim() || "Sin placa", vs: [] }).get(k)!).vs.push(v);
  }
  return [...m.entries()].map(([clave, g]) => {
    const saltos = g.vs.map((v, i) => {
      const prev = g.vs[i - 1];
      if (!prev) return null;
      const llego = (prev.destino_nombre ?? prev.destino ?? "").trim().toUpperCase();
      const sale = (v.origen_nombre ?? v.origen ?? "").trim().toUpperCase();
      return llego && sale && llego !== sale ? (prev.destino_nombre ?? prev.destino) : null;
    });
    return {
      clave, placa: g.placa, vs: g.vs, saltos,
      carga: g.vs.reduce((a, v) => a + (v.carga ?? 0), 0),
      nSaltos: saltos.filter(Boolean).length,
    };
  }).sort((a, b) => b.vs.length - a.vs.length || a.placa.localeCompare(b.placa, "es"));
}

/** El documento que cuenta es el de facturación (el que cruza con SAP), con la hora de salida. */
export const documentoDe = (v: Viaje) =>
  v.vacio ? { txt: "—", sin: false, hora: null as string | null }
  : v.factura_documento ? { txt: v.factura_documento, sin: false, hora: v.salida_en ?? null }
  : { txt: "sin documento", sin: v.estado === "registrado", hora: null };
