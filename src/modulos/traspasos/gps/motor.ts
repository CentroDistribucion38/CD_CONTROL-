import { areaM2, distanciaAPoligonoM, puntoEnPoligono, type Punto } from "./geo";

/** Para SALIR de una zona hay que alejarse de su borde más de esto: el GPS «baila» unos metros y sin este margen una sola lectura mala cerraba la visita y abría otra. */
export const HISTERESIS_SALIDA_M = 25;

/**
 * EL MOTOR DE ZONAS — sin pantalla y sin base de datos.
 *
 *   · cuando un vehículo ENTRA a una zona  → se abre una visita (inicio)
 *   · cuando SALE                          → se cierra (fin) y queda EN TRÁNSITO
 *   · cuando entra a otra zona             → el tránsito termina: ese es el tramo
 *
 * Recibe las posiciones en orden y devuelve los eventos con la hora de la posición
 * que lo vio (no la hora de hoy): por eso, aunque nadie tenga la pantalla abierta,
 * al volver a abrirla se reconstruye lo que pasó con la hora real.
 */
export type Zona = { id: string; nombre: string; color: string; poligono: Punto[] };
export type Posicion = { vehiculo: number; lat: number; lng: number; en: string; velocidad?: number | null; rumbo?: number | null };
export type EstadoVehiculo = { vehiculo: number; zonaId: string | null; fixEn: string | null };
export type Evento = { vehiculo: number; zonaId: string; tipo: "entra" | "sale"; en: string };
export type ResultadoMotor = { eventos: Evento[]; estados: Map<number, EstadoVehiculo & { lat: number; lng: number; velocidad: number | null; rumbo: number | null }> };

/** La zona donde está un punto. Si cae en dos que se cruzan, gana la más pequeña (la más específica). */
export function zonaDe(p: Punto, zonas: Zona[]): Zona | null {
  let mejor: Zona | null = null, area = Infinity;
  for (const z of zonas) {
    if (!puntoEnPoligono(p, z.poligono)) continue;
    const a = areaM2(z.poligono);
    if (a < area) { mejor = z; area = a; }
  }
  return mejor;
}

export function procesarPosiciones(zonas: Zona[], previos: EstadoVehiculo[], posiciones: Posicion[]): ResultadoMotor {
  const estados: ResultadoMotor["estados"] = new Map();
  for (const e of previos) estados.set(e.vehiculo, { ...e, lat: NaN, lng: NaN, velocidad: null, rumbo: null });
  const eventos: Evento[] = [];
  const ordenadas = [...posiciones].sort((a, b) => a.en.localeCompare(b.en));
  for (const p of ordenadas) {
    const e = estados.get(p.vehiculo) ?? { vehiculo: p.vehiculo, zonaId: null, fixEn: null, lat: NaN, lng: NaN, velocidad: null, rumbo: null };
    /* Lo que ya se procesó no se repite. */
    if (e.fixEn && p.en <= e.fixEn) { estados.set(p.vehiculo, e); continue }
    const z = zonaDe([p.lat, p.lng], zonas);
    let nueva = z?.id ?? null;
    /* Sigue «adentro» de la zona en que estaba si apenas se asomó por el borde (ruido del GPS). */
    if (!nueva && e.zonaId) {
      const anterior = zonas.find((x) => x.id === e.zonaId);
      if (anterior && distanciaAPoligonoM([p.lat, p.lng], anterior.poligono) <= HISTERESIS_SALIDA_M) nueva = e.zonaId;
    }
    if (nueva !== e.zonaId) {
      if (e.zonaId) eventos.push({ vehiculo: p.vehiculo, zonaId: e.zonaId, tipo: "sale", en: p.en });
      if (nueva) eventos.push({ vehiculo: p.vehiculo, zonaId: nueva, tipo: "entra", en: p.en });
    }
    estados.set(p.vehiculo, { vehiculo: p.vehiculo, zonaId: nueva, fixEn: p.en, lat: p.lat, lng: p.lng, velocidad: p.velocidad ?? null, rumbo: p.rumbo ?? null });
  }
  return { eventos, estados };
}

/* ------------------------------------------------------------------ resúmenes (tiempos y flujos) */
export type Visita = { vehiculo: string; zona: string; entrada: string; salida: string | null };

const seg = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));

export type TiempoZona = { zona: string; visitas: number; total: number; promedio: number; maximo: number; adentro: number };
/** Cuánto estuvieron los vehículos dentro de cada zona (las visitas abiertas cuentan hasta `ahora`). */
export function tiemposPorZona(visitas: Visita[], ahora: string): TiempoZona[] {
  const m = new Map<string, TiempoZona>();
  for (const v of visitas) {
    const t = seg(v.entrada, v.salida ?? ahora);
    const x = m.get(v.zona) ?? { zona: v.zona, visitas: 0, total: 0, promedio: 0, maximo: 0, adentro: 0 };
    x.visitas++; x.total += t; x.maximo = Math.max(x.maximo, t);
    if (!v.salida) x.adentro++;
    m.set(v.zona, x);
  }
  return [...m.values()].map((x) => ({ ...x, promedio: x.visitas ? Math.round(x.total / x.visitas) : 0 }));
}

export type Tramo = { vehiculo: string; origen: string; destino: string; salio: string; llego: string | null; segundos: number };
/** Los tramos en tránsito de cada vehículo: de la salida de una zona a la entrada de la siguiente (si aún no llega, va corriendo hasta `ahora`). */
export function tramosDe(visitas: Visita[], ahora: string): Tramo[] {
  const por = new Map<string, Visita[]>();
  for (const v of visitas) por.set(v.vehiculo, [...(por.get(v.vehiculo) ?? []), v]);
  const out: Tramo[] = [];
  for (const [veh, lista] of por) {
    const o = [...lista].sort((a, b) => a.entrada.localeCompare(b.entrada));
    for (let i = 0; i < o.length - 1; i++) {
      const a = o[i], b = o[i + 1];
      if (!a.salida) continue;
      out.push({ vehiculo: veh, origen: a.zona, destino: b.zona, salio: a.salida, llego: b.entrada, segundos: seg(a.salida, b.entrada) });
    }
    const ult = o[o.length - 1];
    if (ult?.salida) out.push({ vehiculo: veh, origen: ult.zona, destino: "", salio: ult.salida, llego: null, segundos: seg(ult.salida, ahora) });
  }
  return out.sort((a, b) => b.salio.localeCompare(a.salio));
}

export type Flujo = { origen: string; destino: string; viajes: number; promedio: number; minimo: number; maximo: number };
/** Cuántas veces se fue de una zona a otra y cuánto tardó en el tránsito (solo tramos ya completos). */
export function flujosEntreZonas(tramos: Tramo[]): Flujo[] {
  const m = new Map<string, { origen: string; destino: string; t: number[] }>();
  for (const t of tramos) {
    if (!t.llego || !t.destino) continue;
    const k = t.origen + "\u0001" + t.destino;
    const x = m.get(k) ?? { origen: t.origen, destino: t.destino, t: [] };
    x.t.push(t.segundos); m.set(k, x);
  }
  return [...m.values()].map((x) => ({
    origen: x.origen, destino: x.destino, viajes: x.t.length,
    promedio: Math.round(x.t.reduce((a, b) => a + b, 0) / x.t.length), minimo: Math.min(...x.t), maximo: Math.max(...x.t),
  })).sort((a, b) => b.viajes - a.viajes);
}

export function duracion(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : m > 0 ? `${m} min ${String(r).padStart(2, "0")} s` : `${r} s`;
}
