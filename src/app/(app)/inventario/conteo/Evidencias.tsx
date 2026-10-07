"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hoyCo, sumarDias } from "@/modulos/inventario/tiempos";
import {
  analizar, diaCorto, diaTxt, filtrarNovedades, letrasTipos, lecturas, TEND, TENDENCIAS, TIPO, TIPOS,
  type Cobertura, type Novedad, type TipoNovedad,
} from "@/modulos/inventario/evidencias";
import { armarGraficas } from "@/modulos/inventario/evidencias-graficas";
import { cargarFotos } from "@/modulos/inventario/evidencias-fotos";
import { construirInforme, detalleNovedad, periodoTxt, type Graficas } from "@/modulos/inventario/evidencias-informe";
import { leerPaleta } from "../informe";

/**
 * INVENTARIO · TABLERO · EVIDENCIAS
 *
 * «Generar informes en PDF y Word de las evidencias, con módulos claros, para ver las tendencias
 * por ubicación de cada día: ayer encontré novedad en esta ubicación, hoy ya no; hoy sí.»
 *
 * Novedad = avería, PNC (con su política de bloqueo), módulo mezclado, módulo sin acceso.
 * La pantalla muestra los mismos módulos que el informe; los botones bajan el PDF o el Word
 * con las mismas cuentas y las mismas gráficas.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });
type Rango = "hoy" | "ayer" | "7" | "30" | "otro";
const MAX_FOTOS = 24, MAX_ANEXO = 600, MAX_PANTALLA = 300;
const rgbHex = (c: [number, number, number]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function Evidencias() {
  const supabase = useMemo(() => createClient(), []);
  const raiz = useRef<HTMLElement>(null);
  const hoy = hoyCo();
  const [rango, setRango] = useState<Rango>("7");
  const [desde, setDesde] = useState(sumarDias(hoy, -6));
  const [hasta, setHasta] = useState(hoy);
  const [tipos, setTipos] = useState<TipoNovedad[]>(TIPOS.map((t) => t.k));
  const [novs, setNovs] = useState<Novedad[] | null>(null);
  const [cob, setCob] = useState<Cobertura[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [falta, setFalta] = useState(false);
  const [armando, setArmando] = useState<"pdf" | "word" | null>(null);
  const [avance, setAvance] = useState("");
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null);
  const [fotoAbierta, setFotoAbierta] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string | "cargando" | "mal">>({});
  const [imgs, setImgs] = useState<Graficas | null>(null);

  const escoger = (r: Rango) => {
    setRango(r);
    if (r === "hoy") { setDesde(hoy); setHasta(hoy) }
    if (r === "ayer") { const a = sumarDias(hoy, -1); setDesde(a); setHasta(a) }
    if (r === "7") { setDesde(sumarDias(hoy, -6)); setHasta(hoy) }
    if (r === "30") { setDesde(sumarDias(hoy, -29)); setHasta(hoy) }
  };
  const alternar = (k: TipoNovedad) =>
    setTipos((t) => (t.includes(k) ? (t.length > 1 ? t.filter((x) => x !== k) : t) : TIPOS.map((x) => x.k).filter((x) => x === k || t.includes(x))));

  const cargar = useCallback(async () => {
    setError(null); setNovs(null);
    const [e, c] = await Promise.all([
      supabase.rpc("conteo_evidencias", { p_desde: desde, p_hasta: hasta }),
      supabase.rpc("conteo_cobertura", { p_desde: desde, p_hasta: hasta }),
    ]);
    const err = e.error ?? c.error;
    if (err) {
      if (/does not exist|schema cache|Could not find/i.test(err.message)) setFalta(true); else setError(err.message);
      setNovs([]); setCob([]); return;
    }
    setFalta(false);
    setNovs((e.data ?? []) as Novedad[]);
    setCob((c.data ?? []) as Cobertura[]);
  }, [supabase, desde, hasta]);
  useEffect(() => { void cargar() }, [cargar]);

  const vistas = useMemo(() => filtrarNovedades(novs ?? [], desde, hasta, tipos), [novs, desde, hasta, tipos]);
  const an = useMemo(() => analizar(novs ?? [], cob, desde, hasta, tipos), [novs, cob, desde, hasta, tipos]);

  /* Las gráficas se dibujan en un lienzo: solo en el navegador, y las mismas van al informe. */
  useEffect(() => { setImgs(novs ? armarGraficas(an) : null) }, [an, novs]);

  const verFoto = async (ruta: string, clave: string) => {
    if (fotoAbierta === clave) { setFotoAbierta(null); return }
    setFotoAbierta(clave);
    if (urls[ruta] && urls[ruta] !== "mal") return;
    setUrls((u) => ({ ...u, [ruta]: "cargando" }));
    const { data, error: e } = await supabase.storage.from("inventario").createSignedUrl(ruta, 600);
    setUrls((u) => ({ ...u, [ruta]: e || !data ? "mal" : data.signedUrl }));
  };

  async function bajar(formato: "pdf" | "word") {
    if (armando || !novs) return;
    setArmando(formato); setAviso(null); setAvance("Preparando…");
    try {
      const fotos = await cargarFotos(supabase, vistas, MAX_FOTOS, (h, t) => setAvance(t ? `Bajando fotos ${h} de ${t}…` : "Armando…"));
      setAvance("Armando el informe…");
      const g = armarGraficas(an);
      let quien = "—";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { const { data: p } = await supabase.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle(); quien = p?.nombre || p?.usuario || user.email || "—" }
      } catch { /* sin nombre */ }
      const generado = new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" });
      const tiposTxt = tipos.length === TIPOS.length ? "avería, PNC, módulo mezclado y módulo sin acceso" : TIPOS.filter((t) => tipos.includes(t.k)).map((t) => t.nombre.toLowerCase()).join(", ");
      const bloques = construirInforme(an, vistas, { desde, hasta, tiposTxt, quien, generado, graficas: g, fotos, maxFotos: MAX_FOTOS, maxFilasAnexo: MAX_ANEXO });
      const comoDataUrl = async (url: string) => {
        try {
          const r = await fetch(url); if (!r.ok) return null;
          const b = await r.blob();
          return await new Promise<string | null>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(null); f.readAsDataURL(b) });
        } catch { return null }
      };
      const [palabra, sello] = await Promise.all([comoDataUrl("/marca/logo-bavaria.png"), comoDataUrl("/marca/logo-b.png")]);
      const paleta = leerPaleta(raiz.current);
      const periodo = periodoTxt(desde, hasta);
      const filtros = `Novedades: ${tiposTxt}`;
      if (formato === "pdf") {
        const [{ jsPDF }, { dibujarEvidencias, nombreEvidenciasPdf }] = await Promise.all([import("jspdf"), import("@/modulos/inventario/evidencias-pdf")]);
        const doc = dibujarEvidencias(jsPDF, bloques, { periodo, filtros, generado: `${generado} · ${quien}`, marca: { palabra: palabra ?? undefined, sello: sello ?? undefined }, paleta });
        doc.save(nombreEvidenciasPdf(desde, hasta));
      } else {
        const { armarWord, nombreEvidenciasWord } = await import("@/modulos/inventario/evidencias-word");
        const bytes = armarWord(bloques, { periodo, filtros, generado, tinta: rgbHex(paleta.tinta), acento: rgbHex(paleta.acento), logo: palabra ?? undefined });
        const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = nombreEvidenciasWord(desde, hasta);
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      const sinFoto = vistas.filter((n) => n.ruta).length > 0 && fotos.size === 0;
      setAviso({ txt: formato === "pdf" ? "PDF listo: quedó en tus descargas." : "Word listo: quedó en tus descargas.", ...(sinFoto ? { txt: "Informe listo, pero las fotos no se pudieron bajar. Revisa la señal y vuelve a generarlo.", mal: true } : {}) });
    } catch {
      setAviso({ txt: "No se pudo armar el informe. Recarga la página e intenta otra vez.", mal: true });
    } finally { setArmando(null); setAvance("") }
  }

  if (falta) {
    return <section className="sin-tablas"><h2>Falta preparar las evidencias en Supabase</h2><p>Abre el SQL Editor y ejecuta <code>supabase/migraciones/2026-10-conteo-evidencias.sql</code>. Después recarga esta pantalla.</p></section>;
  }

  const cargando = novs == null;
  const c = an.conteoTendencia;
  const pctCumple = an.pnc.respondidos ? Math.round((an.pnc.cumplen / an.pnc.respondidos) * 100) : null;
  const nDias = an.dias.length;
  const pnc = vistas.filter((n) => n.tipo === "pnc");
  const lista = vistas.slice(0, MAX_PANTALLA);

  return (
    <section className="tp ev" ref={raiz} aria-busy={cargando}>
      <section className="tp-panel" aria-label="Filtros de evidencias">
        <div className="tp-fila">
          <span className="tp-lb">Periodo</span>
          <div className="tp-seg" role="radiogroup" aria-label="Periodo">
            {([["hoy", "Hoy"], ["ayer", "Ayer"], ["7", "7 días"], ["30", "30 días"], ["otro", "Fechas"]] as [Rango, string][]).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={rango === k} className={rango === k ? "on" : ""} onClick={() => escoger(k)}>{t}</button>
            ))}
          </div>
          {rango === "otro" && (
            <div className="tp-fechas">
              <label><span>Desde</span><input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} /></label>
              <label><span>Hasta</span><input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => e.target.value && setHasta(e.target.value)} /></label>
            </div>
          )}
        </div>
        <div className="tp-fila">
          <span className="tp-lb">Novedad</span>
          <div className="ev-tipos" role="group" aria-label="Qué se cuenta como novedad">
            {TIPOS.map((t) => (
              <button key={t.k} type="button" role="checkbox" aria-checked={tipos.includes(t.k)} className={tipos.includes(t.k) ? "on" : ""} onClick={() => alternar(t.k)}>
                <i style={{ background: t.color }} aria-hidden /><b>{t.letra}</b> {t.nombre}
              </button>
            ))}
          </div>
        </div>
        <div className="tp-fila">
          <span className="tp-lb">Informe</span>
          <div className="ev-bajar">
            <button type="button" className="ev-bt" onClick={() => void bajar("pdf")} disabled={!!armando || cargando || !!error}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg><span>{armando === "pdf" ? "Armando…" : "Bajar PDF"}</span>
            </button>
            <button type="button" className="ev-bt" onClick={() => void bajar("word")} disabled={!!armando || cargando || !!error}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg><span>{armando === "word" ? "Armando…" : "Bajar Word"}</span>
            </button>
            {armando && <span className="ev-avance" role="status">{avance}</span>}
          </div>
          <p className="tp-res">Viendo <b>{periodoTxt(desde, hasta)}</b> · {tipos.length === TIPOS.length ? "todas las novedades" : TIPOS.filter((t) => tipos.includes(t.k)).map((t) => t.nombre).join(", ")}</p>
        </div>
      </section>

      {aviso && <p className={aviso.mal ? "tp-error" : "ev-ok"} role="status">{aviso.txt}</p>}
      {error && <p className="tp-error" role="alert">{error}</p>}

      <div className="ev-kpis">
        <div className="tp-kpi grande"><span>Novedades</span><b>{nf.format(an.total)}</b></div>
        <div className="tp-kpi"><span>Ubicaciones afectadas</span><b>{nf.format(an.ubicacionesAfectadas)}</b></div>
        <div className="tp-kpi ev-k-persiste"><span>Persisten</span><b>{nf.format(c.persiste + c.reincide)}</b></div>
        <div className="tp-kpi ev-k-nueva"><span>Nuevas</span><b>{nf.format(c.nueva)}</b></div>
        <div className="tp-kpi ev-k-yano"><span>Ya no tienen novedad</span><b>{nf.format(c.ya_no)}</b></div>
        <div className="tp-kpi"><span>PNC que cumplen</span><b>{pctCumple == null ? "—" : `${pctCumple} %`}</b></div>
      </div>

      {!cargando && (
        <ul className="ev-lectura" aria-label="Lo que dice el periodo">
          {lecturas(an).map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}

      {cargando ? <p className="fe-vacio">Cargando…</p> : (
        <>
          {/* ===== MÓDULO 1 ===== */}
          <h2 className="tp-h ev-mod"><span>Módulo 1</span> Tendencia por día <small>cuántas novedades hubo cada día y cuántas ubicaciones se miraron</small></h2>
          {imgs && (
            <div className="ev-graficas">
              <div className="ev-scroll"><img className="ev-img" src={imgs.dias.png} alt="Novedades por día, apiladas por tipo" width={imgs.dias.w} height={imgs.dias.h} /></div>
              <div className="ev-scroll"><img className="ev-img" src={imgs.cobertura.png} alt="Ubicaciones contadas y ubicaciones con novedad, por día" width={imgs.cobertura.w} height={imgs.cobertura.h} /></div>
            </div>
          )}
          <div className="tp-tabla" tabIndex={0} aria-label="Novedades por día">
            <table>
              <thead><tr><th className="tp-izq">Día</th><th>Ubic. contadas</th><th>Ubic. con novedad</th>{TIPOS.map((t) => <th key={t.k}>{t.nombre}</th>)}<th>Total</th></tr></thead>
              <tbody>
                {an.porDia.map((d) => (
                  <tr key={d.dia}>
                    <th scope="row" className="tp-izq">{diaTxt(d.dia)}</th>
                    <td>{d.contadas ? nf.format(d.contadas) : <span className="tp-sin">No se contó</span>}</td>
                    <td>{nf.format(d.conNovedad)}</td>
                    {TIPOS.map((t) => <td key={t.k}>{d.porTipo[t.k] ? nf.format(d.porTipo[t.k]) : "·"}</td>)}
                    <td className="tp-rph">{nf.format(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== MÓDULO 2 ===== */}
          <h2 className="tp-h ev-mod"><span>Módulo 2</span> Mapa de calor: ubicación × día <small>ayer sí, hoy no, hoy sí otra vez</small></h2>
          {an.filas.length === 0 ? <p className="fe-vacio">Sin novedades en este periodo.</p> : (
            <>
              <div className="tp-tabla ev-mapa" tabIndex={0} aria-label="Mapa de calor de novedades por ubicación y día">
                <table>
                  <thead>
                    <tr>
                      <th className="tp-izq ev-fija">Ubicación</th><th className="tp-izq">Tendencia</th>
                      {an.dias.map((d) => <th key={d} className="ev-dia" title={diaTxt(d)}><span>{Number(d.slice(8))}</span><small>{diaCorto(d).split(" ")[1]}</small></th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {an.filas.map((f) => (
                      <tr key={f.id}>
                        <th scope="row" className="tp-izq ev-fija">{f.clave}</th>
                        <td className="tp-izq"><span className="ev-chip" style={{ ["--ev-c" as string]: TEND[f.tendencia].color }}>{TEND[f.tendencia].nombre}</span></td>
                        {f.celdas.map((ce, i) => (
                          <td key={i} className={"ev-c " + (ce.estado === "novedad" ? `nov n${Math.min(ce.n, 3)}` : ce.estado)}
                            title={`${f.clave} · ${diaTxt(an.dias[i])} · ${ce.estado === "novedad" ? ce.tipos.map((t) => TIPO[t].nombre).join(", ") + (ce.n > 1 ? ` (${ce.n})` : "") : ce.estado === "limpia" ? "contada, sin novedad" : "no se contó"}`}>
                            {ce.estado === "novedad" ? letrasTipos(ce.tipos) : <span className="ev-v">{ce.estado === "limpia" ? "Sin novedad" : "No se contó"}</span>}
                          </td>
                        ))}
                        <td className="tp-rph">{nf.format(f.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ev-leyenda">
                <span><i className="ev-q n1" />1 novedad</span><span><i className="ev-q n2" />2</span><span><i className="ev-q n3" />3 o más</span>
                <span><i className="ev-q limpia" />Contada, sin novedad</span><span><i className="ev-q sin" />No se contó ese día</span>
                <span className="ev-letras">{TIPOS.map((t) => `${t.letra} = ${t.nombre}`).join(" · ")}</span>
              </p>
            </>
          )}

          {/* ===== MÓDULO 3 ===== */}
          <h2 className="tp-h ev-mod"><span>Módulo 3</span> Tendencia por ubicación <small>si la novedad persiste, volvió, es nueva o ya se resolvió</small></h2>
          <ul className="ev-defs">
            {TENDENCIAS.map((t) => <li key={t.k}><span className="ev-chip" style={{ ["--ev-c" as string]: t.color }}>{t.nombre}</span> {t.frase}</li>)}
          </ul>
          {an.filas.length > 0 && (
            <div className="tp-tabla" tabIndex={0} aria-label="Tendencia de cada ubicación">
              <table>
                <thead><tr><th className="tp-izq">Ubicación</th><th className="tp-izq">Tendencia</th><th>Días con novedad</th><th>Seguidos hasta hoy</th><th className="tp-izq">Qué tipos</th><th className="tp-izq">Último día contado</th><th>Total</th></tr></thead>
                <tbody>
                  {an.filas.map((f) => (
                    <tr key={f.id}>
                      <th scope="row" className="tp-izq">{f.clave}</th>
                      <td className="tp-izq"><span className="ev-chip" style={{ ["--ev-c" as string]: TEND[f.tendencia].color }}>{TEND[f.tendencia].nombre}</span></td>
                      <td>{nf.format(f.diasConNovedad)} de {nDias}</td>
                      <td>{f.tendencia === "ya_no" ? "0" : nf.format(f.racha)}</td>
                      <td className="tp-izq">{TIPOS.filter((t) => f.tipos[t.k] > 0).map((t) => `${t.letra} ${f.tipos[t.k]}`).join(" · ")}</td>
                      <td className="tp-izq">{f.ultimoVisto ? diaTxt(f.ultimoVisto) : "—"}</td>
                      <td className="tp-rph">{nf.format(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== MÓDULO 4 ===== */}
          <h2 className="tp-h ev-mod"><span>Módulo 4</span> Dónde se concentra <small>las ubicaciones y los módulos con más novedades</small></h2>
          {imgs && (
            <div className="ev-graficas dos">
              <div className="ev-scroll"><img className="ev-img corto" src={imgs.dona.png} alt="Proporción de novedades por tipo" width={imgs.dona.w} height={imgs.dona.h} /></div>
              <div className="ev-scroll"><img className="ev-img" src={imgs.top.png} alt="Ubicaciones con más novedades" width={imgs.top.w} height={imgs.top.h} /></div>
            </div>
          )}
          {an.modulos.length > 0 && (
            <div className="tp-tabla" tabIndex={0} aria-label="Novedades por módulo">
              <table>
                <thead><tr><th className="tp-izq">Módulo (calle + número)</th><th>Ubicaciones afectadas</th><th>Novedades</th></tr></thead>
                <tbody>{an.modulos.slice(0, 25).map((m) => <tr key={m.modulo}><th scope="row" className="tp-izq">{m.modulo}</th><td>{nf.format(m.ubicaciones)}</td><td className="tp-rph">{nf.format(m.total)}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {/* ===== MÓDULO 5 ===== */}
          <h2 className="tp-h ev-mod"><span>Módulo 5</span> PNC y política de bloqueo <small>cumple si tiene rótulo y bloqueo mecánico</small></h2>
          {pnc.length === 0 ? <p className="fe-vacio">No hubo PNC en este periodo{tipos.includes("pnc") ? "" : " (el tipo PNC no está escogido)"}.</p> : (
            <div className="tp-tabla" tabIndex={0} aria-label="PNC y política de bloqueo">
              <table>
                <thead><tr><th className="tp-izq">Día</th><th className="tp-izq">Ubicación</th><th className="tp-izq">Material</th><th>Cajas</th><th>Rótulo</th><th>Bloqueo mecánico</th><th>¿Cumple?</th><th className="tp-izq">Persona</th></tr></thead>
                <tbody>
                  {pnc.map((n, i) => (
                    <tr key={i}>
                      <td className="tp-izq">{diaTxt(n.dia)}</td><th scope="row" className="tp-izq">{n.ubicacion ?? "—"}</th>
                      <td className="tp-izq tp-mat">{`${n.codigo ?? ""} ${n.material ?? ""}`.trim() || "—"}</td>
                      <td>{n.cajas == null ? "—" : nf.format(n.cajas)}</td>
                      <td>{n.pnc_rotulo == null ? "—" : n.pnc_rotulo ? "Sí" : "No"}</td><td>{n.pnc_bloqueo_mecanico == null ? "—" : n.pnc_bloqueo_mecanico ? "Sí" : "No"}</td>
                      <td>{n.cumple == null ? <span className="tp-sin">Sin responder</span> : n.cumple ? <span className="ev-chip" style={{ ["--ev-c" as string]: "#2E7D4F" }}>Cumple</span> : <span className="ev-chip" style={{ ["--ev-c" as string]: "#B3470F" }}>No cumple</span>}</td>
                      <td className="tp-izq">{n.persona ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== MÓDULO 6 ===== */}
          <h2 className="tp-h ev-mod"><span>Módulo 6</span> Evidencias <small>cada novedad con su foto{an.fotos ? ` · ${an.fotos} con foto` : ""}</small></h2>
          {vistas.length === 0 ? <p className="fe-vacio">Sin novedades en este periodo.</p> : (
            <div className="tp-tabla" tabIndex={0} aria-label="Detalle de las novedades">
              <table>
                <thead><tr><th className="tp-izq">Día</th><th>Hora</th><th className="tp-izq">Ubicación</th><th className="tp-izq">Tipo</th><th className="tp-izq">Material</th><th>Cajas</th><th className="tp-izq">Persona</th><th className="tp-izq">Foto</th></tr></thead>
                <tbody>
                  {lista.map((n, i) => {
                    const clave = `${i}`;
                    return (
                      <Fragment key={clave}>
                        <tr>
                          <td className="tp-izq">{diaTxt(n.dia)}</td><td>{hora(n.hora)}</td>
                          <th scope="row" className="tp-izq">{n.ubicacion ?? "—"}</th>
                          <td className="tp-izq"><span className="ev-chip" style={{ ["--ev-c" as string]: TIPO[n.tipo].color }}>{TIPO[n.tipo].nombre}</span></td>
                          <td className="tp-izq tp-mat">{`${n.codigo ?? ""} ${n.material ?? ""}`.trim() || "—"}</td>
                          <td>{n.cajas == null ? "—" : nf.format(n.cajas)}</td>
                          <td className="tp-izq">{n.persona ?? "—"}</td>
                          <td className="tp-izq">{n.ruta ? <button type="button" className="tp-ver" aria-expanded={fotoAbierta === clave} onClick={() => void verFoto(n.ruta!, clave)}>{fotoAbierta === clave ? "Ocultar" : "Ver foto"}</button> : <span className="tp-sinubi">Sin foto</span>}</td>
                        </tr>
                        {fotoAbierta === clave && n.ruta && (
                          <tr className="tp-detalle"><td colSpan={8}>
                            <div className="ev-foto">
                              {urls[n.ruta] === "cargando" || urls[n.ruta] === undefined ? <p className="fe-vacio">Cargando la foto…</p>
                                : urls[n.ruta] === "mal" ? <p className="tp-error">No se pudo abrir la foto.</p>
                                : <img src={urls[n.ruta]} alt={`Foto de ${TIPO[n.tipo].nombre} en ${n.ubicacion ?? "la ubicación"}`} />}
                              <p>{detalleNovedad(n)}</p>
                            </div>
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {vistas.length > lista.length && <p className="ev-nota">Se muestran las primeras {lista.length} de {nf.format(vistas.length)}. Acota el periodo para ver el resto; el informe lleva hasta {MAX_ANEXO} en el anexo.</p>}
        </>
      )}
    </section>
  );
}
