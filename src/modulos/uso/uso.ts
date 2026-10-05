import { MODULOS, moduloPorRuta } from "@/modulos/registro";

/**
 * USO DE LA APP POR USUARIO — lo que se puede calcular sin tocar la base.
 *
 * Se anota DÓNDE estuvo cada persona, no lo que escribió: la ruta sin ids
 * sueltos (/roturas/salida/:id), el módulo y los segundos activos.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La ruta como se anota: sin consulta, sin «/» al final y con los ids (uuid o números de 3 cifras o más) como «:id». */
export function normalizarRuta(pathname: string): string {
  const limpia = (pathname || "/").split("?")[0].split("#")[0];
  const partes = limpia.split("/").filter(Boolean).map((p) => (UUID.test(p) || /^\d{3,}$/.test(p) ? ":id" : p));
  return ("/" + partes.join("/")).slice(0, 120);
}

/** El módulo de una ruta, o «otros» (perfil, ayuda…). */
export function moduloDeRuta(pathname: string): string {
  return moduloPorRuta(normalizarRuta(pathname).replace(/\/:id/g, ""))?.id ?? "otros";
}

export const NOMBRE_OTROS = "Otras pantallas";

/** El nombre que ve la gente: «Roturas», no «roturas». */
export function nombreModulo(id: string): string {
  if (id === "otros") return NOMBRE_OTROS;
  return MODULOS.find((m) => m.id === id)?.nombre ?? id;
}
export function colorModulo(id: string): string {
  return MODULOS.find((m) => m.id === id)?.acento ?? "#5b6b7f";
}

/** El nombre de una pantalla: el de su sección en el menú, o la ruta si no está. */
export function nombrePantalla(ruta: string): string {
  for (const m of MODULOS) {
    if (m.ruta === ruta) return `${m.nombre} · inicio`;
    const s = m.secciones.find((x) => x.ruta === ruta);
    if (s) return `${m.nombre} · ${s.nombre}`;
  }
  return ruta === "/inicio" ? "Inicio" : ruta === "/perfil" ? "Mi perfil" : ruta;
}

/* ---------- lo que devuelve la base ---------- */
export type UsoUsuario = {
  id: string; usuario: string | null; nombre: string | null; rol: string; activo: boolean;
  ultimo_uso: string | null; visitas: number; dias_activos: number; minutos: number | string;
  modulos: Record<string, number>;
};
export type UsoDia = { usuario: string; dia: string; visitas: number; minutos: number | string };
export type UsoPantalla = { usuario: string; modulo: string; ruta: string; visitas: number; minutos: number | string; ultima: string };

export const num = (x: number | string | null | undefined) => Number(x ?? 0) || 0;

/** «3 h 20 min», «45 min», «—». */
export function duracion(min: number): string {
  if (!(min > 0)) return "—";
  if (min < 1) return "<1 min";
  const t = Math.round(min);
  return t < 60 ? `${t} min` : `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, "0")} min`;
}

/** «hoy 3:42 p. m.», «ayer», «hace 5 días», «nunca». */
export function haceCuanto(iso: string | null, ahora = Date.now()): string {
  if (!iso) return "nunca";
  const dias = Math.floor((ahora - 5 * 3600_000) / 86400_000) - Math.floor((new Date(iso).getTime() - 5 * 3600_000) / 86400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

/** El módulo que más abre una persona (id), o null. */
export function moduloTop(m: Record<string, number>): string | null {
  const e = Object.entries(m ?? {}).sort((a, b) => b[1] - a[1]);
  return e[0]?.[0] ?? null;
}

/** El rango en fechas de Colombia: «últimos N días» termina hoy. */
export function rango(dias: number, hoyISO: string): { desde: string; hasta: string } {
  const d = new Date(hoyISO + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - (dias - 1));
  return { desde: d.toISOString().slice(0, 10), hasta: hoyISO };
}
export function diasDelRango(desde: string, hasta: string): string[] {
  const r: string[] = [];
  for (let d = new Date(desde + "T00:00:00Z"); d.toISOString().slice(0, 10) <= hasta && r.length < 400; d.setUTCDate(d.getUTCDate() + 1)) r.push(d.toISOString().slice(0, 10));
  return r;
}
