"use client";

import { useEffect, useState } from "react";
import "./foto-compartir.css";

/**
 * DASHBOARD Y DETALLE PARA COMPARTIR — la ventana con la imagen y los botones Copiar imagen,
 * Compartir (en el celular) y Descargar PNG. La usan el Informe pasivo y el Tablero del casco.
 *
 * Cada pantalla dice CÓMO se dibuja cada imagen (`hacer`); aquí está todo lo demás: el lienzo a
 * PNG, la vista previa, las dos pestañas para pasar de una a la otra y el portapapeles.
 */
export type TipoFoto = "dashboard" | "detalle";
type Foto = { tipo: TipoFoto; url: string; blob: Blob; nombre: string };
export type Hacer = (tipo: TipoFoto) => Promise<{ lienzo: HTMLCanvasElement; nombre: string }>;

export const NOMBRE_FOTO: Record<TipoFoto, string> = { dashboard: "Dashboard", detalle: "Detalle por almacén" };

/** El logo de la marca como imagen para el lienzo (null si no carga: la foto sale sin él). */
export async function logoMarca() {
  try { const i = new Image(); i.src = "/marca/logo-bavaria.png"; await i.decode(); return i } catch { return null }
}

function bajar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function useFotoCompartir(hacer: Hacer, titulo: string) {
  const [foto, setFoto] = useState<Foto | null>(null);
  const [armando, setArmando] = useState<TipoFoto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mal, setMal] = useState(false);

  function cerrar() { setFoto((f) => { if (f) URL.revokeObjectURL(f.url); return null }); setAviso(null) }
  useEffect(() => {
    if (!foto) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto]);

  async function abrir(tipo: TipoFoto) {
    setMal(false); setArmando(tipo);
    try {
      const { lienzo, nombre } = await hacer(tipo);
      const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/png"));
      if (!blob) throw new Error("sin imagen");
      setAviso(null);
      setFoto((viejo) => { if (viejo) URL.revokeObjectURL(viejo.url); return { tipo, url: URL.createObjectURL(blob), blob, nombre } });
    } catch { setMal(true) }
    finally { setArmando(null) }
  }

  async function copiar() {
    if (!foto) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": foto.blob })]);
      setAviso("Copiada. Pégala en el correo o en WhatsApp con Ctrl + V.");
    } catch {
      setAviso("Este navegador no deja copiar imágenes. Usa «Descargar PNG» o «Compartir».");
    }
  }
  const archivo = foto ? new File([foto.blob], foto.nombre, { type: "image/png" }) : null;
  const sePuedeCompartir = !!archivo && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [archivo] });
  async function compartir() {
    if (!archivo) return;
    try { await navigator.share({ files: [archivo], title: titulo }) } catch { /* lo cerró */ }
  }

  const vista = foto && (
    <div className="fc" role="dialog" aria-modal="true" aria-label={`${titulo}: imagen para compartir`} onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <div className="fc-caja">
        <div className="fc-barra">
          <div className="fc-tabs" role="tablist" aria-label="Qué imagen">
            {(["dashboard", "detalle"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={foto.tipo === t} className={foto.tipo === t ? "on" : ""}
                disabled={armando != null} onClick={() => foto.tipo !== t && abrir(t)}>
                {armando === t ? "Armando…" : NOMBRE_FOTO[t]}
              </button>
            ))}
          </div>
          <div className="fc-acc">
            <button type="button" className="fc-bt" onClick={copiar}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></svg>
              Copiar imagen
            </button>
            {sePuedeCompartir && (
              <button type="button" className="fc-bt alt" onClick={compartir}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0-4 4m4-4 4 4M5 12v8h14v-8" /></svg>
                Compartir
              </button>
            )}
            <button type="button" className="fc-bt alt" onClick={() => bajar(foto.blob, foto.nombre)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
              Descargar PNG
            </button>
            <button type="button" className="fc-x" onClick={cerrar} aria-label="Cerrar">×</button>
          </div>
        </div>
        {aviso && <p className="fc-aviso" role="status">{aviso}</p>}
        <div className="fc-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt={`${titulo} · ${NOMBRE_FOTO[foto.tipo]}`} />
        </div>
      </div>
    </div>
  );

  return { abrir, armando, mal, abierta: !!foto, vista };
}

/** Los dos botones, con la clase de botón de cada pantalla. */
export function BotonesFoto({ abrir, armando, abierta, deshabilitado, clase }: {
  abrir: (t: TipoFoto) => void; armando: TipoFoto | null; abierta: boolean; deshabilitado?: boolean; clase: string;
}) {
  return (
    <>
      <button type="button" className={clase} onClick={() => abrir("dashboard")} disabled={deshabilitado || armando != null}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="5" /><rect x="13" y="10" width="8" height="11" /><rect x="3" y="13" width="8" height="8" /></svg>
        {armando === "dashboard" && !abierta ? "Armando…" : "Dashboard"}
      </button>
      <button type="button" className={clase} onClick={() => abrir("detalle")} disabled={deshabilitado || armando != null}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18M3 10h18M3 15h18M3 20h18M9 5v15" /></svg>
        {armando === "detalle" && !abierta ? "Armando…" : "Detalle"}
      </button>
    </>
  );
}
