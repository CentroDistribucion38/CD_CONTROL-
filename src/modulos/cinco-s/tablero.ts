/**
 * 5S · LAS CIFRAS DEL TABLERO — una sola cuenta para la pantalla y para la imagen que se copia.
 * Si la pantalla y la foto calcularan cada una por su lado, tarde o temprano dirían números distintos.
 */
import { FORMATO_5S, formatoDe, type Area5S, type Formato5S, type Inspeccion5S, type Programada5S, type Responsable5S } from "./cinco-s";

export type NoCumple5S = { inspeccion_id: string; s: string; pregunta: string; zona: string | null; severidad: string | null };
export const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const restar = (f: string, n: number) => new Date(new Date(f + "T00:00:00Z").getTime() - n * 86400000).toISOString().slice(0, 10);
const lunes = (f: string) => restar(f, (new Date(f + "T00:00:00Z").getUTCDay() + 6) % 7);
const semIso = (f: string) => {
  const d = new Date(f + "T12:00:00Z"); const dia = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dia + 3);
  const p = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - p.getTime()) / 86400000 - 3 + ((p.getUTCDay() + 6) % 7)) / 7);
};

export type Tablero5S = ReturnType<typeof armarTablero5S>;

/** DÓNDE EMPIEZA EL EJE: con todo entre 85 y 92, una escala de 0 a 100 deja columnas iguales y no se ve nada.
 *  Se arranca un poco por debajo del menor valor (o de la meta), en decenas, y la gráfica lo dice. */
export function piso(valores: (number | null | undefined)[], meta: number) {
  const vs = valores.filter((v): v is number => v != null);
  const min = Math.min(meta, ...vs);
  return Math.max(0, Math.min(80, Math.floor((min - 8) / 10) * 10));
}

export function armarTablero5S(p: {
  filas: Inspeccion5S[]; areas: Area5S[]; responsables: Responsable5S[]; meta: number; plan: Programada5S[];
  noCumple: NoCumple5S[]; desde: string; hoy: string; areaF: string;
  /** Qué se mira (5S, PTL…): las cifras de formatos distintos no se mezclan. Sin él, 5S. */
  formato?: Formato5S; formatos?: Formato5S[];
}) {
  const fmt = p.formato ?? FORMATO_5S;
  const esDe = (f: Inspeccion5S) => !p.formatos || formatoDe(p.formatos, f.formato_id).id === fmt.id;
  const vista = p.filas.filter((f) => esDe(f) && f.fecha >= p.desde && (!p.areaF || f.area_id === p.areaF));
  const ids = new Set(vista.map((f) => f.id));
  const general = prom(vista.map((f) => f.cumplimiento));
  const metaRef = prom(vista.map((f) => f.meta)) ?? p.meta;

  const m = new Map<string, Inspeccion5S[]>();
  for (const f of vista) { const k = f.area_id ?? f.area; m.set(k, [...(m.get(k) ?? []), f]) }
  const porArea = [...m.entries()].map(([k, xs]) => {
    const a = p.areas.find((y) => y.id === k);
    const ult = xs[0];
    return { id: k, nombre: a?.nombre ?? ult.area, n: xs.length, pct: prom(xs.map((x) => x.cumplimiento))!, meta: a?.meta ?? p.meta,
      ultima: ult.fecha, ultimaPct: ult.cumplimiento, hallazgos: xs.reduce((t, x) => t + x.no_cumple, 0),
      responsable: p.responsables.find((r) => r.id === a?.responsable_id)?.nombre ?? ult.responsable };
  }).sort((a, b) => (a.pct - a.meta) - (b.pct - b.meta));
  const bajoMeta = porArea.filter((a) => a.pct < a.meta).length;
  const sinAuditar = p.areas.filter((a) => a.activa && !p.filas.some((f) => esDe(f) && f.area_id === a.id && f.fecha >= restar(p.hoy, 30)));

  const porS = fmt.secciones.map((s) => ({ ...s, pct: prom(vista.map((f) => f.por_s[s.clave]).filter((v): v is number => v != null)) }));
  const peorS = porS.filter((s) => s.pct != null).sort((a, b) => a.pct! - b.pct!)[0];

  const sm = new Map<string, number[]>();
  for (const f of vista) { const k = lunes(f.fecha); sm.set(k, [...(sm.get(k) ?? []), f.cumplimiento]) }
  const semanas = [...sm.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-16).map(([k, xs]) => ({ k, s: semIso(k), pct: prom(xs)!, n: xs.length }));

  const rm = new Map<string, Inspeccion5S[]>();
  for (const f of vista) { const k = f.responsable ?? "Sin responsable"; rm.set(k, [...(rm.get(k) ?? []), f]) }
  const porResp = [...rm.entries()].map(([k, xs]) => ({ nombre: k, n: xs.length, areas: new Set(xs.map((x) => x.area)).size, pct: prom(xs.map((x) => x.cumplimiento))!, hallazgos: xs.reduce((t, x) => t + x.no_cumple, 0) }))
    .sort((a, b) => b.pct - a.pct);
  const am = new Map<string, number>();
  for (const f of vista) am.set(f.auditor_nombre ?? "—", (am.get(f.auditor_nombre ?? "—") ?? 0) + 1);
  const porAuditor = [...am.entries()].sort((a, b) => b[1] - a[1]);

  const rp = new Map<string, { pregunta: string; s: string; n: number; zonas: Set<string>; altas: number }>();
  for (const x of p.noCumple) {
    if (!ids.has(x.inspeccion_id)) continue;
    const e = rp.get(x.pregunta) ?? { pregunta: x.pregunta, s: x.s, n: 0, zonas: new Set<string>(), altas: 0 };
    e.n++; if (x.zona) e.zonas.add(x.zona); if (x.severidad === "alta") e.altas++;
    rp.set(x.pregunta, e);
  }
  const repetidos = [...rp.values()].sort((a, b) => b.n - a.n || b.altas - a.altas).slice(0, 8);

  const planP = p.plan.filter((x) => !x.cancelada && x.hasta >= p.desde && x.desde <= p.hoy && (!p.areaF || x.area_id === p.areaF));
  const cerradas = planP.filter((x) => x.estado === "hecha" || x.estado === "vencida");
  const hechas = cerradas.filter((x) => x.estado === "hecha").length;
  const cumplePlan = cerradas.length ? (100 * hechas) / cerradas.length : null;

  return {
    formato: fmt, vista, general, metaRef, porArea, bajoMeta, sinAuditar, porS, peorS, semanas, porResp, porAuditor, repetidos,
    cerradas: cerradas.length, hechas, cumplePlan, hallazgos: vista.reduce((t, f) => t + f.no_cumple, 0),
  };
}
