"use client";

/**
 * EL CIERRE POR TURNO Y POR DÍA DE LA REVISIÓN AI — como el de Traspasos.
 *
 * «Informe AI, cierre por turno como traspasos: por turno y por día, la misma lógica, mejor diseño.»
 *
 * Los tres anillos (C, A y B, en el orden de la bodega: C abre el día) y debajo —o al lado, en pantalla ancha— el botón
 * grande del día. Los mismos dos gestos de Traspasos:
 *   TOCAR EL ANILLO ..... abre el cierre de ESE turno.
 *   TOCAR LA CASILLA .... lo suma a una selección; con uno o más marcados sale una barra que abre el cierre de todos juntos.
 *
 * EN EL CENTRO DEL ANILLO VA EL %AI del turno (mal estado ÷ revisadas, sumadas). EL ARCO es cuánto de lo revisado en el día
 * se revisó en ese turno: un %AI alto con un arco corto es poca muestra. El día se escoge arriba (‹ › o el calendario).
 * Lee lo mismo que el cierre (`cierreAiDia`): el número del anillo y el de la ficha no pueden ser distintos.
 */
import { useEffect, useMemo, useState } from "react";
import type { Revision } from "@/modulos/sider/ai";
import { armarCierreAi } from "@/modulos/sider/cierre-ai";
import { cierreAiDia } from "./actions";
import { DiaCierre } from "./DiaCierre";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pc = (x: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x * 100) + " %";
const TURNOS = [["T3", "C", "22:00 – 06:00"], ["T1", "A", "06:00 – 14:00"], ["T2", "B", "14:00 – 22:00"]] as const;
const hoyCo = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
const mover = (f: string, n: number) => { const x = new Date(f + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) };
const diaLargo = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

export function TurnosAi({ ultima, tipo, abrir }: {
  /** El último día con revisiones: el tablero arranca ahí, no en un hoy vacío. */
  ultima: string | null;
  tipo: "ai" | "sorting" | "";
  /** Abre la ficha del cierre con ese día y esos turnos (los tres = el día). */
  abrir: (dia: string, turnos: string[]) => void;
}) {
  const hoy = hoyCo();
  const [dia, setDia] = useState(ultima && ultima <= hoy ? ultima : hoy);
  const [revs, setRevs] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    setRevs(null); setError(null);
    cierreAiDia(dia, ["T3", "T1", "T2"], tipo).then((r) => {
      if (!vivo) return;
      if ("error" in r && r.error) { setError(r.error); return }
      setRevs(r.revisiones ?? []);
    }).catch(() => { if (vivo) setError("No se pudo leer el día. Intenta otra vez.") });
    return () => { vivo = false };
  }, [dia, tipo]);

  const dia_ = useMemo(() => (revs ? armarCierreAi(revs, []) : null), [revs]);
  const anillos = useMemo(() => TURNOS.map(([k, l, h]) => {
    const c = armarCierreAi((revs ?? []).filter((r) => r.turno === k), []);
    return { k, l, h, c, parte: dia_ && dia_.revisadas > 0 ? c.revisadas / dia_.revisadas : 0 };
  }), [revs, dia_]);

  const sel: string[] = TURNOS.map(([k]) => k as string).filter((k) => marcados.includes(k));
  const letras = (l: string[]) => { const x = l.map((k) => TURNOS.find(([t]) => t === k)![1]); return x.length > 1 ? x.slice(0, -1).join(", ") + " y " + x[x.length - 1] : x[0] ?? "" };
  const cSel = useMemo(() => armarCierreAi((revs ?? []).filter((r) => sel.includes(r.turno)), []), [revs, sel.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const marcar = (k: string) => setMarcados((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]));
  const cambiarDia = (f: string) => { setDia(f); setMarcados([]) };

  const R = 24, C = 2 * Math.PI * R;
  const cargando = revs == null && !error;
  const largo = diaLargo(dia);

  return (
    <section className="ia-turnos" aria-label="Cierre por turno y por día">
      <header className="iat-cab">
        <p className="iat-tit"><span className="iat-ojo">CIERRE POR TURNO</span><b>{largo.charAt(0).toUpperCase() + largo.slice(1)}</b></p>
        <div className="iat-dia">
          <button type="button" className="iat-flecha" onClick={() => cambiarDia(mover(dia, -1))} aria-label="Día anterior">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <DiaCierre valor={dia} hoy={hoy} alCambiar={cambiarDia} />
          <button type="button" className="iat-flecha" onClick={() => cambiarDia(mover(dia, 1))} disabled={dia >= hoy} aria-label="Día siguiente">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </header>

      {error && <p className="iat-error">{error}</p>}

      <div className="iat-cuerpo">
        {anillos.map(({ k, l, h, c, parte }) => {
          const on = marcados.includes(k), hay = c.revisiones > 0;
          return (
            <div className={"iat-turno" + (on ? " iat-on" : "") + (hay ? "" : " iat-sin")} key={k}>
              <button type="button" className="iat-marca" aria-pressed={on} onClick={() => marcar(k)} disabled={cargando}
                      aria-label={`${on ? "Quitar" : "Sumar"} el turno ${l} a la selección`}>
                <i aria-hidden>{on && <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</i>
              </button>
              <button type="button" className="iat-abrir" onClick={() => abrir(dia, [k])} disabled={cargando} aria-label={`Ver el cierre del turno ${l}`}>
                <svg className="iat-aro" viewBox="0 0 60 60" aria-hidden>
                  <circle cx="30" cy="30" r={R} className="iat-pista" />
                  {hay && <circle cx="30" cy="30" r={R} className="iat-arco" strokeDasharray={`${Math.max(0.02, parte) * C} ${C}`} transform="rotate(-90 30 30)" />}
                  <text x="30" y="35" textAnchor="middle" className="iat-l">{l}</text>
                </svg>
                <span className="iat-txt">
                  <span className="iat-pc">{cargando ? "…" : hay ? pc(c.indice) : "—"}</span>
                  <span className="iat-nom">Turno {l} <small>{h}</small></span>
                  <span className="iat-det">{cargando ? "Leyendo…" : hay ? <>{c.revisiones} rev<span className="iat-mas"> · {nf.format(c.revisadas)} und · {Math.round(parte * 100)} % del día</span></> : "Sin revisiones"}</span>
                </span>
                <svg className="iat-ir" viewBox="0 0 24 24" aria-hidden><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          );
        })}

        <button type="button" className="iat-diabt" onClick={() => abrir(dia, ["T3", "T1", "T2"])} disabled={cargando}>
          <span className="iat-txt">
            <span className="iat-q">Cierre del día</span>
            <span className="iat-pc">{dia_ && dia_.revisiones ? pc(dia_.indice) : "—"}</span>
            <span className="iat-det">{cargando ? "Leyendo…" : dia_ && dia_.revisiones ? `${dia_.revisiones} rev · ${dia_.vh} VH · ${nf.format(dia_.revisadas)} und` : "Sin revisiones"}</span>
          </span>
          <svg className="iat-ir" viewBox="0 0 24 24" aria-hidden><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></svg>
        </button>
      </div>

      {/* LO QUE SE ESCOGIÓ, Y CÓMO VA: sale solo con algo marcado. */}
      {sel.length > 0 && (
        <div className="iat-sel">
          <span className="iat-selq">Turno{sel.length === 1 ? "" : "s"} <b>{letras(sel)}</b><em>{pc(cSel.indice)} AI · {cSel.revisiones} rev · {nf.format(cSel.revisadas)} und</em></span>
          <button type="button" className="iat-limpiar" onClick={() => setMarcados([])}>Quitar</button>
          <button type="button" className="iat-ver" onClick={() => abrir(dia, sel)}>Ver el cierre de {sel.length === 1 ? "este turno" : letras(sel)}</button>
        </div>
      )}
    </section>
  );
}
