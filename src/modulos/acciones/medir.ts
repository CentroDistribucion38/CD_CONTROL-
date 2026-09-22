/**
 * LOS INDICADORES DE ACCIONES — todo sale de lo que ya se registra.
 *
 * Cada acción ya trae cuándo se reportó, se asignó, se cerró y se
 * verificó, si fue efectiva, la zona y el plazo. De ahí sale TODO lo que
 * se mide aquí: no hay que pedirle a nadie un dato nuevo.
 *
 * Funciones puras —entra la lista, sale el número— para poder medirlas
 * sin base (.arnes/ac-indicadores.mjs) y usarlas igual en la pantalla y
 * en el PDF.
 */
import type { Accion } from "./datos";

const HORA = 3_600_000;
const DIA = 86_400_000;

export type Metas = { efectividad: number; aTiempo: number };
/** Con menos verificadas que esto, la efectividad no se dice: 1 de 1 sale
 *  «100 %» y no es un logro, es una sola acción. */
export const MIN_MEDIR = 5;

const t = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);
const anulada = (a: Accion) => a.estado === "anulada";
/** La mediana: la mitad tarda menos, la mitad más. El promedio lo daña
 *  una sola acción olvidada tres meses. */
export function mediana(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function percentil(xs: number[], p: number) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
/** El plazo que se le dio al reportar: vence − reportada. */
const plazoH = (a: Accion) => (t(a.vence_en) - t(a.reportada_en)) / HORA;
/** ¿Se cerró dentro del plazo? */
export const aTiempo = (a: Accion) => !!a.cerrada_en && t(a.cerrada_en) <= t(a.vence_en);

/** El lunes 00:00 (hora local) de la semana de `d`. */
export function lunes(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export type Medida = ReturnType<typeof medir>;

export function medir(todas: Accion[], hoyD: Date, dias: number, metas: Metas,
                      nombres: Record<string, string> = {}) {
  const hoy = hoyD.getTime();
  const desde = hoy - dias * DIA;
  const acc = todas.filter((a) => !anulada(a));
  const enPeriodo = (s: string | null | undefined) => { const x = t(s); return x >= desde && x <= hoy };

  const vivas = acc.filter((a) => a.viva);
  const reportadas = acc.filter((a) => enPeriodo(a.reportada_en));
  const cerradas = acc.filter((a) => enPeriodo(a.cerrada_en));
  const verificadas = acc.filter((a) => enPeriodo(a.verificada_en) && a.efectiva !== null);

  /* ---------- 1 · LAS CIFRAS DE ARRIBA ---------- */
  const abiertasAntes = acc.filter((a) => t(a.reportada_en) <= desde &&
    (!a.cerrada_en || t(a.cerrada_en) > desde)).length;
  const kpis = {
    abiertas: vivas.length,
    abiertasAntes,
    vencidas: vivas.filter((a) => a.vencida).length,
    reportadas: reportadas.length,
    cerradas: cerradas.length,
    aTiempo: pct(cerradas.filter(aTiempo).length, cerradas.length),
    efectividad: verificadas.length >= MIN_MEDIR ? pct(verificadas.filter((a) => a.efectiva).length, verificadas.length) : null,
    verificadas: verificadas.length,
    cierreMedianaH: mediana(cerradas.map((a) => (t(a.cerrada_en) - t(a.reportada_en)) / HORA)),
    metas,
  };

  /* ---------- 2 · TIEMPOS POR PRIORIDAD, contra su plazo ---------- */
  const tiempos = (["alta", "media", "baja"] as const).map((p) => {
    const c = cerradas.filter((a) => a.prioridad === p);
    const asignar = acc.filter((a) => a.prioridad === p && enPeriodo(a.reportada_en) && a.asignada_en)
      .map((a) => (t(a.asignada_en) - t(a.reportada_en)) / HORA);
    const cerrar = c.map((a) => (t(a.cerrada_en) - t(a.reportada_en)) / HORA);
    const verificar = acc.filter((a) => a.prioridad === p && enPeriodo(a.verificada_en) && a.cerrada_en)
      .map((a) => (t(a.verificada_en) - t(a.cerrada_en)) / HORA);
    const plazos = acc.filter((a) => a.prioridad === p).map(plazoH).filter((x) => x > 0);
    return {
      prioridad: p, n: c.length,
      plazoH: mediana(plazos),
      asignarH: mediana(asignar), cerrarH: mediana(cerrar), cerrarP90H: percentil(cerrar, 90),
      verificarH: mediana(verificar),
      aTiempo: pct(c.filter(aTiempo).length, c.length),
    };
  });

  /* ---------- 3 · TENDENCIA SEMANAL: entran, salen y lo que queda ---------- */
  const semanas: { desde: number; hasta: number; entran: number; cierran: number; quedan: number; etiqueta: string }[] = [];
  const nSem = Math.min(26, Math.max(4, Math.ceil(dias / 7)));
  let ini = lunes(hoyD).getTime() - (nSem - 1) * 7 * DIA;
  for (let i = 0; i < nSem; i++, ini += 7 * DIA) {
    const fin = ini + 7 * DIA;
    const hasta = Math.min(fin, hoy);
    semanas.push({
      desde: ini, hasta: fin,
      entran: acc.filter((a) => { const x = t(a.reportada_en); return x >= ini && x < fin }).length,
      cierran: acc.filter((a) => { const x = t(a.cerrada_en); return x >= ini && x < fin }).length,
      quedan: acc.filter((a) => t(a.reportada_en) < hasta && (!a.cerrada_en || t(a.cerrada_en) >= hasta)).length,
      /* «29 jun», no «29 de jun»: en el celular caben seis y no tres. */
      etiqueta: `${new Date(ini).getDate()} ${new Date(ini).toLocaleDateString("es-CO", { month: "short" }).replace(".", "")}`,
    });
  }

  /* ---------- 4 · ANTIGÜEDAD DE LO ABIERTO ---------- */
  const franjas = [
    { rot: "0–3 días", de: 0, a: 3 }, { rot: "4–7", de: 4, a: 7 }, { rot: "8–15", de: 8, a: 15 },
    { rot: "16–30", de: 16, a: 30 }, { rot: "Más de 30", de: 31, a: Infinity },
  ].map((f) => {
    const en = vivas.filter((a) => { const d = Math.floor((hoy - t(a.reportada_en)) / DIA); return d >= f.de && d <= f.a });
    return { ...f, n: en.length, vencidas: en.filter((a) => a.vencida).length };
  });

  /* ---------- 5 · REINCIDENCIA: la efectividad real ---------- */
  const grupos = new Map<string, Accion[]>();
  for (const a of acc) if (a.zona) {
    const k = a.motivo + "|" + a.zona;
    grupos.set(k, [...(grupos.get(k) ?? []), a]);
  }
  /* Una repetición = la misma falla, en la misma zona, antes de 30 días
     de la anterior. Es lo que dice que la solución no aguantó. */
  let repeticiones = 0;
  const repiten = [...grupos.values()].map((g) => {
    const s = [...g].sort((a, b) => t(a.reportada_en) - t(b.reportada_en));
    let rep = 0;
    for (let i = 1; i < s.length; i++)
      if (t(s[i].reportada_en) - t(s[i - 1].reportada_en) <= 30 * DIA && enPeriodo(s[i].reportada_en)) rep++;
    repeticiones += rep;
    const u = s[s.length - 1];
    return { motivo: u.motivo_nombre, zona: u.zona_nombre ?? u.zona ?? "", codigoZona: u.zona ?? "",
             n: s.length, repeticiones: rep, abiertas: s.filter((a) => a.viva).length, ultima: u.reportada_en };
  }).filter((x) => x.n > 1).sort((a, b) => b.repeticiones - a.repeticiones || b.n - a.n);
  const reincidencia = {
    reabiertas: acc.filter((a) => a.estado === "reabierta").length,
    noEfectivas: verificadas.filter((a) => a.efectiva === false).length,
    repeticiones,
    /* Efectividad REAL: de lo verificado en el periodo, lo que además no
       se repitió en su zona en los 30 días siguientes. */
    real: (() => {
      const ok = verificadas.filter((a) => a.efectiva && !(a.zona && acc.some((b) =>
        b.id !== a.id && b.motivo === a.motivo && b.zona === a.zona &&
        t(b.reportada_en) > t(a.cerrada_en ?? a.reportada_en) &&
        t(b.reportada_en) - t(a.cerrada_en ?? a.reportada_en) <= 30 * DIA)));
      return pct(ok.length, verificadas.length);
    })(),
    repiten: repiten.slice(0, 12),
  };

  /* ---------- 6 · PARETO DE MOTIVOS ---------- */
  const cuenta = new Map<string, number>();
  for (const a of reportadas) cuenta.set(a.motivo_nombre, (cuenta.get(a.motivo_nombre) ?? 0) + 1);
  const ord = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  let acum = 0;
  const pareto = ord.map(([motivo, n]) => {
    acum += n;
    return { motivo, n, acumulado: reportadas.length ? Math.round((acum / reportadas.length) * 100) : 0 };
  });
  const corte80 = pareto.findIndex((x) => x.acumulado >= 80);

  /* ---------- 7 · POR RESPONSABLE (a quien las resuelve, no a quien reporta) ---------- */
  const dueno = (a: Accion) => a.responsable
    ? { k: "p:" + a.responsable, nombre: nombres[a.responsable] ?? "Sin nombre", equipo: a.equipo_nombre }
    : a.equipo ? { k: "e:" + a.equipo, nombre: a.equipo_nombre ?? a.equipo, equipo: "Equipo" }
    : { k: "-", nombre: "Sin dueño", equipo: null };
  const porDueno = new Map<string, { nombre: string; equipo: string | null; lista: Accion[] }>();
  for (const a of acc) {
    if (!a.viva && !enPeriodo(a.cerrada_en) && !enPeriodo(a.verificada_en)) continue;
    const d = dueno(a);
    const x = porDueno.get(d.k) ?? { nombre: d.nombre, equipo: d.equipo, lista: [] };
    x.lista.push(a); porDueno.set(d.k, x);
  }
  const responsables = [...porDueno.entries()].map(([k, x]) => {
    const c = x.lista.filter((a) => enPeriodo(a.cerrada_en));
    const v = x.lista.filter((a) => enPeriodo(a.verificada_en) && a.efectiva !== null);
    const carga = x.lista.filter((a) => a.viva).length;
    const vencidas = x.lista.filter((a) => a.vencida).length;
    const at = pct(c.filter(aTiempo).length, c.length);
    const ef = v.length >= MIN_MEDIR ? pct(v.filter((a) => a.efectiva).length, v.length) : null;
    const semaforo: "bien" | "ojo" | "mal" =
      k === "-" || vencidas >= 3 || (at !== null && at < metas.aTiempo - 15) ? "mal"
      : vencidas > 0 || (at !== null && at < metas.aTiempo) || (ef !== null && ef < metas.efectividad) ? "ojo" : "bien";
    return { clave: k, nombre: x.nombre, equipo: x.equipo, carga, vencidas, cerradas: c.length, aTiempo: at,
             efectividad: ef, cierreH: mediana(c.map((a) => (t(a.cerrada_en) - t(a.reportada_en)) / HORA)), semaforo };
  }).sort((a, b) => b.vencidas - a.vencidas || b.carga - a.carga);

  /* ---------- 8 · EL MAPA: cada zona con lo suyo ---------- */
  const zonas = new Map<string, { codigo: string; nombre: string; proceso: string | null; total: number; vivas: number; vencidas: number; repeticiones: number }>();
  for (const a of acc) {
    if (!a.zona || !(a.viva || enPeriodo(a.reportada_en))) continue;
    const z = zonas.get(a.zona) ?? { codigo: a.zona, nombre: a.zona_nombre ?? a.zona, proceso: a.zona_proceso, total: 0, vivas: 0, vencidas: 0, repeticiones: 0 };
    if (enPeriodo(a.reportada_en)) z.total++;
    if (a.viva) z.vivas++;
    if (a.vencida) z.vencidas++;
    zonas.set(a.zona, z);
  }
  for (const r of repiten) { const z = zonas.get(r.codigoZona); if (z) z.repeticiones += r.repeticiones }

  return { dias, kpis, tiempos, semanas, franjas, reincidencia, pareto, corte80, responsables,
           zonas: [...zonas.values()].sort((a, b) => b.total - a.total) };
}

/** «3 h», «1,8 días»: lo que se entiende de un vistazo. */
export function horas(h: number | null) {
  if (h === null || !isFinite(h)) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 36) return `${h.toFixed(h < 10 ? 1 : 0).replace(".", ",")} h`;
  return `${(h / 24).toFixed(1).replace(".", ",")} días`;
}
