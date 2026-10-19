"use client";

import { useRef, useState } from "react";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import { BotonesFoto, logoMarca, useFotoCompartir, type TipoFoto } from "@/components/FotoCompartir";
import { PALETA_MARCA } from "@/modulos/rotlinea/hoja";
import type { DatosInformePasivo } from "@/modulos/pasivos/informe";

/**
 * LOS BOTONES DEL INFORME PASIVO: Dashboard y Detalle (cada uno una imagen para copiar y pegar en
 * un correo o en WhatsApp) y el informe en PDF y Word, como los del casco. jsPDF / fflate se cargan
 * solo al tocar el botón; los colores salen del tema y los logos van tal cual. Los datos llegan ya
 * calculados desde la pantalla, con los filtros puestos.
 */
async function comoDataUrl(url: string) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise<string | null>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(null); f.readAsDataURL(b) });
  } catch { return null }
}
function bajar(datos: BlobPart, tipo: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([datos], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function BotonesPasivo({ datos }: { datos: DatosInformePasivo | null }) {
  const [armando, setArmando] = useState<"pdf" | "word" | null>(null);
  const [mal, setMal] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const fotos = useFotoCompartir(async (tipo: TipoFoto) => {
    if (!datos) throw new Error("sin datos");
    const paleta = leerPaleta(caja.current) ?? PALETA_MARCA;
    const [fo, logo] = await Promise.all([import("@/modulos/pasivos/foto"), logoMarca()]);
    return tipo === "dashboard"
      ? { lienzo: fo.dibujarFotoPasivo(datos, { paleta, logo }), nombre: fo.nombreFotoPasivo(datos.dia) }
      : {
          lienzo: fo.dibujarDetallePasivo(datos, { paleta, logo }),
          nombre: fo.nombreDetallePasivo(datos.dia),
          /* lo que se envía no lleva los materiales en 0 ni negativos (en pantalla sí se ven) */
          lienzoEnvio: datos.consolidado.some((f) => !(f.und > 0)) ? fo.dibujarDetallePasivo(datos, { paleta, logo, ocultarCeroYNegativos: true }) : undefined,
        };
  }, "Pasivos BAQ AG01");

  async function armar(que: "pdf" | "word") {
    if (!datos) return;
    setMal(false); setArmando(que);
    try {
      const paleta = leerPaleta(caja.current) ?? PALETA_MARCA;
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

  return (
    <div className="ip-exp" ref={caja}>
      <BotonesFoto abrir={fotos.abrir} armando={fotos.armando} abierta={fotos.abierta} deshabilitado={!datos || armando != null} clase="ip-exp-bt foto" />
      <button type="button" className="ip-exp-bt" onClick={() => armar("pdf")} disabled={!datos || armando != null}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
        {armando === "pdf" ? "Armando…" : "Informe PDF"}
      </button>
      <button type="button" className="ip-exp-bt alt" onClick={() => armar("word")} disabled={!datos || armando != null}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
        {armando === "word" ? "Armando…" : "Informe Word"}
      </button>
      <p className="ip-exp-nota">Sale con el día y los filtros puestos.</p>
      {(mal || fotos.mal) && <p className="ip-exp-mal">No se pudo armar. Recarga la página y vuelve a intentar.</p>}
      {fotos.vista}
    </div>
  );
}
