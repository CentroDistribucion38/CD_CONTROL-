import "server-only";
import { VERCEL_HOBBY } from "./limites";

export type ServicioVercel = { servicio: string; cantidad: number; unidad: string; costo: number; efectivo: number };
export type ProyectoVercel = { proyecto: string; efectivo: number };
export type DatosVercel = {
  ok: boolean;
  error?: string;
  desde?: string;
  servicios?: ServicioVercel[];
  proyectos?: ProyectoVercel[];
  costoMes?: number;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 };

/** El mes en curso, en UTC: desde el día 1 hasta mañana (el límite superior no cuenta). */
export function rangoMes(hoy = new Date()) {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const h = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + 1));
  return { desde: d.toISOString(), hasta: h.toISOString() };
}

export async function leerVercel(): Promise<DatosVercel> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) return { ok: false, error: "Falta la variable VERCEL_API_TOKEN en Vercel." };
  const { desde, hasta } = rangoMes();
  const team = process.env.VERCEL_TEAM_ID;
  const url = `https://api.vercel.com/v1/billing/charges?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}${team ? (team.startsWith("team_") ? `&teamId=${encodeURIComponent(team)}` : `&slug=${encodeURIComponent(team)}`) : ""}`;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    const texto = await r.text();
    const por = new Map<string, ServicioVercel>();
    const proy = new Map<string, number>();
    let costoMes = 0;
    for (const linea of texto.split("\n")) {
      if (!linea.trim()) continue;
      let c: Record<string, unknown>;
      try { c = JSON.parse(linea) as Record<string, unknown> } catch { continue }
      const nombre = String(c.ServiceName ?? "Otro");
      const unidad = String(c.ConsumedUnit ?? c.PricingUnit ?? "");
      const clave = `${nombre}|${unidad}`;
      const s = por.get(clave) ?? { servicio: nombre, cantidad: 0, unidad, costo: 0, efectivo: 0 };
      s.cantidad += num(c.ConsumedQuantity ?? c.PricingQuantity); s.costo += num(c.BilledCost); s.efectivo += num(c.EffectiveCost);
      por.set(clave, s);
      costoMes += num(c.EffectiveCost);
      const tags = (c.Tags ?? {}) as Record<string, string>;
      const nom = tags.ProjectName || tags.ProjectId || "(sin proyecto)";
      proy.set(nom, (proy.get(nom) ?? 0) + num(c.EffectiveCost));
    }
    return {
      ok: true, desde, costoMes,
      servicios: [...por.values()].sort((a, b) => b.efectivo - a.efectivo || b.cantidad - a.cantidad),
      proyectos: [...proy.entries()].map(([proyecto, efectivo]) => ({ proyecto, efectivo })).sort((a, b) => b.efectivo - a.efectivo),
    };
  } catch (e) {
    return { ok: false, error: `Vercel respondió: ${(e as Error).message}` };
  }
}

/** Lleva la cantidad que reporta Vercel a la unidad en que está el tope del plan. */
export function aUnidadDelTope(q: number, unidad: string, tipo: (typeof VERCEL_HOBBY)[number]["tipo"]): number {
  const u = unidad.toLowerCase();
  if (tipo === "gb") {
    if (/^tb|tib/.test(u)) return q * 1024;
    if (/^mb|mib/.test(u)) return q / 1024;
    if (/^kb|kib/.test(u)) return q / 1024 ** 2;
    if (/^byte|^b$/.test(u)) return q / 1024 ** 3;
    return q;
  }
  if (tipo === "h") {
    if (/^(second|sec|s$)/.test(u)) return q / 3600;
    if (/^(millisecond|ms)/.test(u)) return q / 3_600_000;
    if (/^(minute|min)/.test(u)) return q / 60;
    return q;
  }
  if (tipo === "n") return /million/.test(u) ? q * 1_000_000 : /thousand|^k$/.test(u) ? q * 1000 : q;
  return q;
}
