"use client";

import { useEffect, useState } from "react";

/**
 * CUANDO UNA PANTALLA SE CAE. Antes salía el cartel en inglés de Next («Application error») y no había
 * cómo saber qué pasó. Ahora:
 *   · con internet y un error de «archivo que no se encontró» (pasa justo después de una actualización,
 *     o si la copia guardada quedó desfasada) la app borra la copia de ESTA pantalla y se recarga sola, una vez;
 *   · si no, dice en español qué pasó, con el detalle técnico a la vista para poder mandarlo, y deja
 *     reintentar o ir al inicio.
 */
const LLAVE = "cd38.error.recarga";
const DESFASE = /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch|Importing a module script failed|error loading dynamically/i;

export function PantallaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [auto, setAuto] = useState(false);
  const detalle = `${error?.name ?? "Error"}: ${error?.message ?? ""}${error?.digest ? " · " + error.digest : ""}`.slice(0, 300);
  const sinRed = typeof navigator !== "undefined" && !navigator.onLine;

  useEffect(() => {
    try { localStorage.setItem("cd38.error.ultimo", JSON.stringify({ cuando: new Date().toISOString(), ruta: location.pathname, detalle })) } catch { /* nada */ }
    if (!DESFASE.test(`${error?.name} ${error?.message}`) || !navigator.onLine) return;
    try {
      const t = Number(sessionStorage.getItem(LLAVE) ?? 0);
      if (Date.now() - t < 60_000) return;           // una sola recarga automática por minuto: nunca un bucle
      sessionStorage.setItem(LLAVE, String(Date.now()));
    } catch { /* sin memoria de sesión: igual se intenta una vez */ }
    setAuto(true);
    void (async () => {
      try {
        if ("caches" in window) {
          const c = await caches.open("control-paginas");
          const u = new URL(location.href);
          await c.delete(u.pathname + u.search); await c.delete(location.href);
        }
        const regs = await navigator.serviceWorker?.getRegistrations?.();
        await Promise.all((regs ?? []).map((r) => r.update()));
      } catch { /* da igual: se recarga de todos modos */ }
      location.reload();
    })();
  }, [error, detalle]);

  const caja = { maxWidth: 520, margin: "12vh auto 0", padding: 28, background: "#fff", border: "1px solid #d5dce5", borderTop: "4px solid #e0123b", color: "#04203f", fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif" } as const;
  const boton = { font: "inherit", fontWeight: 600, fontSize: 14, minHeight: 44, padding: "0 18px", display: "inline-flex", alignItems: "center", cursor: "pointer", textDecoration: "none", margin: "6px 10px 0 0", borderRadius: 0 } as const;
  return (
    <main style={caja} role="alert">
      <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>{auto ? "Actualizando esta pantalla…" : "Esta pantalla no pudo abrir"}</h1>
      <p style={{ fontSize: 15, lineHeight: 1.5, margin: "0 0 12px", color: "#3d4c5f" }}>
        {auto
          ? "Se está trayendo la versión nueva. Un momento."
          : sinRed
            ? "No hay internet y esta pantalla necesita algo que todavía no está guardado en este equipo. Vuelve al inicio o espera a tener internet."
            : "Pasó un error al abrirla. Reintenta; si sigue igual, vuelve al inicio y avisa con el detalle de abajo."}
      </p>
      <p style={{ fontSize: 11.5, color: "#8a96a6", margin: "4px 0 10px", wordBreak: "break-word" }}>{detalle}</p>
      {!auto && (
        <>
          <button type="button" onClick={() => reset()} style={{ ...boton, background: "#04203f", color: "#fff", border: 0 }}>Reintentar</button>
          <a href="/inicio" style={{ ...boton, background: "#fff", color: "#04203f", border: "1px solid #04203f" }}>Ir al inicio</a>
        </>
      )}
    </main>
  );
}
