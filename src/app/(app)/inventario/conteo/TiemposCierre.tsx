"use client";

/**
 * INVENTARIO · CONTEO · EL CIERRE DE TIEMPOS — el informe que se comparte, con el diseño de los otros cierres
 * (banda negra con el sello, franja del acento, tablas, imagen para copiar / compartir / descargar, texto, imprimir).
 *
 * MIRA, no cierra nada: es la foto de lo que se ve en el tablero a esta hora. Lleva:
 *   · el RANKING y la LÍNEA DE TIEMPO (inicio → final de cada conteo, en orden de hora, día por día);
 *   · las OBSERVACIONES que escribe la persona (las tareas del turno): salen en la imagen, el texto y la impresión;
 *   · para quien MANDA, las personas que se pueden quitar del informe (una o varias).
 * Las cuentas son `armarCierreTiempos` (módulo puro); la imagen es `tiempos-foto` (lienzo). Aquí solo se dibuja la ventana.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { duracion, type FilaTiempo } from "@/modulos/inventario/tiempos";
import { armarCierreTiempos, horasEje, lineasObs, marcaEstado, num, num1, periodoTxt, textoCierreTiempos } from "@/modulos/inventario/tiempos-cierre";
import { useFotoCompartir, type TipoFoto } from "@/components/FotoCompartir";
import "../../roturas/roturas.css";
import "../../roturas/en-sitio/tablero/cierre.css";
import "../../sider/seguimiento/ai/cierre-ai.css";
import "./tiempos-cierre.css";

const hhmm = (d: Date) => d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const guardado = (k: string) => { try { return window.localStorage.getItem(k) ?? "" } catch { return "" } };
const guardar = (k: string, v: string) => { try { v ? window.localStorage.setItem(k, v) : window.localStorage.removeItem(k) } catch { /* sin almacenamiento: no pasa nada */ } };

export function TiemposCierre({ filas, personas, ocultas, alternarOculta, mostrarTodas, manda, desde, hasta, quien, cerrar }: {
  /** Las filas que ya se ven en el tablero (periodo, persona y ocultas aplicados). */
  filas: FilaTiempo[];
  /** Todas las personas del periodo, para que quien manda quite o devuelva. */
  personas: [string, string][];
  ocultas: string[];
  alternarOculta: (id: string) => void;
  mostrarTodas: () => void;
  manda: boolean;
  desde: string; hasta: string; quien: string;
  cerrar: () => void;
}) {
  const botonX = useRef<HTMLButtonElement>(null);
  const [armado] = useState(() => new Date());
  const claveObs = `tiempos-obs:${desde}:${hasta}`;
  const [obsTxt, setObsTxt] = useState("");
  useEffect(() => { setObsTxt(guardado(claveObs)) }, [claveObs]);
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null);

  const c = useMemo(() => armarCierreTiempos(filas), [filas]);
  const obs = useMemo(() => lineasObs(obsTxt), [obsTxt]);
  const periodo = periodoTxt(desde, hasta);
  const titulo = "Cierre · Tiempos de conteo";
  const ojo = "INVENTARIO · TIEMPOS DE CONTEO";

  const alTeclear = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") cerrar() }, [cerrar]);
  useEffect(() => { document.addEventListener("keydown", alTeclear); botonX.current?.focus(); return () => document.removeEventListener("keydown", alTeclear) }, [alTeclear]);
  const dicho = (txt: string, mal = false) => { setAviso({ txt, mal }); setTimeout(() => setAviso(null), 3200) };

  async function copiarTexto() {
    const texto = textoCierreTiempos(c, titulo, `${periodo} · ${quien}`, armado, obs);
    try { await navigator.clipboard.writeText(texto) } catch {
      const a = document.createElement("textarea"); a.value = texto; a.setAttribute("readonly", ""); a.style.position = "fixed"; a.style.opacity = "0";
      document.body.appendChild(a); a.select(); try { document.execCommand("copy") } catch { /* ni modo */ } a.remove();
    }
    dicho("Texto copiado. Pégalo donde lo vayas a mandar.");
  }

  const imagen = useFotoCompartir(async (_t: TipoFoto) => {
    const [fo, pa] = await Promise.all([import("@/modulos/inventario/tiempos-foto"), import("@/modulos/sider/foto-pareto")]);
    const logo = await pa.cargarLogoB();
    return { lienzo: fo.dibujarTiemposFoto(c, { titulo, ojo, periodo: `${periodo} · ${quien}`, generado: armado, logo, obs }), nombre: `tiempos-conteo-${desde}-${hasta}.png` };
  }, titulo, { dashboard: "Informe" }, undefined, ["dashboard"]);

  const eje = c.eje, span = eje.fin - eje.ini;
  const paso = span / 60 <= 12 ? 60 : 120;
  const marcas: number[] = []; for (let m = eje.ini; m <= eje.fin; m += paso) marcas.push(m);
  const pct = (m: number) => `${((m - eje.ini) / span) * 100}%`;
  const topeRph = Math.max(0.0001, ...c.rank.map((p) => p.rph ?? 0));

  return (
    <div className="rt-modal rtc-velo" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <section className="rtc tc" role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="rtc-cab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-b.png" alt="" width={34} height={34} />
          <div className="rtc-tit">
            <div className="rtc-ojo">{ojo}</div>
            <h2>{titulo}</h2>
            <div className="rtc-f">{periodo.charAt(0).toUpperCase() + periodo.slice(1)} · {quien} · foto de las {hhmm(armado)}</div>
          </div>
          <div className="rtc-der ca-no-foto">
            <button type="button" className="rtc-bt pdf" onClick={() => void imagen.abrir("dashboard")} disabled={imagen.armando != null} title="El informe como imagen: copiar, compartir o descargar">
              <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="5" /><rect x="13" y="10" width="8" height="11" /><rect x="3" y="13" width="8" height="8" /></svg>
              <span>{imagen.armando && !imagen.abierta ? "Armando…" : "Copiar imagen"}</span>
            </button>
            <button type="button" className="rtc-bt" onClick={copiarTexto} title="Copiar el informe como texto">
              <svg viewBox="0 0 24 24" aria-hidden><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" /></svg>
              <span>Copiar texto</span>
            </button>
            <button type="button" className="rtc-bt" onClick={() => window.print()}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="7" rx="1.5" /><path d="M7 16h10v4H7z" /></svg>
              <span>Imprimir</span>
            </button>
            <button type="button" className="rtc-bt ico" ref={botonX} onClick={cerrar} aria-label="Cerrar">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </header>

        {aviso && <p className={"rtc-aviso ca-no-foto" + (aviso.mal ? " mal" : "")} role="status">{aviso.txt}</p>}

        {/* ─ QUITAR PERSONAS: solo quien manda ─ */}
        {manda && personas.length > 0 && (
          <div className="ca-barra ca-no-foto tc-quitar">
            <div className="ca-grupo" role="group" aria-label="Personas en el informe">
              <span>Personas</span>
              {personas.map(([id, n]) => {
                const fuera = ocultas.includes(id);
                return <button key={id} type="button" aria-pressed={!fuera} className={fuera ? "" : "on"} onClick={() => alternarOculta(id)} title={fuera ? "Está fuera del informe: tócala para volver a ponerla" : "Tócala para quitarla del informe"}>{fuera ? "✕ " : ""}{n}</button>;
              })}
              {ocultas.length > 0 && <button type="button" className="tc-todas" onClick={mostrarTodas}>Mostrar todas</button>}
            </div>
            <p className="tc-nota">{ocultas.length ? `${ocultas.length} fuera del informe y del tablero.` : "Quita a quien no deba salir; el tablero también deja de mostrarla."}</p>
          </div>
        )}

        {/* ─ LA FRANJA DEL ACENTO ─ */}
        <div className="rtc-hero">
          <div className="rtc-total">
            <div className="rtc-k">RENGLONES POR HORA ACTIVA</div>
            <div className="rtc-v">{num1(c.rph)}</div>
            <div className="rtc-s">{c.personas} persona{c.personas === 1 ? "" : "s"}</div>
          </div>
          <div className="rtc-lado">
            <div className="rtc-mini">
              <div><div className="rtc-k">CONTEOS ENVIADOS</div><div className="rtc-v">{num(c.conteos)}</div><div className="rtc-s2">{c.sinEnviar ? `${c.sinEnviar} sin enviar` : "todos enviados"}</div></div>
              <div><div className="rtc-k">RENGLONES</div><div className="rtc-v">{num(c.renglones)}</div><div className="rtc-s2">contados</div></div>
              <div><div className="rtc-k">TIEMPO ACTIVO</div><div className="rtc-v">{duracion(c.activoMin)}</div><div className="rtc-s2">{c.pausasMin > 0 ? `y ${duracion(c.pausasMin)} de pausas` : "sin pausas largas"}</div></div>
            </div>
          </div>
        </div>

        <div className="rtc-cuerpo">
          {/* ─ EL RANKING ─ */}
          <div className="rtc-sec"><b>Ranking · renglones por hora activa</b><span>{c.rank.length} persona{c.rank.length === 1 ? "" : "s"}</span></div>
          {c.rank.length === 0 ? <p className="rtc-nada">Todavía no hay conteos enviados en este periodo.</p> : (
            <div className="rtc-rueda tc-rueda">
              <table className="rtc-tabla ca-tabla tc-tabla">
                <thead><tr><th className="n">#</th><th>Persona</th><th className="n">Conteos</th><th className="n">Renglones</th><th className="n">Tiempo activo</th><th className="n">Pausas</th><th className="n">Rengl. / hora</th></tr></thead>
                <tbody>
                  {c.rank.map((p, i) => (
                    <tr key={p.id} className={i === 0 && p.rph != null ? "ca-vital" : undefined}>
                      <td className="n">{p.rph == null ? "·" : i + 1}</td>
                      <td>{p.persona}<i className="rtc-barra" aria-hidden><b style={{ width: `${Math.max(2, Math.round(((p.rph ?? 0) / topeRph) * 100))}%` }} /></i></td>
                      <td className="n">{p.conteos}</td><td className="n">{num(p.renglones)}</td><td className="n">{duracion(p.activo_min)}</td><td className="n">{p.pausas_min > 0 ? duracion(p.pausas_min) : "·"}</td>
                      <td className="n"><b>{num1(p.rph)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ─ LA LÍNEA DE TIEMPO: inicio → final, en orden ─ */}
          <div className="rtc-sec"><b>Línea de tiempo · inicio → final de cada conteo</b><span>{c.dias.reduce((t, d) => t + d.filas.length, 0)} conteos</span></div>
          {c.dias.length === 0 ? <p className="rtc-nada">No hay conteos en este periodo.</p> : (
            <div className="tc-rueda">
              <div className="tc-lt">
                <div className="tc-fila tc-cab">
                  <span className="n">Inicio</span><span>Persona</span>
                  <span className="tc-eje">{marcas.map((m) => <em key={m} style={{ left: pct(m) }}>{horasEje(m)}</em>)}</span>
                  <span className="n">Final</span><span className="n">Duración</span><span className="n">Rengl.</span><span className="n">R. / hora</span>
                </div>
                {c.dias.map((d) => (
                  <div key={d.dia} className="tc-dia">
                    <div className="tc-diat"><b>{periodoTxt(d.dia, d.dia)}</b><span>{d.filas.length} conteo{d.filas.length === 1 ? "" : "s"} · {num(d.renglones)} renglones</span></div>
                    {d.filas.map((f) => (
                      <div key={f.id} className="tc-fila">
                        <span className="n tc-hi">{f.horaIni}</span>
                        <span className="tc-per">{f.persona}</span>
                        <span className="tc-pista" style={{ backgroundSize: `${(paso / span) * 100}% 100%` }}>
                          <i className={f.estado === "enviado" ? "" : "sin"} style={{ left: pct(f.ini), width: `max(4px, ${(Math.min(f.dur, eje.fin - f.ini) / span) * 100}%)` }} />
                        </span>
                        <span className="n">{f.estado === "enviado" ? f.horaFin : <small className="tc-sin">{marcaEstado(f.estado)}</small>}</span>
                        <span className="n">{duracion(f.dur)}</span><span className="n">{num(f.renglones)}</span><span className="n tc-rph">{num1(f.rph)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─ LAS OBSERVACIONES: lo escribe la persona; sale en la imagen, el texto y la impresión ─ */}
          <div className="rtc-sec"><b>Observaciones del turno</b><span className="ca-no-foto">una tarea por línea</span></div>
          <textarea className="tc-obs ca-no-foto" rows={4} value={obsTxt} maxLength={1500}
            placeholder={"Ej.:\nConteo fiscal de las hojas 1 a 4 terminado.\nReconteo de las diferencias de casco con Génesis.\nPendiente: la hoja 6."}
            onChange={(e) => { setObsTxt(e.target.value); guardar(claveObs, e.target.value) }} aria-label="Observaciones del turno" />
          {obs.length > 0 && <ul className="tc-obs-ver">{obs.map((o, i) => <li key={i}>{o}</li>)}</ul>}

          <p className="rtc-fin">
            Renglones por hora = renglones ÷ horas de trabajo activo (sin las pausas de más de 30 min); en el ranking solo cuentan los conteos enviados.
            Inicio = primer renglón · final = envío. Las barras rayadas son conteos que no se enviaron. La foto es de las {hhmm(armado)}; si alguien envía un conteo después, el informe cambia.
          </p>
        </div>
      </section>
      {imagen.vista}
    </div>
  );
}
