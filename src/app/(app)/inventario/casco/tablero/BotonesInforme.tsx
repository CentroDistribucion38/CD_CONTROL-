"use client";

import { useRef, useState } from "react";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import { PALETA_MARCA } from "@/modulos/rotlinea/hoja";
import { graficaPNG, nombreInformeCasco, type DatosInformeCasco } from "@/modulos/casco/informe";

/**
 * LOS DOS BOTONES DEL INFORME DEL CASCO: PDF y Word.
 *
 * Igual que el de salida de vidrio: solo esto es de cliente pesado, y jsPDF / fflate se importan
 * cuando alguien toca el botón. Los colores salen del tema (`leerPaleta`), los logos no.
 * Los datos llegan YA CALCULADOS desde el tablero, con los filtros que estén puestos.
 */
async function comoDataUrl(url: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise<string | null>((ok) => {
      const f = new FileReader();
      f.onload = () => ok(String(f.result));
      f.onerror = () => ok(null);
      f.readAsDataURL(b);
    });
  } catch { return null }
}

function bajar(datos: BlobPart, tipo: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([datos], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function BotonesInforme({ datos }: { datos: DatosInformeCasco | null }) {
  const [armando, setArmando] = useState<"pdf" | "word" | null>(null);
  const [mal, setMal] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  async function armar(que: "pdf" | "word") {
    if (!datos) return;
    setMal(false); setArmando(que);
    try {
      const paleta = leerPaleta(caja.current) ?? PALETA_MARCA;
      const grafica = (() => { try { return graficaPNG(datos, paleta.tinta) } catch { return null } })();
      const generado = new Date();
      if (que === "pdf") {
        const [{ jsPDF }, { dibujarInformeCasco }, palabra, sello] = await Promise.all([
          import("jspdf"), import("@/modulos/casco/informe"),
          comoDataUrl("/marca/logo-bavaria.png"), comoDataUrl("/marca/logo-b.png"),
        ]);
        const doc = dibujarInformeCasco(jsPDF, datos, { generado, paleta, grafica, marca: { palabra: palabra ?? undefined, sello: sello ?? undefined } });
        doc.save(nombreInformeCasco(datos.hoy, "pdf"));
      } else {
        const [{ armarWordCasco }, palabra] = await Promise.all([import("@/modulos/casco/word"), comoDataUrl("/marca/logo-bavaria.png")]);
        const bytes = armarWordCasco(datos, { generado, paleta, grafica, palabra });
        bajar(bytes as BlobPart, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", nombreInformeCasco(datos.hoy, "docx"));
      }
    } catch { setMal(true) }
    finally { setArmando(null) }
  }

  return (
    <div className="cvt-inf" ref={caja}>
      <div className="cvt-inf-bts">
        <button type="button" className="cvt-inf-bt" onClick={() => armar("pdf")} disabled={!datos || armando != null}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
          {armando === "pdf" ? "Armando…" : "Informe PDF"}
        </button>
        <button type="button" className="cvt-inf-bt alt" onClick={() => armar("word")} disabled={!datos || armando != null}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
          {armando === "word" ? "Armando…" : "Informe Word"}
        </button>
      </div>
      <p className="cvt-inf-nota">Sale con los filtros puestos y solo lo que tiene inventario.</p>
      {mal && <p className="cvt-inf-mal">No se pudo armar el informe. Recarga la página y vuelve a intentar.</p>}
    </div>
  );
}
