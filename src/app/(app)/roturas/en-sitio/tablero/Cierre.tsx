"use client";

/**
 * EL CIERRE DE TURNO DE ROTURAS EN SITIO — la ficha que se abre desde el
 * Tablero.
 *
 * «Quiero cierres de turno A, B y C mostrando, en el día y en el turno,
 *  cuántos registros hicieron, cuántos fueron reportados, cuántos fueron
 *  encontrados, a qué corresponde esa rotura, con exportables PDF, así
 *  como en el control de traspasos.»
 *
 * MIRA, NO CIERRA. Nadie firma nada ni queda nada congelado en la base:
 * es la foto de cómo quedó el turno en el momento en que se abre, para
 * leerla en la reunión, bajarla en PDF o mandarla. Por eso arriba dice
 * la hora a la que se armó: si mañana alguien registra una rotura de
 * este turno, la cifra cambia, y una foto sin hora es una cifra que
 * nadie puede ubicar.
 *
 * LA CUENTA NO SE HACE AQUÍ. `armarCierre` (módulo puro, con su prueba)
 * es lo único que suma; la ficha, el PDF y el texto para copiar leen su
 * resultado. Tres sumas distintas son tres maneras de decir 41 y 40.
 *
 * RECIBE LO QUE EL TABLERO YA FILTRÓ por estado y búsqueda; el día y el
 * turno se los pasa aparte, porque con el rango puesto la ficha tiene
 * que enseñar también los turnos en cero —«no se rompió nada» es una
 * respuesta, no un hueco—.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Rotura } from "@/modulos/roturas/datos";
import {
  armarCierre, diaLargo, ddmm, HORARIO_TURNO, ORIGEN_TXT, periodoCierre, textoCierre,
  type Cuenta, type TurnoCierre,
} from "@/modulos/roturas/cierre";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import "./cierre.css";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const hhmm = (d: Date) => d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

async function comoDataUrl(url: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise<string | null>((ok) => {
      const f = new FileReader();
      f.onload = () => ok(String(f.result));
      f.onerror = () => ok(null);
      f.readAsDataURL(b);
    });
  } catch { return null }
}

/** Un turno, su letra; dos o más, «C y A»; los tres, «los tres turnos». */
const letras = (t: string[]) =>
  t.length > 1 ? t.slice(0, -1).join(", ") + " y " + t[t.length - 1] : t[0] ?? "";

export function Cierre({ roturas, nombres, desde, hasta, turnos, filtros, cerrar }: {
  /** Ya filtradas por estado y búsqueda; sin filtrar por día ni turno. */
  roturas: Rotura[];
  nombres: Record<string, string>;
  desde: string;
  hasta: string;
  turnos: string[];
  /** Los filtros puestos, ya en palabras. Vacío = ninguno. */
  filtros: string;
  cerrar: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const botonX = useRef<HTMLButtonElement>(null);
  /* La hora de la foto se fija UNA vez, al abrir: si se recalculara en
     cada dibujo, la hora del papel iría cambiando mientras se lee. */
  const [armado] = useState(() => new Date());
  const [aviso, setAviso] = useState<null | { txt: string; mal?: boolean }>(null);
  const [armando, setArmando] = useState(false);

  const c = useMemo(
    () => armarCierre(roturas, nombres, { desde, hasta, turnos }),
    [roturas, nombres, desde, hasta, turnos]);
  const t = c.total;

  const periodo = periodoCierre(c, turnos);
  const titulo = turnos.length === 1 ? `Cierre del turno ${turnos[0]}`
    : turnos.length === 2 ? `Cierre de los turnos ${letras(turnos)}`
    : c.desde === c.hasta && c.desde ? "Cierre del día" : "Cierre del período";
  const ojo = turnos.length === 1 ? `TURNO ${turnos[0]} · ${HORARIO_TURNO[turnos[0] as "C" | "A" | "B"]}`
    : turnos.length === 2 ? `TURNOS ${letras(turnos)}` : "LOS TRES TURNOS · C, A Y B";

  /* Escape cierra, y el foco entra a la ficha: sin eso, el teclado sigue
     detrás, en un botón que ya no se ve. */
  const alTeclear = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") cerrar() }, [cerrar]);
  useEffect(() => {
    document.addEventListener("keydown", alTeclear);
    botonX.current?.focus();
    return () => document.removeEventListener("keydown", alTeclear);
  }, [alTeclear]);

  const dicho = (txt: string, mal = false) => {
    setAviso({ txt, mal });
    setTimeout(() => setAviso(null), 3200);
  };

  async function copiarTexto() {
    const texto = textoCierre(c, { rotulo: periodo, filtros, generado: armado });
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      /* Sin permiso de portapapeles se copia con el truco de siempre. */
      const a = document.createElement("textarea");
      a.value = texto; a.setAttribute("readonly", "");
      a.style.position = "fixed"; a.style.opacity = "0";
      document.body.appendChild(a); a.select();
      try { document.execCommand("copy") } catch { /* ni modo */ }
      a.remove();
    }
    dicho("Texto copiado. Pégalo donde lo vayas a mandar.");
  }

  async function bajarPdf() {
    if (armando) return;
    setArmando(true);
    try {
      /* jsPDF pesa 350 KB y solo hace falta cuando alguien lo toca. */
      const [{ jsPDF }, { dibujarCierre, nombreCierre }, palabra, sello] = await Promise.all([
        import("jspdf"),
        import("./cierre-pdf"),
        comoDataUrl("/marca/logo-bavaria.png"),
        comoDataUrl("/marca/logo-b.png"),
      ]);
      const doc = dibujarCierre(jsPDF, c, {
        titulo, ojo, periodo, filtros, generado: armado,
        marca: { palabra: palabra ?? undefined, sello: sello ?? undefined },
        paleta: leerPaleta(raiz.current),
      });
      doc.save(nombreCierre(c, turnos));
      dicho("PDF listo: quedó en tus descargas.");
    } catch {
      /* Un botón que no hace nada visible se toca cuatro veces y luego
         se reporta como «la app no sirve»: si falla, lo dice. */
      dicho("No se pudo armar el PDF. Recarga la página e intenta otra vez.", true);
    } finally { setArmando(false) }
  }

  /* AL IMPRIMIR SE ABREN TODOS LOS «A QUÉ CORRESPONDE»: en papel no hay
     dónde tocar, y un acordeón cerrado se imprime cerrado. */
  function imprimir() {
    const cerrados = [...(raiz.current?.querySelectorAll("details:not([open])") ?? [])] as HTMLDetailsElement[];
    cerrados.forEach((d) => { d.open = true });
    window.print();
    cerrados.forEach((d) => { d.open = false });
  }

  const pct = (n: number, de: number) => (de > 0 ? Math.round((n / de) * 100) : 0);

  const lista = (titulo: string, nota: string, filas: Cuenta[], total: number) => (
    <section className="rtc-lista" aria-label={titulo}>
      <h4>{titulo}<span>{nota}</span></h4>
      {filas.length === 0
        ? <p className="rtc-nada">Sin registros.</p>
        : (
          <table>
            <thead><tr><th>Nombre</th><th className="n">Reg.</th><th className="n">Rotas</th><th className="n">Contam.</th></tr></thead>
            <tbody>
              {filas.slice(0, 8).map((f) => (
                <tr key={f.nombre}>
                  <td>
                    <span className={f.nombre === "Sin dato" ? "rtc-sd" : ""}>{f.nombre}</span>
                    <i className="rtc-barra" aria-hidden><b style={{ width: `${pct(f.n, total)}%` }} /></i>
                  </td>
                  <td className="n"><b>{f.n}</b></td>
                  <td className="n">{nf.format(f.rotas)}</td>
                  <td className="n">{f.contaminadas ? nf.format(f.contaminadas) : "—"}</td>
                </tr>
              ))}
              {filas.length > 8 && (
                <tr><td colSpan={4} className="rtc-mas">y {filas.length - 8} más (están en el PDF y en el detalle)</td></tr>
              )}
            </tbody>
          </table>
        )}
    </section>
  );

  const tarjeta = (x: TurnoCierre) => {
    const vacio = x.registros === 0;
    return (
      <article key={x.dia + x.turno} className={"rtc-turno" + (vacio ? " vacio" : "")}
               aria-label={`Turno ${x.turno} del ${ddmm(x.dia)}`}>
        <header>
          <span className="rtc-letra" aria-hidden>{x.turno}</span>
          <div>
            <b>Turno {x.turno}</b>
            <small>{HORARIO_TURNO[x.turno]} · {diaLargo(x.dia)}</small>
          </div>
        </header>
        <div className="rtc-cifras">
          <div className="rtc-reg"><span>REGISTROS</span><b>{x.registros}</b></div>
          <div><span>REPORTADAS</span><b>{x.reportadas}</b></div>
          <div><span>ENCONTRADAS</span><b>{x.encontradas}</b></div>
          {x.sinOrigen > 0 && <div className="rtc-sin"><span>SIN ORIGEN</span><b>{x.sinOrigen}</b></div>}
        </div>
        {vacio
          ? <p className="rtc-nada">No se registró ninguna rotura en este turno.</p>
          : (
            <>
              <i className="rtc-cinta" role="img"
                 aria-label={`${x.reportadas} reportadas, ${x.encontradas} encontradas, ${x.sinOrigen} sin origen`}>
                <b className="r" style={{ width: `${pct(x.reportadas, x.registros)}%` }} />
                <b className="e" style={{ width: `${pct(x.encontradas, x.registros)}%` }} />
                <b className="s" style={{ width: `${pct(x.sinOrigen, x.registros)}%` }} />
              </i>
              <p className="rtc-linea">
                <b>{nf.format(x.rotas)}</b> rotas{x.contaminadas > 0 && <> · <b>{nf.format(x.contaminadas)}</b> contaminadas</>}
                {x.anuladas > 0 && <> · {x.anuladas} anulada{x.anuladas === 1 ? "" : "s"}</>}
              </p>
              <p className="rtc-linea rtc-fase">
                A cobro <b>{x.aCobro}</b> · espera al OL <b>{x.esperanOL}</b> · en desacuerdo <b>{x.desacuerdo}</b>
                {x.noSeCobra > 0 && <> · no se cobra <b>{x.noSeCobra}</b></>}
              </p>
              <details className="rtc-corresponde">
                <summary>A qué corresponde</summary>
                <div className="rtc-cuatro">
                  {lista("Por causa", "qué la rompió", x.porCausa, x.registros)}
                  {lista("Por proceso", "dónde pasó", x.porProceso, x.registros)}
                  {lista("Por área", "en qué zona", x.porArea, x.registros)}
                  {lista("Quién registró", "en la app", x.porQuien, x.registros)}
                </div>
              </details>
            </>
          )}
      </article>
    );
  };

  const varios = c.dias > 1 || (c.desde !== c.hasta);

  return (
    <div className="rt-modal rtc-velo" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <section className="rtc" ref={raiz} role="dialog" aria-modal="true" aria-label={titulo}>

        {/* ─ LA BANDA NEGRA CON EL SELLO ─ */}
        <header className="rtc-cab">
          {/* El sello va tal cual, nunca recoloreado con el tema. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-b.png" alt="" width={34} height={34} />
          <div className="rtc-tit">
            <div className="rtc-ojo">ROTURAS EN SITIO · {ojo}</div>
            <h2>{titulo}</h2>
            <div className="rtc-f">
              {periodo.charAt(0).toUpperCase() + periodo.slice(1)} · foto de las {hhmm(armado)}
            </div>
          </div>
          <div className="rtc-der">
            <button type="button" className="rtc-bt pdf" onClick={bajarPdf} disabled={armando}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
              <span>{armando ? "Armando…" : "PDF"}</span>
            </button>
            <button type="button" className="rtc-bt" onClick={copiarTexto} title="Copiar el cierre como texto">
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

        {aviso && <p className={"rtc-aviso" + (aviso.mal ? " mal" : "")} role="status">{aviso.txt}</p>}

        {/* ─ LA FRANJA DEL ACENTO: lo que se pidió, en tres números ─ */}
        <div className="rtc-hero">
          <div className="rtc-total">
            <div className="rtc-k">REGISTROS</div>
            <div className="rtc-v">{t.registros}</div>
            <div className="rtc-s">
              {nf.format(t.rotas)} rotas{t.contaminadas > 0 && <> y {nf.format(t.contaminadas)} contaminadas</>}
            </div>
          </div>
          <div className="rtc-lado">
            <div className="rtc-mini">
              <div><div className="rtc-k">REPORTADAS</div><div className="rtc-v">{t.reportadas}</div>
                <div className="rtc-s2">por un OPM con su PIN</div></div>
              <div><div className="rtc-k">ENCONTRADAS</div><div className="rtc-v">{t.encontradas}</div>
                <div className="rtc-s2">sin dueño · van a cobro</div></div>
              {t.sinOrigen > 0 && (
                <div className="rtc-sin"><div className="rtc-k">SIN ORIGEN</div><div className="rtc-v">{t.sinOrigen}</div>
                  <div className="rtc-s2">hay que completarlas</div></div>
              )}
            </div>
            <i className="rtc-cinta grande" role="img"
               aria-label={`${t.reportadas} reportadas, ${t.encontradas} encontradas, ${t.sinOrigen} sin origen`}>
              <b className="r" style={{ width: `${pct(t.reportadas, t.registros)}%` }} />
              <b className="e" style={{ width: `${pct(t.encontradas, t.registros)}%` }} />
              <b className="s" style={{ width: `${pct(t.sinOrigen, t.registros)}%` }} />
            </i>
            <div className="rtc-ley">
              <span><i className="r" />reportadas</span>
              <span><i className="e" />encontradas</span>
              {t.sinOrigen > 0 && <span><i className="s" />sin origen</span>}
              <span className="fases">
                a cobro <b>{t.aCobro}</b> · espera al OL <b>{t.esperanOL}</b> · en desacuerdo <b>{t.desacuerdo}</b>
                {t.anuladas > 0 && <> · anuladas <b>{t.anuladas}</b></>}
              </span>
            </div>
          </div>
        </div>

        {filtros && (
          <p className="rtc-filtros"><b>FILTRADO</b>{filtros}</p>
        )}

        <div className="rtc-cuerpo">
          {/* ─ UN TURNO POR TARJETA ─ */}
          <div className="rtc-sec"><b>Por turno</b>
            <span>{c.turnos.length} {c.turnos.length === 1 ? "turno" : "turnos"} · el C abre el día</span></div>
          {c.turnos.length === 0
            ? <p className="rtc-nada">No hay roturas con estos filtros.</p>
            : <div className="rtc-turnos">{c.turnos.map(tarjeta)}</div>}

          {/* ─ A QUÉ CORRESPONDE, EN TODO LO FILTRADO ─ */}
          {t.registros > 0 && c.turnos.length > 1 && (
            <>
              <div className="rtc-sec"><b>A qué corresponde</b><span>todo lo del cierre, junto</span></div>
              <div className="rtc-cuatro grande">
                {lista("Por causa", "qué la rompió", t.porCausa, t.registros)}
                {lista("Por proceso", "dónde pasó", t.porProceso, t.registros)}
                {lista("Por área", "en qué zona", t.porArea, t.registros)}
                {lista("Quién registró", "en la app", t.porQuien, t.registros)}
              </div>
            </>
          )}

          {/* ─ LAS ROTURAS, UNA POR UNA ─ */}
          <div className="rtc-sec"><b>Las roturas</b>
            <span>{t.registros} registrada{t.registros === 1 ? "" : "s"}{t.anuladas > 0 && ` · ${t.anuladas} anulada${t.anuladas === 1 ? "" : "s"} aparte`}</span></div>
          {c.turnos.every((x) => x.filas.length === 0)
            ? <p className="rtc-nada">Nada que listar.</p>
            : (
              <div className="rtc-rueda">
                <table className="rtc-tabla">
                  <thead>
                    <tr>
                      {varios && <th>Día</th>}
                      <th>Turno</th><th>Hora</th><th>Rotura</th><th>Material</th>
                      <th className="n">Rotas</th><th className="n">Contam.</th>
                      <th>Causa</th><th>Proceso</th><th>Área</th><th>Origen</th><th>Quién</th><th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.turnos.flatMap((x) => x.filas).map((f) => (
                      <tr key={f.id} className={f.anulada ? "anulada" : ""}>
                        {varios && <td>{ddmm(f.dia)}</td>}
                        <td><span className="rtc-tl">{f.turno}</span></td>
                        <td>{f.hora}</td>
                        <td className="cod">{f.codigo}</td>
                        <td>{f.material_nombre}</td>
                        <td className="n">{nf.format(f.rotas)}</td>
                        <td className="n">{f.tipo === "eer" ? <span className="na">—</span> : (f.contaminadas || "—")}</td>
                        <td>{f.causa || <span className="rtc-sd">Sin dato</span>}</td>
                        <td>{f.proceso || <span className="rtc-sd">Sin dato</span>}</td>
                        <td>{f.area || <span className="rtc-sd">Sin dato</span>}</td>
                        <td><span className={"rtc-or " + f.origen}>{ORIGEN_TXT[f.origen]}</span>
                          {f.opm && <small>{f.opm}</small>}</td>
                        <td>{f.registro || "—"}</td>
                        <td><span className={"tb-eti " + f.clase}>{f.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          <p className="rtc-fin">
            Las anuladas no cuentan como registros. La foto es de las {hhmm(armado)}; si alguien
            registra algo después, el cierre cambia. El turno sale de la hora de registro (hora de
            Colombia): C 22:00–06:00 abre el día, A 06:00–14:00, B 14:00–22:00.
          </p>
        </div>
      </section>
    </div>
  );
}
