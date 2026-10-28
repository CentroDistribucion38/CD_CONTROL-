"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ===================================================================
   COMPARTIR UBICACIÓN — el celular del conductor manda su posición cada ~10 s.
   Mientras esté activo se pide mantener la pantalla encendida (si el celular se bloquea o se cambia de
   aplicación, el navegador pausa el GPS y se deja de reportar).
   =================================================================== */
const CADA_MS = 10_000;
const PRECISION_MAX_M = 50;   // igual que en el servidor: con más error no se puede decir en qué zona está
type Fix = { lat: number; lng: number; precision: number; velocidad: number | null; rumbo: number | null; en: number };
type Ultimo = { hora: string; zona: string | null; precision: number };

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Bogota" });
const limpiar = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");
const leerPlaca = () => { try { return localStorage.getItem("gps_placa") ?? "" } catch { return "" } };
const guardarPlaca = (p: string) => { try { localStorage.setItem("gps_placa", p) } catch { /* sin almacenamiento */ } };

export function Compartir() {
  const [placa, setPlaca] = useState("");
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
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; zona?: string | null; error?: string; debil?: boolean };
    if (!r.ok || j.ok === false) { if (j.debil) setAviso(j.error ?? "Señal débil."); else setMal(j.error ?? "No se pudo enviar."); return }
    setMal(null); setAviso(null);
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
  useEffect(() => {
    const v = () => { if (!document.hidden && activo) void pedirPantalla() };
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [activo, pedirPantalla]);
  useEffect(() => parar, [parar]);

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
                <b>{ultimo.zona ? `Estás en ${ultimo.zona}` : "En tránsito (fuera de las zonas)"}</b>
                <small>Último envío {ultimo.hora} · precisión ±{Math.round(ultimo.precision)} m · {enviados} {enviados === 1 ? "envío" : "envíos"}</small>
              </>) : <b>Enviando…</b>}
            </div>
          </div>
        )}

        <ul className="cu-notas">
          <li>Deja <b>esta pantalla encendida y abierta</b>. Si bloqueas el celular o cambias de aplicación, el GPS se pausa y no se registra el recorrido.</li>
          <li>Acepta el permiso de ubicación cuando el celular lo pida.</li>
          <li>Al llegar a Fábrica, Bodega 38 o Arenosa el sistema marca solo la entrada y la salida: no tienes que tocar nada.</li>
        </ul>
      </div>
    </div>
  );
}
