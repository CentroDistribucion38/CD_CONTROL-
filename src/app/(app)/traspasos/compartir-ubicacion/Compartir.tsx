"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirmar } from "@/components/Confirmar";
import type { ViajeConductor } from "@/modulos/traspasos/gps/recorridos";

/* ===================================================================
   COMPARTIR UBICACIÓN — el celular del conductor manda su posición cada ~10 s.
   Mientras esté activo se pide mantener la pantalla encendida (si el celular se bloquea o se cambia de
   aplicación, el navegador pausa el GPS y se deja de reportar).
   =================================================================== */
const CADA_MS = 10_000;
const PRECISION_MAX_M = 50;   // igual que en el servidor: con más error no se puede decir en qué zona está
type Fix = { lat: number; lng: number; precision: number; velocidad: number | null; rumbo: number | null; en: number };
type Ultimo = { hora: string; zona: string | null; precision: number };
type Seguimiento = { id: string; estado: "en_curso" | "llego" | "cancelado"; km: number; destino: string | null; llegoAhora: boolean };
const RECARGAR_MS = 30_000;

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Bogota" });
const hm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }) : "—";
const km = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
const minutos = (a: string, b: string | null) => { const m = Math.max(0, Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min` };
const limpiar = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");
const leerPlaca = () => { try { return localStorage.getItem("gps_placa") ?? "" } catch { return "" } };
const guardarPlaca = (p: string) => { try { localStorage.setItem("gps_placa", p) } catch { /* sin almacenamiento */ } };

export function Compartir({ conViajes = false }: { conViajes?: boolean }) {
  const [placa, setPlaca] = useState("");
  const [viajes, setViajes] = useState<ViajeConductor[] | null>(null);
  const [errViajes, setErrViajes] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [llegada, setLlegada] = useState<string | null>(null);
  const [pedir, dialogo] = useConfirmar();
  const [activo, setActivo] = useState(false);
  const [ultimo, setUltimo] = useState<Ultimo | null>(null);
  const [enviados, setEnviados] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mal, setMal] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);

  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fixRef = useRef<Fix | null>(null);
  const enviadoRef = useRef(0);
  const lockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const placaRef = useRef("");
  const cargarRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => { setPlaca(leerPlaca()) }, []);

  const pedirPantalla = useCallback(async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl) lockRef.current = await wl.request("screen");
    } catch { /* el celular no lo permite: se avisa en pantalla */ }
  }, []);

  const mandar = useCallback(async () => {
    const f = fixRef.current;
    if (!f || f.en === enviadoRef.current) return;
    if (f.precision > PRECISION_MAX_M) { setAviso(`Tu ubicación tiene ±${Math.round(f.precision)} m de error: todavía no sirve. Usa el celular con el GPS encendido (un computador no alcanza) y sal a un sitio abierto.`); return }
    enviadoRef.current = f.en;
    const r = await fetch("/api/traspasos/gps/celular", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placa: placaRef.current, lat: f.lat, lng: f.lng, precision: f.precision, velocidad: f.velocidad, rumbo: f.rumbo }),
    }).catch(() => null);
    if (!r) { setAviso("Sin internet. Sigo intentando…"); return }
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; zona?: string | null; error?: string; debil?: boolean; recorrido?: Seguimiento | null };
    if (!r.ok || j.ok === false) { if (j.debil) setAviso(j.error ?? "Señal débil."); else setMal(j.error ?? "No se pudo enviar."); return }
    setMal(null); setAviso(null);
    const rec = j.recorrido;
    if (rec) {
      setViajes((vs) => vs?.map((v) => v.recorrido?.id === rec.id ? { ...v, recorrido: { ...v.recorrido, km: rec.km, estado: rec.estado, fin: rec.llegoAhora ? new Date().toISOString() : v.recorrido.fin, cierre: rec.llegoAhora ? "geocerca" : v.recorrido.cierre } } : v) ?? vs);
      if (rec.llegoAhora) { setLlegada(`Llegaste a ${rec.destino ?? "tu destino"}. El viaje quedó cerrado: marca el siguiente cuando salgas.`); void cargarRef.current?.() }
    }
    setUltimo({ hora: hora(Date.now()), zona: j.zona ?? null, precision: f.precision });
    setEnviados((n) => n + 1);
  }, []);

  const parar = useCallback(() => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    void lockRef.current?.release().catch(() => {}); lockRef.current = null;
    setActivo(false); setEsperando(false);
  }, []);

  const empezar = useCallback(() => {
    const p = limpiar(placa);
    if (!/^[A-Z0-9]{5,7}$/.test(p)) { setMal("Escribe la placa del vehículo (por ejemplo ABC123)."); return }
    if (!("geolocation" in navigator)) { setMal("Este celular no permite ubicación en el navegador."); return }
    setMal(null); setAviso(null); setEnviados(0); setUltimo(null); enviadoRef.current = 0; fixRef.current = null;
    placaRef.current = p; guardarPlaca(p); setPlaca(p);
    setActivo(true); setEsperando(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        fixRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy, velocidad: pos.coords.speed != null ? pos.coords.speed * 3.6 : null, rumbo: pos.coords.heading != null && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null, en: pos.timestamp };
        if (enviadoRef.current === 0) { setEsperando(false); void mandar() }
      },
      (err) => {
        setEsperando(false);
        if (err.code === err.PERMISSION_DENIED) { setMal("Dale permiso de ubicación a esta página (candado junto a la dirección) y vuelve a empezar."); parar() }
        else setAviso("No encuentro la señal GPS. Sal a un sitio abierto…");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    );
    timerRef.current = setInterval(() => void mandar(), CADA_MS);
    void pedirPantalla();
  }, [placa, mandar, parar, pedirPantalla]);

  /* Al volver a la pantalla, se pide otra vez mantenerla encendida (el celular la suelta al cambiar de app). */
  /* Y si estuvo más de un minuto bloqueado o en otra app, se le dice: en ese tiempo no se mandó su ubicación
     (y en Tiempos GPS salió «sin señal»). Se manda una posición enseguida para retomar. */
  const ocultoDesde = useRef<number | null>(null);
  const [pausa, setPausa] = useState<string | null>(null);
  useEffect(() => {
    const v = () => {
      if (document.hidden) { if (activo) ocultoDesde.current = Date.now(); return }
      if (!activo) return;
      void pedirPantalla();
      const d = ocultoDesde.current ? Date.now() - ocultoDesde.current : 0;
      ocultoDesde.current = null;
      if (d >= 60_000) { setPausa(`Estuviste ${Math.round(d / 60_000)} min con la pantalla bloqueada o en otra app: en ese tiempo no se mandó tu ubicación. Deja esta pantalla abierta y encendida mientras manejas.`); void mandar() }
    };
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [activo, pedirPantalla, mandar]);
  useEffect(() => parar, [parar]);

  /* ---------- PARTE 2: LOS VIAJES DE LA PLACA (en prueba, solo superadmin) ---------- */
  const placaLista = /^[A-Z0-9]{5,7}$/.test(placa) ? placa : "";
  const cargar = useCallback(async () => {
    if (!conViajes || !placaLista) return;
    const r = await fetch(`/api/traspasos/gps/conductor?placa=${encodeURIComponent(placaLista)}`, { cache: "no-store" }).catch(() => null);
    if (!r) { setErrViajes("Sin internet: no pude traer tus viajes."); return }
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; viajes?: ViajeConductor[]; error?: string };
    if (!r.ok || !j.ok) { setErrViajes(j.error ?? "No pude traer tus viajes."); return }
    setErrViajes(null); setViajes(j.viajes ?? []);
  }, [conViajes, placaLista]);
  useEffect(() => { cargarRef.current = cargar }, [cargar]);
  useEffect(() => {
    setViajes(null); setErrViajes(null);
    if (!conViajes || !placaLista) return;
    const t = setTimeout(() => void cargar(), 400);
    const i = setInterval(() => { if (!document.hidden) void cargar() }, RECARGAR_MS);
    return () => { clearTimeout(t); clearInterval(i) };
  }, [conViajes, placaLista, cargar]);

  const accion = useCallback(async (cuerpo: Record<string, string>, clave: string) => {
    setOcupado(clave); setErrViajes(null);
    const r = await fetch("/api/traspasos/gps/conductor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placa: placaLista, ...cuerpo }) }).catch(() => null);
    setOcupado(null);
    if (!r) { setErrViajes("Sin internet. Intenta otra vez."); return false }
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; viajes?: ViajeConductor[]; error?: string };
    if (!r.ok || !j.ok) { setErrViajes(j.error ?? "No se pudo."); void cargar(); return false }
    setViajes(j.viajes ?? []); return true;
  }, [placaLista, cargar]);

  const iniciar = async (v: ViajeConductor) => {
    setLlegada(null);
    if (!(await accion({ accion: "iniciar", viaje: v.id }, v.id))) return;
    if (!activo) empezar();
  };
  const cancelar = async (v: ViajeConductor) => {
    if (!v.recorrido) return;
    const ok = await pedir({ titulo: "¿Cancelar este viaje?", dice: <>Se deja de seguir <b>{v.origen} → {v.destino}</b> y vuelve a quedar por iniciar. Úsalo si marcaste el viaje equivocado.</>, confirmar: "Cancelar viaje", cancelar: "Seguir en camino", peligro: true });
    if (ok) await accion({ accion: "cancelar", recorrido: v.recorrido.id }, v.id);
  };
  const llegue = async (v: ViajeConductor) => {
    if (!v.recorrido) return;
    const ok = await pedir({ titulo: `¿Llegaste a ${v.destino ?? "tu destino"}?`, dice: "Este destino no tiene geocerca, así que el viaje no se cierra solo. Márcalo solo cuando estés en el sitio.", confirmar: "Sí, llegué" });
    if (ok) await accion({ accion: "llegue", recorrido: v.recorrido.id }, v.id);
  };
  const enCurso = viajes?.find((v) => v.recorrido?.estado === "en_curso") ?? null;
  const hechos = viajes?.filter((v) => v.recorrido?.estado === "llego").length ?? 0;

  return (
    <div className="cu">
      <header className="cu-cab">
        <p>Traspasos · Compartir ubicación</p>
        <h1>{activo ? "Compartiendo tu ubicación" : "Compartir ubicación"}</h1>
      </header>

      <div className="cu-caja">
        <label className="cu-campo">Placa del vehículo
          <input value={placa} onChange={(e) => setPlaca(limpiar(e.target.value))} disabled={activo} placeholder="ABC123" maxLength={7} autoCapitalize="characters" autoComplete="off" inputMode="text" />
        </label>

        {!activo
          ? <button type="button" className="cu-boton" onClick={empezar}>Empezar a compartir</button>
          : <button type="button" className="cu-boton parar" onClick={parar}>Dejar de compartir</button>}

        {mal && <p className="cu-aviso mal" role="alert">{mal}</p>}
        {aviso && !mal && <p className="cu-aviso" role="status">{aviso}</p>}

        {activo && (
          <div className="cu-estado" role="status" aria-live="polite">
            <div className="cu-pulso" aria-hidden="true" />
            <div>
              {esperando && !ultimo ? <b>Buscando señal GPS…</b> : ultimo ? (<>
                <b>{enCurso ? `En camino a ${enCurso.destino ?? "destino"} · ${km(enCurso.recorrido!.km)}` : ultimo.zona ? `Estás en ${ultimo.zona}` : "En tránsito (fuera de las zonas)"}</b>
                <small>Último envío {ultimo.hora} · precisión ±{Math.round(ultimo.precision)} m · {enviados} {enviados === 1 ? "envío" : "envíos"}</small>
              </>) : <b>Enviando…</b>}
            </div>
          </div>
        )}

        {pausa && <p className="cu-aviso mal" role="alert">{pausa} <button type="button" className="cu-mini" onClick={() => setPausa(null)}>Entendido</button></p>}
        {llegada && <p className="cu-aviso bien" role="status">{llegada}</p>}

        {conViajes && placaLista && (
          <section className="cu-viajes" aria-label="Tus viajes">
            <div className="cu-viajes-cab">
              <h2>Tus viajes · {placaLista}</h2>
              {viajes && viajes.length > 0 && <span>{hechos} de {viajes.length} hechos</span>}
              <button type="button" className="cu-mini" onClick={() => void cargar()}>Actualizar</button>
            </div>
            {errViajes && <p className="cu-aviso mal" role="alert">{errViajes}</p>}
            {viajes === null && !errViajes && <p className="cu-vacio">Buscando tus viajes…</p>}
            {viajes?.length === 0 && <p className="cu-vacio">Todavía no tienes viajes con la salida confirmada. Cuando facturación confirme la salida del vehículo, aparecen aquí en orden.</p>}
            {viajes && viajes.length > 0 && (
              <ol className="cu-lista">
                {viajes.map((v, i) => {
                  const r = v.recorrido;
                  const est = r?.estado === "llego" ? "llego" : r?.estado === "en_curso" ? "curso" : "pendiente";
                  return (
                    <li key={v.id} className={`cu-viaje ${est}`}>
                      <span className="cu-num" aria-hidden="true">{est === "llego" ? "✓" : i + 1}</span>
                      <div className="cu-viaje-cuerpo">
                        <p className="cu-ruta"><b>{v.origen ?? "—"}</b><span aria-label="hacia">→</span><b>{v.destino ?? "—"}</b></p>
                        <p className="cu-meta">{v.tipoNombre ?? "Viaje"}{v.vacio ? " · vacío" : v.documento ? ` · doc ${v.documento}` : ""} · {v.salida ? `salió ${hm(v.salida)}` : `registrado ${hm(v.registrado)}`}</p>

                        {est === "pendiente" && (
                          <button type="button" className="cu-check" disabled={!!enCurso || ocupado === v.id} onClick={() => void iniciar(v)}>
                            <span className="cu-caja-check" aria-hidden="true" />
                            {ocupado === v.id ? "Iniciando…" : enCurso ? "Termina el viaje en curso primero" : "Iniciar este viaje"}
                          </button>
                        )}
                        {est === "curso" && r && (<>
                          <p className="cu-sigue"><b>En curso</b> · {km(r.km)} · desde {hm(r.inicio)} ({minutos(r.inicio, null)})</p>
                          <p className="cu-nota">{v.geocercaDestino ? <>Se cierra solo cuando entres a <b>{v.geocercaDestino}</b>.</> : <>El destino no tiene geocerca: al llegar toca <b>Llegué</b>.</>}</p>
                          <div className="cu-botones">
                            {!v.geocercaDestino && <button type="button" className="cu-mini fuerte" disabled={ocupado === v.id} onClick={() => void llegue(v)}>Llegué</button>}
                            <button type="button" className="cu-mini" disabled={ocupado === v.id} onClick={() => void cancelar(v)}>Cancelar viaje</button>
                          </div>
                        </>)}
                        {est === "llego" && r && (
                          <p className="cu-sigue">Llegó {hm(r.fin)} · {minutos(r.inicio, r.fin)} · {km(r.km)}{r.cierre === "manual" ? " · marcado a mano" : ""}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        <ul className="cu-notas">
          <li>Deja <b>esta pantalla encendida y abierta</b>. Si bloqueas el celular o cambias de aplicación, el GPS se pausa y no se registra el recorrido.</li>
          <li>Acepta el permiso de ubicación cuando el celular lo pida.</li>
          <li>Al llegar a Fábrica, Bodega 38 o Arenosa el sistema marca solo la entrada y la salida: no tienes que tocar nada.</li>
          {conViajes && <li>Antes de arrancar, marca <b>el viaje que vas a hacer</b>. Al entrar a la geocerca del destino se cierra solo y marcas el siguiente.</li>}
        </ul>
      </div>
      {dialogo}
    </div>
  );
}
