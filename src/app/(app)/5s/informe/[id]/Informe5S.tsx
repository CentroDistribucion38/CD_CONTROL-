"use client";

/**
 * 5S · INFORME DE AUDITORÍA EN HOJA CARTA — el formato de calidad (opción C) con el bloque de resultado de la
 * opción A: el porcentaje grande con su resumen y las barras de cada S contra la meta.
 *
 * «La inspección, en el historial o cuando la hago, me debe generar el PDF como resultado.» Por eso:
 *   · al guardar una inspección se entra aquí con ?pdf=1 y el PDF se descarga solo;
 *   · desde el Historial, cada inspección tiene su «Informe PDF».
 * El PDF se dibuja con jsPDF (pdf-5s.ts) con el mismo formato que la pantalla: vectorial, nítido y liviano.
 * También se puede imprimir.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LAS_S, fechaLarga, pct, semanaIso, type ClaveS } from "@/modulos/cinco-s/cinco-s";
import { armarHojas, nombreS, type Bloque, type DatosInforme } from "@/modulos/cinco-s/informe";

const CODIGO = "CD38-5S-F01", VERSION = "01";
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fecha = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const RES = { cumple: "C", no_cumple: "NC", na: "N/A" } as const;

export function Informe5S({ datos, descargar }: { datos: DatosInforme; descargar: boolean }) {
  const { insp, items, fotos } = datos;
  const hojas = armarHojas(datos);
  const ref = useRef<HTMLDivElement>(null);
  const [haciendo, setHaciendo] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const generado = useRef(new Date()).current;
  const gen = `${generado.toLocaleDateString("es-CO")} ${generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
  /* «Que se descargue con el nombre de la inspección junto con la fecha y la hora»: la hora es la de cuando se
     guardó (en Colombia). Sin «:» ni «/», que Windows no los deja en un nombre de archivo. */
  const hora = new Date(insp.creado).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "-");
  /* Sin tildes: hay navegadores que con una tilde en el nombre bajan el archivo como «download». */
  const nombreArchivo = `Inspeccion 5S - ${insp.area} - ${fecha(insp.fecha).replace(/\//g, "-")} ${hora}.pdf`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\\/:*?"<>|]/g, "-");

  const bajo = insp.cumplimiento < insp.meta;
  const evaluados = items.filter((i) => i.resultado !== "na").length;
  const na = items.length - evaluados;
  const nc = items.filter((i) => i.resultado === "no_cumple");
  const altas = nc.filter((i) => i.severidad === "alta").length;
  const difMeta = insp.cumplimiento - insp.meta;
  const cuentaS = (s: ClaveS, r: string) => items.filter((i) => i.s === s && i.resultado === r).length;

  async function pdf() {
    setHaciendo(true); setMal(null);
    try {
      /* Dibujado de verdad (vectorial), no una foto de la pantalla: letras nítidas a cualquier zoom y nada montado. */
      const [{ jsPDF }, { pdfInforme5S }] = await Promise.all([import("jspdf"), import("@/modulos/cinco-s/pdf-5s")]);
      const doc = await pdfInforme5S(jsPDF, datos, generado);
      /* Se baja con un enlace propio (no doc.save): así el archivo conserva su nombre en todos los navegadores. */
      const url = URL.createObjectURL(doc.output("blob"));
      const enlace = document.createElement("a");
      enlace.href = url; enlace.download = nombreArchivo; document.body.appendChild(enlace); enlace.click(); enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setMal("No se pudo armar el PDF: " + (e instanceof Error ? e.message : String(e)) + ". Prueba con Imprimir → Guardar como PDF.");
    }
    setHaciendo(false);
  }

  /* La X (y Esc) cierra el informe y vuelve al Historial. */
  const router = useRouter();
  const cerrar = () => router.push("/5s/historial");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ?pdf=1 (recién guardada): el PDF sale solo, una vez. */
  const yaBajo = useRef(false);
  useEffect(() => {
    if (!descargar || yaBajo.current) return;
    yaBajo.current = true;
    const t = setTimeout(pdf, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descargar]);

  const encabezado = (n: number) => (
    <table className="i5-enc"><tbody><tr>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <td className="logo"><img src="/marca/logo-bavaria.png" alt="Bavaria" /></td>
      <td className="tt"><b>INFORME DE AUDITORÍA 5S</b><span>Sistema de gestión · Orden y aseo · CD38</span></td>
      <td className="cod"><b>Código:</b> {CODIGO}<br /><b>Versión:</b> {VERSION}<br /><b>Fecha:</b> {fecha(insp.fecha)}<br /><b>Página:</b> {n} de {hojas.length}</td>
    </tr></tbody></table>
  );

  const pintar = (b: Bloque, k: number) => {
    switch (b.k) {
      case "titulo": return <h2 key={k} className="i5-h2">{b.n}. {b.t}</h2>;
      case "datos": return (
        <table key={k} className="i5-dat"><tbody>
          <tr><td className="l">Área auditada</td><td><b>{insp.area}</b></td><td className="l">Fecha / semana</td><td>{fecha(insp.fecha)} · S{semanaIso(insp.fecha)}</td></tr>
          <tr><td className="l">Responsable del área</td><td>{insp.responsable ?? "Sin asignar"}{datos.cargo ? ` · ${datos.cargo}` : ""}</td><td className="l">Auditor</td><td>{insp.auditor_nombre ?? "—"}</td></tr>
          <tr><td className="l">Meta del área</td><td>{pct(insp.meta)}</td><td className="l">Inspección N.º</td><td>{datos.numero}</td></tr>
        </tbody></table>
      );
      case "resultado": return (
        <div key={k} className="i5-res">
          <div className={"score" + (bajo ? " bajo" : "")}>
            <small>CUMPLIMIENTO</small>
            <b>{nf1.format(insp.cumplimiento)} %</b>
            <span>{bajo ? "Bajo" : "Cumple"} la meta de {pct(insp.meta)}</span>
            <em>{nf1.format(Math.abs(difMeta))} puntos {difMeta < 0 ? "por debajo" : "por encima"} de la meta<br />{datos.anterior != null ? `Inspección anterior: ${nf1.format(datos.anterior)} %` : "Primera inspección del área"}</em>
          </div>
          <table className="resumen"><tbody>
            <tr><td>Responsable del área</td><td>{insp.responsable ?? "Sin asignar"}{datos.cargo ? ` · ${datos.cargo}` : ""}</td></tr>
            <tr><td>Auditor</td><td>{insp.auditor_nombre ?? "—"}</td></tr>
            <tr><td>Puntos evaluados</td><td>{evaluados} de {items.length}{na ? ` (${na} N/A)` : ""}</td></tr>
            <tr><td>No cumple</td><td>{nc.length}{altas ? ` · ${altas === 1 ? "uno" : altas} de severidad alta` : ""}</td></tr>
            <tr><td>Evidencia fotográfica</td><td>{fotos.length} {fotos.length === 1 ? "foto" : "fotos"}</td></tr>
          </tbody></table>
        </div>
      );
      case "porS": return (
        <table key={k} className="i5-s"><thead><tr><th colSpan={2}>CUMPLIMIENTO POR S</th><th className="bar">META {pct(insp.meta)}</th><th>C</th><th>NC</th><th>N/A</th><th className="p">%</th></tr></thead>
          <tbody>
            {LAS_S.map((s) => {
              const v = insp.por_s[s.clave];
              if (v === undefined) return null;
              const b2 = v != null && v < insp.meta;
              return (
                <tr key={s.clave}>
                  <td className="n">{s.n}S</td><td className="nom">{s.nombre}<i>{s.jp}</i></td>
                  <td className="bar"><div className="barra"><i className={b2 ? "bajo" : ""} style={{ width: `${v ?? 0}%` }} /><em style={{ left: `${insp.meta}%` }} /></div></td>
                  <td>{cuentaS(s.clave, "cumple")}</td><td className={cuentaS(s.clave, "no_cumple") ? "nc" : ""}>{cuentaS(s.clave, "no_cumple")}</td><td>{cuentaS(s.clave, "na")}</td>
                  <td className={"p" + (b2 ? " bajo" : "")}>{v == null ? "—" : `${nf1.format(v)} %`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
      case "matriz": return (
        <table key={k} className="i5-mat">
          <thead><tr><th className="c">#</th><th className="req">REQUISITO</th><th className="c">C</th><th className="c">NC</th><th className="c">N/A</th><th className="sev">SEV.</th><th className="obs">OBSERVACIÓN</th></tr></thead>
          <tbody>
            {b.filas.map((f, j) => "grupo" in f ? (
              <tr key={j} className="grupo"><td colSpan={7}>{nombreS(f.grupo)?.n}S · {nombreS(f.grupo)?.nombre.toUpperCase()} ({nombreS(f.grupo)?.jp.toUpperCase()})</td></tr>
            ) : (
              <tr key={j}>
                <td className="c">{f.n}</td><td>{f.item.pregunta}</td>
                {(["cumple", "no_cumple", "na"] as const).map((r) => <td key={r} className={"x" + (r === "no_cumple" ? " no" : "")}>{f.item.resultado === r ? "X" : ""}</td>)}
                <td className="sev">{f.item.severidad ? f.item.severidad[0].toUpperCase() + f.item.severidad.slice(1) : ""}</td>
                <td>{[f.item.zona, f.item.observacion].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
      case "hallazgos": return b.filas.length === 0 ? (
        <p key={k} className="i5-caja">Sin hallazgos: todo lo evaluado cumple.</p>
      ) : (
        <table key={k} className="i5-acc">
          <thead><tr><th className="c">#</th><th>HALLAZGO</th><th className="sev">SEV.</th><th className="ac">ACCIÓN CORRECTIVA</th><th className="rs">RESPONSABLE</th><th className="fe">FECHA</th></tr></thead>
          <tbody>
            {b.filas.map((f) => (
              <tr key={f.item.id}>
                <td className="c">{f.n}</td>
                <td><b>{nombreS(f.item.s)?.n}S{f.item.zona ? ` · ${f.item.zona}` : ""}.</b> {f.item.observacion}</td>
                <td className="sev">{f.item.severidad ? f.item.severidad[0].toUpperCase() + f.item.severidad.slice(1) : ""}</td>
                <td /><td /><td />
              </tr>
            ))}
          </tbody>
        </table>
      );
      case "fotos": return b.fotos.length === 0 ? (
        <p key={k} className="i5-caja">Sin fotos en esta inspección.</p>
      ) : (
        <div key={k} className="i5-reg">
          {b.fotos.map((f) => (
            <figure key={f.i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`Foto ${f.i}`} crossOrigin="anonymous" />
              <figcaption><b>Foto {f.i} · Punto {f.n} ({RES[f.item.resultado]}{f.item.severidad ? `, ${f.item.severidad}` : ""}).</b> {f.item.observacion ?? f.item.pregunta}</figcaption>
            </figure>
          ))}
        </div>
      );
      case "obs": return <p key={k} className="i5-caja">{insp.nota || "Sin observaciones."}</p>;
      case "firmas": return (
        /* LAS DOS FIRMAS: el supervisor del operador logístico (el responsable del área) y el Warehouse Supervisor de ABI. */
        <div key={k} className="i5-fir dos">
          <div><b>{insp.responsable ?? "\u00a0"}</b>Supervisor OL</div>
          <div><b>&nbsp;</b>Warehouse Supervisor ABI</div>
        </div>
      );
    }
  };

  return (
    <div className="i5">
      <div className="i5-barra">
        <div>
          <p className="s5-ojo">5S · INFORME DE AUDITORÍA</p>
          <h1>{insp.area} · {fechaLarga(insp.fecha)}</h1>
          <p className="s5-sub">{datos.numero} · se descarga como «{nombreArchivo}»{haciendo ? " · armando el PDF…" : ""}</p>
        </div>
        <div className="s5-acc">
          <Link href="/5s" className="s5-bt">Nueva inspección</Link>
          <button type="button" className="s5-bt" onClick={() => window.print()}>Imprimir</button>
          <button type="button" className="s5-bt osc" onClick={pdf} disabled={haciendo}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3v12M7 10l5 5 5-5M5 20h14" /></svg>
            {haciendo ? "Armando PDF…" : "Descargar PDF"}
          </button>
          <button type="button" className="i5-x" onClick={cerrar} aria-label="Cerrar y volver al Historial" title="Cerrar (Esc)">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>
      {mal && <p className="s5-aviso mal" role="alert">{mal}</p>}

      <div ref={ref} className="i5-hojas">
        {hojas.map((h, n) => (
          <section key={n} className="i5-hoja" aria-label={`Hoja ${n + 1}`}>
            {encabezado(n + 1)}
            <div className="i5-cuerpo">{h.map(pintar)}</div>
            <footer className="i5-pie"><span>Documento generado por CONTROL · {gen}</span><span>{CODIGO} · v{VERSION}</span></footer>
          </section>
        ))}
      </div>
    </div>
  );
}
