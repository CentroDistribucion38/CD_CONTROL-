"use client";

import { useEffect, useRef, useState } from "react";
import { useAvisos } from "@/components/Aviso";
import type { PlanLinea } from "@/modulos/traspasos/datos";

/**
 * EL ICONO PEQUEÑO QUE COPIA EL PLAN DEL DÍA COMO IMAGEN.
 *
 * Va al lado del título. Dibuja el plan GUARDADO del día (el publicado; si todavía no hay, el borrador) en un lienzo y lo
 * pone en el portapapeles para pegarlo en WhatsApp o Teams. Si el navegador no deja copiar imágenes, la baja como PNG.
 *
 * El portapapeles se pide EN EL MISMO TOQUE y se le pasa la imagen como promesa: Safari (el iPad del muelle) solo deja
 * copiar mientras el toque está "vivo", y armar el dibujo antes de pedirlo se lo gastaba.
 */
export function CopiarPlan({ fechaLarga, dia, tipos, publicadas, borrador, vacios, hechos }: {
  fechaLarga: string;
  dia: string;
  tipos: { clave: string; nombre: string }[];
  publicadas: PlanLinea[];
  borrador: PlanLinea[];
  vacios: { turno: string; vacios: number }[];
  /** Viajes ya hechos hoy; null si el día no es hoy. */
  hechos: number | null;
}) {
  const [avisar, avisos] = useAvisos();
  const [armando, setArmando] = useState(false);
  const [listo, setListo] = useState(false);

  const esAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  /* La imagen se arma YA como un File y se tiene lista: en Android el menú de compartir solo se abre si se pide en el mismo
     toque, sin esperas en medio (si se arma después del toque, el navegador dice «no hubo toque» y no pasa nada). */
  const archivoListo = useRef<File | null>(null);

  const hacerBlob = async () => {
    const estado = publicadas.length ? "PUBLICADO" : borrador.length ? "BORRADOR" : "SIN PLAN";
    const lineas = publicadas.length ? publicadas : borrador;
    const fo = await import("@/modulos/traspasos/foto-plan");
    const logo = await fo.cargarLogoB();
    const plan: Record<string, number> = {};
    for (const l of lineas) plan[`${l.turno}|${l.tipo}`] = l.planeado;
    const v: Record<string, number> = {};
    for (const x of vacios) v[x.turno] = x.vacios;
    const lienzo = fo.dibujarPlanFoto({ fechaLarga, estado, tipos, plan, vacios: v, hechos, generado: new Date(), logo });
    return new Promise<Blob>((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
  };

  useEffect(() => {
    if (!esAndroid) return;
    let vivo = true;
    archivoListo.current = null;
    hacerBlob().then((b) => { if (vivo) archivoListo.current = new File([b], `plan-del-dia-${dia}.png`, { type: "image/png" }) }).catch(() => {});
    return () => { vivo = false };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAndroid, dia, fechaLarga, publicadas, borrador, vacios, hechos, tipos]);

  const bajar = async (blob?: Blob) => {
    const b = blob ?? await hacerBlob();
    const url = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = url; a.download = `plan-del-dia-${dia}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  async function copiar() {
    if (armando) return;

    /* EN ANDROID NO SE COPIA: la imagen copiada llega a WhatsApp como «Portapapeles» y no se pega. Se abre el menú de
       compartir con la imagen (de ahí sale WhatsApp o Teams). La llamada va PRIMERO, sin esperar nada antes. */
    if (esAndroid) {
      const f = archivoListo.current;
      if (!f) { avisar.info("Estoy armando la imagen. Toca otra vez en un segundo."); return }
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: `Plan del día · ${fechaLarga}` }); avisar.bien("Plan listo para enviar."); setListo(true); setTimeout(() => setListo(false), 2000) }
        catch (e) {
          if ((e as { name?: string })?.name === "AbortError") return;
          await bajar(f); avisar.info("No se pudo abrir el menú de compartir: se bajó la imagen para que la mandes desde Archivos o la Galería.");
        }
        return;
      }
      await bajar(f); avisar.info("Este navegador no comparte imágenes: se bajó para que la mandes desde Archivos o la Galería.");
      return;
    }

    setArmando(true);
    try {
      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        try {
          /* Safari (iPhone, iPad) solo deja copiar mientras el toque está «vivo»: la imagen va como promesa. */
          await navigator.clipboard.write([new ClipboardItem({ "image/png": hacerBlob() })]);
          avisar.bien("Imagen copiada. Pégala en WhatsApp o Teams (Ctrl + V).");
        } catch {
          await bajar();
          avisar.info("El navegador no dejó copiar la imagen: se bajó como PNG para que la mandes.");
        }
      } else {
        await bajar();
        avisar.info("Este navegador no copia imágenes: se bajó como PNG para que la mandes.");
      }
      setListo(true); setTimeout(() => setListo(false), 2000);
    } catch {
      avisar.mal("No se pudo armar la imagen del plan. Vuelve a intentarlo.");
    } finally {
      setArmando(false);
    }
  }

  return (
    <>
      {avisos}
      <button type="button" className={"btn-foto-plan" + (listo ? " listo" : "")} onClick={copiar} disabled={armando}
              title="Copiar imagen del plan" aria-label="Copiar imagen del plan">
        {listo ? (
          <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></svg>
        )}
      </button>
    </>
  );
}
