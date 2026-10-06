/**
 * TIEMPOS DEL CONTEO — las cuentas del tablero «Tiempos».
 *
 * La base (`conteo_tiempos`) entrega UNA FILA POR CONTEO con la hora del primer
 * renglón, la hora de envío y los minutos brutos, activos y de pausa. Aquí solo
 * se agrupa por persona y se arma el ranking:
 *
 *   RENGLONES POR HORA = renglones ÷ horas ACTIVAS (sin las pausas largas).
 *
 * Es la velocidad real y deja comparar conteos de distinto tamaño: terminar
 * rápido un conteo de 12 renglones no le gana a uno de 150.
 * El ranking cuenta SOLO conteos ya enviados; los que siguen abiertos salen
 * aparte como «en curso», porque no tienen hora de fin.
 */
export type FilaTiempo = {
  conteo_id: string; codigo: string; responsable_id: string | null; persona: string | null; dia: string;
  primer_renglon: string; fin: string | null; enviado: boolean; ultimo_renglon: string | null; vencido?: boolean;
  renglones: number; ubicaciones: number; total_cajas: number;
  bruto_min: number; activo_min: number; pausas_min: number;
};

export type Posicion = {
  id: string; persona: string; conteos: number; renglones: number; activo_min: number; pausas_min: number;
  rph: number | null; mejor: number | null;
};

/** Renglones por hora activa; null si no hay tiempo medible (menos de un minuto). */
export const porHora = (renglones: number, activoMin: number): number | null =>
  activoMin >= 1 ? (renglones / activoMin) * 60 : null;

export function ranking(filas: FilaTiempo[]): Posicion[] {
  const m = new Map<string, Posicion>();
  for (const f of filas) {
    if (!f.enviado) continue;
    const id = f.responsable_id ?? "sin-persona";
    const p = m.get(id) ?? { id, persona: f.persona ?? "Sin nombre", conteos: 0, renglones: 0, activo_min: 0, pausas_min: 0, rph: null, mejor: null };
    p.conteos += 1; p.renglones += f.renglones; p.activo_min += Number(f.activo_min); p.pausas_min += Number(f.pausas_min);
    const r = porHora(f.renglones, Number(f.activo_min));
    if (r != null && (p.mejor == null || r > p.mejor)) p.mejor = r;
    m.set(id, p);
  }
  const out = [...m.values()];
  for (const p of out) p.rph = porHora(p.renglones, p.activo_min);
  /* Sin tiempo medible, al final. */
  return out.sort((a, b) => (b.rph ?? -1) - (a.rph ?? -1) || b.renglones - a.renglones);
}

/** «2 h 05 min», «38 min», «—». */
export function duracion(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const t = Math.round(min);
  if (t < 60) return `${t} min`;
  return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, "0")} min`;
}

/** La hora de pared de Colombia, «08:05». */
export const horaCo = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }) : "—";

export const hoyCo = (): string => new Date().toLocaleDateString("sv", { timeZone: "America/Bogota" });

export function sumarDias(iso: string, d: number): string {
  const f = new Date(iso + "T12:00:00Z"); f.setUTCDate(f.getUTCDate() + d);
  return f.toISOString().slice(0, 10);
}

/** Un conteo abierto sigue «en curso» solo si se movió en los últimos 30 minutos; si no, quedó SIN ENVIAR;
    y con más de 8 horas sin uso (o anulado por la base) está CERRADO sin enviar: la persona arranca otro. */
export const MINUTOS_ABANDONO = 30;
export const HORAS_VENCE = 8;
export type Estado = "enviado" | "en_curso" | "sin_enviar" | "cerrado";
export function estadoConteo(f: FilaTiempo, ahora: number = Date.now()): Estado {
  if (f.enviado) return "enviado";
  if (f.vencido) return "cerrado";
  const u = new Date(f.ultimo_renglon ?? f.primer_renglon).getTime();
  const min = (ahora - u) / 60000;
  if (min > HORAS_VENCE * 60) return "cerrado";
  return min <= MINUTOS_ABANDONO ? "en_curso" : "sin_enviar";
}

/* ---------- EL RECORRIDO RENGLÓN POR RENGLÓN ---------- */
export type Renglon = {
  n: number; registrado_en: string; seg_desde_anterior: number;
  ubicacion: string | null; codigo: string | null; material: string | null;
  estibas: number | null; cajas: number | null; saldo: number | null; corregido: boolean;
};
export type InicioUbi = { conteo_id: string; lat: number | null; lng: number | null; precision_m: number | null; tomada_en: string | null; estado: string | null };

/** Menos de 15 s de un renglón al siguiente es muy poco para caminar, mirar y teclear: se marca para revisar. */
export const SEG_MUY_SEGUIDO = 15;

/** «45 s», «3 min 20 s», «1 h 05 min». */
export function fmtSeg(seg: number | null | undefined): string {
  if (seg == null || !Number.isFinite(seg)) return "—";
  const s = Math.max(0, Math.round(seg));
  if (s < 60) return `${s} s`;
  if (s < 3600) { const m = Math.floor(s / 60), r = s % 60; return r ? `${m} min ${String(r).padStart(2, "0")} s` : `${m} min`; }
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}

/** Resumen de los saltos de un renglón al siguiente (sin contar el primero, que se mide desde que abrió). */
export function analizarRecorrido(rs: Renglon[]) {
  const saltos = rs.filter((r) => r.n > 1).map((r) => r.seg_desde_anterior).sort((a, b) => a - b);
  const mediana = saltos.length === 0 ? null : saltos.length % 2 ? saltos[(saltos.length - 1) / 2] : (saltos[saltos.length / 2 - 1] + saltos[saltos.length / 2]) / 2;
  return {
    renglones: rs.length,
    masCorto: saltos[0] ?? null,
    masLargo: saltos.length ? saltos[saltos.length - 1] : null,
    mediana,
    seguidos: rs.filter((r) => r.n > 1 && r.seg_desde_anterior < SEG_MUY_SEGUIDO).length,
    corregidos: rs.filter((r) => r.corregido).length,
  };
}

/** Texto de la ubicación de inicio para la tabla. */
export function textoUbicacion(u: InicioUbi | undefined): { texto: string; mapa: string | null } {
  if (!u || !u.estado) return { texto: "—", mapa: null };
  if (u.estado === "ok" && u.lat != null && u.lng != null)
    return { texto: `Ver mapa${u.precision_m != null ? ` · ±${Math.round(u.precision_m)} m` : ""}`, mapa: `https://www.openstreetmap.org/?mlat=${u.lat}&mlon=${u.lng}#map=18/${u.lat}/${u.lng}` };
  const why = u.estado === "denegada" ? "dijo que no" : u.estado === "tiempo" ? "tardó demasiado" : "no se pudo";
  return { texto: `Sin ubicación · ${why}`, mapa: null };
}
