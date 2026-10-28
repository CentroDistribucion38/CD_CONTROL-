/**
 * TIEMPOS GPS × PLAN DE TRASPASOS — lo planeado contra lo que el GPS vio.
 *
 * El plan (Traspasos → Plan) dice «cuántos viajes de cada tipo por turno»; los viajes registrados dicen
 * placa, origen y destino. El GPS dice cuándo ese vehículo salió del origen y cuándo entró al destino.
 * Aquí se juntan: por cada viaje registrado hoy se busca, entre las visitas del vehículo (placa), el
 * recorrido «sale de la zona de origen → entra a la zona de destino», en orden (el 1.º viaje de la placa
 * con el 1.º recorrido, etc.). Cada punto de Traspasos se liga a una zona por su clave (o por el nombre).
 */
import type { Zona } from "./motor";
import type { VisitaGps } from "./tipos";

export type ViajePlan = {
  codigo: string | null; placa: string | null; tipo: string | null; tipoNombre: string | null; turno: string | null; hora: string | null;
  origen: string | null; origenNombre: string | null; destino: string | null; destinoNombre: string | null; vacio: boolean;
};
export type LineaPlan = { tipo: string; tipoNombre: string; turno: string; planeado: number; cumplido: number; faltan: number };
export type ZonaLigada = Zona & { punto?: string | null };
export type VehiculoPlaca = { id: string; placa: string | null };

export type EstadoViaje = "llego" | "en_camino" | "en_origen" | "sin_salir" | "sin_gps" | "sin_placa" | "sin_zona";
export type ViajeGps = ViajePlan & {
  estado: EstadoViaje; salio: string | null; llego: string | null; entroOrigen: string | null; segundos: number | null;
  zonaOrigen: string | null; zonaDestino: string | null;
};

export const placaClave = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/[\s-]/g, "");
export const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** La zona que corresponde a un punto de Traspasos: la ligada por clave, o la de nombre igual / contenido. */
export function zonaDePunto(clave: string | null, nombre: string | null, zonas: ZonaLigada[]): ZonaLigada | null {
  if (clave) { const z = zonas.find((x) => x.punto === clave); if (z) return z }
  const n = norm(nombre);
  if (!n) return null;
  return zonas.find((x) => !x.punto && norm(x.nombre) === n)
      ?? zonas.find((x) => !x.punto && (norm(x.nombre).includes(n) || n.includes(norm(x.nombre))) && norm(x.nombre).length >= 4) ?? null;
}

export function cruzarViajes(viajes: ViajePlan[], zonas: ZonaLigada[], vehiculos: VehiculoPlaca[], visitas: VisitaGps[]): ViajeGps[] {
  const vehDe = new Map<string, string>();
  for (const v of vehiculos) if (v.placa) vehDe.set(placaClave(v.placa), v.id);
  const orden = [...viajes].sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? "") || (a.codigo ?? "").localeCompare(b.codigo ?? "", "es", { numeric: true }));
  const usados = new Map<string, number>();   // placa|zo|zd → cuántos recorridos ya se repartieron
  return orden.map((v): ViajeGps => {
    const base = { ...v, salio: null, llego: null, entroOrigen: null, segundos: null, zonaOrigen: null, zonaDestino: null };
    const zo = zonaDePunto(v.origen, v.origenNombre, zonas), zd = zonaDePunto(v.destino, v.destinoNombre, zonas);
    const ref = { zonaOrigen: zo?.nombre ?? null, zonaDestino: zd?.nombre ?? null };
    if (!v.placa) return { ...base, ...ref, estado: "sin_placa" };
    const vid = vehDe.get(placaClave(v.placa));
    if (!vid) return { ...base, ...ref, estado: "sin_gps" };
    if (!zo || !zd) return { ...base, ...ref, estado: "sin_zona" };

    const mias = visitas.filter((x) => x.vehiculo === vid).sort((a, b) => a.entrada.localeCompare(b.entrada));
    const recorridos: { entroOrigen: string; salio: string | null; llego: string | null }[] = [];
    mias.forEach((v1, i) => {
      if (v1.zona !== zo.id) return;
      if (!v1.salida) { recorridos.push({ entroOrigen: v1.entrada, salio: null, llego: null }); return }
      const sigOrigen = mias.slice(i + 1).find((x) => x.zona === zo.id)?.entrada ?? "9999";
      const v2 = mias.slice(i + 1).find((x) => x.zona === zd.id && x.entrada >= v1.salida! && x.entrada < sigOrigen);
      recorridos.push({ entroOrigen: v1.entrada, salio: v1.salida, llego: v2?.entrada ?? null });
    });
    const k = `${placaClave(v.placa)}|${zo.id}|${zd.id}`;
    const n = usados.get(k) ?? 0; usados.set(k, n + 1);
    const r = recorridos[n];
    if (!r) return { ...base, ...ref, estado: "sin_salir" };
    if (!r.salio) return { ...base, ...ref, estado: "en_origen", entroOrigen: r.entroOrigen };
    if (!r.llego) return { ...base, ...ref, estado: "en_camino", entroOrigen: r.entroOrigen, salio: r.salio };
    return { ...base, ...ref, estado: "llego", entroOrigen: r.entroOrigen, salio: r.salio, llego: r.llego, segundos: Math.max(0, Math.round((Date.parse(r.llego) - Date.parse(r.salio)) / 1000)) };
  });
}

export type ResumenTipo = {
  tipo: string; nombre: string; planeado: number; cumplido: number; faltan: number;
  registrados: number; llegaron: number; enCamino: number; enOrigen: number; sinSalir: number; sinGps: number;
};

/** Plan del día por tipo (sumando turnos) junto a lo que el GPS vio de los viajes de ese tipo. */
export function resumenPorTipo(plan: LineaPlan[], viajes: ViajeGps[]): ResumenTipo[] {
  const m = new Map<string, ResumenTipo>();
  const nuevo = (tipo: string, nombre: string): ResumenTipo => ({ tipo, nombre, planeado: 0, cumplido: 0, faltan: 0, registrados: 0, llegaron: 0, enCamino: 0, enOrigen: 0, sinSalir: 0, sinGps: 0 });
  for (const l of plan) {
    const r = m.get(l.tipo) ?? nuevo(l.tipo, l.tipoNombre); m.set(l.tipo, r);
    r.planeado += l.planeado; r.cumplido += l.cumplido; r.faltan += l.faltan;
  }
  for (const v of viajes) {
    const t = v.tipo ?? "—";
    const r = m.get(t) ?? nuevo(t, v.tipoNombre ?? "Sin tipo"); m.set(t, r);
    r.registrados++;
    if (v.estado === "llego") r.llegaron++;
    else if (v.estado === "en_camino") r.enCamino++;
    else if (v.estado === "en_origen") r.enOrigen++;
    else if (v.estado === "sin_salir") r.sinSalir++;
    else r.sinGps++;
  }
  return [...m.values()].sort((a, b) => b.planeado - a.planeado || a.nombre.localeCompare(b.nombre, "es"));
}

/** Tiempo promedio en tránsito de los viajes que ya llegaron, por ruta. */
export function promedioPorRuta(viajes: ViajeGps[]): { ruta: string; viajes: number; promedio: number }[] {
  const m = new Map<string, number[]>();
  for (const v of viajes) if (v.estado === "llego" && v.segundos != null) {
    const k = `${v.zonaOrigen} → ${v.zonaDestino}`; (m.get(k) ?? m.set(k, []).get(k)!).push(v.segundos);
  }
  return [...m.entries()].map(([ruta, s]) => ({ ruta, viajes: s.length, promedio: Math.round(s.reduce((a, b) => a + b, 0) / s.length) })).sort((a, b) => b.viajes - a.viajes);
}
