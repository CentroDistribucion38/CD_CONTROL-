"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import { BotonesFoto, logoMarca, useFotoCompartir, type TipoFoto } from "@/components/FotoCompartir";
import { PALETA_MARCA } from "@/modulos/rotlinea/hoja";
import { graficaPNG, nombreInformeCasco, type DatosInformeCasco } from "@/modulos/casco/informe";

/**
 * LOS BOTONES DEL INFORME DEL CASCO: Dashboard y Detalle (cada uno una imagen para copiar y pegar
 * en un correo o en WhatsApp, como en Pasivos) y el informe en PDF y Word.
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

export function BotonesInforme({ datos, rango, hlEstiba = {}, chips = [] }: {
  datos: DatosInformeCasco | null;
  /** El periodo del tablero (desde / hasta): de ahí salen los viajes del «Cierre de viajes». */
  rango?: { desde: string; hasta: string } | null;
  /** HL de una estiba de cada referencia (del maestro), para pasar las estibas movilizadas a HL. */
  hlEstiba?: Record<string, number | null>;
  chips?: string[];
}) {
  const [armando, setArmando] = useState<"pdf" | "word" | null>(null);
  const [mal, setMal] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  /* EL CIERRE DE VIAJES: los movimientos del periodo (se leen al abrir la imagen) y las referencias que se quitaron de
     la imagen con un clic («si quiero que uno no se vea, con un clic lo quito»). */
  const [movs, setMovs] = useState<{ clave: string; filas: import("@/modulos/casco/foto").MovCasco[] } | null>(null);
  const [ocultos, setOcultos] = useState<string[]>([]);
  const claveRango = rango ? `${rango.desde}|${rango.hasta}` : "";
  async function leerMovs() {
    if (movs && movs.clave === claveRango) return movs.filas;
    if (!rango) return [];
    const { data, error } = await createClient().from("v_casco_movimientos").select("*")
      .gte("fecha", rango.desde).lte("fecha", rango.hasta).order("fecha").limit(5000);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as import("@/modulos/casco/foto").MovCasco[];
    setMovs({ clave: claveRango, filas });
    return filas;
  }
  /* Las referencias que se movilizaron (para los botones de mostrar / quitar), las de más estibas primero. */
  const refs = (() => {
    const m = new Map<string, { nombre: string; est: number }>();
    for (const x of movs?.clave === claveRango ? movs.filas : []) {
      if (x.ajuste) continue;
      const k = String(x.sku).trim(), r = m.get(k) ?? { nombre: x.descripcion || k, est: 0 };
      r.est += Number(x.estibas) || 0; m.set(k, r);
    }
    return [...m].sort((a, b) => b[1].est - a[1].est).map(([k, r]) => ({ k, t: `${k} · ${r.nombre.length > 22 ? r.nombre.slice(0, 21) + "…" : r.nombre}` }));
  })();

  const fotos = useFotoCompartir(async (tipo: TipoFoto) => {
    if (!datos) throw new Error("sin datos");
    const paleta = leerPaleta(caja.current) ?? PALETA_MARCA;
    const [fo, logo] = await Promise.all([import("@/modulos/casco/foto"), logoMarca()]);
    if (tipo === "viajes") {
      const filas = await leerMovs();
      const fuera = new Set(ocultos);
      const cierre = fo.armarCierreViajes(filas, hlEstiba, fuera);
      const corto = (f: string) => `${Number(f.slice(8, 10))} de ${new Date(f + "T12:00:00").toLocaleDateString("es-CO", { month: "long" })}`;
      const periodo = rango ? `del ${corto(rango.desde)} al ${corto(rango.hasta)} de ${rango.hasta.slice(0, 4)}` : datos.periodo;
      return { lienzo: fo.dibujarCierreViajes(cierre, { periodo, chips: chips.length ? chips : ["Todas las rutas", "Todas las referencias"], ocultos: fuera.size }, { paleta, logo }),
               nombre: fo.nombreCierreViajes(rango?.desde ?? datos.corte, rango?.hasta ?? datos.corte) };
    }
    return tipo === "dashboard"
      ? { lienzo: fo.dibujarDashboardCasco(datos, { paleta, logo }), nombre: fo.nombreDashboardCasco(datos.corte) }
      : { lienzo: fo.dibujarDetalleCasco(datos, { paleta, logo }), nombre: fo.nombreDetalleCasco(datos.corte) };
  }, "Casco de vidrio", undefined,
  /* En el Cierre de viajes, un botón por referencia: tocarlo la quita (o la vuelve a poner) de la imagen que se manda. */
  (t) => (t === "viajes" && refs.length ? {
    titulo: "Referencias", valores: refs, actual: refs.map((r) => r.k).filter((k) => !ocultos.includes(k)),
    cambiar: (k: string) => setOcultos((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k])),
  } : undefined),
  ["dashboard", "detalle", "viajes"]);

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
        <BotonesFoto abrir={fotos.abrir} armando={fotos.armando} abierta={fotos.abierta} deshabilitado={!datos || armando != null} clase="cvt-inf-bt foto" />
        <button type="button" className="cvt-inf-bt foto" onClick={() => fotos.abrir("viajes")} disabled={!datos || !rango || armando != null || fotos.armando != null}
                title="Las referencias que se movilizaron en el periodo, por ruta (Carnaval → Peldar primero)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></svg>
          {fotos.armando === "viajes" && !fotos.abierta ? "Armando…" : "Cierre de viajes"}
        </button>
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
      {(mal || fotos.mal) && <p className="cvt-inf-mal">No se pudo armar. Recarga la página y vuelve a intentar.</p>}
      {fotos.vista}
    </div>
  );
}
