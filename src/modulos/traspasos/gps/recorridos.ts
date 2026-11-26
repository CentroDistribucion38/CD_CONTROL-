/**
 * TIEMPOS GPS · RECORRIDOS POR VIAJE (parte 2, en prueba: solo superadmin).
 *
 * Cuando facturación confirma la salida, el viaje le aparece al conductor en «Compartir ubicación»
 * (por la placa). Él da check al que va a hacer: desde ahí cada posición del celular queda guardada
 * con ese recorrido, se suman los km, y al entrar a la geocerca del destino el viaje se cierra solo.
 *
 * Todo esto corre en el servidor con la llave de servicio: quien llama YA comprobó sesión y permiso.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Zona } from "./motor";
import { distanciaM, puntoEnPoligono, type Punto } from "./geo";
import { distanciaAPoligono } from "./seguimiento";
import { placaClave, zonaDePunto, type ZonaLigada } from "./plan";

/** Cuánto hacia atrás se buscan los viajes del conductor (el día operativo cruza la medianoche). */
const VENTANA_H = 20;
/** Por debajo de esto el movimiento es ruido del GPS parado: no suma km. */
const PASO_MIN_M = 12;
/** Un salto mayor entre dos envíos seguidos es un error del GPS, no un recorrido. */
const SALTO_MAX_M = 5000;
/** LLEGÓ aunque la geocerca quede corta: basta con estar a esta distancia del borde de la zona destino. Y para contar
 *  que «ya salió» del destino hay que alejarse un poco más (así un GPS que baila en el borde no lo cierra y abre). */
export const MARGEN_LLEGADA_M = 60;
const MARGEN_SALIDA_M = 90;

export type EstadoRecorrido = "en_curso" | "llego" | "cancelado";
export type Recorrido = {
  id: string; viaje: string; estado: EstadoRecorrido; cierre: "geocerca" | "manual" | null;
  inicio: string; fin: string | null; km: number; zonaDestino: string | null;
};
export type ViajeConductor = {
  id: string; codigo: string | null; tipo: string | null; tipoNombre: string | null;
  origen: string | null; destino: string | null; vacio: boolean; documento: string | null;
  salida: string | null; registrado: string;
  /** Nombre de la geocerca del destino; null = el destino no tiene geocerca (el viaje no se cierra solo). */
  geocercaDestino: string | null;
  recorrido: Recorrido | null;
};

type FilaViaje = {
  id: string; codigo: string | null; placa: string | null; tipo: string | null; tipo_nombre: string | null;
  origen: string | null; origen_nombre: string | null; destino: string | null; destino_nombre: string | null;
  vacio: boolean; registrado_en: string; salida_en: string | null; factura_documento: string | null;
};
type FilaRecorrido = {
  id: string; viaje: string; estado: EstadoRecorrido; cierre: "geocerca" | "manual" | null; inicio: string; fin: string | null;
  km: number | string; zona_destino: string | null;
};

const falta = (m: string) => /gps_recorridos|gps_posiciones|schema cache|does not exist/i.test(m);
const FALTA = "Falta correr 2026-11-gps-recorridos.sql en Supabase.";

const aRecorrido = (r: FilaRecorrido, zonas: ZonaLigada[]): Recorrido => ({
  id: r.id, viaje: r.viaje, estado: r.estado, cierre: r.cierre, inicio: r.inicio, fin: r.fin, km: Number(r.km) || 0,
  zonaDestino: zonas.find((z) => z.id === r.zona_destino)?.nombre ?? null,
});

async function zonasLigadas(db: SupabaseClient): Promise<ZonaLigada[]> {
  const { data } = await db.from("gps_zonas").select("id, nombre, color, poligono, punto").eq("activa", true);
  return ((data ?? []) as { id: string; nombre: string; color: string; poligono: Punto[]; punto: string | null }[])
    .map((z) => ({ id: z.id, nombre: z.nombre, color: z.color, poligono: z.poligono, punto: z.punto }));
}

/**
 * Los viajes de una placa que ya puede hacer: con carga, los que facturación ya dejó salir;
 * vacíos, los registrados (no pasan por facturación). En el orden en que salieron.
 */
export async function viajesDeConductor(db: SupabaseClient, placa: string, ahora = new Date()):
  Promise<{ ok: true; viajes: ViajeConductor[] } | { ok: false; estado: number; error: string }> {
  const desde = new Date(ahora.getTime() - VENTANA_H * 3600_000).toISOString();
  const dia = new Date(ahora.getTime() - (VENTANA_H + 24) * 3600_000).toISOString().slice(0, 10);
  const { data, error } = await db.from("v_traspasos_viajes")
    .select("id, codigo, placa, tipo, tipo_nombre, origen, origen_nombre, destino, destino_nombre, vacio, registrado_en, salida_en, factura_documento")
    .eq("vale", true).gte("fecha", dia).not("placa", "is", null).limit(3000);
  if (error) return { ok: false, estado: 500, error: error.message };
  const clave = placaClave(placa);
  const mios = ((data ?? []) as FilaViaje[])
    .filter((v) => placaClave(v.placa) === clave)
    .filter((v) => (v.salida_en && v.salida_en >= desde) || (v.vacio && v.registrado_en >= desde))
    .sort((a, b) => (a.salida_en ?? a.registrado_en).localeCompare(b.salida_en ?? b.registrado_en)
                 || (a.codigo ?? "").localeCompare(b.codigo ?? "", "es", { numeric: true }));

  const zonas = await zonasLigadas(db);
  let recs: FilaRecorrido[] = [];
  if (mios.length) {
    const r = await db.from("gps_recorridos").select("id, viaje, estado, cierre, inicio, fin, km, zona_destino")
      .in("viaje", mios.map((v) => v.id)).neq("estado", "cancelado");
    if (r.error) return { ok: false, estado: falta(r.error.message) ? 409 : 500, error: falta(r.error.message) ? FALTA : r.error.message };
    recs = (r.data ?? []) as FilaRecorrido[];
  }
  return {
    ok: true,
    viajes: mios.map((v) => {
      const rec = recs.find((x) => x.viaje === v.id);
      return {
        id: v.id, codigo: v.codigo, tipo: v.tipo, tipoNombre: v.tipo_nombre,
        origen: v.origen_nombre, destino: v.destino_nombre, vacio: v.vacio, documento: v.factura_documento,
        salida: v.salida_en, registrado: v.registrado_en,
        geocercaDestino: zonaDePunto(v.destino, v.destino_nombre, zonas)?.nombre ?? null,
        recorrido: rec ? aRecorrido(rec, zonas) : null,
      };
    }),
  };
}

type Resultado = { ok: true } | { ok: false; estado: number; error: string };

/** El conductor da check al viaje que va a hacer. */
export async function iniciarRecorrido(db: SupabaseClient, placa: string, viajeId: string, usuario: string | null): Promise<Resultado> {
  const lista = await viajesDeConductor(db, placa);
  if (!lista.ok) return lista;
  const v = lista.viajes.find((x) => x.id === viajeId);
  if (!v) return { ok: false, estado: 404, error: "Ese viaje no es de esta placa o todavía no tiene la salida confirmada." };
  if (v.recorrido) return { ok: false, estado: 409, error: v.recorrido.estado === "llego" ? "Ese viaje ya llegó." : "Ese viaje ya está en curso." };
  if (lista.viajes.some((x) => x.recorrido?.estado === "en_curso"))
    return { ok: false, estado: 409, error: "Ya tienes un viaje en curso. Termínalo o cancélalo antes de iniciar otro." };

  const { data: fila } = await db.from("v_traspasos_viajes").select("origen, origen_nombre, destino, destino_nombre").eq("id", viajeId).maybeSingle();
  const zonas = await zonasLigadas(db);
  const f = fila as { origen: string | null; origen_nombre: string | null; destino: string | null; destino_nombre: string | null } | null;
  const { error } = await db.from("gps_recorridos").insert({
    viaje: viajeId, placa: placaClave(placa),
    zona_origen: f ? zonaDePunto(f.origen, f.origen_nombre, zonas)?.id ?? null : null,
    zona_destino: f ? zonaDePunto(f.destino, f.destino_nombre, zonas)?.id ?? null : null,
    iniciado_por: usuario,
  });
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return { ok: false, estado: 409, error: "Ese viaje ya se inició, o ya tienes otro en curso." };
    return { ok: false, estado: falta(error.message) ? 409 : 500, error: falta(error.message) ? FALTA : error.message };
  }
  return { ok: true };
}

/** Cancelar (se marcó el viaje equivocado) o marcar la llegada a mano (solo si el destino no tiene geocerca). */
export async function cerrarRecorrido(db: SupabaseClient, placa: string, id: string, como: "cancelar" | "llegue"): Promise<Resultado> {
  const { data, error } = await db.from("gps_recorridos").select("id, zona_destino, inicio").eq("id", id).eq("placa", placaClave(placa)).eq("estado", "en_curso").maybeSingle();
  if (error) return { ok: false, estado: falta(error.message) ? 409 : 500, error: falta(error.message) ? FALTA : error.message };
  if (!data) return { ok: false, estado: 404, error: "Ese viaje ya no está en curso." };
  if (como === "llegue" && data.zona_destino) return { ok: false, estado: 409, error: "Este destino tiene geocerca: el viaje se cierra solo cuando entres." };
  const { error: e2 } = await db.from("gps_recorridos")
    .update(como === "cancelar" ? { estado: "cancelado", fin: new Date().toISOString() } : { estado: "llego", cierre: "manual", fin: new Date().toISOString() })
    .eq("id", id).eq("estado", "en_curso");
  if (e2) return { ok: false, estado: 500, error: e2.message };
  return { ok: true };
}

export type Seguimiento = { id: string; estado: EstadoRecorrido; km: number; destino: string | null; llegoAhora: boolean };
type Fix = { lat: number; lng: number; precision: number | null; velocidad: number | null; rumbo: number | null; en: string };

/**
 * Cada posición del celular: se guarda (con el recorrido en curso, si hay), se suman los km y, si entró
 * a la geocerca destino después de haber estado afuera, el viaje se cierra. Si las tablas no existen
 * todavía, no hace nada (la parte 1 sigue funcionando igual).
 */
export async function seguirPosicion(db: SupabaseClient, placa: string, fix: Fix, zonas: Zona[]): Promise<Seguimiento | null> {
  const p = placaClave(placa);
  const { data: r, error } = await db.from("gps_recorridos")
    .select("id, zona_destino, fuera_destino, km, ultimo_lat, ultimo_lng").eq("placa", p).eq("estado", "en_curso").maybeSingle();
  if (error) return null;
  await db.from("gps_posiciones").insert({
    placa: p, recorrido: r?.id ?? null, lat: fix.lat, lng: fix.lng, precision: fix.precision, velocidad: fix.velocidad, rumbo: fix.rumbo, en: fix.en,
  });
  if (!r) return null;

  const aqui: Punto = [fix.lat, fix.lng];
  let km = Number(r.km) || 0;
  const cambios: Record<string, unknown> = {};
  if (r.ultimo_lat == null || r.ultimo_lng == null) Object.assign(cambios, { ultimo_lat: fix.lat, ultimo_lng: fix.lng, ultimo_en: fix.en });
  else {
    const d = distanciaM([r.ultimo_lat, r.ultimo_lng], aqui);
    if (d >= PASO_MIN_M && d <= SALTO_MAX_M) { km += d / 1000; Object.assign(cambios, { km: Math.round(km * 1000) / 1000, ultimo_lat: fix.lat, ultimo_lng: fix.lng, ultimo_en: fix.en }) }
  }

  const zd = zonas.find((z) => z.id === r.zona_destino) ?? null;
  const dist = zd ? (puntoEnPoligono(aqui, zd.poligono) ? 0 : distanciaAPoligono(aqui, zd.poligono)) : Infinity;
  const dentro = !!zd && dist <= MARGEN_LLEGADA_M;
  let llegoAhora = false;
  if (zd && dist > MARGEN_SALIDA_M && !r.fuera_destino) cambios.fuera_destino = true;
  if (zd && dentro && r.fuera_destino) { Object.assign(cambios, { estado: "llego", cierre: "geocerca", fin: fix.en }); llegoAhora = true }

  if (Object.keys(cambios).length) await db.from("gps_recorridos").update(cambios).eq("id", r.id).eq("estado", "en_curso");
  return { id: r.id, estado: llegoAhora ? "llego" : "en_curso", km: Math.round(km * 10) / 10, destino: zd?.nombre ?? null, llegoAhora };
}


/**
 * EL VIAJE ARRANCA SOLO (los conductores no siempre marcan): cuando el vehículo SALE de una zona y la placa tiene un
 * viaje con la salida ya confirmada (o vacío registrado), todavía sin iniciar, cuyo origen es esa zona, se inicia ese
 * viaje (el más antiguo). Si ya tiene uno en curso no hace nada. Devuelve el viaje iniciado, si hubo.
 */
export async function autoIniciar(db: SupabaseClient, placa: string, salioDe: string[]): Promise<{ id: string; origen: string | null; destino: string | null } | null> {
  if (!salioDe.length) return null;
  const p = placaClave(placa);
  const ya = await db.from("gps_recorridos").select("id").eq("placa", p).eq("estado", "en_curso").maybeSingle();
  if (ya.error || ya.data) return null;
  const lista = await viajesDeConductor(db, placa);
  if (!lista.ok) return null;
  const zonas = await zonasLigadas(db);
  const { data: filas } = await db.from("v_traspasos_viajes").select("id, origen, origen_nombre").in("id", lista.viajes.filter((v) => !v.recorrido).map((v) => v.id));
  const origenDe = new Map(((filas ?? []) as { id: string; origen: string | null; origen_nombre: string | null }[]).map((f) => [f.id, zonaDePunto(f.origen, f.origen_nombre, zonas)?.id ?? null]));
  const v = lista.viajes.find((x) => !x.recorrido && salioDe.includes(origenDe.get(x.id) ?? ""));
  if (!v) return null;
  const r = await iniciarRecorrido(db, placa, v.id, null);
  return r.ok ? { id: v.id, origen: v.origen, destino: v.destino } : null;
}
