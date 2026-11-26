"use client";

/**
 * TIEMPOS GPS · AVISOS AL CELULAR (ventana propia de la app).
 *   · ESTE EQUIPO: activar los avisos aquí (el navegador pide permiso), probar y quitar. En iPhone, solo con CONTROL
 *     agregado a la pantalla de inicio.
 *   · A QUIÉN LE LLEGAN (superadmin o quien edita Tiempos GPS): cada persona con los tipos de aviso que recibe —
 *     parado, espera larga, llegó, salió— y cuántos equipos tiene activos.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

type Persona = { id: string; nombre: string; usuario: string; tipos: string[]; equipos: number };
type Datos = { escoge: boolean; yo: { id: string; tipos: string[]; equipos: number }; personas: Persona[] };
const TIPOS: [string, string][] = [["parado", "Parado"], ["espera", "Espera larga"], ["llego", "Llegó"], ["salio", "Salió"]];

const llave = (b64: string) => {
  const p = "=".repeat((4 - (b64.length % 4)) % 4), s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const esIphone = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

export function AvisosCelular({ cerrar }: { cerrar: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [publica, setPublica] = useState<string | null | undefined>(undefined);
  const [faltaLlaves, setFaltaLlaves] = useState<string | null>(null);
  const [aqui, setAqui] = useState<"no-soporta" | "bloqueado" | "activo" | "inactivo" | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; mal?: boolean } | null>(null);
  const [busca, setBusca] = useState("");

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/traspasos/gps/avisos", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ error: "Sin conexión." })),
      fetch("/api/notificaciones", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    if (a.error) setMsg({ t: a.error, mal: true }); else setDatos(a as Datos);
    setPublica((b as { publica?: string | null }).publica ?? null);
    setFaltaLlaves((b as { falta?: string | null }).falta ?? null);
  }, []);

  const revisarAqui = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setAqui("no-soporta"); return }
    if (Notification.permission === "denied") { setAqui("bloqueado"); return }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setAqui(sub ? "activo" : "inactivo");
  }, []);

  useEffect(() => { void cargar(); void revisarAqui() }, [cargar, revisarAqui]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k) }, [cerrar]);

  async function activar() {
    if (!publica) { setMsg({ t: faltaLlaves ?? "El servidor todavía no tiene las llaves de avisos.", mal: true }); return }
    setOcupado("activar"); setMsg(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") { setAqui(permiso === "denied" ? "bloqueado" : "inactivo"); setMsg({ t: "No se dio el permiso de notificaciones.", mal: true }); return }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave(publica) }));
      const equipo = `${esIphone() ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Computador"} · ${new Date().toLocaleDateString("es-CO")}`;
      const r = await fetch("/api/notificaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "suscribir", sub: sub.toJSON(), equipo }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ t: j.error ?? "No se pudo activar.", mal: true }); return }
      setAqui("activo"); setMsg({ t: "Avisos activos en este equipo. Toca «Probar» para oír cómo suena." }); void cargar();
    } catch (e) { setMsg({ t: `No se pudo activar: ${e instanceof Error ? e.message : e}`, mal: true }) }
    finally { setOcupado(null) }
  }
  async function quitar() {
    setOcupado("quitar");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await fetch("/api/notificaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "quitar", endpoint: sub.endpoint }) }).catch(() => null); await sub.unsubscribe().catch(() => false) }
    setOcupado(null); setAqui("inactivo"); setMsg({ t: "Este equipo ya no recibe avisos." }); void cargar();
  }
  async function probar() {
    setOcupado("probar");
    const r = await fetch("/api/notificaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "probar" }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Sin conexión." };
    setOcupado(null);
    setMsg(j.error ? { t: j.error, mal: true } : { t: j.enviados ? `Aviso de prueba enviado a ${j.enviados} ${j.enviados === 1 ? "equipo" : "equipos"}.` : "No tienes equipos activos: actívalo primero aquí.", mal: !j.enviados });
  }
  async function cambiar(p: Persona, tipo: string) {
    const tipos = p.tipos.includes(tipo) ? p.tipos.filter((t) => t !== tipo) : [...p.tipos, tipo];
    setDatos((d) => d && { ...d, personas: d.personas.map((x) => x.id === p.id ? { ...x, tipos } : x), yo: d.yo.id === p.id ? { ...d.yo, tipos } : d.yo });
    const r = await fetch("/api/traspasos/gps/avisos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: p.id, tipos }) }).catch(() => null);
    if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; setMsg({ t: (j as { error?: string }).error ?? "No se pudo guardar.", mal: true }); void cargar() }
  }

  const lista = useMemo(() => {
    const n = busca.trim().toLowerCase();
    const ps = datos?.personas ?? [];
    return (n ? ps.filter((p) => `${p.nombre} ${p.usuario}`.toLowerCase().includes(n)) : ps)
      .sort((a, b) => Number(b.tipos.length > 0) - Number(a.tipos.length > 0) || a.nombre.localeCompare(b.nombre, "es"));
  }, [datos, busca]);
  const conAvisos = datos?.personas.filter((p) => p.tipos.length).length ?? 0;

  return (
    <div className="tg-modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <div className="tg-modal" role="dialog" aria-modal="true" aria-labelledby="tg-av-t">
        <header>
          <div><p className="tg-ojo">Tiempos GPS</p><h2 id="tg-av-t">Avisos al celular</h2></div>
          <button type="button" className="tg-modal-x" onClick={cerrar} aria-label="Cerrar">×</button>
        </header>
        <div className="tg-modal-cuerpo">
          {msg && <p className={"tg-aviso" + (msg.mal ? " mal" : " bien")} role="status">{msg.t}</p>}

          <section className="tg-av-equipo">
            <h3 className="tg-sub">Este equipo</h3>
            {aqui === "no-soporta" ? (
              <p className="tg-nota">{esIphone() && !instalada()
                ? <>En iPhone los avisos solo funcionan con CONTROL en la pantalla de inicio: en Safari toca <b>Compartir → Agregar a inicio</b>, abre CONTROL desde ese ícono y vuelve aquí.</>
                : "Este navegador no permite avisos. Usa Chrome en Android o en el computador."}</p>
            ) : aqui === "bloqueado" ? (
              <p className="tg-nota">Las notificaciones de CONTROL están <b>bloqueadas</b> en este navegador. Actívalas en la configuración del sitio (el candado junto a la dirección → Notificaciones → Permitir) y vuelve aquí.</p>
            ) : (
              <div className="tg-av-fila">
                <span className={"tg-av-estado" + (aqui === "activo" ? " si" : "")}>{aqui === "activo" ? "Avisos activos aquí" : aqui === null ? "Revisando…" : "Sin avisos en este equipo"}</span>
                {aqui === "activo"
                  ? <><button type="button" className="tg-btn fuerte" disabled={!!ocupado} onClick={() => void probar()}>{ocupado === "probar" ? "Enviando…" : "Probar"}</button>
                      <button type="button" className="tg-btn" disabled={!!ocupado} onClick={() => void quitar()}>Quitar de este equipo</button></>
                  : <button type="button" className="tg-btn fuerte" disabled={!!ocupado || aqui === null} onClick={() => void activar()}>{ocupado === "activar" ? "Activando…" : "Activar avisos aquí"}</button>}
              </div>
            )}
            {datos && (
              <p className="tg-nota">{datos.yo.tipos.length
                ? <>Te llegan: <b>{datos.yo.tipos.map((t) => TIPOS.find((x) => x[0] === t)?.[1] ?? t).join(", ")}</b> · {datos.yo.equipos} {datos.yo.equipos === 1 ? "equipo activo" : "equipos activos"}.</>
                : <>Todavía no estás en la lista de quienes reciben avisos{datos.escoge ? ": márcate abajo." : ". Pídeselo a quien administra Tiempos GPS."}</>}</p>
            )}
            {publica === null && faltaLlaves && <p className="tg-aviso mal">{faltaLlaves}</p>}
          </section>

          {datos?.escoge && (
            <section>
              <div className="tg-av-cab">
                <h3 className="tg-sub">A quién le llegan · {conAvisos}</h3>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar persona" aria-label="Buscar persona" />
              </div>
              <div className="tg-av-tabla">
                <table className="tg-tabla">
                  <thead><tr><th>Persona</th>{TIPOS.map(([k, t]) => <th key={k} className="c">{t}</th>)}<th className="n">Equipos</th></tr></thead>
                  <tbody>
                    {lista.map((p) => (
                      <tr key={p.id} className={p.tipos.length ? "con" : ""}>
                        <td><b>{p.nombre}</b><small className="tg-n">{p.usuario}{p.id === datos.yo.id ? " · tú" : ""}</small></td>
                        {TIPOS.map(([k, t]) => (
                          <td key={k} className="c"><input type="checkbox" checked={p.tipos.includes(k)} onChange={() => void cambiar(p, k)} aria-label={`${t} para ${p.nombre}`} /></td>
                        ))}
                        <td className={"n" + (p.tipos.length && !p.equipos ? " tg-alto" : "")} title={p.tipos.length && !p.equipos ? "Está en la lista pero no ha activado los avisos en ningún equipo" : undefined}>{p.equipos || "—"}</td>
                      </tr>
                    ))}
                    {lista.length === 0 && <tr><td colSpan={6} className="tg-vacio">Nadie con ese nombre.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="tg-nota">Cada persona marcada tiene que abrir CONTROL en su celular y tocar <b>Activar avisos aquí</b> una vez. En rojo, los que están en la lista sin ningún equipo activo. <b>Parado</b>: 15 min sin moverse fuera de las zonas. <b>Espera larga</b>: mucho más que lo normal en una zona. <b>Llegó</b> y <b>Salió</b>: cada viaje.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
