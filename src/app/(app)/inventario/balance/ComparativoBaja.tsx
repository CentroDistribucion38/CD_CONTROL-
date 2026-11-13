"use client";

/**
 * EL COMPARATIVO DE LO PENDIENTE POR DARLE DE BAJA — la ventana que abre el icono al lado de «Exportar pendiente de baja».
 *
 * Los días de conteo, del más viejo al de pantalla: el total de cada día arriba (cuánto subió o bajó contra el anterior)
 * y la tabla por descripción (SORTING, PRESORTING, ROTURA DE LÍNEA) y por SKU, con una columna por día y la diferencia
 * contra el día anterior. Copiar tabla (se pega en Excel o en el correo como tabla) e Imagen (copiar, compartir, descargar).
 *
 * Cada día se pide aparte (`pendienteBajaDia`) y se guarda: cambiar de 5 a 7 días solo lee los dos que faltan.
 * El día de pantalla se cruza con el casco que está escogido; los anteriores, con el último casco hasta ese día.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { pendienteBajaDia } from "./actions";
import { armarComparativo, diaCorto, diaSemana, flecha, textoComparativo, unidades, type DiaPendiente } from "@/modulos/inventario/baja-comparativo";
import { logoMarca, useFotoCompartir } from "@/components/FotoCompartir";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import "./comparativo-baja.css";

const CUANTOS = [3, 5, 7] as const;

export function ComparativoBaja({ fecha, fechaCasco, dias, cerrar }: {
  fecha: string; fechaCasco: string | null;
  /** Los días con conteo enviado, del más nuevo al más viejo (como los trae el Balance). */
  dias: string[];
  cerrar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [cuantos, setCuantos] = useState<number>(5);
  const [leidos, setLeidos] = useState<Record<string, DiaPendiente>>({});
  const [aviso, setAviso] = useState<string | null>(null);

  /* Los días que van: el de pantalla y los anteriores con conteo, del más viejo al más nuevo. */
  const fechas = useMemo(() => {
    const orden = [...new Set(dias)].sort().reverse();
    const i = Math.max(0, orden.indexOf(fecha));
    return orden.slice(i, i + cuantos).reverse();
  }, [dias, fecha, cuantos]);

  useEffect(() => {
    let vivo = true;
    for (const f of fechas) {
      if (leidos[f]) continue;
      pendienteBajaDia(f, f === fecha ? fechaCasco : null)
        .then((r) => { if (vivo) setLeidos((x) => ({ ...x, [f]: r })) })
        .catch(() => { if (vivo) setLeidos((x) => ({ ...x, [f]: { fecha: f, filas: [], error: "No se pudo leer ese día" } })) });
    }
    return () => { vivo = false };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechas.join(",")]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".fc")) cerrar() };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [cerrar]);

  const faltan = fechas.filter((f) => !leidos[f]).length;
  const listos = fechas.map((f) => leidos[f] ?? { fecha: f, filas: [], error: "leyendo" });
  const comp = useMemo(() => armarComparativo(listos), [listos.map((d) => `${d.fecha}:${d.error ?? ""}:${d.filas.length}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = comp.fechas.length;
  const errores = listos.filter((d) => d.error && d.error !== "leyendo");

  const dicho = (t: string) => { setAviso(t); window.setTimeout(() => setAviso(null), 3500) };

  async function copiarTabla() {
    const tsv = textoComparativo(comp);
    const html = "<table border=\"1\" cellspacing=\"0\" cellpadding=\"4\" style=\"border-collapse:collapse;font-family:Calibri,Arial;font-size:11pt\">" +
      tsv.split("\n").map((l, i) => "<tr>" + l.split("\t").map((c) => {
        const t = c.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        return i === 0 ? `<th style="background:#111;color:#fff">${t}</th>` : /^(Total|TOTAL)/.test(l) ? `<td style="background:#FFF3C4;font-weight:bold">${t}</td>` : `<td>${t}</td>`;
      }).join("") + "</tr>").join("") + "</table>";
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([tsv], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
      dicho("Tabla copiada. Pégala en Excel o en el correo (Ctrl + V).");
    } catch {
      try { await navigator.clipboard.writeText(tsv); dicho("Tabla copiada. Pégala en Excel (Ctrl + V).") }
      catch { dicho("Este navegador no dejó copiar. Usa «Imagen» → Descargar.") }
    }
  }

  const foto = useFotoCompartir(async () => {
    const [{ dibujarComparativo, nombreComparativo }, logo] = await Promise.all([import("@/modulos/inventario/baja-comparativo"), logoMarca()]);
    return { lienzo: dibujarComparativo(comp, { paleta: leerPaleta(caja.current), logo }), nombre: nombreComparativo(comp.fechas[0] ?? fecha, comp.fechas[n - 1] ?? fecha) };
  }, "Pendiente de baja", { dashboard: "Comparativo por día" }, undefined, ["dashboard"]);

  const clase = (d: number | null) => (d == null || d === 0 ? "" : d > 0 ? " sube" : " baja");

  return (
    <div className="cpb-velo" role="dialog" aria-modal="true" aria-label="Pendiente de baja, comparativo por día" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <div className="cpb" ref={caja}>
        {/* LA BARRA DE SIEMPRE: banda negra con el sello, el título y la X (como las ventanas de la app). */}
        <header className="cpb-cab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cpb-logo" src="/marca/logo-b.png" alt="Bavaria" /><span className="cpb-sep" aria-hidden />
          <div className="cpb-tit">
            <p className="cpb-ojo">PENDIENTE DE BAJA · COMPARATIVO</p>
            <h2>Unidades pendientes, día por día</h2>
          </div>
          <button type="button" className="cpb-x" onClick={cerrar} aria-label="Cerrar" title="Cerrar (Esc)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="cpb-acc">
          <div className="cpb-seg" role="radiogroup" aria-label="Cuántos días">
            {CUANTOS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={cuantos === k} className={cuantos === k ? "on" : ""} onClick={() => setCuantos(k)}>{k} días</button>
            ))}
          </div>
          <button type="button" className="cpb-bt" onClick={copiarTabla} disabled={faltan > 0}>
            <svg viewBox="0 0 24 24" aria-hidden><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></svg>Copiar tabla
          </button>
          <button type="button" className="cpb-bt osc" onClick={() => foto.abrir("dashboard")} disabled={faltan > 0 || foto.armando != null}>
            <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="5" width="18" height="14" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-8 8" /></svg>
            {foto.armando ? "Armando…" : "Imagen"}
          </button>
        </div>
        {aviso && <p className="cpb-aviso" role="status">{aviso}</p>}

        {errores.length > 0 && <p className="cpb-error">{errores.map((d) => `${diaCorto(d.fecha)}: ${d.error}`).join(" · ")}</p>}

        {/* ---------- LA TABLA: por descripción y SKU ---------- */}
        <div className="cpb-rueda">
          <table className="cpb-tabla">
            <thead>
              <tr>
                <th className="sku">SKU · material</th>
                {comp.fechas.map((d, i) => <th key={d} className={"n" + (i === n - 1 ? " hoy" : "")}>{diaSemana(d)}<br />{diaCorto(d)}</th>)}
                {n >= 2 && <th className="n dl">vs día<br />anterior</th>}
              </tr>
            </thead>
            <tbody>
              {comp.grupos.map((g) => (
                <Fragment key={g.desc}>
                  <tr className="cpb-grupo">
                    <td colSpan={n + 1 + (n >= 2 ? 1 : 0)}><b>{g.titulo}</b><span>{g.sub}</span><em>{g.filas.length} SKU</em></td>
                  </tr>
                  {g.filas.length === 0 && <tr className="cpb-nada"><td colSpan={n + 1 + (n >= 2 ? 1 : 0)}>{faltan ? "Leyendo…" : "Nada pendiente en estos días"}</td></tr>}
                  {g.filas.map((f) => (
                    <tr key={f.codigo}>
                      <td className="sku"><b>{f.codigo}</b><span>{f.material}</span></td>
                      {f.valores.map((v, i) => <td key={i} className={"n" + (i === n - 1 ? " hoy" : "") + (v === 0 ? " cero" : "")}>{leidos[comp.fechas[i]] ? unidades(v) : "…"}</td>)}
                      {n >= 2 && <td className={"n dl" + clase(f.delta)}>{flecha(f.delta)}</td>}
                    </tr>
                  ))}
                  {g.filas.length > 0 && (
                    <tr className="cpb-sub">
                      <td className="sku">Total {g.titulo.toLowerCase()}</td>
                      {g.totales.map((v, i) => <td key={i} className={"n" + (i === n - 1 ? " hoy" : "")}>{unidades(v)}</td>)}
                      {n >= 2 && <td className={"n dl" + clase(g.delta)}>{flecha(g.delta)}</td>}
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="sku">TOTAL PENDIENTE DE BAJA</td>
                {comp.totales.map((v, i) => <td key={i} className={"n" + (i === n - 1 ? " hoy" : "")}>{unidades(v)}</td>)}
                {n >= 2 && <td className={"n dl" + clase(comp.delta)}>{flecha(comp.delta)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="cpb-pie">
          Cada día es lo mismo que «Exportar pendiente de baja» de ese día: SORTING (Fábrica) y PRESORTING (Bodega 38) = Dif cajas × factor caja cuando el
          físico pasa del casco, más la rotura de línea del pasivo. ▲ subió (hay más pendiente), ▼ bajó.
        </p>
      </div>
      {foto.vista}
    </div>
  );
}
