"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { useConfirmar } from "@/components/Confirmar";
import { centro, circuloComoPoligono, leerUbicacion, type Punto } from "@/modulos/traspasos/gps/geo";
import { duracion, flujosEntreZonas, tiemposPorZona, tramosDe, type Visita, type Zona } from "@/modulos/traspasos/gps/motor";
import { COLORES_ZONA, type Instantanea, type VehiculoVivo, type VisitaGps } from "@/modulos/traspasos/gps/tipos";
import { Demo, ZONAS_DEMO } from "@/modulos/traspasos/gps/demo";
import { cruzarViajes, norm, placaClave, promedioPorRuta, resumenPorTipo, type EstadoViaje, type LineaPlan, type ViajePlan, type ZonaLigada } from "@/modulos/traspasos/gps/plan";
import { MapaGps, type CapaBase, type FlujoMapa, type RutaMapa, type VehiculoMapa, type ZonaMapa } from "./MapaGps";
import { adelgazar, alertasDe, calorPorHora, corto, enVivo, esLarga, lineaDeTiempo, normalesDe, type PosRuta, type Vivo } from "@/modulos/traspasos/gps/seguimiento";
import { LineaTiempo, CalorEspera } from "./LineaTiempo";
import { AvisosCelular } from "./AvisosCelular";

/* ===================================================================
   TIEMPOS GPS — el mapa de los vehículos y sus tiempos por zona

   Las zonas son «cuadritos» en el mapa (Fábrica, Bodega 38, Arenosa, Exportación…): se dibujan aquí o se
   traen de las geocercas de Traccar. Cuando un vehículo ENTRA a una zona se marca el inicio; cuando SALE se
   marca el final y queda EN TRÁNSITO hasta que entra a la siguiente. De ahí salen los tiempos de cada zona
   y los flujos (de dónde a dónde va y cuánto tarda).
   Sin Traccar conectado la pantalla corre en MODO DEMO, con vehículos simulados que no se guardan.
   =================================================================== */
type Rango = "hoy" | "24h" | "7d";
type Pestania = "ahora" | "viajes" | "plan" | "tiempos" | "flujos" | "zonas";
/** Un recorrido con seguimiento (parte 2/3): el viaje que el conductor marcó, con su línea de posiciones. */
type Rec = {
  id: string; viaje: string; placa: string; estado: "en_curso" | "llego"; cierre: string | null; inicio: string; fin: string | null; km: number;
  zonaDestino: string | null; zonaOrigen: string | null; codigo: string | null; origen: string | null; destino: string | null; tipo: string | null; puntos: PosRuta[];
};
/** Trae todas las filas de a 1.000 (lo máximo que entrega Supabase por consulta). */
async function todas<T>(arma: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 30_000) {
  const out: T[] = [];
  for (let a = 0; a < max; a += 1000) {
    const r = await arma(a, a + 999);
    if (r.error) return { data: out, error: r.error };
    out.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 1000) break;
  }
  return { data: out, error: null as { message: string } | null };
}
type PuntoT = { clave: string; nombre: string };

const RANGOS: [Rango, string][] = [["hoy", "Hoy"], ["24h", "24 horas"], ["7d", "7 días"]];
const hoyBogota = () => new Date().toLocaleDateString("sv", { timeZone: "America/Bogota" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
const desdeDe = (r: Rango): string => {
  if (r === "24h") return new Date(Date.now() - 24 * 3600_000).toISOString();
  if (r === "7d") return new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  return new Date(hoyBogota() + "T00:00:00-05:00").toISOString();
};
const GRIS = "#8a94a0", AMBAR = "#ffc20e";
const ESTADO_VIAJE: Record<EstadoViaje, { texto: string; clase: string }> = {
  llego: { texto: "Llegó", clase: "ok" }, en_camino: { texto: "En camino", clase: "ruta" }, en_origen: { texto: "En origen", clase: "ruta" },
  sin_salir: { texto: "Sin salir", clase: "aviso" }, sin_gps: { texto: "Sin GPS", clase: "nada" }, sin_placa: { texto: "Sin placa", clase: "nada" }, sin_zona: { texto: "Falta zona", clase: "aviso" },
};

export function TiemposGps({ puedeEditar }: { puedeEditar: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [real, setReal] = useState<Instantanea | null>(null);
  const [viajes, setViajes] = useState<ViajePlan[]>([]);
  const [lineasPlan, setLineasPlan] = useState<LineaPlan[]>([]);
  const [puntos, setPuntos] = useState<PuntoT[]>([]);
  const [puntoDeZona, setPuntoDeZona] = useState<Map<string, string | null>>(new Map());
  /* LA ZONA QUE SE ESTÁ ARMANDO O AJUSTANDO: por dirección (o tocando el mapa) se pone un círculo de N metros y luego
     se arrastran sus esquinas en el mapa hasta que encierre el patio. Con id = se está ajustando una que ya existe. */
  const [editar, setEditar] = useState<null | { id?: string; nombre: string; color: string; punto: string; centro: Punto | null; radio: number; poligono: Punto[]; llave: string }>(null);
  const [busca, setBusca] = useState<{ texto: string; cargando: boolean; resultados: { nombre: string; lat: number; lng: number }[] | null }>({ texto: "", cargando: false, resultados: null });
  const [falta, setFalta] = useState(false);
  const [rango, setRango] = useState<Rango>("hoy");
  const [capa, setCapa] = useState<CapaBase>("calles");
  const [tab, setTab] = useState<Pestania>("viajes");
  const [sel, setSel] = useState<string | null>(null);
  const [dibujo, setDibujo] = useState<null | "rect" | "poli" | "punto">(null);
  const [nueva, setNueva] = useState<{ poligono: Punto[]; nombre: string; color: string; punto: string } | null>(null);
  const [verFlujos, setVerFlujos] = useState(true);
  const [ajuste, setAjuste] = useState(0);
  const [ok, setOk] = useState<string | null>(null);
  const [mal, setMal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [reloj, setReloj] = useState(() => Date.now());
  const [demo, setDemo] = useState<Instantanea | null>(null);
  const demoRef = useRef<Demo | null>(null);
  /* PARTE 3: los recorridos con seguimiento, el recorrido escogido, su repetición y la historia de 14 días para «lo normal». */
  const [recs, setRecs] = useState<Rec[]>([]);
  const [faltaRec, setFaltaRec] = useState(false);
  const [selRec, setSelRec] = useState<string | null>(null);
  const [repite, setRepite] = useState(0);
  const [hist, setHist] = useState<VisitaGps[]>([]);
  const [verAvisos, setVerAvisos] = useState(false);
  const ultimoId = useRef(0);
  const puntosRef = useRef(new Map<string, PosRuta[]>());

  /* ------------------------------------------------------------ lo que hay en la base */
  const cargar = useCallback(async () => {
    const desde = desdeDe(rango);
    const [z, v, e, vi] = await Promise.all([
      supabase.from("gps_zonas").select("id, nombre, color, poligono, punto").eq("activa", true).order("nombre"),
      supabase.from("gps_vehiculos").select("id, nombre, placa, activo").eq("activo", true),
      supabase.from("gps_estado").select("vehiculo_id, lat, lng, velocidad, rumbo, fix_en, zona_id"),
      supabase.from("gps_visitas").select("id, vehiculo_id, zona_id, entrada, salida").or(`entrada.gte.${desde},salida.is.null`).order("entrada", { ascending: true }).limit(8000),
    ]);
    const err = z.error ?? v.error ?? e.error ?? vi.error;
    if (err) { setFalta(/gps_|schema cache|does not exist|no existe/i.test(err.message)); if (!/gps_|schema cache|does not exist|no existe/i.test(err.message)) setMal(traducirError(err.message)); return }
    setFalta(false);
    setPuntoDeZona(new Map((z.data ?? []).map((x) => [x.id as string, (x.punto as string | null) ?? null])));
    const zonas: Zona[] = (z.data ?? []).map((x) => ({ id: x.id as string, nombre: x.nombre as string, color: x.color as string, poligono: x.poligono as Punto[] }));
    const est = new Map((e.data ?? []).map((x) => [x.vehiculo_id as string, x]));
    const vehiculos: VehiculoVivo[] = (v.data ?? []).filter((x) => est.has(x.id as string)).map((x) => {
      const s = est.get(x.id as string)!;
      return { id: x.id as string, nombre: x.nombre as string, placa: (x.placa as string | null) ?? null, lat: s.lat as number, lng: s.lng as number, velocidad: (s.velocidad as number | null) ?? null, rumbo: (s.rumbo as number | null) ?? null, fixEn: s.fix_en as string, zonaId: (s.zona_id as string | null) ?? null };
    });
    const visitas: VisitaGps[] = (vi.data ?? []).map((x) => ({ id: String(x.id), vehiculo: x.vehiculo_id as string, zona: x.zona_id as string, entrada: x.entrada as string, salida: (x.salida as string | null) ?? null }));
    setReal({ zonas, vehiculos, visitas, ahora: new Date().toISOString(), demo: false });
  }, [supabase, rango]);

  /* Lo de Traspasos: los viajes registrados hoy, el plan de hoy y los puntos. Si la pantalla no existe o no hay permiso, simplemente no hay. */
  const cargarViajes = useCallback(async () => {
    const hoy = hoyBogota();
    const [vj, pl, pu] = await Promise.all([
      supabase.from("v_traspasos_viajes").select("codigo, placa, tipo, tipo_nombre, turno, hora, origen, origen_nombre, destino, destino_nombre, vacio").eq("fecha", hoy).eq("vale", true).limit(1000),
      supabase.from("v_traspasos_control").select("tipo, tipo_nombre, turno, planeado, cumplido, faltan").eq("fecha", hoy).limit(500),
      supabase.from("traspasos_puntos").select("clave, nombre").order("nombre"),
    ]);
    setViajes(vj.error ? [] : (vj.data ?? []).map((x) => ({
      codigo: (x.codigo as string | null) ?? null, placa: (x.placa as string | null) ?? null, tipo: (x.tipo as string | null) ?? null, tipoNombre: (x.tipo_nombre as string | null) ?? null,
      turno: (x.turno as string | null) ?? null, hora: (x.hora as string | null) ?? null, origen: (x.origen as string | null) ?? null, origenNombre: (x.origen_nombre as string | null) ?? null,
      destino: (x.destino as string | null) ?? null, destinoNombre: (x.destino_nombre as string | null) ?? null, vacio: !!x.vacio,
    })));
    setLineasPlan(pl.error ? [] : (pl.data ?? []).map((x) => ({ tipo: x.tipo as string, tipoNombre: (x.tipo_nombre as string) ?? (x.tipo as string), turno: x.turno as string, planeado: Number(x.planeado) || 0, cumplido: Number(x.cumplido) || 0, faltan: Number(x.faltan) || 0 })));
    setPuntos(pu.error ? [] : ((pu.data ?? []) as PuntoT[]));
  }, [supabase]);

  /* LOS RECORRIDOS DE HOY (y los que sigan en curso) con sus posiciones. Las posiciones se piden solo las nuevas
     (id mayor que la última que ya se tiene), así cada vuelta de 10 s trae poco. */
  const cargarRecorridos = useCallback(async () => {
    const desde = desdeDe(rango === "7d" ? "24h" : rango);
    const r = await supabase.from("gps_recorridos").select("id, viaje, placa, estado, cierre, inicio, fin, km, zona_destino, zona_origen")
      .or(`inicio.gte.${desde},estado.eq.en_curso`).neq("estado", "cancelado").order("inicio", { ascending: true }).limit(500);
    if (r.error) { setFaltaRec(/gps_recorridos|schema cache|does not exist/i.test(r.error.message)); setRecs([]); return }
    setFaltaRec(false);
    const filas = (r.data ?? []) as { id: string; viaje: string; placa: string; estado: "en_curso" | "llego"; cierre: string | null; inicio: string; fin: string | null; km: number | string; zona_destino: string | null; zona_origen: string | null }[];
    if (!filas.length) { setRecs([]); return }
    const ids = filas.map((x) => x.id);
    const [vj, ps] = await Promise.all([
      supabase.from("v_traspasos_viajes").select("id, codigo, origen_nombre, destino_nombre, tipo_nombre").in("id", filas.map((x) => x.viaje)),
      todas<{ id: number; recorrido: string; lat: number; lng: number; velocidad: number | null; en: string }>((a, b) =>
        supabase.from("gps_posiciones").select("id, recorrido, lat, lng, velocidad, en").in("recorrido", ids).gt("id", ultimoId.current).order("id", { ascending: true }).range(a, b)),
    ]);
    const pm = puntosRef.current;
    for (const k of [...pm.keys()]) if (!ids.includes(k)) pm.delete(k);
    for (const x of ps.data) {
      (pm.get(x.recorrido) ?? pm.set(x.recorrido, []).get(x.recorrido)!).push({ lat: x.lat, lng: x.lng, en: x.en, velocidad: x.velocidad });
      if (x.id > ultimoId.current) ultimoId.current = x.id;
    }
    const info = new Map(((vj.data ?? []) as { id: string; codigo: string | null; origen_nombre: string | null; destino_nombre: string | null; tipo_nombre: string | null }[]).map((x) => [x.id, x]));
    setRecs(filas.map((x) => {
      const i = info.get(x.viaje);
      return { id: x.id, viaje: x.viaje, placa: x.placa, estado: x.estado, cierre: x.cierre, inicio: x.inicio, fin: x.fin, km: Number(x.km) || 0, zonaDestino: x.zona_destino, zonaOrigen: x.zona_origen,
        codigo: i?.codigo ?? null, origen: i?.origen_nombre ?? null, destino: i?.destino_nombre ?? null, tipo: i?.tipo_nombre ?? null, puntos: [...(pm.get(x.id) ?? [])] };
    }));
  }, [supabase, rango]);
  useEffect(() => { ultimoId.current = 0; puntosRef.current = new Map() }, [rango]);

  /* LA HISTORIA PARA «LO NORMAL»: las visitas cerradas de los últimos 14 días (una vez al abrir y cada 10 min). */
  const cargarHistoria = useCallback(async () => {
    const desde = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
    const r = await todas<{ id: number; vehiculo_id: string; zona_id: string; entrada: string; salida: string | null }>((a, b) =>
      supabase.from("gps_visitas").select("id, vehiculo_id, zona_id, entrada, salida").gte("entrada", desde).not("salida", "is", null).order("entrada", { ascending: true }).range(a, b), 20_000);
    if (!r.error) setHist(r.data.map((x) => ({ id: String(x.id), vehiculo: x.vehiculo_id, zona: x.zona_id, entrada: x.entrada, salida: x.salida })));
  }, [supabase]);
  useEffect(() => { void cargarHistoria(); const t = setInterval(() => void cargarHistoria(), 600_000); return () => clearInterval(t) }, [cargarHistoria]);

  /* ¿Hay Traccar conectado? */
  useEffect(() => {
    let vivo = true;
    fetch("/api/traspasos/gps").then((r) => r.json()).then((j: { conectado?: boolean }) => { if (vivo) setConectado(!!j.conectado) }).catch(() => { if (vivo) setConectado(false) });
    return () => { vivo = false };
  }, []);

  useEffect(() => { void cargar(); void cargarViajes() }, [cargar, cargarViajes]);

  /* Mientras la pantalla está abierta: con Traccar se sincroniza cada 15 s; sin él solo se relee la base. */
  useEffect(() => {
    if (conectado === null) return;
    const vuelta = async () => {
      if (document.hidden) return;
      if (conectado) {
        const r = await fetch("/api/traspasos/gps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "sincronizar" }) }).catch(() => null);
        const j = r ? ((await r.json().catch(() => ({}))) as { error?: string }) : { error: "Sin conexión con el servidor." };
        setMal(j.error ?? null);
      }
      await Promise.all([cargar(), cargarRecorridos()]);
    };
    void vuelta();
    const t = setInterval(() => void vuelta(), conectado ? 15_000 : 10_000);
    return () => clearInterval(t);
  }, [conectado, cargar, cargarRecorridos]);

  useEffect(() => { const t = setInterval(() => setReloj(Date.now()), 1000); return () => clearInterval(t) }, []);

  /* ------------------------------------------------------------ modo demo (sin Traccar) */
  const enDemo = conectado === false && (real?.vehiculos.length ?? 0) === 0;
  const zonasParaDemo = real && real.zonas.length > 0 ? real.zonas : ZONAS_DEMO;
  const llaveZonas = zonasParaDemo.map((z) => z.id).join("|");
  useEffect(() => {
    if (!enDemo) { demoRef.current = null; setDemo(null); return }
    demoRef.current = new Demo(zonasParaDemo);
    setDemo(demoRef.current.foto());
    const t = setInterval(() => { if (demoRef.current) setDemo(demoRef.current.avanzar()) }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enDemo, llaveZonas]);

  const foto: Instantanea | null = enDemo ? demo : real;
  const ahoraMs = enDemo && foto ? Date.parse(foto.ahora) : reloj;
  const ahoraIso = new Date(ahoraMs).toISOString();

  /* ------------------------------------------------------------ lo que se deriva */
  const d = useMemo(() => {
    if (!foto) return null;
    const nombreZ = new Map(foto.zonas.map((z) => [z.id, z.nombre]));
    const colorZ = new Map(foto.zonas.map((z) => [z.id, z.color]));
    const nombreV = new Map(foto.vehiculos.map((v) => [v.id, v.placa || v.nombre]));
    const visitasN: Visita[] = foto.visitas.filter((v) => nombreZ.has(v.zona)).map((v) => ({ vehiculo: v.vehiculo, zona: nombreZ.get(v.zona)!, entrada: v.entrada, salida: v.salida }));
    return { nombreZ, colorZ, nombreV, visitasN };
  }, [foto]);

  const calc = useMemo(() => {
    if (!foto || !d) return null;
    const tiempos = tiemposPorZona(d.visitasN, ahoraIso).sort((a, b) => b.total - a.total);
    const tramos = tramosDe(d.visitasN, ahoraIso);
    const flujos = flujosEntreZonas(tramos);
    const centros = new Map(foto.zonas.map((z) => [z.nombre, centro(z.poligono)]));
    const dentro = new Map<string, number>();
    const abierta = new Map<string, VisitaGps>(), ultimaCerrada = new Map<string, VisitaGps>();
    for (const v of foto.visitas) {
      if (!v.salida) { abierta.set(v.vehiculo, v); dentro.set(v.zona, (dentro.get(v.zona) ?? 0) + 1) }
      else { const u = ultimaCerrada.get(v.vehiculo); if (!u || (u.salida ?? "") < v.salida) ultimaCerrada.set(v.vehiculo, v) }
    }
    const vehs = foto.vehiculos.map((v) => {
      const ab = abierta.get(v.id) ?? (v.zonaId ? foto.visitas.find((x) => x.vehiculo === v.id && x.zona === v.zonaId && !x.salida) : undefined);
      const uc = ultimaCerrada.get(v.id);
      const estado: VehiculoMapa["estado"] = ab ? "dentro" : uc ? "transito" : "quieto";
      const desdeIso = ab ? ab.entrada : uc?.salida ?? null;
      const segs = desdeIso ? Math.max(0, Math.round((ahoraMs - Date.parse(desdeIso)) / 1000)) : 0;
      const zonaN = ab ? d.nombreZ.get(ab.zona) ?? "?" : null;
      const color = ab ? d.colorZ.get(ab.zona) ?? GRIS : estado === "transito" ? AMBAR : GRIS;
      const texto = estado === "dentro" ? `En ${zonaN} · ${duracion(segs)}` : estado === "transito" ? `En tránsito desde ${d.nombreZ.get(uc!.zona) ?? "?"} · ${duracion(segs)}` : "Sin pasar por una zona";
      return { v, estado, color, texto, segs, zonaN, nombre: v.placa || v.nombre };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
    const enZonas = vehs.filter((x) => x.estado === "dentro").length;
    const enTransito = vehs.filter((x) => x.estado === "transito").length;
    const entradas = foto.visitas.length;
    const totalSegs = d.visitasN.reduce((t, v) => t + Math.max(0, Math.round(((v.salida ? Date.parse(v.salida) : ahoraMs) - Date.parse(v.entrada)) / 1000)), 0);
    return { tiempos, tramos, flujos, centros, dentro, vehs, enZonas, enTransito, entradas, promedio: entradas ? Math.round(totalSegs / entradas) : 0 };
  }, [foto, d, ahoraIso, ahoraMs]);

  const zonasMapa: ZonaMapa[] = useMemo(() => (foto && calc ? foto.zonas.map((z) => ({ ...z, adentro: calc.dentro.get(z.id) ?? 0 })) : []), [foto, calc]);
  const vehiculosMapa: VehiculoMapa[] = useMemo(() => (calc ? calc.vehs.map((x) => ({ id: x.v.id, etiqueta: x.nombre, lat: x.v.lat, lng: x.v.lng, rumbo: x.v.rumbo, estado: x.estado, color: x.color })) : []), [calc]);
  const flujosMapa: FlujoMapa[] = useMemo(() => {
    if (!calc || !verFlujos) return [];
    return calc.flujos.flatMap((f) => {
      const a = calc.centros.get(f.origen), b = calc.centros.get(f.destino);
      return a && b ? [{ origen: a, destino: b, viajes: f.viajes, texto: `${f.origen} → ${f.destino} · ${f.viajes} ${f.viajes === 1 ? "viaje" : "viajes"} · ${duracion(f.promedio)} en promedio` }] : [];
    });
  }, [calc, verFlujos]);
  const viajePorPlaca = useMemo(() => { const m = new Map<string, ViajePlan>(); for (const v of viajes) if (v.placa && !m.has(placaClave(v.placa))) m.set(placaClave(v.placa), v); return m }, [viajes]);
  const zonasLigadas: ZonaLigada[] = useMemo(() => (foto ? foto.zonas.map((z) => ({ ...z, punto: puntoDeZona.get(z.id) ?? null })) : []), [foto, puntoDeZona]);
  const plan = useMemo(() => {
    if (!foto) return null;
    const hoyIso = desdeDe("hoy");
    const visitasHoy = foto.visitas.filter((v) => !v.salida || v.salida >= hoyIso);
    const vg = cruzarViajes(viajes, zonasLigadas, foto.vehiculos.map((v) => ({ id: v.id, placa: v.placa })), visitasHoy);
    const cuenta = (e: EstadoViaje) => vg.filter((x) => x.estado === e).length;
    const segs = vg.filter((x) => x.segundos != null).map((x) => x.segundos!);
    return { vg, tipos: resumenPorTipo(lineasPlan, vg), rutas: promedioPorRuta(vg), llegaron: cuenta("llego"), enCamino: cuenta("en_camino"), enOrigen: cuenta("en_origen"),
      sinGps: cuenta("sin_gps") + cuenta("sin_placa"), sinSalir: cuenta("sin_salir"), sinZona: cuenta("sin_zona"), promedio: segs.length ? Math.round(segs.reduce((a, b) => a + b, 0) / segs.length) : 0 };
  }, [foto, viajes, lineasPlan, zonasLigadas]);
  const centroInicial: Punto = useMemo(() => (foto && foto.zonas.length ? centro(foto.zonas[0].poligono) : [10.9878, -74.7869]), [foto]);

  /* ------------------------------------------------------------ acciones sobre las zonas */
  async function guardarZona() {
    if (!nueva) return;
    const nombre = nueva.nombre.trim();
    if (!nombre) { setMal("Ponle un nombre a la zona."); return }
    setMal(null); setOcupado(true);
    const { error } = await supabase.from("gps_zonas").insert({ nombre, color: nueva.color, poligono: nueva.poligono, origen: "dibujada", punto: nueva.punto || puntoSugerido(nombre) });
    setOcupado(false);
    if (error) { setMal(/duplicate|unique|gps_zonas_nombre/i.test(error.message) ? `Ya hay una zona llamada «${nombre}».` : /gps_zonas|schema cache|does not exist/i.test(error.message) ? "Falta correr 2026-10-traspasos-gps.sql en Supabase." : traducirError(error.message)); return }
    setNueva(null); setOk(`Zona «${nombre}» guardada. Desde ahora cuenta las entradas y salidas.`);
    await cargar(); setAjuste((n) => n + 1);
  }
  /** El punto de Traspasos que se llama igual que la zona (para ligarlos sin que nadie lo piense). */
  function puntoSugerido(nombre: string): string | null {
    const n = norm(nombre);
    return puntos.find((p) => norm(p.nombre) === n)?.clave ?? null;
  }
  async function ligarPunto(id: string, punto: string) {
    const { error } = await supabase.from("gps_zonas").update({ punto: punto || null }).eq("id", id);
    if (error) setMal(traducirError(error.message)); else { setOk("Zona ligada al punto de Traspasos."); await cargar() }
  }
  /** Busca una dirección: coordenadas o Plus Code directo; si no, OpenStreetMap (Nominatim), con las abreviaturas de las
   *  direcciones colombianas escritas completas (Cra → Carrera, Cl → Calle…). Si no encuentra el número, prueba la vía sola. */
  async function buscarDireccion(dado?: string) {
    const texto = (dado ?? busca.texto).trim();
    if (!texto) return;
    const ref: Punto = foto && foto.zonas.length ? centro(foto.zonas[0].poligono) : [10.98, -74.8];
    const directo = leerUbicacion(texto, ref);
    if (directo) { setBusca({ texto, cargando: false, resultados: null }); ponerCentro(directo); return }
    setBusca({ texto, cargando: true, resultados: null });
    const largo = texto
      .replace(/\b(cra|kra|kr|cr|carr)\.?\s*/gi, "Carrera ").replace(/\b(cll|cl|clle)\.?\s*/gi, "Calle ")
      .replace(/\b(dg|diag)\.?\s*/gi, "Diagonal ").replace(/\b(tv|tr|trans|transv)\.?\s*/gi, "Transversal ")
      .replace(/\b(av|avda)\.?\s*/gi, "Avenida ").replace(/\s*(#|no\.?|n°)\s*/gi, " # ").replace(/\s+/g, " ").trim();
    const conCiudad = (t: string) => (/,/.test(t) ? `${t}, Colombia` : `${t}, Atlántico, Colombia`);
    const vb = `${ref[1] - 0.5},${ref[0] + 0.5},${ref[1] + 0.5},${ref[0] - 0.5}`;
    const pedirN = async (q: string) => {
      const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=co&accept-language=es&viewbox=${vb}&q=${encodeURIComponent(q)}`;
      const r = await fetch(u, { headers: { Accept: "application/json" } }).catch(() => null);
      const j = r && r.ok ? ((await r.json().catch(() => [])) as { display_name: string; lat: string; lon: string }[]) : [];
      return j.map((x) => ({ nombre: x.display_name.split(",").slice(0, 4).join(",").trim(), lat: Number(x.lat), lng: Number(x.lon) }));
    };
    let res = await pedirN(conCiudad(largo));
    if (!res.length && largo.includes("#")) res = await pedirN(conCiudad(largo.split("#")[0].trim() + (largo.includes(",") ? largo.slice(largo.indexOf(",")) : "")));
    /* Un solo resultado: se pone de una el perímetro ahí. Varios: se escoge en la lista de la derecha. */
    if (res.length === 1) { setBusca((b) => ({ ...b, cargando: false, resultados: null })); ponerCentro([res[0].lat, res[0].lng]); return }
    setBusca((b) => ({ ...b, cargando: false, resultados: res }));
    if (!res.length) setMal("No encontré esa dirección. Prueba con la vía y la ciudad (Calle 30, Soledad), con coordenadas de Google Maps, o toca el sitio en el mapa.");
  }
  /** Empieza una zona nueva por dirección (desde el botón de Zonas o desde el buscador del mapa). */
  const nuevaPorDireccion = () => {
    setOk(null); setMal(null); setTab("zonas");
    setEditar({ nombre: "", color: COLORES_ZONA[(foto?.zonas.length ?? 0) % COLORES_ZONA.length], punto: "", centro: null, radio: 150, poligono: [], llave: "nueva" });
  };
  /** EL BUSCADOR DEL MAPA: escribes la dirección y Enter → se abre «Zona por dirección» con el perímetro puesto ahí. */
  const [dirMapa, setDirMapa] = useState("");
  const buscarEnMapa = () => {
    const t = dirMapa.trim();
    if (!t || dibujo || nueva) return;
    if (!editar || editar.id) nuevaPorDireccion();
    void buscarDireccion(t);
  };
  /** Pone el círculo de la zona en un sitio (o lo vuelve a armar con otro radio). */
  const ponerCentro = (c: Punto, radio = editar?.radio || 150) => setEditar((e) => e && ({ ...e, centro: c, radio, poligono: circuloComoPoligono(c, radio, 12), llave: `c${Date.now()}` }));
  async function guardarEdicion() {
    if (!editar) return;
    const nombre = editar.nombre.trim();
    if (!nombre) { setMal("Ponle un nombre a la zona."); return }
    if (editar.poligono.length < 3) { setMal("Busca la dirección o toca el sitio en el mapa."); return }
    setMal(null); setOcupado(true);
    const fila = { nombre, color: editar.color, poligono: editar.poligono, punto: editar.punto || puntoSugerido(nombre) };
    const { error } = editar.id
      ? await supabase.from("gps_zonas").update(fila).eq("id", editar.id)
      : await supabase.from("gps_zonas").insert({ ...fila, origen: "dibujada" });
    setOcupado(false);
    if (error) { setMal(/duplicate|unique|gps_zonas_nombre/i.test(error.message) ? `Ya hay una zona llamada «${nombre}».` : traducirError(error.message)); return }
    setOk(editar.id ? `Zona «${nombre}» ajustada.` : `Zona «${nombre}» creada. Desde ahora cuenta las entradas y salidas.`);
    setEditar(null); setBusca({ texto: "", cargando: false, resultados: null }); setDirMapa("");
    await cargar();
  }
  async function quitarZona(id: string, nombre: string) {
    if (!(await pedir({ titulo: `Quitar la zona «${nombre}»`, dice: "Deja de contar entradas y salidas en ella. Lo que ya se registró se conserva.", confirmar: "Quitar zona", peligro: true }))) return;
    setOcupado(true);
    const { error } = await supabase.from("gps_zonas").update({ activa: false }).eq("id", id);
    setOcupado(false);
    if (error) { setMal(traducirError(error.message)); return }
    setOk(`Zona «${nombre}» quitada.`); await cargar();
  }
  async function traerDeTraccar() {
    setOcupado(true); setMal(null); setOk(null);
    const r = await fetch("/api/traspasos/gps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "zonas" }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { error?: string; nuevas?: number; omitidas?: number; total?: number }) : { error: "Sin conexión con el servidor." };
    setOcupado(false);
    if (j.error) { setMal(j.error); return }
    setOk(`De Traccar: ${j.nuevas ?? 0} ${j.nuevas === 1 ? "zona nueva" : "zonas nuevas"}${j.omitidas ? ` (${j.omitidas} ya estaban o no sirven como zona)` : ""}.`);
    await cargar(); setAjuste((n) => n + 1);
  }
  async function ponerPlaca(id: string, placa: string) {
    const { error } = await supabase.from("gps_vehiculos").update({ placa: placa.trim().toUpperCase() || null }).eq("id", id);
    if (error) setMal(traducirError(error.message)); else { setOk("Placa guardada."); await cargar() }
  }

  /* ------------------------------------------------------------ la pantalla */
  if (falta) {
    return (
      <div className="tg">
        <p className="tg-aviso mal" role="alert">Falta correr <code>supabase/migraciones/2026-10-traspasos-gps.sql</code> en Supabase para estrenar esta pantalla.</p>
      </div>
    );
  }

  const nVeh = calc?.vehs.length ?? 0;

  /* ------------------------------------------------------------ PARTE 3: en vivo, línea de tiempo, tiempos y alertas */
  const seg3 = useMemo(() => {
    if (!foto || !d) return null;
    const zonasS = foto.zonas;
    const vehDePlaca = new Map(foto.vehiculos.filter((v) => v.placa).map((v) => [placaClave(v.placa), v.id]));
    const recsV = recs.map((r) => {
      const destino = zonasS.find((z) => z.id === r.zonaDestino) ?? null;
      const vivo: Vivo | null = r.estado === "en_curso" ? enVivo(r.puntos, r.km, destino, zonasS, ahoraMs) : null;
      return { ...r, vehiculo: vehDePlaca.get(placaClave(r.placa)) ?? null, destinoZona: destino?.nombre ?? null, vivo };
    });
    const enCurso = recsV.filter((r) => r.estado === "en_curso");
    const parados = new Map<string, number>();
    for (const r of enCurso) if (r.vehiculo && r.vivo && !r.vivo.enZona && r.vivo.parado > 0) parados.set(r.vehiculo, r.vivo.parado);
    /* lo normal: 14 días de visitas cerradas (con nombre de zona) */
    const histN: Visita[] = hist.filter((v) => d.nombreZ.has(v.zona)).map((v) => ({ vehiculo: v.vehiculo, zona: d.nombreZ.get(v.zona)!, entrada: v.entrada, salida: v.salida }));
    const normales = normalesDe(histN);
    const hoyN = normalesDe(d.visitasN);
    const alertas = enDemo ? [] : alertasDe(d.visitasN, normales, parados, d.nombreV, ahoraIso);
    /* la ventana de la línea de tiempo: hoy de 00 a 24; si no, las últimas 24 h */
    const ini = rango === "hoy" ? desdeDe("hoy") : new Date(ahoraMs - 24 * 3600_000).toISOString();
    const fin = rango === "hoy" ? new Date(Date.parse(ini) + 24 * 3600_000).toISOString() : ahoraIso;
    const colorN = new Map(foto.zonas.map((z) => [z.nombre, z.color]));
    const filas = lineaDeTiempo(d.visitasN, colorN, normales, ini, fin, ahoraIso)
      .map((f) => ({ ...f, nombre: d.nombreV.get(f.vehiculo) ?? "—" })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
    const calor = calorPorHora(d.visitasN, ahoraIso);
    return { recsV, enCurso, terminados: recsV.filter((r) => r.estado === "llego").reverse(), normales, hoyN, alertas, ventana: { ini, fin }, filas, calor };
  }, [foto, d, recs, hist, ahoraMs, ahoraIso, rango, enDemo]);

  const recSel = seg3?.recsV.find((r) => r.id === selRec) ?? null;
  /* El detalle muestra el escogido; si no hay ninguno (ni vehículo escogido), el primer viaje en curso. */
  const recDet = recSel ?? (sel ? null : seg3?.enCurso[0] ?? null);
  const detId = recDet?.id ?? null;
  const rutasMapa: RutaMapa[] = useMemo(() => (seg3 ? seg3.recsV.filter((r) => r.estado === "en_curso" || r.id === detId).map((r) => ({
    id: r.id, puntos: adelgazar(r.puntos).map((p) => [p.lat, p.lng] as Punto), enCurso: r.estado === "en_curso", sel: r.id === detId,
    texto: `${r.placa} · ${r.origen ?? "?"} → ${r.destino ?? "?"} · ${r.km.toLocaleString("es-CO", { maximumFractionDigits: 1 })} km`,
  })) : []), [seg3, detId]);
  const puntosSel = useMemo(() => (recSel ? adelgazar(recSel.puntos).map((p) => [p.lat, p.lng] as Punto) : []), [recSel]);
  const puntosDet = useMemo(() => (recDet ? adelgazar(recDet.puntos).map((p) => [p.lat, p.lng] as Punto) : []), [recDet]);
  /** Escoger un recorrido: se resalta su línea, el mapa se encuadra en ella y su vehículo queda escogido. */
  const escogerRec = (id: string | null) => {
    setSelRec(id); setRepite(0);
    const r = seg3?.recsV.find((x) => x.id === id);
    if (r?.vehiculo) setSel(r.vehiculo);
  };
  const kmTxt = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: n < 10 ? 1 : 0 })} km`;
  return (
    <div className="tg">
      {dialogo}
      <header className="tg-cab">
        <div>
          <p className="tg-ojo">Traspasos · Tiempos GPS</p>
          <h1>Seguimiento de flota</h1>
        </div>
        <div className="tg-controles">
          <button type="button" className="tg-btn tg-btn-avisos" onClick={() => setVerAvisos(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>Avisos al celular
          </button>
          <div className="tg-seg" role="group" aria-label="Periodo">
            {RANGOS.map(([k, et]) => <button key={k} type="button" aria-pressed={rango === k} onClick={() => setRango(k)}>{et}</button>)}
          </div>
          <div className="tg-seg" role="group" aria-label="Fondo del mapa">
            {([["calles", "Calles"], ["oscuro", "Oscuro"], ["satelite", "Satélite"]] as [CapaBase, string][]).map(([k, et]) => <button key={k} type="button" aria-pressed={capa === k} onClick={() => setCapa(k)}>{et}</button>)}
          </div>
        </div>
      </header>

      {enDemo && <p className="tg-aviso" role="note"><b>MODO DEMO.</b> Todavía nadie está compartiendo su ubicación: estos vehículos son simulados (el reloj corre 20 veces más rápido) y nada se guarda. Para verlo de verdad, el conductor abre <b>Traspasos → Compartir ubicación</b> en su celular (o se conecta Traccar). Las zonas sí son de verdad: dibújalas en la pestaña «Zonas».</p>}
      {conectado && nVeh === 0 && <p className="tg-aviso" role="status">Traccar conectado. Esperando la primera posición de los equipos…</p>}
      {mal && <p className="tg-aviso mal" role="alert">{mal}</p>}
      {ok && <p className="tg-aviso bien" role="status">{ok}</p>}

      <section className="tg-kpis" aria-label="Resumen">
        <div className="k-ruta"><span>en ruta</span><b>{seg3?.enCurso.length ?? 0}</b></div>
        <div className="k-zona"><span>en una zona</span><b>{calc?.enZonas ?? 0}</b></div>
        <div className="k-tran"><span>en tránsito</span><b>{calc?.enTransito ?? 0}</b></div>
        <div className="k-viajes"><span>viajes con GPS</span><b>{seg3?.recsV.length ?? 0}</b></div>
        <div className="k-espera"><span>espera promedio</span><b>{calc?.promedio ? corto(calc.promedio) : "—"}</b></div>
        <button type="button" className={"k-al" + (seg3?.alertas.length ? " hay" : "")} onClick={() => setTab("tiempos")} aria-label="Ver las alertas en Tiempos">
          <span>{seg3?.alertas.length === 1 ? "alerta" : "alertas"}</span><b>{seg3?.alertas.length ?? 0}</b>
        </button>
      </section>

      <div className="tg-cuerpo tres">
        <div className={"tg-mapa-col" + (dibujo ? " dibujando" : "")}>
          <MapaGps zonas={editar?.id ? zonasMapa.filter((z) => z.id !== editar.id) : zonasMapa} vehiculos={vehiculosMapa} flujos={flujosMapa} capa={capa} dibujo={dibujo}
                   edicion={editar && editar.poligono.length >= 3 ? { poligono: editar.poligono, color: editar.color, llave: editar.llave } : null}
                   alEditar={(p) => setEditar((e) => e && ({ ...e, poligono: p }))}
                   alDibujar={(p) => {
                     setDibujo(null);
                     if (p.length === 1) { ponerCentro(p[0]); return }
                     setNueva({ poligono: p, nombre: "", color: COLORES_ZONA[(foto?.zonas.length ?? 0) % COLORES_ZONA.length], punto: "" }); setTab("zonas");
                   }}
                   alCancelarDibujo={() => setDibujo(null)} seleccion={sel}
                   alSeleccionar={(id) => {
                     setSel(id);
                     const r = id ? seg3?.enCurso.find((x) => x.vehiculo === id) : null;
                     if (r) { setSelRec(r.id); setTab("viajes") } else { if (!id) setSelRec(null); if (id) setTab("ahora") }
                   }}
                   ajustar={ajuste} centroInicial={centroInicial}
                   rutas={rutasMapa} alRuta={(id) => { escogerRec(id); setTab("viajes") }}
                   encuadrar={recSel && recSel.estado === "llego" ? { puntos: puntosSel, llave: recSel.id } : null}
                   repetir={recSel && repite > 0 ? { puntos: puntosSel, llave: `${recSel.id}-${repite}`, etiqueta: recSel.placa } : null} />
          {dibujo && (
            <div className="tg-guia" role="status">
              {dibujo === "punto" ? "Toca en el mapa el centro del patio o la bodega." : dibujo === "rect" ? "Haz clic en una esquina y luego en la esquina opuesta." : "Haz clic en cada vértice. Doble clic o Enter para cerrar la zona."} <button type="button" onClick={() => setDibujo(null)}>Cancelar (Esc)</button>
            </div>
          )}
          {puedeEditar && !dibujo && (
            <form className="tg-mapa-busca" role="search" onSubmit={(e) => { e.preventDefault(); buscarEnMapa() }}>
              <span aria-hidden="true">⌖</span>
              <input value={dirMapa} onChange={(e) => setDirMapa(e.target.value)} disabled={!!dibujo || !!nueva || !!editar?.id}
                placeholder="Dirección para una geocerca: Cra 38 #10-50, Barranquilla" aria-label="Dirección para crear una geocerca" />
              <button type="submit" disabled={!dirMapa.trim() || busca.cargando || !!dibujo || !!nueva || !!editar?.id}>{busca.cargando ? "Buscando…" : "Buscar"}</button>
            </form>
          )}
          <div className="tg-leyenda" aria-hidden="true">
            <span><i style={{ background: "#2fa66a" }} /> dentro de una zona</span>
            <span><i style={{ background: AMBAR }} /> en tránsito</span>
            <span><i style={{ background: GRIS }} /> sin zonas aún</span>
          </div>
        </div>

        <aside className="tg-lado">
          <div className="tg-pest" role="tablist">
            {([["viajes", "Viajes"], ["ahora", "Vehículos"], ["tiempos", "Tiempos"], ["plan", "Plan"], ["flujos", "Flujos"], ["zonas", "Zonas"]] as [Pestania, string][]).map(([k, et]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {et}{k === "viajes" && (seg3?.enCurso.length ?? 0) > 0 && <i className="tg-pest-n">{seg3!.enCurso.length}</i>}{k === "tiempos" && (seg3?.alertas.length ?? 0) > 0 && <i className="tg-pest-n mal">{seg3!.alertas.length}</i>}
              </button>
            ))}
          </div>

          {tab === "ahora" && (
            <ul className="tg-lista">
              {calc?.vehs.map((x) => {
                const viaje = viajePorPlaca.get(placaClave(x.v.placa));
                const abierto = sel === x.v.id;
                const tramosV = calc.tramos.filter((t) => t.vehiculo === x.v.id);
                const visV = foto!.visitas.filter((v) => v.vehiculo === x.v.id).sort((a, b) => b.entrada.localeCompare(a.entrada)).slice(0, 6);
                return (
                  <li key={x.v.id} className={"tg-veh-fila" + (abierto ? " sel" : "")}>
                    <button type="button" className="tg-veh-b" onClick={() => setSel(abierto ? null : x.v.id)} aria-expanded={abierto}>
                      <i style={{ background: x.color }} />
                      <span><b>{x.nombre}</b><small>{x.texto}</small></span>
                      {x.v.velocidad != null && x.v.velocidad > 3 && <em>{Math.round(x.v.velocidad)} km/h</em>}
                    </button>
                    {viaje && <p className="tg-viaje">Viaje de hoy {viaje.codigo ? `· ${viaje.codigo}` : ""}: {viaje.origenNombre ?? "?"} → {viaje.destinoNombre ?? "?"}</p>}
                    {abierto && (
                      <div className="tg-detalle">
                        {visV.length === 0 && <p className="tg-vacio">Todavía no pasa por ninguna zona en este periodo.</p>}
                        <ol>
                          {visV.map((v) => {
                            const sig = tramosV.find((t) => t.llego === v.entrada);
                            return (
                              <li key={v.id}>
                                {sig && <div className="tg-transito">↳ en tránsito {duracion(sig.segundos)} desde {sig.origen}</div>}
                                <div><b style={{ color: d?.colorZ.get(v.zona) }}>{d?.nombreZ.get(v.zona) ?? "?"}</b> · entró {hhmm(v.entrada)}{v.salida ? ` · salió ${hhmm(v.salida)}` : " · sigue adentro"}
                                  <span>{duracion(Math.round(((v.salida ? Date.parse(v.salida) : ahoraMs) - Date.parse(v.entrada)) / 1000))}</span></div>
                              </li>
                            );
                          })}
                        </ol>
                        {puedeEditar && !enDemo && (
                          <label className="tg-placa-edit">Placa
                            <input defaultValue={x.v.placa ?? ""} maxLength={10} placeholder="ABC123" onBlur={(e) => { if (e.target.value.trim().toUpperCase() !== (x.v.placa ?? "")) void ponerPlaca(x.v.id, e.target.value) }} />
                          </label>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
              {nVeh === 0 && <li className="tg-vacio">No hay vehículos para mostrar todavía.</li>}
            </ul>
          )}

          {tab === "viajes" && (
            <div className="tg-tabla-caja tg-viajes">
              {faltaRec && <p className="tg-nota">Falta correr <b>2026-11-gps-recorridos.sql</b> en Supabase: con eso aparecen aquí los viajes que los conductores inician en su celular.</p>}
              <h3 className="tg-sub">En curso · {seg3?.enCurso.length ?? 0}</h3>
              <ul className="tg-rec">
                {seg3?.enCurso.map((r) => {
                  const v = r.vivo!, parado = v.parado >= 300 && !v.enZona;
                  return (
                    <li key={r.id}>
                      <button type="button" className={"tg-rec-b curso" + (selRec === r.id ? " sel" : "") + (parado ? " mal" : "")} onClick={() => escogerRec(selRec === r.id ? null : r.id)} aria-pressed={selRec === r.id}>
                        <span className="tg-rec-l"><b>{r.placa}</b> · {r.origen ?? "?"} → {r.destino ?? "?"}</span>
                        <span className="tg-rec-eta">{parado ? <>parado <b>{Math.round(v.parado / 60)} min</b></> : v.etaMin == null ? "sin geocerca destino" : <><b>{v.etaMin} min</b> · llega ~{hhmm(v.llegaEn!)}</>}</span>
                        <span className="tg-rec-barra"><i style={{ width: `${Math.round(v.avance * 100)}%` }} /></span>
                        <small>salió {hhmm(r.inicio)} · {kmTxt(r.km)} · {Math.round(v.velocidad)} km/h{v.faltaKm != null ? ` · faltan ${kmTxt(v.faltaKm)}` : ""}</small>
                      </button>
                    </li>
                  );
                })}
                {seg3 && seg3.enCurso.length === 0 && <li className="tg-vacio">Ningún viaje en curso. El conductor los inicia en Traspasos → Compartir ubicación, después de que facturación confirma la salida.</li>}
              </ul>
              <h3 className="tg-sub">Terminados · {seg3?.terminados.length ?? 0}</h3>
              <ul className="tg-rec">
                {seg3?.terminados.map((r) => (
                  <li key={r.id}>
                    <button type="button" className={"tg-rec-b" + (selRec === r.id ? " sel" : "")} onClick={() => escogerRec(selRec === r.id ? null : r.id)} aria-pressed={selRec === r.id}>
                      <span className="tg-rec-l"><b>{r.placa}</b> · {r.origen ?? "?"} → {r.destino ?? "?"}</span>
                      <small>{hhmm(r.inicio)} → {r.fin ? hhmm(r.fin) : "—"} · <b>{r.fin ? duracion(Math.round((Date.parse(r.fin) - Date.parse(r.inicio)) / 1000)) : "—"}</b> · {kmTxt(r.km)}{r.cierre === "manual" ? " · a mano" : ""}</small>
                    </button>
                  </li>
                ))}
                {seg3 && seg3.terminados.length === 0 && <li className="tg-vacio">Todavía no termina ningún viaje en este periodo.</li>}
              </ul>
              <p className="tg-nota">Toca un viaje para ver su línea en el mapa; en los terminados, <b>Repetir recorrido</b> lo vuelve a pasar. La hora de llegada se calcula con la distancia al borde de la geocerca destino y la velocidad de los últimos 3 minutos.</p>
            </div>
          )}

          {tab === "plan" && plan && (
            <div className="tg-tabla-caja">
              {enDemo && <p className="tg-nota">Estás en modo demo: los vehículos simulados no tienen las placas de tus viajes. Con Traccar conectado aquí se cruza cada viaje de hoy con su recorrido real.</p>}
              <div className="tg-mini">
                <div><b>{viajes.length}</b><span>viajes de hoy</span></div>
                <div><b>{plan.llegaron}</b><span>llegaron (GPS)</span></div>
                <div><b>{plan.enCamino + plan.enOrigen}</b><span>en origen / camino</span></div>
                <div><b>{plan.promedio ? duracion(plan.promedio) : "—"}</b><span>tránsito promedio</span></div>
              </div>

              <h3 className="tg-sub">Viajes de hoy con el GPS</h3>
              <ul className="tg-flujos tg-vj">
                {plan.vg.map((v, i) => {
                  const e = ESTADO_VIAJE[v.estado];
                  const ruta = `${v.zonaOrigen ?? v.origenNombre ?? "?"} → ${v.zonaDestino ?? v.destinoNombre ?? "?"}`;
                  const detalle = v.estado === "llego" ? `salió ${hhmm(v.salio!)} · llegó ${hhmm(v.llego!)} · ${duracion(v.segundos ?? 0)} en tránsito`
                    : v.estado === "en_camino" ? `salió ${hhmm(v.salio!)} · va en camino hace ${duracion(Math.max(0, Math.round((ahoraMs - Date.parse(v.salio!)) / 1000)))}`
                    : v.estado === "en_origen" ? `entró a ${v.zonaOrigen} a las ${hhmm(v.entroOrigen!)} y sigue adentro`
                    : v.estado === "sin_salir" ? `el GPS aún no lo vio salir de ${v.zonaOrigen}`
                    : v.estado === "sin_zona" ? `falta ligar ${!v.zonaOrigen ? `«${v.origenNombre ?? "origen"}»` : `«${v.destinoNombre ?? "destino"}»`} a una zona (pestaña Zonas)`
                    : v.estado === "sin_placa" ? "el viaje no tiene placa" : "esa placa no aparece en Traccar";
                  return (
                    <li key={(v.codigo ?? "") + i}>
                      <div><b>{v.placa ?? "—"}</b> · {ruta}<span className={"tg-est " + e.clase}>{e.texto}</span></div>
                      <small>{v.tipoNombre ?? "—"}{v.turno ? ` · turno ${v.turno}` : ""}{v.hora ? ` · registrado ${v.hora.slice(0, 5)}` : ""}{v.vacio ? " · vacío" : ""}<br />{detalle}</small>
                    </li>
                  );
                })}
                {plan.vg.length === 0 && <li className="tg-vacio">Hoy no hay viajes registrados en Traspasos.</li>}
              </ul>

              <h3 className="tg-sub">El plan de hoy, contra el GPS</h3>
              <table className="tg-tabla">
                <thead><tr><th>Tipo</th><th className="n">Plan</th><th className="n">Hechos</th><th className="n">Llegaron</th><th className="n">En camino</th></tr></thead>
                <tbody>
                  {plan.tipos.map((t) => (
                    <tr key={t.tipo}>
                      <td>{t.nombre}</td><td className="n">{t.planeado || "—"}</td>
                      <td className="n"><b>{t.cumplido}</b></td><td className="n">{t.llegaron}</td><td className="n">{t.enCamino + t.enOrigen}</td>
                    </tr>
                  ))}
                  {plan.tipos.length === 0 && <tr><td colSpan={5} className="tg-vacio">No hay plan publicado para hoy.</td></tr>}
                </tbody>
              </table>
              <p className="tg-nota">«Plan» y «Hechos» vienen de Traspasos → Plan y Control; «Llegaron» y «En camino» son los de esos viajes que el GPS vio salir de su origen y entrar a su destino.</p>

              {plan.rutas.length > 0 && (<>
                <h3 className="tg-sub">Tiempo real por ruta (hoy)</h3>
                <ul className="tg-flujos">{plan.rutas.map((r) => <li key={r.ruta}><div><b>{r.ruta}</b></div><small>{r.viajes} {r.viajes === 1 ? "viaje" : "viajes"} · promedio <b>{duracion(r.promedio)}</b></small></li>)}</ul>
              </>)}
              {plan.sinZona > 0 && <p className="tg-nota">Hay {plan.sinZona} {plan.sinZona === 1 ? "viaje" : "viajes"} cuyo origen o destino no está ligado a una zona. En la pestaña Zonas escoge, para cada zona, el punto de Traspasos que le corresponde.</p>}
            </div>
          )}

          {tab === "tiempos" && (
            <div className="tg-tabla-caja">
              <h3 className="tg-sub">Alertas ahora</h3>
              <ul className="tg-alertas">
                {seg3?.alertas.map((a, i) => (
                  <li key={i}><button type="button" onClick={() => { setSel(a.vehiculo); const r = seg3.enCurso.find((x) => x.vehiculo === a.vehiculo); if (r) setSelRec(r.id) }}>
                    <b>{a.texto}</b><small>{a.detalle}</small></button></li>
                ))}
                {seg3 && seg3.alertas.length === 0 && <li className="tg-vacio">Sin alertas: nadie pasa de lo normal.</li>}
              </ul>

              <h3 className="tg-sub">Espera en cada zona</h3>
              <table className="tg-tabla">
                <thead><tr><th>Zona</th><th className="n">Hoy</th><th className="n">Normal</th><th className="n">Ahora</th></tr></thead>
                <tbody>
                  {calc?.tiempos.map((t) => {
                    const z = foto?.zonas.find((x) => x.nombre === t.zona);
                    const n = seg3?.normales.zona.get(t.zona)?.normal ?? null;
                    const alta = esLarga(t.promedio, n);
                    return (
                      <tr key={t.zona}>
                        <td><i className="tg-sw" style={{ background: z?.color }} />{t.zona}<small className="tg-n">{t.visitas} {t.visitas === 1 ? "visita" : "visitas"} · la más larga {corto(t.maximo)}</small></td>
                        <td className={"n" + (alta ? " tg-alto" : "")}><b>{corto(t.promedio)}</b></td><td className="n">{n ? corto(n) : "—"}</td><td className="n">{t.adentro}</td>
                      </tr>
                    );
                  })}
                  {(calc?.tiempos.length ?? 0) === 0 && <tr><td colSpan={4} className="tg-vacio">Todavía no hay entradas a zonas en este periodo.</td></tr>}
                </tbody>
              </table>

              <h3 className="tg-sub">Tramos entre zonas</h3>
              <table className="tg-tabla">
                <thead><tr><th>Tramo</th><th className="n">Hoy</th><th className="n">Normal</th><th className="n">Viajes</th></tr></thead>
                <tbody>
                  {calc?.flujos.map((f) => {
                    const n = seg3?.normales.tramo.get(`${f.origen} → ${f.destino}`)?.normal ?? null;
                    return (
                      <tr key={f.origen + f.destino}>
                        <td>{f.origen} → {f.destino}</td>
                        <td className={"n" + (f.promedio < 4 * 3600 && esLarga(f.promedio, n) ? " tg-alto" : "")}><b>{corto(f.promedio)}</b></td><td className="n">{n ? corto(n) : "—"}</td><td className="n">{f.viajes}</td>
                      </tr>
                    );
                  })}
                  {(calc?.flujos.length ?? 0) === 0 && <tr><td colSpan={4} className="tg-vacio">Aún no hay tramos completos entre dos zonas.</td></tr>}
                </tbody>
              </table>

              {seg3 && seg3.normales.ciclo.size > 0 && (<>
                <h3 className="tg-sub">Ciclo completo (volver a la misma zona)</h3>
                <table className="tg-tabla">
                  <thead><tr><th>Desde</th><th className="n">Hoy</th><th className="n">Normal</th></tr></thead>
                  <tbody>
                    {[...seg3.normales.ciclo].map(([z, x]) => {
                      const h = seg3.hoyN.ciclo.get(z);
                      const hoyMed = h && h.n ? h.normal ?? null : null;
                      return <tr key={z}><td>{z}</td><td className={"n" + (hoyMed && esLarga(hoyMed, x.normal) ? " tg-alto" : "")}>{hoyMed ? corto(hoyMed) : h?.n ? `${h.n} ${h.n === 1 ? "vuelta" : "vueltas"}` : "—"}</td><td className="n">{x.normal ? corto(x.normal) : "—"}</td></tr>;
                    })}
                  </tbody>
                </table>
              </>)}
              <p className="tg-nota"><b>Normal</b> = la mediana de los últimos 14 días (hace falta al menos {3} casos). Una espera es larga si pasa 1,5 veces lo normal y al menos 10 min más; sin historia todavía, si pasa de 45 min. Parado = 15 min o más sin moverse fuera de las zonas.</p>
            </div>
          )}


          {tab === "flujos" && (
            <div className="tg-tabla-caja">
              <label className="tg-chk"><input type="checkbox" checked={verFlujos} onChange={(e) => setVerFlujos(e.target.checked)} /> Dibujar los flujos en el mapa</label>
              <ul className="tg-flujos">
                {calc?.flujos.map((f) => (
                  <li key={f.origen + f.destino}>
                    <div><b>{f.origen}</b> <span aria-hidden="true">→</span> <b>{f.destino}</b></div>
                    <small>{f.viajes} {f.viajes === 1 ? "viaje" : "viajes"} · promedio <b>{duracion(f.promedio)}</b> · de {duracion(f.minimo)} a {duracion(f.maximo)}</small>
                  </li>
                ))}
                {(calc?.flujos.length ?? 0) === 0 && <li className="tg-vacio">Aún no hay recorridos completos entre dos zonas.</li>}
              </ul>
              <h3 className="tg-sub">Últimos tramos en tránsito</h3>
              <ul className="tg-flujos">
                {calc?.tramos.slice(0, 12).map((t, i) => (
                  <li key={i}>
                    <div><b>{d?.nombreV.get(t.vehiculo) ?? "—"}</b> · {t.origen} <span aria-hidden="true">→</span> {t.destino || "…en camino"}</div>
                    <small>salió {hhmm(t.salio)} · {t.llego ? `llegó ${hhmm(t.llego)} · ` : ""}{duracion(t.segundos)}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "zonas" && (
            <div className="tg-zonas">
              {puedeEditar ? (
                <div className="tg-acciones">
                  <button type="button" className="tg-btn fuerte" disabled={!!dibujo || !!nueva || !!editar} onClick={nuevaPorDireccion}>⌖ Zona por dirección</button>
                  <button type="button" className="tg-btn" disabled={!!dibujo || !!nueva || !!editar} onClick={() => { setOk(null); setMal(null); setDibujo("rect") }}>▭ Dibujar rectángulo</button>
                  <button type="button" className="tg-btn" disabled={!!dibujo || !!nueva || !!editar} onClick={() => { setOk(null); setMal(null); setDibujo("poli") }}>⬠ Dibujar polígono</button>
                  {conectado && <button type="button" className="tg-btn plano" disabled={ocupado} onClick={() => void traerDeTraccar()}>Traer las de Traccar</button>}
                </div>
              ) : <p className="tg-nota">Solo ves las zonas. Para dibujarlas hace falta permiso de edición en esta pantalla (Admin → Roles).</p>}

              {editar && (
                <form className="tg-nueva tg-dir" onSubmit={(e) => { e.preventDefault(); void guardarEdicion() }}>
                  <b>{editar.id ? `Ajustar «${editar.nombre}»` : "Zona por dirección"}</b>
                  {!editar.id && (<>
                    <div className="tg-busca">
                      <input autoFocus value={busca.texto} onChange={(e) => setBusca({ ...busca, texto: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscarDireccion() } }}
                        placeholder="Cra 38 #10-50, Barranquilla · o coordenadas · o Plus Code" aria-label="Dirección" />
                      <button type="button" className="tg-btn" disabled={busca.cargando || !busca.texto.trim()} onClick={() => void buscarDireccion()}>{busca.cargando ? "Buscando…" : "Buscar"}</button>
                    </div>
                    {busca.resultados && busca.resultados.length > 0 && (
                      <ul className="tg-res">{busca.resultados.map((r, k) => (
                        <li key={k}><button type="button" onClick={() => { ponerCentro([r.lat, r.lng]); setBusca({ ...busca, resultados: null }) }}>{r.nombre}</button></li>
                      ))}</ul>
                    )}
                    <button type="button" className="tg-btn plano" onClick={() => setDibujo("punto")}>…o toca el sitio en el mapa</button>
                  </>)}
                  {editar.poligono.length >= 3 && (<>
                    {!editar.id && (
                      <div className="tg-radio" role="group" aria-label="Tamaño del perímetro">
                        <span>Perímetro</span>
                        {[80, 150, 250, 400].map((r) => (
                          <button key={r} type="button" aria-pressed={editar.radio === r} onClick={() => editar.centro && ponerCentro(editar.centro, r)}>{r} m</button>
                        ))}
                      </div>
                    )}
                    <p className="tg-nota">En el mapa: <b>arrastra los cuadritos</b> de las esquinas hasta que el perímetro encierre el patio · toca un <b>+</b> para agregar una esquina · doble clic en una esquina la quita.</p>
                    <input value={editar.nombre} onChange={(e) => setEditar({ ...editar, nombre: e.target.value })} placeholder="Nombre: Arenosa, Fábrica…" aria-label="Nombre de la zona" maxLength={40} />
                    <select value={editar.punto} onChange={(e) => setEditar({ ...editar, punto: e.target.value })} aria-label="Punto de Traspasos">
                      <option value="">Punto de Traspasos: (igual al nombre)</option>
                      {puntos.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
                    </select>
                    <div className="tg-colores" role="group" aria-label="Color">
                      {COLORES_ZONA.map((c) => <button key={c} type="button" style={{ background: c }} aria-pressed={editar.color === c} aria-label={`Color ${c}`} onClick={() => setEditar({ ...editar, color: c })} />)}
                    </div>
                  </>)}
                  <div className="tg-acciones">
                    {editar.poligono.length >= 3 && <button type="submit" className="tg-btn fuerte" disabled={ocupado}>{editar.id ? "Guardar ajuste" : "Guardar zona"}</button>}
                    <button type="button" className="tg-btn plano" onClick={() => { setEditar(null); setDibujo(null); setBusca({ texto: "", cargando: false, resultados: null }) }}>Descartar</button>
                  </div>
                </form>
              )}

              {nueva && (
                <form className="tg-nueva" onSubmit={(e) => { e.preventDefault(); void guardarZona() }}>
                  <b>Zona nueva</b>
                  <input autoFocus value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre: Bodega 38, Arenosa…" aria-label="Nombre de la zona" maxLength={40} />
                  <select value={nueva.punto} onChange={(e) => setNueva({ ...nueva, punto: e.target.value })} aria-label="Punto de Traspasos">
                    <option value="">Punto de Traspasos: (igual al nombre)</option>
                    {puntos.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
                  </select>
                  <div className="tg-colores" role="group" aria-label="Color">
                    {COLORES_ZONA.map((c) => <button key={c} type="button" style={{ background: c }} aria-pressed={nueva.color === c} aria-label={`Color ${c}`} onClick={() => setNueva({ ...nueva, color: c })} />)}
                  </div>
                  <div className="tg-acciones">
                    <button type="submit" className="tg-btn fuerte" disabled={ocupado}>Guardar zona</button>
                    <button type="button" className="tg-btn plano" onClick={() => setNueva(null)}>Descartar</button>
                  </div>
                </form>
              )}

              <ul className="tg-lista-z">
                {foto?.zonas.map((z) => (
                  <li key={z.id}>
                    <i className="tg-sw" style={{ background: z.color }} /><span><b>{z.nombre}</b><small>{calc?.dentro.get(z.id) ?? 0} adentro ahora</small>
                      {puedeEditar && !enDemo && puntos.length > 0 ? (
                        <select className="tg-punto" value={puntoDeZona.get(z.id) ?? ""} onChange={(e) => void ligarPunto(z.id, e.target.value)} aria-label={`Punto de Traspasos de ${z.nombre}`}>
                          <option value="">Sin ligar a un punto</option>
                          {puntos.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
                        </select>
                      ) : !enDemo && puntoDeZona.get(z.id) ? <small>Punto: {puntos.find((p) => p.clave === puntoDeZona.get(z.id))?.nombre ?? puntoDeZona.get(z.id)}</small> : null}
                    </span>
                    {puedeEditar && !enDemo && <span className="tg-zacc">
                      <button type="button" className="tg-x aj" disabled={!!editar || !!dibujo} onClick={() => { setOk(null); setMal(null); setEditar({ id: z.id, nombre: z.nombre, color: z.color, punto: puntoDeZona.get(z.id) ?? "", centro: centro(z.poligono), radio: 0, poligono: z.poligono, llave: z.id }) }} aria-label={`Ajustar ${z.nombre}`}>Ajustar</button>
                      <button type="button" className="tg-x" onClick={() => void quitarZona(z.id, z.nombre)} aria-label={`Quitar ${z.nombre}`}>Quitar</button>
                    </span>}
                  </li>
                ))}
                {(foto?.zonas.length ?? 0) === 0 && <li className="tg-vacio">Aún no hay zonas. Dibuja la primera.</li>}
              </ul>
              {enDemo && real && real.zonas.length === 0 && <p className="tg-nota">Estas son zonas de ejemplo. Dibuja las tuyas y la demo pasa a usarlas.</p>}
            </div>
          )}
        </aside>

        {/* EL DETALLE (derecha): el viaje escogido —o el primero en curso— con su paso a paso. */}
        <section className="tg-det" aria-label="Detalle del viaje">
          {recDet ? (() => {
            const r = recDet, v = r.vivo;
            const zo = r.zonaOrigen ? d?.nombreZ.get(r.zonaOrigen) ?? null : null, zd = r.destinoZona;
            const espO = r.vehiculo && zo ? d?.visitasN.filter((x) => x.vehiculo === r.vehiculo && x.zona === zo && x.salida && Math.abs(Date.parse(x.salida) - Date.parse(r.inicio)) < 30 * 60_000).pop() : undefined;
            const sEspO = espO ? Math.round((Date.parse(espO.salida!) - Date.parse(espO.entrada)) / 1000) : null;
            const nO = zo ? seg3?.normales.zona.get(zo)?.normal ?? null : null, nD = zd ? seg3?.normales.zona.get(zd)?.normal ?? null : null;
            const nT = zo && zd ? seg3?.normales.tramo.get(`${zo} → ${zd}`)?.normal ?? null : null;
            const lleva = Math.round(((r.fin ? Date.parse(r.fin) : ahoraMs) - Date.parse(r.inicio)) / 1000);
            const parado = !!v && v.parado >= 300 && !v.enZona;
            const deLaPlaca = seg3?.recsV.filter((x) => x.placa === r.placa).length ?? 0;
            return (<>
              <div className="tg-det-cab">
                <span className="tg-placa-et">{r.placa}</span>
                <small>{[r.codigo, r.tipo].filter(Boolean).join(" · ")}</small>
                {recSel && <button type="button" className="tg-det-x" onClick={() => escogerRec(null)} aria-label="Cerrar el detalle">×</button>}
              </div>
              {r.estado === "en_curso" && v ? (<>
                <p className="tg-det-ojo">{parado ? "Parado hace" : "Llega en"}</p>
                <p className={"tg-det-eta" + (parado ? " mal" : "")}>
                  <b>{parado ? corto(v.parado) : v.etaMin == null ? "—" : `${v.etaMin} min`}</b>
                  {!parado && v.llegaEn && <span>~{hhmm(v.llegaEn)}</span>}
                </p>
                <div className="tg-det-barra"><span style={{ width: `${Math.round(v.avance * 100)}%` }} /></div>
              </>) : (<>
                <p className="tg-det-ojo">Llegó</p>
                <p className="tg-det-eta ok"><b>{r.fin ? hhmm(r.fin) : "—"}</b><span>{corto(lleva)} de viaje</span></p>
                <div className="tg-det-barra"><span style={{ width: "100%", background: "#2fa66a" }} /></div>
              </>)}
              <ol className="tg-pasos">
                <li className="p-hecho" style={{ ["--c" as string]: zo ? d?.colorZ.get(r.zonaOrigen!) ?? GRIS : GRIS }}>
                  <b>Salió de {r.origen ?? zo ?? "origen"}</b>
                  <small>{hhmm(r.inicio)}{sEspO != null ? ` · esperó ${corto(sEspO)}${nO ? ` (normal ${corto(nO)})` : ""}` : ""}</small>
                </li>
                <li className={r.estado === "en_curso" ? (parado ? "p-ahora mal" : "p-ahora") : "p-hecho"}>
                  <b>{r.estado === "en_curso" ? (parado ? `Parado${v?.enZona ? ` en ${v.enZona}` : " fuera de las zonas"}` : "En camino") : "Tránsito"}</b>
                  <small>{r.estado === "en_curso" && v
                    ? `${kmTxt(r.km)} recorridos · ${Math.round(v.velocidad)} km/h${v.faltaKm != null ? ` · faltan ${kmTxt(v.faltaKm)}` : ""}`
                    : `${corto(lleva)} · ${kmTxt(r.km)}${nT ? ` (normal ${corto(nT)})` : ""}${r.cierre === "manual" ? " · llegada marcada a mano" : ""}`}</small>
                </li>
                <li className={r.estado === "llego" ? "p-hecho" : "p-falta"} style={{ ["--c" as string]: r.zonaDestino ? d?.colorZ.get(r.zonaDestino) ?? GRIS : GRIS }}>
                  <b>{r.estado === "llego" ? "Llegó a" : "Llega a"} {r.destino ?? zd ?? "destino"}</b>
                  <small>{r.estado === "llego" ? (r.fin ? hhmm(r.fin) : "—") : v?.llegaEn ? `~${hhmm(v.llegaEn)}` : zd ? "—" : "el destino no tiene geocerca"}{nD ? ` · descargue normal ${corto(nD)}` : ""}</small>
                </li>
              </ol>
              <div className="tg-det-cifras">
                <div><span>Tramo {r.estado === "en_curso" ? "hasta ahora" : ""}</span><b>{corto(lleva)}</b></div>
                <div><span>Normal</span><b>{nT ? corto(nT) : "—"}</b></div>
                <div><span>Viajes de la placa</span><b>{deLaPlaca}</b></div>
                <div><span>Recorrido</span><b>{kmTxt(r.km)}</b></div>
              </div>
              <div className="tg-det-acc">
                {r.estado === "llego"
                  ? <button type="button" className="tg-btn" disabled={puntosDet.length < 2} onClick={() => { if (selRec !== r.id) escogerRec(r.id); setRepite((n) => n + 1) }}>▶ {repite && selRec === r.id ? "Repetir otra vez" : "Repetir recorrido"}</button>
                  : <button type="button" className="tg-btn" onClick={() => { escogerRec(r.id) }}>Seguir en el mapa</button>}
              </div>
            </>);
          })() : (
            <div className="tg-det-vacio">
              <p className="tg-det-ojo">Alertas ahora</p>
              <ul className="tg-alertas">
                {seg3?.alertas.map((a, i) => <li key={i}><button type="button" onClick={() => setSel(a.vehiculo)}><b>{a.texto}</b><small>{a.detalle}</small></button></li>)}
                {seg3 && seg3.alertas.length === 0 && <li className="tg-vacio">Sin alertas: nadie pasa de lo normal.</li>}
              </ul>
              <p className="tg-nota">Toca un viaje de la lista, una línea del mapa o un bloque de la línea de tiempo para ver aquí su paso a paso: cuándo salió, cuánto esperó, cuánto le falta y a qué hora llega.</p>
            </div>
          )}
        </section>
      </div>

      {verAvisos && <AvisosCelular cerrar={() => setVerAvisos(false)} />}

      <div className="tg-abajo">
      {seg3 && (
        <LineaTiempo filas={seg3.filas} desde={seg3.ventana.ini} hasta={seg3.ventana.fin} ahora={ahoraIso} rango={rango}
          zonas={(foto?.zonas ?? []).map((z) => ({ nombre: z.nombre, color: z.color }))}
          alTocar={(veh, ini, fin) => {
            setSel(veh);
            const r = seg3.recsV.find((x) => x.vehiculo === veh && x.inicio <= fin && (x.fin ?? ahoraIso) >= ini);
            if (r) { escogerRec(r.id); setTab("viajes") } else setTab("ahora");
          }} />
      )}
      {seg3 && seg3.calor.size > 0 && (
        <CalorEspera calor={seg3.calor} normales={seg3.normales.zona} colores={new Map((foto?.zonas ?? []).map((z) => [z.nombre, z.color]))} />
      )}
      </div>
    </div>
  );
}
