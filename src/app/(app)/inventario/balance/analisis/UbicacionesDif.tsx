"use client";

import { useEffect, useRef, useState } from "react";
import type { FilaAnalisis } from "@/modulos/inventario/analisis-dif";

/* ===================================================================
   ANÁLISIS DE DIFERENCIA · «UBICACIONES» DE UN CÓDIGO

   «Así como selecciono el código y salen las partidas, un ícono pequeño de
    ubicaciones: que se abra un toolbox con las ubicaciones que presentan esa
    diferencia, y poder copiar y pegar la imagen.»

   Muestra DÓNDE se contó el código en Bodega 38 (ubicación → cantidad), junto con
   SAP, Conteo y Diferencia. SAP no tiene ubicación, así que la diferencia se lee
   contra el total contado. Lo que suma al conteo sin ubicación (casco con baja,
   novedades) sale en su propio renglón para que el total siempre cuadre.

   «Copiar imagen» saca solo la tarjeta (sin botones) a PNG, igual que el Consumo:
   si el navegador no deja copiar, se descarga.
   =================================================================== */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));

function unidadDe(f: FilaAnalisis) {
  return f.familia.startsWith("E03") ? "estibas" : f.familia.startsWith("E01") ? "cajas" : "unidades";
}

export function UbicacionesDif({ fila, fecha }: { fila: FilaAnalisis; fecha: string }) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  const foto = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const atras = boton.current;
    cerrar.current?.focus();
    const sobre = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) };
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = sobre; atras?.focus() };
  }, [abierto]);

  const ubis = fila.ubicaciones ?? [];
  const suma = ubis.reduce((t, u) => t + u.cantidad, 0);
  const sinUbi = fila.conteo - suma;
  const unidad = unidadDe(fila);
  const pct = (v: number) => (fila.conteo ? `${Math.round((Math.abs(v) / Math.abs(fila.conteo)) * 100)}%` : "—");
  const dif = fila.diferencia;
  const tope = Math.max(1, ...ubis.map((u) => Math.abs(u.cantidad)), Math.abs(sinUbi));
  const fechaLarga = new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());

  /* La tarjeta a PNG. El html2canvas se carga solo cuando se usa. */
  async function armar(): Promise<Blob> {
    const nodo = foto.current;
    if (!nodo) throw new Error("sin tarjeta");
    const html2canvas = (await import("html2canvas")).default;
    const lienzo = await html2canvas(nodo, {
      backgroundColor: "#ffffff", scale: 2, useCORS: true,
      onclone: (doc: Document) => {
        /* La ventana tiene scroll propio: en la copia se estira para que la imagen salga completa. */
        let el: HTMLElement | null = doc.getElementById("ub-foto");
        while (el) { el.style.overflow = "visible"; el.style.maxHeight = "none"; el.style.height = "auto"; el = el.parentElement }
      },
    });
    const blob: Blob | null = await new Promise((r) => lienzo.toBlob(r, "image/png"));
    if (!blob) throw new Error("sin imagen");
    return blob;
  }
  const nombreArchivo = `ubicaciones-${fila.codigo}-${fecha}.png`;
  function bajar(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = nombreArchivo; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function copiar(soloBajar = false) {
    setTrabajando(true); setAviso("Armando la imagen…");
    try {
      const blob = await armar();
      if (soloBajar) { bajar(blob); setAviso("Imagen descargada.") }
      else {
        try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); setAviso("Imagen copiada. Pégala donde quieras con Ctrl + V.") }
        catch { bajar(blob); setAviso("Este navegador no deja copiar: se descargó la imagen.") }
      }
    } catch { setAviso("No pude armar la imagen. Intenta de nuevo.") }
    setTrabajando(false);
    setTimeout(() => setAviso(""), 6000);
  }

  return (
    <>
      <button ref={boton} type="button" className="ub-ico" onClick={() => { setAviso(""); setAbierto(true) }}
              aria-label={`Ubicaciones de ${fila.codigo}`} title="Ubicaciones donde se contó este código">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" />
        </svg>
        <em>{ubis.length}</em>
      </button>

      {abierto && (
        <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="ub-titulo"
             onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}>
          <div className="ub-caja">
            <div className="ub-barra">
              <span>Se copia como imagen, tal cual la ves</span>
              <button ref={cerrar} type="button" className="ub-x" onClick={() => setAbierto(false)} aria-label="Cerrar">×</button>
            </div>

            <div className="ub-scroll">
              <div id="ub-foto" ref={foto} className="ub-foto">
                <div className="ub-top">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/marca/logo-bavaria.png" alt="Bavaria" height={34} />
                  <span>CD Barranquilla · Bodega 38<br />{fechaLarga}</span>
                </div>
                <div className="ub-tit">
                  <p className="ub-ojo">DÓNDE SE CONTÓ</p>
                  <h2 id="ub-titulo"><span className="ub-cod">{fila.codigo}</span><span className="ub-desc">{fila.descripcion}</span></h2>
                </div>

                <div className="ub-kpis">
                  <div className="s"><small>SAP</small><b>{n(fila.sap)}</b></div>
                  <div><small>Conteo</small><b>{n(fila.conteo)}</b></div>
                  <div className={"d" + (dif < 0 ? " neg" : dif > 0 ? " pos" : "")}><small>Diferencia</small><b>{signo(dif)}</b></div>
                </div>

                <div className="ub-h"><span>Ubicación</span><span>Contado ({unidad})</span><span className="n">Un.</span><span className="n">%</span></div>
                <div className="ub-l">
                  {ubis.length === 0 && <p className="ub-vacio">Este código no tiene ubicación en el conteo: lo que suma viene de casco con baja o de novedades.</p>}
                  {ubis.map((u, i) => (
                    <div key={u.ubicacion} className={"ub-r" + (i === 0 ? " p1" : "")}>
                      <span className="ub-u">{u.ubicacion}</span>
                      <div className="ub-tr"><i style={{ width: `${Math.max(1, Math.round((Math.abs(u.cantidad) / tope) * 100))}%` }} /></div>
                      <span className={"ub-v" + (u.cantidad < 0 ? " neg" : "")}>{n(u.cantidad)}</span>
                      <span className="ub-p">{pct(u.cantidad)}</span>
                    </div>
                  ))}
                  {ubis.length > 0 && Math.abs(sinUbi) >= 1 && (
                    <div className="ub-r ub-sin">
                      <span className="ub-u">Sin ubicación<small>casco con baja, novedades</small></span>
                      <div className="ub-tr"><i style={{ width: `${Math.max(1, Math.round((Math.abs(sinUbi) / tope) * 100))}%` }} /></div>
                      <span className={"ub-v" + (sinUbi < 0 ? " neg" : "")}>{signo(sinUbi)}</span>
                      <span className="ub-p">{pct(sinUbi)}</span>
                    </div>
                  )}
                </div>
                <div className="ub-tot"><span>Total contado · {ubis.length} {ubis.length === 1 ? "ubicación" : "ubicaciones"}</span><b>{n(fila.conteo)}</b></div>
                <p className="ub-pie"><span>SAP no se lleva por ubicación: la diferencia ({signo(dif)}) se lee contra el total contado.</span><span>Control CD38 · Bavaria</span></p>
              </div>
            </div>

            <div className="ub-acc">
              <button type="button" className="ub-bt" disabled={trabajando} onClick={() => copiar(false)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></svg>
                Copiar imagen
              </button>
              <button type="button" className="ub-bt alt" disabled={trabajando} onClick={() => copiar(true)}>Descargar PNG</button>
              <span className="ub-aviso" role="status" aria-live="polite">{aviso}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
