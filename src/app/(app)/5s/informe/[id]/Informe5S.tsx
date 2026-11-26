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
 *
 * EL VISOR (opción B): a la izquierda un panel con el resultado, las barras por S, QUIÉN FIRMA (se escoge de los
 * responsables 5S y se guarda solo) y los botones; a la derecha las hojas, con paginación y zoom flotantes.
 */

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FORMATO_5S, fechaLarga, pct, semanaIso, type ClaveS, type Responsable5S } from "@/modulos/cinco-s/cinco-s";
import { armarHojas, es5S, seccionDe, siglaDe, tituloSeccion, type Bloque, type DatosInforme } from "@/modulos/cinco-s/informe";

const VERSION = "01";
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fecha = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const RES = { cumple: "C", no_cumple: "NC", na: "N/A" } as const;
const RECORDAR_OL = "s5-firma-ol";
const cap = (s: string | null | undefined) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const corta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

export function Informe5S({ datos, descargar, responsables = [], areaResp = null, puedeFirmar = false, olPrevios = [] }: {
  datos: DatosInforme; descargar: boolean; responsables?: Responsable5S[]; areaResp?: string | null; puedeFirmar?: boolean;
  olPrevios?: string[];
}) {
  const { items, fotos } = datos;
  /* LAS FIRMAS: la de Warehouse Supervisor ABI es el responsable del área (se escoge de la lista y arranca en él);
     la de Supervisor OL se ESCRIBE (es del operador logístico, no está en el maestro). */
  type Firmas = { ol: string; abi: string };
  const [firmas, setFirmas] = useState<Firmas>({ ol: datos.insp.firma_ol ?? "", abi: datos.insp.firma_abi_id ?? areaResp ?? "" });
  const guardadas = useRef<Firmas>({ ol: datos.insp.firma_ol ?? "", abi: datos.insp.firma_abi_id ?? "" });
  const [firmando, setFirmando] = useState(false);
  const nombreDe = (id: string) => responsables.find((x) => x.id === id)?.nombre ?? null;
  const nombres = (f: Firmas) => ({
    ol: f.ol.trim() || null,
    abi: (f.abi ? nombreDe(f.abi) : null) ?? (f.abi && f.abi === datos.insp.firma_abi_id ? datos.insp.firma_abi ?? null : null),
  });
  const { ol: nomOl, abi: nomAbi } = nombres(firmas);
  const insp = { ...datos.insp, firma_ol: nomOl, firma_abi: nomAbi };
  const conFirmas = { ...datos, insp };
  const hojas = armarHojas(conFirmas);
  const ref = useRef<HTMLDivElement>(null);
  const [haciendo, setHaciendo] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const generado = useRef(new Date()).current;
  const gen = `${generado.toLocaleDateString("es-CO")} ${generado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
  /* «Que se descargue con el nombre de la inspección junto con la fecha y la hora»: la hora es la de cuando se
     guardó (en Colombia). Sin «:» ni «/», que Windows no los deja en un nombre de archivo. */
  const hora = new Date(insp.creado).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "-");
  /* Sin tildes: hay navegadores que con una tilde en el nombre bajan el archivo como «download». */
  /* El formato manda: «Inspeccion PTL - T1 - …», código «CD38-PTL-F01». */
  const secs = (datos.formato ?? FORMATO_5S).secciones;
  const sigla = siglaDe(datos), CODIGO = `CD38-${sigla.toUpperCase()}-F01`;
  const nombreArchivo = `Inspeccion ${sigla} - ${insp.area} - ${fecha(insp.fecha).replace(/\//g, "-")} ${hora}.pdf`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\\/:*?"<>|]/g, "-");

  const bajo = insp.cumplimiento < insp.meta;
  const evaluados = items.filter((i) => i.resultado !== "na").length;
  const na = items.length - evaluados;
  const nc = items.filter((i) => i.resultado === "no_cumple");
  const altas = nc.filter((i) => i.severidad === "alta").length;
  const nAntes = fotos.filter((f) => f.momento !== "despues").length;
  const difMeta = insp.cumplimiento - insp.meta;
  const cuentaS = (s: ClaveS, r: string) => items.filter((i) => i.s === s && i.resultado === r).length;

  /** Guarda las dos firmas si cambiaron. La de OL se recuerda en este equipo: casi siempre firma el mismo. */
  async function guardarFirmas(nuevas: Firmas) {
    setFirmas(nuevas);
    const limpias = { ol: nuevas.ol.trim(), abi: nuevas.abi };
    if (limpias.ol) { try { localStorage.setItem(RECORDAR_OL, limpias.ol) } catch { /* sin almacenamiento */ } }
    if (!puedeFirmar || (limpias.ol === guardadas.current.ol && limpias.abi === guardadas.current.abi)) return true;
    setFirmando(true);
    const { error } = await createClient().rpc("s5_firmas", { p_insp: datos.insp.id, p_ol: limpias.ol || null, p_abi: limpias.abi || null });
    setFirmando(false);
    if (error) {
      setMal(/s5_firmas|schema cache|function/i.test(error.message) ? "Falta correr 2026-11-cinco-s-4.sql en Supabase para guardar las firmas." : "No se guardó la firma: " + error.message);
      return false;
    }
    guardadas.current = limpias;
    return true;
  }

  async function pdf(f = firmas) {
    setHaciendo(true); setMal(null);
    try {
      await guardarFirmas(f);
      /* Dibujado de verdad (vectorial), no una foto de la pantalla: letras nítidas a cualquier zoom y nada montado. */
      const [{ jsPDF }, { pdfInforme5S }] = await Promise.all([import("jspdf"), import("@/modulos/cinco-s/pdf-5s")]);
      const n = nombres(f);
      const doc = await pdfInforme5S(jsPDF, { ...datos, insp: { ...datos.insp, firma_ol: n.ol, firma_abi: n.abi } }, generado);
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
    /* Esc mientras se escribe una firma no cierra el informe. */
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target as HTMLElement)?.closest?.("input, select, textarea")) cerrar() };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ?pdf=1 (recién guardada): el PDF sale solo, una vez. Antes se dejan puestas las firmas: ABI = el responsable del
     área y OL = el último nombre que se escribió en este equipo; se guardan y entonces sale el PDF. */
  const yaBajo = useRef(false);
  useEffect(() => {
    if (!descargar || yaBajo.current) return;
    yaBajo.current = true;
    const t = setTimeout(async () => {
      let f = firmas;
      if (!f.ol.trim()) {
        let ult = "";
        try { ult = localStorage.getItem(RECORDAR_OL) ?? "" } catch { /* sin almacenamiento */ }
        if (ult) f = { ...f, ol: ult };
      }
      await pdf(f);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descargar]);

  const encabezado = (n: number) => (
    <table className="i5-enc"><tbody><tr>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <td className="logo"><img src="/marca/logo-bavaria.png" alt="Bavaria" /></td>
      <td className="tt"><b>INFORME DE AUDITORÍA {sigla.toUpperCase()}</b><span>Sistema de gestión · {es5S(datos) ? "Orden y aseo" : (datos.formato?.nombre.split("·")[1] ?? "").trim() || "Evaluación"} · CD38</span></td>
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
            <tr><td>Evidencia fotográfica</td><td>{nAntes} {nAntes === 1 ? "foto" : "fotos"}</td></tr>
          </tbody></table>
        </div>
      );
      case "porS": return (
        <table key={k} className="i5-s"><thead><tr><th colSpan={2}>{es5S(datos) ? "CUMPLIMIENTO POR S" : "CUMPLIMIENTO POR SECCIÓN"}</th><th className="bar">META {pct(insp.meta)}</th><th>C</th><th>NC</th><th>N/A</th><th className="p">%</th></tr></thead>
          <tbody>
            {secs.map((s) => {
              const v = insp.por_s[s.clave];
              if (v === undefined) return null;
              const b2 = v != null && v < insp.meta;
              return (
                <tr key={s.clave}>
                  <td className="n">{s.corto}</td><td className="nom">{s.nombre}{s.jp && <i>{s.jp}</i>}</td>
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
              <tr key={j} className="grupo"><td colSpan={7}>{tituloSeccion(seccionDe(datos, f.grupo), f.grupo)}</td></tr>
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
                <td><b>{seccionDe(datos, f.item.s)?.corto ?? f.item.s}{f.item.zona ? ` · ${f.item.zona}` : ""}.</b> {f.item.observacion}</td>
                <td className="sev">{cap(f.item.severidad)}</td>
                <td>{f.item.cerrada_el ? <><b>Cerrado.</b> {f.item.cierre_nota}</> : f.item.accion ?? ""}</td>
                <td>{f.item.accion_resp ?? ""}</td>
                <td>{f.item.cerrada_el ? `Cerrado ${corta(f.item.cerrada_el.slice(0, 10))}` : f.item.accion_fecha ? fecha(f.item.accion_fecha) : ""}</td>
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
              <img src={f.url} alt={`Foto ${f.i}`} />
              {f.despues
                ? <figcaption><b>Foto {f.i} · Punto {f.n} · DESPUÉS (cierre).</b> {f.item.cierre_nota}</figcaption>
                : <figcaption><b>Foto {f.i} · Punto {f.n} ({RES[f.item.resultado]}{f.item.severidad ? `, ${f.item.severidad}` : ""}).</b> {f.item.observacion ?? f.item.pregunta}</figcaption>}
            </figure>
          ))}
        </div>
      );
      case "obs": return <p key={k} className="i5-caja">{insp.nota || "Sin observaciones."}</p>;
      case "firmas": return (
        /* LAS DOS FIRMAS: el supervisor del operador logístico (el responsable del área) y el Warehouse Supervisor de ABI. */
        <div key={k} className="i5-fir dos">
          <div><b>{insp.firma_ol || "\u00a0"}</b>Supervisor OL</div>
          <div><b>{insp.firma_abi || "\u00a0"}</b>Warehouse Supervisor ABI</div>
        </div>
      );
    }
  };

  /* ---------------- el visor: zoom, hoja actual y saltar de hoja ---------------- */
  const lienzo = useRef<HTMLDivElement>(null);
  const [ajuste, setAjuste] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null); // null = ajustar al ancho
  const [actual, setActual] = useState(1);
  const z = zoom ?? ajuste;
  useEffect(() => {
    const el = lienzo.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setAjuste(Math.max(0.3, Math.min(1, (e.contentRect.width - 40) / 816))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const hs = [...(ref.current?.querySelectorAll<HTMLElement>(".i5-hoja") ?? [])];
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (vis) setActual(hs.indexOf(vis.target as HTMLElement) + 1);
    }, { threshold: [0.25, 0.5, 0.75] });
    hs.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [hojas.length, z]);
  const ir = (n: number) => ref.current?.querySelectorAll<HTMLElement>(".i5-hoja")[n - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  const PASOS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];
  const zoomar = (d: 1 | -1) => {
    const i = PASOS.findIndex((p) => p >= z - 0.001);
    const sig = d > 0 ? PASOS.find((p) => p > z + 0.01) ?? PASOS[PASOS.length - 1] : [...PASOS].reverse().find((p) => p < z - 0.01) ?? PASOS[0];
    setZoom(i < 0 && d < 0 ? PASOS[PASOS.length - 1] : sig);
  };
  const activos = responsables.filter((x) => x.activo || x.id === firmas.abi);
  const planes = { cerrados: nc.filter((i) => i.cerrada_el).length, conPlan: nc.filter((i) => !i.cerrada_el && i.accion).length };

  return (
    <div className="i5">
      <aside className="i5-lado" aria-label="Resumen del informe">
        <div className="top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-bavaria.png" alt="Bavaria" />
          <button type="button" className="i5-x" onClick={cerrar} aria-label="Cerrar y volver al Historial" title="Cerrar (Esc)">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="sec">
          <p className="s5-ojo">{sigla.toUpperCase()} · INFORME · {datos.numero}</p>
          <h1>{insp.area}</h1>
          <p className="sub">{fechaLarga(insp.fecha)} · S{semanaIso(insp.fecha)} · Auditor: {insp.auditor_nombre ?? "—"}</p>
        </div>
        <div className="sec">
          <b className={"big" + (bajo ? " bajo" : "")}>{nf1.format(insp.cumplimiento)} %</b>
          <p className="meta">{bajo ? "Bajo" : "Cumple"} la meta de {pct(insp.meta)} · {nc.length} {nc.length === 1 ? "hallazgo" : "hallazgos"}</p>
          <ul className="porS">
            {secs.map((x) => {
              const v = insp.por_s[x.clave]; if (v === undefined) return null;
              const b2 = v != null && v < insp.meta;
              return (
                <li key={x.clave} title={`${x.corto} ${x.nombre}`}>
                  <b>{x.corto}</b><i><em className={b2 ? "bajo" : ""} style={{ width: `${v ?? 0}%` }} /><u style={{ left: `${insp.meta}%` }} /></i>
                  <span className={b2 ? "bajo" : ""}>{v == null ? "—" : pct(v)}</span>
                </li>
              );
            })}
          </ul>
          {nc.length > 0 && (
            <Link className="plan" href="/5s/plan">
              <span>Plan de acción</span>
              <b>{planes.cerrados} de {nc.length} {nc.length === 1 ? "cerrado" : "cerrados"}{planes.conPlan ? ` · ${planes.conPlan} en curso` : ""}</b>
            </Link>
          )}
        </div>
        <div className="sec firmas">
          <p className="s5-ojo tinta">Firmas del informe</p>
          <label className={"s5-campo" + (firmas.ol.trim() ? "" : " falta")}><span>Supervisor OL</span>
            <input value={firmas.ol} maxLength={80} list="s5-ol-previos" placeholder="Escribe el nombre…" autoComplete="off"
                   disabled={!puedeFirmar} onChange={(e) => setFirmas({ ...firmas, ol: e.target.value })}
                   onBlur={() => guardarFirmas(firmas)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }} />
            <datalist id="s5-ol-previos">{olPrevios.map((n) => <option key={n} value={n} />)}</datalist></label>
          <label className={"s5-campo" + (firmas.abi ? "" : " falta")}><span>Warehouse Supervisor ABI</span>
            <select value={firmas.abi} disabled={!puedeFirmar || firmando} onChange={(e) => guardarFirmas({ ...firmas, abi: e.target.value })}>
              <option value="">Escoger quién firma…</option>
              {activos.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.cargo ? ` · ${x.cargo}` : ""}{x.id === areaResp ? " (responsable del área)" : ""}</option>)}
            </select></label>
          <small>{puedeFirmar ? (firmando ? "Guardando…" : "Se guardan solas y salen en el PDF. ABI arranca en el responsable del área.") : "Solo quien inspecciona puede cambiar las firmas."}</small>
        </div>
        {mal && <p className="s5-aviso mal" role="alert">{mal}</p>}
        <div className="acc">
          <button type="button" className="s5-bt osc" onClick={() => pdf()} disabled={haciendo}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3v12M7 10l5 5 5-5M5 20h14" /></svg>
            {haciendo ? "Armando PDF…" : "Descargar PDF"}
          </button>
          <div className="dos">
            <button type="button" className="s5-bt" onClick={() => window.print()}>Imprimir</button>
            <Link href="/5s" className="s5-bt">Nueva inspección</Link>
          </div>
          <p className="archivo">Se descarga como «{nombreArchivo}»</p>
        </div>
      </aside>

      <div className="i5-lienzo" ref={lienzo}>
        <div ref={ref} className="i5-hojas">
          {hojas.map((h, n) => (
            <section key={n} className="i5-hoja" aria-label={`Hoja ${n + 1}`} style={{ zoom: z }}>
              {encabezado(n + 1)}
              <div className="i5-cuerpo">{h.map(pintar)}</div>
              <footer className="i5-pie"><span>Documento generado por CONTROL · {gen}</span><span>{CODIGO} · v{VERSION}</span></footer>
            </section>
          ))}
        </div>
        <nav className="i5-pag" aria-label="Hojas y zoom">
          <button type="button" aria-label="Hoja anterior" disabled={actual <= 1} onClick={() => ir(actual - 1)}>‹</button>
          <span>Hoja {actual} de {hojas.length}</span>
          <button type="button" aria-label="Hoja siguiente" disabled={actual >= hojas.length} onClick={() => ir(actual + 1)}>›</button>
          <button type="button" aria-label="Alejar" onClick={() => zoomar(-1)}>−</button>
          <button type="button" className="z" title="Ajustar al ancho" onClick={() => setZoom(zoom == null ? 1 : null)}>{Math.round(z * 100)} %</button>
          <button type="button" aria-label="Acercar" onClick={() => zoomar(1)}>+</button>
        </nav>
      </div>
    </div>
  );
}
