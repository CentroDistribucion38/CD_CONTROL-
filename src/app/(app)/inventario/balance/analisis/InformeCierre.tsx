"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FilaAjuste } from "@/modulos/inventario/compensa";
import { NOMBRE_CIERRE, archivoCierre, construirCierre } from "@/modulos/inventario/cierre-informe";
import { leerPaleta } from "../../informe";

/**
 * EL INFORME DEL CIERRE DEL DÍA, EN PDF O WORD — con la caja para ponerle nombre.
 *
 * «Que me deje renombrar con toolbox el nombre del informe, que siempre será en mayúscula; tú siempre se lo
 *  darás, pero por si algo que se pueda renombrar.» El nombre viene puesto; si se cambia, se escribe en
 *  mayúscula sola. Se pinta con el mismo papel del informe de evidencias.
 */
const rgbHex = (c: [number, number, number]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function InformeCierre({ fecha, fechaLarga, ajustes, guardadoEn, guardadoPor, finalEn }: {
  fecha: string; fechaLarga: string; ajustes: FilaAjuste[];
  guardadoEn: string | null; guardadoPor: string | null; finalEn: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(NOMBRE_CIERRE);
  const [armando, setArmando] = useState<"pdf" | "word" | null>(null);
  const [aviso, setAviso] = useState<{ t: string; mal?: boolean } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLInputElement>(null);
  useEffect(() => { if (abierto) setTimeout(() => caja.current?.select(), 30) }, [abierto]);
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !armando) setAbierto(false) };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [abierto, armando]);

  async function generar(formato: "pdf" | "word") {
    const titulo = (nombre.trim() || NOMBRE_CIERRE).toUpperCase();
    setArmando(formato); setAviso(null);
    try {
      let quien = "—";
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { const { data: p } = await supabase.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle(); quien = p?.nombre || p?.usuario || user.email || "—" }
      } catch { /* sin nombre */ }
      const generado = new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" });
      const bloques = construirCierre(ajustes, { nombre: titulo, fechaLarga, generado, quien, guardadoEn, guardadoPor, finalEn });
      const comoDataUrl = async (url: string) => {
        try {
          const r = await fetch(url); if (!r.ok) return null;
          const b = await r.blob();
          return await new Promise<string | null>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(null); f.readAsDataURL(b) });
        } catch { return null }
      };
      const [palabra, sello] = await Promise.all([comoDataUrl("/marca/logo-bavaria.png"), comoDataUrl("/marca/logo-b.png")]);
      const paleta = leerPaleta(raiz.current);
      const encabezado = "Inventario · Cierre del análisis de diferencia";
      const ojo = "INVENTARIO · BALANCE · BODEGA 38";
      const filtros = `Análisis de diferencia · ${fechaLarga}`;
      if (formato === "pdf") {
        const [{ jsPDF }, { dibujarEvidencias }] = await Promise.all([import("jspdf"), import("@/modulos/inventario/evidencias-pdf")]);
        const doc = dibujarEvidencias(jsPDF, bloques, { periodo: fechaLarga, filtros, generado, marca: { palabra: palabra ?? undefined, sello: sello ?? undefined }, paleta, encabezado, ojo });
        doc.save(archivoCierre(titulo, fecha, "pdf"));
      } else {
        const { armarWord } = await import("@/modulos/inventario/evidencias-word");
        const bytes = armarWord(bloques, { periodo: fechaLarga, filtros, generado, tinta: rgbHex(paleta.tinta), acento: rgbHex(paleta.acento), logo: palabra ?? undefined, encabezado, ojo });
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
        const a = document.createElement("a"); a.href = url; a.download = archivoCierre(titulo, fecha, "docx");
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      setAviso({ t: formato === "pdf" ? "PDF listo: quedó en tus descargas." : "Word listo: quedó en tus descargas." });
    } catch {
      setAviso({ t: "No se pudo armar el informe. Recarga la página e intenta otra vez.", mal: true });
    } finally { setArmando(null) }
  }

  return (
    <div ref={raiz} className="ad-inf">
      <button type="button" className="ad-bt" onClick={() => { setAviso(null); setAbierto(true) }} disabled={!ajustes.length}>Informe PDF · Word</button>
      {abierto && (
        <div className="ad-modal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !armando) setAbierto(false) }}>
          <div className="ad-modal-caja" role="dialog" aria-modal="true" aria-labelledby="ad-inf-t">
            <p className="ad-modal-ojo">INFORME DEL CIERRE</p>
            <h3 id="ad-inf-t">{fechaLarga}</h3>
            <p className="ad-modal-sub">Resumen, top diferencias, compensaciones, ajustes hechos, pendientes y por familia. Listo para enviar.</p>
            <label className="ad-modal-campo">
              <span>Nombre del informe</span>
              <input ref={caja} value={nombre} maxLength={120} spellCheck={false}
                     onChange={(e) => setNombre(e.target.value.toUpperCase())}
                     onKeyDown={(e) => { if (e.key === "Enter" && !armando) void generar("pdf") }} />
              <small>Siempre en mayúscula. {nombre !== NOMBRE_CIERRE && <button type="button" className="ad-modal-link" onClick={() => setNombre(NOMBRE_CIERRE)}>Volver al nombre de siempre</button>}</small>
            </label>
            {aviso && <p className={"ad-msg" + (aviso.mal ? " mal" : " bien")} role="status">{aviso.t}</p>}
            <div className="ad-modal-acc">
              <button type="button" className="ad-bt alt" disabled={!!armando} onClick={() => setAbierto(false)}>Cerrar</button>
              <button type="button" className="ad-bt alt" disabled={!!armando} onClick={() => void generar("word")}>{armando === "word" ? "Armando…" : "Word"}</button>
              <button type="button" className="ad-bt" disabled={!!armando} onClick={() => void generar("pdf")}>{armando === "pdf" ? "Armando…" : "PDF"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
