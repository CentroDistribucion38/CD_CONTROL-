"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import { useConfirmar } from "@/components/Confirmar";
import { centro, cuadradoEn, leerUbicacion, type Punto } from "@/modulos/traspasos/gps/geo";
import { duracion, flujosEntreZonas, tiemposPorZona, tramosDe, type Visita, type Zona } from "@/modulos/traspasos/gps/motor";
import { COLORES_ZONA, type Instantanea, type VehiculoVivo, type VisitaGps } from "@/modulos/traspasos/gps/tipos";
import { Demo, ZONAS_DEMO } from "@/modulos/traspasos/gps/demo";
import { cruzarViajes, norm, placaClave, promedioPorRuta, resumenPorTipo, type EstadoViaje, type LineaPlan, type ViajePlan, type ZonaLigada } from "@/modulos/traspasos/gps/plan";
import { MapaGps, type CapaBase, type FlujoMapa, type VehiculoMapa, type ZonaMapa } from "./MapaGps";

/* ===================================================================
   TIEMPOS GPS — el mapa de los vehículos y sus tiempos por zona

   Las zonas son «cuadritos» en el mapa (Fábrica, Bodega 38, Arenosa, Exportación…): se dibujan aquí o se
   traen de las geocercas de Traccar. Cuando un vehículo ENTRA a una zona se marca el inicio; cuando SALE se
   marca el final y queda EN TRÁNSITO hasta que entra a la siguiente. De ahí salen los tiempos de cada zona
   y los flujos (de dónde a dónde va y cuánto tarda).
   Sin Traccar conectado la pantalla corre en MODO DEMO, con vehículos simulados que no se guardan.
   =================================================================== */
type Rango = "hoy" | "24h" | "7d";
type Pestania = "ahora" | "plan" | "tiempos" | "flujos" | "zonas";
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
  const [porCoord, setPorCoord] = useState<null | { nombre: string; texto: string; lado: string; punto: string }>(null);
  const [falta, setFalta] = useState(false);
  const [rango, setRango] = useState<Rango>("hoy");
  const [capa, setCapa] = useState<CapaBase>("calles");
  const [tab, setTab] = useState<Pestania>("ahora");
  const [sel, setSel] = useState<string | null>(null);
  const [dibujo, setDibujo] = useState<null | "rect" | "poli">(null);
  const [nueva, setNueva] = useState<{ poligono: Punto[]; nombre: string; color: string; punto: string } | null>(null);
  const [verFlujos, setVerFlujos] = useState(true);
  const [ajuste, setAjuste] = useState(0);
  const [ok, setOk] = useState<string | null>(null);
  const [mal, setMal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [reloj, setReloj] = useState(() => Date.now());
  const [demo, setDemo] = useState<Instantanea | null>(null);
  const demoRef = useRef<Demo | null>(null);

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
      await cargar();
    };
    void vuelta();
    const t = setInterval(() => void vuelta(), conectado ? 15_000 : 30_000);
    return () => clearInterval(t);
  }, [conectado, cargar]);

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
  async function zonaPorCoordenadas() {
    if (!porCoord) return;
    const nombre = porCoord.nombre.trim();
    if (!nombre) { setMal("Ponle un nombre a la zona."); return }
    const ref: Punto | undefined = foto && foto.zonas.length ? centro(foto.zonas[0].poligono) : undefined;
    const c = leerUbicacion(porCoord.texto, ref);
    if (!c) { setMal("No entiendo esa ubicación. Pega un Plus Code (X6FH+WC) o las coordenadas (10.9748, -74.7714) tal como las da Google Maps."); return }
    const lado = Math.min(1000, Math.max(30, Number(porCoord.lado) || 120));
    setMal(null); setOcupado(true);
    const { error } = await supabase.from("gps_zonas").insert({ nombre, color: COLORES_ZONA[(foto?.zonas.length ?? 0) % COLORES_ZONA.length], poligono: cuadradoEn(c, lado), origen: "dibujada", punto: porCoord.punto || puntoSugerido(nombre) });
    setOcupado(false);
    if (error) { setMal(/duplicate|unique|gps_zonas_nombre/i.test(error.message) ? `Ya hay una zona llamada «${nombre}».` : traducirError(error.message)); return }
    setPorCoord(null); setOk(`Zona «${nombre}» creada en ${c[0].toFixed(5)}, ${c[1].toFixed(5)} (${lado} m de lado). Revísala en el mapa y ajústala si hace falta.`);
    await cargar(); setAjuste((n) => n + 1);
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
  return (
    <div className="tg">
      {dialogo}
      <header className="tg-cab">
        <div>
          <p className="tg-ojo">Traspasos · Tiempos GPS</p>
          <h1>Mapa de vehículos y tiempos por zona</h1>
        </div>
        <div className="tg-controles">
          <div className="tg-seg" role="group" aria-label="Periodo">
            {RANGOS.map(([k, et]) => <button key={k} type="button" aria-pressed={rango === k} onClick={() => setRango(k)}>{et}</button>)}
          </div>
          <div className="tg-seg" role="group" aria-label="Fondo del mapa">
            {([["calles", "Calles"], ["oscuro", "Oscuro"], ["satelite", "Satélite"]] as [CapaBase, string][]).map(([k, et]) => <button key={k} type="button" aria-pressed={capa === k} onClick={() => setCapa(k)}>{et}</button>)}
          </div>
        </div>
      </header>

      {enDemo && <p className="tg-aviso" role="note"><b>MODO DEMO.</b> Todavía no hay Traccar conectado: los vehículos son simulados (el reloj corre 20 veces más rápido) y nada se guarda. Para conectarlo se ponen <code>TRACCAR_URL</code> y <code>TRACCAR_TOKEN</code> en Vercel. Las zonas sí son de verdad: dibújalas en la pestaña «Zonas».</p>}
      {conectado && nVeh === 0 && <p className="tg-aviso" role="status">Traccar conectado. Esperando la primera posición de los equipos…</p>}
      {mal && <p className="tg-aviso mal" role="alert">{mal}</p>}
      {ok && <p className="tg-aviso bien" role="status">{ok}</p>}

      <section className="tg-kpis" aria-label="Resumen">
        <div><b>{calc?.enZonas ?? 0}</b><span>en una zona ahora</span></div>
        <div><b>{calc?.enTransito ?? 0}</b><span>en tránsito</span></div>
        <div><b>{calc?.entradas ?? 0}</b><span>entradas a zonas</span></div>
        <div><b>{calc?.promedio ? duracion(calc.promedio) : "—"}</b><span>promedio por visita</span></div>
      </section>

      <div className="tg-cuerpo">
        <div className={"tg-mapa-col" + (dibujo ? " dibujando" : "")}>
          <MapaGps zonas={zonasMapa} vehiculos={vehiculosMapa} flujos={flujosMapa} capa={capa} dibujo={dibujo}
                   alDibujar={(p) => { setDibujo(null); setNueva({ poligono: p, nombre: "", color: COLORES_ZONA[(foto?.zonas.length ?? 0) % COLORES_ZONA.length], punto: "" }); setTab("zonas") }}
                   alCancelarDibujo={() => setDibujo(null)} seleccion={sel} alSeleccionar={(id) => { setSel(id); if (id) setTab("ahora") }} ajustar={ajuste} centroInicial={centroInicial} />
          {dibujo && (
            <div className="tg-guia" role="status">
              {dibujo === "rect" ? "Haz clic en una esquina y luego en la esquina opuesta." : "Haz clic en cada vértice. Doble clic o Enter para cerrar la zona."} <button type="button" onClick={() => setDibujo(null)}>Cancelar (Esc)</button>
            </div>
          )}
          <div className="tg-leyenda" aria-hidden="true">
            <span><i style={{ background: "#2fa66a" }} /> dentro de una zona</span>
            <span><i style={{ background: AMBAR }} /> en tránsito</span>
            <span><i style={{ background: GRIS }} /> sin zonas aún</span>
          </div>
        </div>

        <aside className="tg-lado">
          <div className="tg-pest" role="tablist">
            {([["ahora", "Ahora"], ["plan", "Plan"], ["tiempos", "Tiempos"], ["flujos", "Flujos"], ["zonas", "Zonas"]] as [Pestania, string][]).map(([k, et]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{et}</button>
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
              <table className="tg-tabla">
                <thead><tr><th>Zona</th><th className="n">Visitas</th><th className="n">Promedio</th><th className="n">Más largo</th><th className="n">Ahora</th></tr></thead>
                <tbody>
                  {calc?.tiempos.map((t) => {
                    const z = foto?.zonas.find((x) => x.nombre === t.zona);
                    const max = Math.max(...(calc?.tiempos.map((x) => x.promedio) ?? [1]), 1);
                    return (
                      <tr key={t.zona}>
                        <td><i className="tg-sw" style={{ background: z?.color }} />{t.zona}<div className="tg-barra"><span style={{ width: `${(t.promedio / max) * 100}%`, background: z?.color }} /></div></td>
                        <td className="n">{t.visitas}</td><td className="n"><b>{duracion(t.promedio)}</b></td><td className="n">{duracion(t.maximo)}</td><td className="n">{t.adentro}</td>
                      </tr>
                    );
                  })}
                  {(calc?.tiempos.length ?? 0) === 0 && <tr><td colSpan={5} className="tg-vacio">Todavía no hay entradas a zonas en este periodo.</td></tr>}
                </tbody>
              </table>
              <p className="tg-nota">El tiempo corre desde la primera posición vista dentro de la zona hasta la primera vista afuera; la precisión depende de cada cuánto reporta el GPS.</p>
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
                  <button type="button" className="tg-btn" disabled={!!dibujo || !!nueva} onClick={() => { setOk(null); setMal(null); setDibujo("rect") }}>▭ Dibujar rectángulo</button>
                  <button type="button" className="tg-btn" disabled={!!dibujo || !!nueva} onClick={() => { setOk(null); setMal(null); setDibujo("poli") }}>⬠ Dibujar polígono</button>
                  <button type="button" className="tg-btn" disabled={!!dibujo || !!nueva || !!porCoord} onClick={() => { setOk(null); setMal(null); setPorCoord({ nombre: "", texto: "", lado: "120", punto: "" }) }}>⌖ Por Plus Code o coordenadas</button>
                  {conectado && <button type="button" className="tg-btn plano" disabled={ocupado} onClick={() => void traerDeTraccar()}>Traer las de Traccar</button>}
                </div>
              ) : <p className="tg-nota">Solo ves las zonas. Para dibujarlas hace falta permiso de edición en esta pantalla (Admin → Roles).</p>}

              {porCoord && (
                <form className="tg-nueva" onSubmit={(e) => { e.preventDefault(); void zonaPorCoordenadas() }}>
                  <b>Zona desde una ubicación</b>
                  <input autoFocus value={porCoord.nombre} onChange={(e) => setPorCoord({ ...porCoord, nombre: e.target.value })} placeholder="Nombre: Arenosa, Fábrica…" aria-label="Nombre de la zona" maxLength={40} />
                  <input value={porCoord.texto} onChange={(e) => setPorCoord({ ...porCoord, texto: e.target.value })} placeholder="Plus Code (X6FH+WC) o coordenadas (10.9748, -74.7714)" aria-label="Ubicación" />
                  <label className="tg-placa-edit">Lado del cuadro (metros)
                    <input value={porCoord.lado} onChange={(e) => setPorCoord({ ...porCoord, lado: e.target.value.replace(/\D/g, "") })} inputMode="numeric" maxLength={4} />
                  </label>
                  <select value={porCoord.punto} onChange={(e) => setPorCoord({ ...porCoord, punto: e.target.value })} aria-label="Punto de Traspasos">
                    <option value="">Punto de Traspasos: (igual al nombre)</option>
                    {puntos.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
                  </select>
                  <p className="tg-nota">En Google Maps: clic derecho sobre el sitio → copia las coordenadas, o abre el sitio y copia su Plus Code. Se crea un cuadro centrado ahí; si no cubre bien el patio, dibújala a mano.</p>
                  <div className="tg-acciones">
                    <button type="submit" className="tg-btn fuerte" disabled={ocupado}>Crear zona</button>
                    <button type="button" className="tg-btn plano" onClick={() => setPorCoord(null)}>Descartar</button>
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
                    {puedeEditar && !enDemo && <button type="button" className="tg-x" onClick={() => void quitarZona(z.id, z.nombre)} aria-label={`Quitar ${z.nombre}`}>Quitar</button>}
                  </li>
                ))}
                {(foto?.zonas.length ?? 0) === 0 && <li className="tg-vacio">Aún no hay zonas. Dibuja la primera.</li>}
              </ul>
              {enDemo && real && real.zonas.length === 0 && <p className="tg-nota">Estas son zonas de ejemplo. Dibuja las tuyas y la demo pasa a usarlas.</p>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
