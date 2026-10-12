"use client";

import { useEffect, useRef, useState } from "react";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import { PALETA_MARCA } from "@/modulos/rotlinea/hoja";
import type { DatosInformePasivo } from "@/modulos/pasivos/informe";

/**
 * LOS BOTONES DEL INFORME PASIVO: PDF y Word, como los del casco, y LA FOTO — todo el tablero en
 * una imagen para pegar en un correo o en WhatsApp. jsPDF / fflate se cargan solo al tocar el
 * botón; los colores salen del tema y los logos van tal cual. Los datos llegan ya calculados desde
 * la pantalla, con los filtros puestos.
 */
async function comoDataUrl(url: string) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise<string | null>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(null); f.readAsDataURL(b) });
  } catch { return null }
}
async function comoImagen(url: string) {
  try { const i = new Image(); i.src = url; await i.decode(); return i } catch { return null }
}
function bajar(datos: BlobPart, tipo: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([datos], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

type TipoFoto = "dashboard" | "detalle";
type Foto = { tipo: TipoFoto; url: string; blob: Blob; nombre: string };

export function BotonesPasivo({ datos }: { datos: DatosInformePasivo | null }) {
  const [armando, setArmando] = useState<"pdf" | "word" | TipoFoto | null>(null);
  const [mal, setMal] = useState(false);
  const [foto, setFoto] = useState<Foto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  // cerrar con Esc y soltar la imagen al cerrar
  useEffect(() => {
    if (!foto) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto]);
  function cerrar() { if (foto) URL.revokeObjectURL(foto.url); setFoto(null); setAviso(null) }
  const ponerFoto = (f: Foto) => setFoto((viejo) => { if (viejo) URL.revokeObjectURL(viejo.url); return f });

  async function armar(que: "pdf" | "word" | TipoFoto) {
    if (!datos) return;
    setMal(false); setArmando(que);
    try {
      const paleta = leerPaleta(caja.current) ?? PALETA_MARCA;
      if (que === "dashboard" || que === "detalle") {
        const [fo, logo] = await Promise.all([import("@/modulos/pasivos/foto"), comoImagen("/marca/logo-bavaria.png")]);
        const lienzo = que === "dashboard" ? fo.dibujarFotoPasivo(datos, { paleta, logo }) : fo.dibujarDetallePasivo(datos, { paleta, logo });
        const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/png"));
        if (!blob) throw new Error("sin imagen");
        setAviso(null);
        ponerFoto({ tipo: que, url: URL.createObjectURL(blob), blob, nombre: que === "dashboard" ? fo.nombreFotoPasivo(datos.dia) : fo.nombreDetallePasivo(datos.dia) });
        return;
      }
      const inf = await import("@/modulos/pasivos/informe");
      const graficas = inf.todasLasGraficas(datos, paleta.tinta);
      const generado = new Date();
      if (que === "pdf") {
        const [{ jsPDF }, palabra, sello] = await Promise.all([import("jspdf"), comoDataUrl("/marca/logo-bavaria.png"), comoDataUrl("/marca/logo-b.png")]);
        const doc = inf.dibujarInformePasivo(jsPDF, datos, { generado, paleta, graficas, marca: { palabra: palabra ?? undefined, sello: sello ?? undefined } });
        doc.save(inf.nombreInformePasivo(datos.dia, "pdf"));
      } else {
        const [{ armarWordPasivo }, palabra] = await Promise.all([import("@/modulos/pasivos/word"), comoDataUrl("/marca/logo-bavaria.png")]);
        const bytes = armarWordPasivo(datos, { generado, paleta, graficas, palabra });
        bajar(bytes as BlobPart, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", inf.nombreInformePasivo(datos.dia, "docx"));
      }
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
    try { await navigator.share({ files: [archivo], title: "Pasivos BAQ AG01" }) } catch { /* lo cerró */ }
  }

  return (
    <div className="ip-exp" ref={caja}>
      <button type="button" className="ip-exp-bt foto" onClick={() => armar("dashboard")} disabled={!datos || armando != null}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="5" /><rect x="13" y="10" width="8" height="11" /><rect x="3" y="13" width="8" height="8" /></svg>
        {armando === "dashboard" && !foto ? "Armando…" : "Dashboard"}
      </button>
      <button type="button" className="ip-exp-bt foto" onClick={() => armar("detalle")} disabled={!datos || armando != null}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18M3 10h18M3 15h18M3 20h18M9 5v15" /></svg>
        {armando === "detalle" && !foto ? "Armando…" : "Detalle"}
      </button>
      <button type="button" className="ip-exp-bt" onClick={() => armar("pdf")} disabled={!datos || armando != null}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
        {armando === "pdf" ? "Armando…" : "Informe PDF"}
      </button>
      <button type="button" className="ip-exp-bt alt" onClick={() => armar("word")} disabled={!datos || armando != null}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
        {armando === "word" ? "Armando…" : "Informe Word"}
      </button>
      <p className="ip-exp-nota">Sale con el día y los filtros puestos.</p>
      {mal && <p className="ip-exp-mal">No se pudo armar. Recarga la página y vuelve a intentar.</p>}

      {foto && (
        <div className="ip-foto" role="dialog" aria-modal="true" aria-label="Imagen del informe pasivo para compartir" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
          <div className="ip-foto-caja">
            <div className="ip-foto-barra">
              <div className="ip-foto-tabs" role="tablist" aria-label="Qué imagen">
                {([["dashboard", "Dashboard"], ["detalle", "Detalle por almacén"]] as const).map(([t, n]) => (
                  <button key={t} type="button" role="tab" aria-selected={foto.tipo === t} className={foto.tipo === t ? "on" : ""}
                    disabled={armando != null} onClick={() => foto.tipo !== t && armar(t)}>
                    {armando === t ? "Armando…" : n}
                  </button>
                ))}
              </div>
              <div className="ip-foto-acc">
                <button type="button" className="ip-exp-bt" onClick={copiar}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></svg>
                  Copiar imagen
                </button>
                {sePuedeCompartir && (
                  <button type="button" className="ip-exp-bt alt" onClick={compartir}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0-4 4m4-4 4 4M5 12v8h14v-8" /></svg>
                    Compartir
                  </button>
                )}
                <button type="button" className="ip-exp-bt alt" onClick={() => foto && bajar(foto.blob, "image/png", foto.nombre)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
                  Descargar PNG
                </button>
                <button type="button" className="ip-foto-x" onClick={cerrar} aria-label="Cerrar">×</button>
              </div>
            </div>
            {aviso && <p className="ip-foto-aviso" role="status">{aviso}</p>}
            <div className="ip-foto-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt={foto.tipo === "dashboard" ? "Dashboard de pasivos en una sola imagen" : "Detalle de pasivos por almacén en una sola imagen"} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
