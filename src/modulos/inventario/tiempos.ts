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
  primer_renglon: string; fin: string | null; enviado: boolean; ultimo_renglon: string | null;
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

/** Un conteo abierto sigue «en curso» solo si se movió en los últimos 30 minutos; si no, quedó SIN ENVIAR. */
export const MINUTOS_ABANDONO = 30;
export type Estado = "enviado" | "en_curso" | "sin_enviar";
export function estadoConteo(f: FilaTiempo, ahora: number = Date.now()): Estado {
  if (f.enviado) return "enviado";
  const u = f.ultimo_renglon ? new Date(f.ultimo_renglon).getTime() : new Date(f.primer_renglon).getTime();
  return ahora - u <= MINUTOS_ABANDONO * 60000 ? "en_curso" : "sin_enviar";
}
