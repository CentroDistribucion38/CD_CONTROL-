"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FilaAjuste } from "@/modulos/inventario/compensa";
import {
  NOMBRE_CIERRE, OJO_CIERRE, OJO_PORTADA, archivoCierre, construirCierre, fechaFiscal,
  type ComparacionFiscal,
} from "@/modulos/inventario/cierre-informe";
import { Selector, type OpcionSel } from "@/components/Selector";
import { analisisDeDias, extrasInforme, fiscalesParaComparar } from "./actions";

/**
 * EL INFORME DEL CIERRE DEL DÍA, EN PDF O WORD — con la caja para ponerle nombre y las fechas de los fiscales.
 *
 * «Que me deje renombrar con toolbox el nombre del informe, que siempre será en mayúscula; tú siempre se lo
 *  darás, pero por si algo que se pueda renombrar.» El nombre viene puesto; si se cambia, se escribe en
 *  mayúscula sola.
 *
 * «Una página nueva que compare con los dos últimos inventarios fiscales (con botón Cambiar fechas).» Por
 * defecto salen los 2 fiscales más recientes antes del día; «Cambiar fechas» abre dos listas para escoger
 * otros dos (fiscales, o cualquier otro día con análisis guardado).
 */
type Fiscal = { fecha: string; nombre: string; conAnalisis: boolean };

export function InformeCierre({ fecha, fechaLarga, ajustes, guardadoEn, guardadoPor, finalEn }: {
  fecha: string; fechaLarga: string; ajustes: FilaAjuste[];
  guardadoEn: string | null; guardadoPor: string | null; finalEn: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(NOMBRE_CIERRE);
  const [armando, setArmando] = useState<"pdf" | "word" | null>(null);
  const [aviso, setAviso] = useState<{ t: string; mal?: boolean } | null>(null);
  const caja = useRef<HTMLInputElement>(null);

  /* LOS FISCALES: se piden al abrir la ventana, no con la página. */
  const [fiscales, setFiscales] = useState<Fiscal[] | null>(null);
  const [otros, setOtros] = useState<string[]>([]);
  const [sel, setSel] = useState<[string, string]>(["", ""]);
  const [cambiando, setCambiando] = useState(false);

  useEffect(() => { if (abierto) setTimeout(() => caja.current?.select(), 30) }, [abierto]);
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !armando) setAbierto(false) };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [abierto, armando]);
  useEffect(() => {
    if (!abierto || fiscales) return;
    let vivo = true;
    fiscalesParaComparar(fecha).then((r) => {
      if (!vivo) return;
      if ("error" in r) { setFiscales([]); return }
      setFiscales(r.fiscales); setOtros(r.otros);
      setSel([r.fiscales[0]?.fecha ?? "", r.fiscales[1]?.fecha ?? ""]);
    }).catch(() => { if (vivo) setFiscales([]) });
    return () => { vivo = false };
  }, [abierto, fiscales, fecha]);

  const porDefecto: [string, string] = [fiscales?.[0]?.fecha ?? "", fiscales?.[1]?.fecha ?? ""];
  const esDefecto = sel[0] === porDefecto[0] && sel[1] === porDefecto[1];
  const fiscalDe = (d: string) => fiscales?.find((f) => f.fecha === d);
  const conAnalisis = (d: string) => fiscalDe(d)?.conAnalisis ?? otros.includes(d);
  const rotulo = (d: string) => `${fiscalDe(d) ? "Fiscal" : "Día"} ${fechaFiscal(d)}`;

  /* Las dos listas: primero los fiscales, después los demás días guardados. La otra fecha escogida no se
     ofrece: comparar un día consigo mismo no dice nada. */
  const opciones = (otra: string): OpcionSel[] => [
    ...(fiscales ?? []).filter((f) => f.fecha !== otra).map((f) => ({
      valor: f.fecha, codigo: "FISCAL",
      etiqueta: `${fechaFiscal(f.fecha)} · ${f.nombre}${f.conAnalisis ? "" : " (sin análisis guardado)"}`,
    })),
    ...otros.filter((d) => d !== otra).map((d) => ({ valor: d, codigo: "DÍA", etiqueta: `${fechaFiscal(d)} · día con análisis guardado` })),
  ];

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
      const ahora = new Date();
      const generado = ahora.toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" });
      const hoyLargo = ahora.toLocaleDateString("es-CO", { dateStyle: "long", timeZone: "America/Bogota" });
      /* Valor $, recurrencia, contra el día anterior y los fiscales: si no llegan, el informe sale sin esas partes. */
      const fechas = sel.filter(Boolean);
      const [ex, dias] = await Promise.all([
        extrasInforme(fecha).catch(() => null),
        fechas.length ? analisisDeDias(fechas).catch(() => null) : Promise.resolve(null),
      ]);
      const extras = ex && !("error" in ex) ? ex : undefined;
      const comp: ComparacionFiscal | null = dias && dias.length ? {
        porDefecto: esDefecto,
        fiscales: dias.map((d) => ({ fecha: d.fecha, nombre: fiscalDe(d.fecha)?.nombre ?? "", filas: d.filas, esFiscal: !!fiscalDe(d.fecha) })),
      } : null;
      const bloques = construirCierre(ajustes, { fecha, nombre: titulo, fechaLarga, generado, quien, guardadoEn, guardadoPor, finalEn }, extras, comp);
      const comoDataUrl = async (url: string) => {
        try {
          const r = await fetch(url); if (!r.ok) return null;
          const b = await r.blob();
          return await new Promise<string | null>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(null); f.readAsDataURL(b) });
        } catch { return null }
      };
      const [logo, sello] = await Promise.all([comoDataUrl("/marca/logo-bavaria.png"), comoDataUrl("/marca/logo-b.png")]);
      const pie = `Periodo: ${fechaLarga} · Análisis de diferencia`;
      if (formato === "pdf") {
        const [{ jsPDF }, { dibujarCierre }] = await Promise.all([import("jspdf"), import("@/modulos/inventario/cierre-pdf")]);
        const doc = dibujarCierre(jsPDF, bloques, {
          pie, fechaPortada: hoyLargo, fechaHojas: fechaLarga, ojoPortada: OJO_PORTADA, ojo: OJO_CIERRE,
          logo: logo ?? undefined, sello: sello ?? undefined,
        });
        doc.save(archivoCierre(titulo, fecha, "pdf"));
      } else {
        const { armarWordCierre, aclararImagen } = await import("@/modulos/inventario/cierre-word");
        const agua = sello ? await aclararImagen(sello, 0.07) : null;
        const bytes = armarWordCierre(bloques, { pie, fechaHojas: fechaLarga, ojo: OJO_CIERRE, titulo: `${titulo} · ${fechaLarga}`, logo: logo ?? undefined, sello: agua ?? undefined });
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

  const escogidas = sel.filter(Boolean);
  const hayConQue = (fiscales?.length ?? 0) + otros.length > 0;

  return (
    <div className="ad-inf">
      <button type="button" className="ad-bt" onClick={() => { setAviso(null); setCambiando(false); setAbierto(true) }} disabled={!ajustes.length}>Informe PDF · Word</button>
      {abierto && (
        <div className="ad-modal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !armando) setAbierto(false) }}>
          <div className="ad-modal-caja" role="dialog" aria-modal="true" aria-labelledby="ad-inf-t">
            <p className="ad-modal-ojo">INFORME DEL CIERRE · TAMAÑO CARTA</p>
            <h3 id="ad-inf-t">{fechaLarga}</h3>
            <p className="ad-modal-sub">Resumen en dos columnas, por familia, diferencias más grandes, compensaciones, ajustes en SAP, comparación con los inventarios fiscales, hechos y pendientes, valor en pesos, recurrencia y anexo de observaciones.</p>
            <label className="ad-modal-campo">
              <span>Nombre del informe</span>
              <input ref={caja} value={nombre} maxLength={120} spellCheck={false}
                     onChange={(e) => setNombre(e.target.value.toUpperCase())}
                     onKeyDown={(e) => { if (e.key === "Enter" && !armando && fiscales != null) void generar("pdf") }} />
              <small>Siempre en mayúscula. {nombre !== NOMBRE_CIERRE && <button type="button" className="ad-modal-link" onClick={() => setNombre(NOMBRE_CIERRE)}>Volver al nombre de siempre</button>}</small>
            </label>

            {/* LA PÁGINA DE LOS FISCALES: con qué dos días se compara, y el botón para cambiarlos. */}
            <div className="ad-modal-campo ad-fis">
              <span>Comparar con</span>
              {fiscales == null ? <small>Buscando los inventarios fiscales…</small>
                : !hayConQue ? <small>No hay inventarios fiscales ni días guardados antes de este día: el informe sale sin esa página.</small>
                : (
                  <>
                    <div className="ad-fis-fila">
                      {escogidas.length ? escogidas.map((d) => (
                        <b key={d} className={"ad-fis-chip" + (conAnalisis(d) ? "" : " sin")}>{rotulo(d)}{conAnalisis(d) ? "" : " · sin análisis"}</b>
                      )) : <small>Ninguna fecha escogida: el informe sale sin esa página.</small>}
                      <button type="button" className="ad-bt alt ad-fis-bt" aria-expanded={cambiando} onClick={() => setCambiando((v) => !v)}>
                        {cambiando ? "Listo" : "Cambiar fechas"}
                      </button>
                    </div>
                    {cambiando && (
                      <div className="ad-fis-sel">
                        <label><em>Fecha 1</em>
                          <Selector valor={sel[0]} onCambiar={(v) => setSel([v, sel[1]])} opciones={opciones(sel[1])} vacio="Escoge una fecha…" ariaLabel="Primera fecha a comparar" />
                        </label>
                        <label><em>Fecha 2</em>
                          <Selector valor={sel[1]} onCambiar={(v) => setSel([sel[0], v])} opciones={opciones(sel[0])} vacio="Escoge una fecha…" ariaLabel="Segunda fecha a comparar" />
                        </label>
                      </div>
                    )}
                    <small>
                      {esDefecto ? "Por defecto: los 2 fiscales más recientes antes de este día." : "Fechas escogidas a mano."}
                      {!esDefecto && porDefecto[0] && <button type="button" className="ad-modal-link" onClick={() => setSel(porDefecto)}>Volver a los 2 más recientes</button>}
                    </small>
                  </>
                )}
            </div>

            {aviso && <p className={"ad-msg" + (aviso.mal ? " mal" : " bien")} role="status">{aviso.t}</p>}
            <div className="ad-modal-acc">
              <button type="button" className="ad-bt alt" disabled={!!armando} onClick={() => setAbierto(false)}>Cerrar</button>
              <button type="button" className="ad-bt alt" disabled={!!armando || fiscales == null} onClick={() => void generar("word")}>{armando === "word" ? "Armando…" : "Word"}</button>
              <button type="button" className="ad-bt" disabled={!!armando || fiscales == null} onClick={() => void generar("pdf")}>{armando === "pdf" ? "Armando…" : "PDF"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
