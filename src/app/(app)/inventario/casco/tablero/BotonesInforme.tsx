"use client";

import { useEffect, useRef, useState } from "react";
import { Calendario, aTexto, partes, type Atajo } from "@/components/CalendarioRango";
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
  /* EL PERIODO DEL CIERRE DE VIAJES se escoge DENTRO de la ventana (hoy, ayer, desde–hasta con el calendario).
     Arranca en el del tablero; si el tablero cambia de periodo, vuelve a él. */
  const hoy = hoyCo();
  const [rv, setRv] = useState<{ desde: string; hasta: string } | null>(null);
  const claveTablero = rango ? `${rango.desde}|${rango.hasta}` : "";
  useEffect(() => { setRv(null) }, [claveTablero]);
  const r = rv ?? rango ?? { desde: hoy, hasta: hoy };
  const claveRango = `${r.desde}|${r.hasta}`;
  async function leerMovs() {
    if (movs && movs.clave === claveRango) return movs.filas;
    const { data, error } = await createClient().from("v_casco_movimientos").select("*")
      .gte("fecha", r.desde).lte("fecha", r.hasta).order("fecha").limit(5000);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as import("@/modulos/casco/foto").MovCasco[];
    setMovs({ clave: claveRango, filas });
    return filas;
  }
  const fotos = useFotoCompartir(async (tipo: TipoFoto) => {
    if (!datos) throw new Error("sin datos");
    const paleta = leerPaleta(caja.current) ?? PALETA_MARCA;
    const [fo, logo] = await Promise.all([import("@/modulos/casco/foto"), logoMarca()]);
    if (tipo === "viajes") {
      const filas = await leerMovs();
      const fuera = new Set(ocultos);
      const corto = (f: string) => `${Number(f.slice(8, 10))} de ${new Date(f + "T12:00:00").toLocaleDateString("es-CO", { month: "long" })}`;
      const periodo = r.desde === r.hasta ? `el ${corto(r.desde)} de ${r.desde.slice(0, 4)}` : `del ${corto(r.desde)} al ${corto(r.hasta)} de ${r.hasta.slice(0, 4)}`;
      const o = { periodo, chips: chips.length ? chips : ["Todas las rutas", "Todas las referencias"], ocultos: fuera.size };
      /* EN PANTALLA se ven todos (los quitados en gris, para poder volver a ponerlos); LO QUE SE MANDA va sin los quitados. */
      const vista = fo.dibujarCierreViajes(fo.armarCierreViajes(filas, hlEstiba, fuera, true), o, { paleta, logo });
      const envio = fuera.size ? fo.dibujarCierreViajes(fo.armarCierreViajes(filas, hlEstiba, fuera, false), o, { paleta, logo }).lienzo : null;
      return {
        lienzo: vista.lienzo, lienzoEnvio: envio, zonas: vista.zonas, ancho: vista.ancho,
        nota: fuera.size
          ? `${fuera.size} ${fuera.size === 1 ? "renglón quitado (en gris)" : "renglones quitados (en gris)"}: no cuentan en viajes, estibas ni HL, y no salen al copiar, compartir o descargar. Tócalo otra vez para volver a contarlo.`
          : "Toca un renglón para que no cuente: se actualizan los viajes, las estibas y los HL. Tócalo otra vez para volver a contarlo.",
        nombre: fo.nombreCierreViajes(r.desde, r.hasta),
      };
    }
    return tipo === "dashboard"
      ? { lienzo: fo.dibujarDashboardCasco(datos, { paleta, logo }), nombre: fo.nombreDashboardCasco(datos.corte) }
      : { lienzo: fo.dibujarDetalleCasco(datos, { paleta, logo }), nombre: fo.nombreDetalleCasco(datos.corte) };
  }, "Casco de vidrio", undefined, undefined, ["dashboard", "detalle", "viajes"], {
    /* EN EL CIERRE DE VIAJES se toca el renglón para que no cuente (o para volver a contarlo): la imagen se arma otra vez con los totales nuevos. */
    tocar: (t, k) => { if (t === "viajes") setOcultos((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k])) },
    rearmar: ocultos.join(",") + "@" + claveRango,
    barra: (t) => (t === "viajes" ? <PeriodoViajes desde={r.desde} hasta={r.hasta} hoy={hoy} cambiar={(desde, hasta) => setRv({ desde, hasta })} /> : null),
  });

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
        <button type="button" className="cvt-inf-bt foto" onClick={() => fotos.abrir("viajes")} disabled={!datos || armando != null || fotos.armando != null}
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

const hoyCo = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
const masDias = (f: string, n: number) => { const { a, m, d } = partes(f); const x = new Date(Date.UTC(a, m, d + n)); return aTexto(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) };

/** EL PERIODO DEL CIERRE DE VIAJES, dentro de la ventana: los atajos a la vista (Hoy, Ayer, 7 días, Este mes) y el
 *  calendario de siempre (dos meses, desde–hasta con dos toques). Cambiar el periodo vuelve a leer y a armar la imagen. */
function PeriodoViajes({ desde, hasta, hoy, cambiar }: { desde: string; hasta: string; hoy: string; cambiar: (d: string, h: string) => void }) {
  const ayer = masDias(hoy, -1);
  const { a, m } = partes(hoy);
  const rapidos: [string, string, string][] = [
    ["Hoy", hoy, hoy], ["Ayer", ayer, ayer], ["Últimos 7 días", masDias(hoy, -6), hoy], ["Este mes", aTexto(a, m, 1), hoy],
  ];
  const atajos: Atajo[] = [
    ...rapidos.map(([t, d, h]) => ({ t, d: (): [string, string] => [d, h] })),
    { t: "Últimos 30 días", d: () => [masDias(hoy, -29), hoy] },
    { t: "Mes pasado", d: () => { const am = m === 0 ? a - 1 : a, mm = m === 0 ? 11 : m - 1; return [aTexto(am, mm, 1), aTexto(am, mm, new Date(Date.UTC(am, mm + 1, 0)).getUTCDate())] } },
  ];
  return (
    <div className="fc-periodo" role="group" aria-label="Periodo del cierre de viajes">
      <span className="fc-opc-t">Periodo</span>
      <div className="fc-tabs">
        {rapidos.map(([t, d, h]) => {
          const on = d === desde && h === hasta;
          return <button key={t} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => !on && cambiar(d, h)}>{t}</button>;
        })}
      </div>
      <div className="fc-cal">
        <Calendario flechaAntesEnMovil desde={desde} hasta={hasta} minF={"2025-01-01" < desde ? "2025-01-01" : desde} maxF={hoy} atajos={atajos}
                    aplicar={(d, h) => { if (d && (d !== desde || (h || d) !== hasta)) cambiar(d, h || d) }} />
      </div>
    </div>
  );
}
