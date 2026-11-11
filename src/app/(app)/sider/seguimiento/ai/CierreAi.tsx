"use client";

/**
 * EL CIERRE DE TURNO DE LA REVISIÓN AI — la ficha que se abre desde el informe de SIDER.
 *
 * Mismo diseño que el cierre de Roturas en sitio (banda con el sello, franja del acento, secciones, copiar imagen,
 * copiar texto e imprimir) con lo que se pidió: VH y cantidad revisada · CDs de mayor a menor %AI · el pareto del
 * defecto más encontrado. MIRA, no cierra nada: es la foto del turno al momento de abrirla.
 * La cuenta es `armarCierreAi` (módulo puro); aquí solo se dibuja.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Revision } from "@/modulos/sider/ai";
import type { PorDefecto } from "@/modulos/sider/informe-ai";
import { armarCierreAi, textoCierreAi } from "@/modulos/sider/cierre-ai";
import { turnoAi } from "@/modulos/sider/comun";
import { cierreAiDia } from "./actions";
import { DiaCierre } from "./DiaCierre";
import { useFotoCompartir, type TipoFoto } from "@/components/FotoCompartir";
import "../../../roturas/roturas.css";
import "../../../roturas/en-sitio/tablero/cierre.css";
import "./cierre-ai.css";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pc = (x: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x * 100) + " %";
const TURNOS = [["T3", "C", "22:00 · 06:00"], ["T1", "A", "06:00 · 14:00"], ["T2", "B", "14:00 · 22:00"]] as const;
const diaLargo = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const hhmm = (d: Date) => d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const hoyCo = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());

export function CierreAi({ ultima, tipoInicial, cerrar }: { ultima: string | null; tipoInicial: "ai" | "sorting" | ""; cerrar: () => void }) {
  const raiz = useRef<HTMLDivElement>(null);
  const botonX = useRef<HTMLButtonElement>(null);
  const [armado, setArmado] = useState(() => new Date());
  const [dia, setDia] = useState(ultima ?? hoyCo());
  const [turnos, setTurnos] = useState<string[]>([turnoAi()]);
  const [tipo, setTipo] = useState<"ai" | "sorting" | "">(tipoInicial || "ai");
  const [datos, setDatos] = useState<{ revisiones: Revision[]; defectos: PorDefecto[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    setDatos(null); setError(null);
    cierreAiDia(dia, turnos, tipo).then((r) => {
      if (!vivo) return;
      if ("error" in r && r.error) { setError(r.error); return }
      setDatos({ revisiones: r.revisiones ?? [], defectos: r.defectos ?? [] }); setArmado(new Date());
    }).catch(() => { if (vivo) setError("No se pudo leer el cierre. Intenta otra vez.") });
    return () => { vivo = false };
  }, [dia, turnos, tipo]);

  const c = useMemo(() => (datos ? armarCierreAi(datos.revisiones, datos.defectos) : null), [datos]);
  const letras = TURNOS.filter(([k]) => turnos.includes(k)).map(([, l]) => l);
  const todos = turnos.length === 3;
  const titulo = todos ? "Cierre del día" : letras.length === 1 ? `Cierre del turno ${letras[0]}` : `Cierre de los turnos ${letras.join(" y ")}`;
  const ojo = (tipo === "ai" ? "REVISIÓN AI CERTIFICADA" : tipo === "sorting" ? "REVISIÓN AI NORMAL" : "REVISIÓN AI") + " · " + (todos ? "LOS TRES TURNOS" : letras.length === 1 ? `TURNO ${letras[0]} · ${TURNOS.find(([, l]) => l === letras[0])?.[2]}` : `TURNOS ${letras.join(" Y ")}`);
  const periodo = diaLargo(dia);

  const alTeclear = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") cerrar() }, [cerrar]);
  useEffect(() => { document.addEventListener("keydown", alTeclear); botonX.current?.focus(); return () => document.removeEventListener("keydown", alTeclear) }, [alTeclear]);

  const dicho = (txt: string, mal = false) => { setAviso({ txt, mal }); setTimeout(() => setAviso(null), 3200) };

  async function copiarTexto() {
    if (!c) return;
    const texto = textoCierreAi(c, `${titulo} · ${ojo.split(" · ")[0].toLowerCase()} · ${periodo}`, armado);
    try { await navigator.clipboard.writeText(texto) } catch {
      const a = document.createElement("textarea"); a.value = texto; a.setAttribute("readonly", ""); a.style.position = "fixed"; a.style.opacity = "0";
      document.body.appendChild(a); a.select(); try { document.execCommand("copy") } catch { /* ni modo */ } a.remove();
    }
    dicho("Texto copiado. Pégalo donde lo vayas a mandar.");
  }

  /* LAS IMÁGENES, COMO EN ROTURAS EN SITIO: una ventana con dos pestañas —Dashboard (el cierre completo) y Pareto (la gráfica)—
     y los botones Copiar imagen, Compartir y Descargar PNG. Las dos se dibujan aparte (lienzo), con solo el sello «B» de la marca. */
  const letrasTxt = letras.join("");
  const imagen = useFotoCompartir(async (tipo: TipoFoto) => {
    if (!c) throw new Error("sin cierre");
    const fo = await import("@/modulos/sider/foto-pareto");
    const logo = await fo.cargarLogoB();
    const extra = { titulo, ojo, periodo, generado: armado, logo };
    if (tipo === "detalle") return { lienzo: fo.dibujarParetoFoto(c, extra), nombre: `pareto-ai-${dia}-${letrasTxt}.png` };
    return { lienzo: fo.dibujarDashboardFoto(c, extra), nombre: `cierre-ai-${dia}-${letrasTxt}.png` };
  }, titulo, { dashboard: "Dashboard", detalle: "Pareto" }, undefined, ["dashboard", "detalle"]);

  function imprimir() { window.print() }
  const alternar = (k: string) => setTurnos((t) => (t.includes(k) ? (t.length > 1 ? t.filter((x) => x !== k) : t) : [...t, k]));
  const topeCd = Math.max(0.0001, ...(c?.cds.map((x) => x.indice) ?? [0]));

  return (
    <div className="rt-modal rtc-velo" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <section className="rtc" ref={raiz} role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="rtc-cab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-b.png" alt="" width={34} height={34} />
          <div className="rtc-tit">
            <div className="rtc-ojo">SIDER · {ojo}</div>
            <h2>{titulo}</h2>
            <div className="rtc-f">{periodo.charAt(0).toUpperCase() + periodo.slice(1)} · foto de las {hhmm(armado)}</div>
          </div>
          <div className="rtc-der ca-no-foto">
            <button type="button" className="rtc-bt pdf" onClick={() => void imagen.abrir("dashboard")} disabled={!c || imagen.armando != null} title="El cierre completo como imagen: copiar, compartir o descargar">
              <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="5" /><rect x="13" y="10" width="8" height="11" /><rect x="3" y="13" width="8" height="8" /></svg>
              <span>{imagen.armando === "dashboard" && !imagen.abierta ? "Armando…" : "Dashboard"}</span>
            </button>
            <button type="button" className="rtc-bt" onClick={() => void imagen.abrir("detalle")} disabled={!c || imagen.armando != null} title="Solo la gráfica del pareto como imagen">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M4 20V10M10 20V6M16 20v-5M22 20v-3" /><path d="M3 9l6-4 6 5 6-6" /></svg>
              <span>{imagen.armando === "detalle" && !imagen.abierta ? "Armando…" : "Pareto"}</span>
            </button>
            <button type="button" className="rtc-bt" onClick={copiarTexto} disabled={!c} title="Copiar el cierre como texto">
              <svg viewBox="0 0 24 24" aria-hidden><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" /></svg>
              <span>Copiar texto</span>
            </button>
            <button type="button" className="rtc-bt" onClick={imprimir}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="7" rx="1.5" /><path d="M7 16h10v4H7z" /></svg>
              <span>Imprimir</span>
            </button>
            <button type="button" className="rtc-bt ico" ref={botonX} onClick={cerrar} aria-label="Cerrar">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </header>

        {aviso && <p className={"rtc-aviso ca-no-foto" + (aviso.mal ? " mal" : "")} role="status">{aviso.txt}</p>}

        {/* ─ QUÉ CIERRO: día, turnos y clase de revisión ─ */}
        <div className="ca-barra ca-no-foto">
          <div className="ca-dia"><span>Día</span><DiaCierre valor={dia} hoy={hoyCo()} alCambiar={setDia} /></div>
          <div className="ca-grupo" role="group" aria-label="Turnos">
            <span>Turno</span>
            {TURNOS.map(([k, l, h]) => <button key={k} type="button" aria-pressed={turnos.includes(k)} className={turnos.includes(k) ? "on" : ""} title={h} onClick={() => alternar(k)}>{l}</button>)}
            <button type="button" className={todos ? "on" : ""} onClick={() => setTurnos(["T3", "T1", "T2"])}>Los tres</button>
          </div>
          <div className="ca-grupo" role="group" aria-label="Clase de revisión">
            <span>Revisión</span>
            {([["ai", "Certificada"], ["sorting", "Normal"], ["", "Todas"]] as const).map(([k, t]) => <button key={k || "t"} type="button" className={tipo === k ? "on" : ""} aria-pressed={tipo === k} onClick={() => setTipo(k)}>{t}</button>)}
          </div>
        </div>

        {error && <p className="rtc-aviso mal">{error}</p>}
        {!c && !error && <p className="rtc-nada ca-carga">Armando el cierre…</p>}

        {c && (
          <>
            {/* ─ LA FRANJA DEL ACENTO: VH y cantidad revisada ─ */}
            <div className="rtc-hero">
              <div className="rtc-total">
                <div className="rtc-k">VH REVISADOS</div>
                <div className="rtc-v">{nf.format(c.vh)}</div>
                <div className="rtc-s">{c.revisiones} revisión{c.revisiones === 1 ? "" : "es"} · {c.cds.length} CD{c.cds.length === 1 ? "" : "s"}</div>
              </div>
              <div className="rtc-lado">
                <div className="rtc-mini">
                  <div><div className="rtc-k">CANTIDAD REVISADA</div><div className="rtc-v">{nf.format(c.revisadas)}</div><div className="rtc-s2">unidades · recibidas {nf.format(c.recibidas)}</div></div>
                  <div><div className="rtc-k">EN MAL ESTADO</div><div className="rtc-v">{nf.format(c.malas)}</div><div className="rtc-s2">unidades</div></div>
                  <div><div className="rtc-k">%AI</div><div className="rtc-v">{pc(c.indice)}</div><div className="rtc-s2">mal estado ÷ revisadas</div></div>
                </div>
              </div>
            </div>

            <div className="rtc-cuerpo">
              {/* ─ CDs, DE MAYOR A MENOR %AI ─ */}
              <div className="rtc-sec"><b>CDs revisados · de mayor a menor %AI</b><span>{c.cds.length} CD{c.cds.length === 1 ? "" : "s"}</span></div>
              {c.cds.length === 0 ? <p className="rtc-nada">No hay revisiones en este turno.</p> : (
                <div className="rtc-rueda">
                  <table className="rtc-tabla ca-tabla">
                    <thead><tr><th className="n">#</th><th>CD</th><th className="n">VH</th><th className="n">Revisadas</th><th className="n">Mal estado</th><th className="n">%AI</th></tr></thead>
                    <tbody>
                      {c.cds.map((x, i) => (
                        <tr key={x.clave}>
                          <td className="n">{i + 1}</td>
                          <td>{x.nombre}<i className="rtc-barra" aria-hidden><b style={{ width: `${Math.round((x.indice / topeCd) * 100)}%` }} /></i></td>
                          <td className="n">{x.vh}</td><td className="n">{nf.format(x.revisadas)}</td><td className="n">{nf.format(x.malas)}</td>
                          <td className="n"><b>{pc(x.indice)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan={2}><b>Total</b></td><td className="n"><b>{c.vh}</b></td><td className="n"><b>{nf.format(c.revisadas)}</b></td><td className="n"><b>{nf.format(c.malas)}</b></td><td className="n"><b>{pc(c.indice)}</b></td></tr></tfoot>
                  </table>
                </div>
              )}

              <p className="rtc-fin">
                %AI = unidades en mal estado ÷ unidades revisadas, sumadas (no el promedio de cada revisión). VH = vehículos distintos revisados; un camión con
                dos materiales cuenta una vez. El pareto de defectos está en el botón «Pareto». La foto es de las {hhmm(armado)}; si
                alguien registra una revisión después, el cierre cambia. Turnos: C 22:00–06:00 abre el día, A 06:00–14:00, B 14:00–22:00.
              </p>
            </div>
          </>
        )}
      </section>
      {imagen.vista}
    </div>
  );
}
