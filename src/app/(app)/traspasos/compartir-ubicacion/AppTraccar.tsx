"use client";

/**
 * COMPARTIR UBICACIÓN · CON EL CELULAR BLOQUEADO: la app gratuita «Traccar Client» sigue mandando la ubicación aunque
 * se bloquee la pantalla o se use otra app (esta página no puede: el navegador la duerme). Le manda directo a CONTROL.
 * Aquí van los pasos y la dirección para copiar (trae la clave; solo la ve quien puede entrar a esta pantalla).
 * Va cerrado y al final: lo principal de la pantalla es compartir y los viajes.
 */
import { useEffect, useState } from "react";

export function AppTraccar() {
  const [url, setUrl] = useState<string | null>(null);
  const [falta, setFalta] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    fetch("/api/traspasos/gps/app-traccar", { cache: "no-store" }).then((r) => r.json())
      .then((j: { ok?: boolean; url?: string; falta?: string }) => { if (j.ok && j.url) setUrl(j.url); else setFalta(j.falta ?? "No se pudo traer la dirección.") }).catch(() => setFalta("Sin conexión: no se pudo traer la dirección."));
  }, []);
  const copiar = async () => { if (!url) return; try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sin portapapeles */ } };

  return (
    <details className="cu-app">
      <summary><b>Con el celular bloqueado: app Traccar Client</b><span>recomendado para los conductores</span></summary>
      <div className="cu-app-cuerpo">
        <p>Esta página deja de mandar la ubicación si se bloquea el celular o se abre otra app. La app gratuita <b>Traccar Client</b> la sigue mandando y le llega directo a CONTROL.</p>
        <ol>
          <li>Instala <b>Traccar Client</b>: <a href="https://play.google.com/store/apps/details?id=org.traccar.client" target="_blank" rel="noreferrer">Android</a> · <a href="https://apps.apple.com/app/traccar-client/id843156974" target="_blank" rel="noreferrer">iPhone</a>.</li>
          <li>En la app, <b>Identificador del dispositivo</b>: la <b>placa</b> del vehículo, sin espacios (ABC123).</li>
          <li><b>URL del servidor</b>: copia y pega esta dirección completa:
            {url ? (
              <div className="cu-app-url"><code>{url}</code><button type="button" className="cu-mini fuerte" onClick={() => void copiar()}>{copiado ? "Copiada" : "Copiar"}</button></div>
            ) : falta ? (
              <p className="cu-aviso mal">{falta}</p>
            ) : <p className="cu-vacio">Cargando la dirección…</p>}
          </li>
          <li><b>Precisión</b>: alta · <b>Intervalo</b>: 10 segundos · <b>Distancia</b>: 0.</li>
          <li>Activa el <b>seguimiento</b> en la app. Cuando pida la ubicación, escoge <b>Permitir todo el tiempo</b>, y en Android quita el <b>ahorro de batería</b> para Traccar Client.</li>
        </ol>
        <p>Los viajes arrancan solos cuando el vehículo sale de su zona de origen con la salida ya confirmada por facturación, y se cierran solos al llegar. Si quieres, también puedes marcarlos aquí.</p>
      </div>
    </details>
  );
}
