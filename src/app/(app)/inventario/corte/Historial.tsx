"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  analizar, armarPar, conteoDelPar, envaseDelRenglon, diaColombia, duracion,
  type Analisis, type ConteoRef, type Corte as CorteT, type LineaConteo,
} from "@/modulos/inventario/corte";
import { ParDiferencia, tablasDelPar } from "./Diferencia";
import type { LineaC, MatC, UbiC } from "./Corte";

/* ===================================================================
   EL HISTORIAL DE LA DIFERENCIA

   Cada par de cortes (inicial + final) que se guarda queda para siempre; esto
   es la forma de consultarlos cuando ya son muchos. Cada par es una FILA
   resumida —fecha, cuántas cajas pasaron por la depa, una pastilla por línea
   con su estado y el estado del par— y al tocarla se abre la tarjeta completa
   de siempre. El más reciente llega abierto; los demás, cerrados.

   Filtros: fecha (del inicial), línea y estado. Con una línea escogida el par
   enseña solo la tarjeta de esa línea, y su estado es el de esa línea.
   =================================================================== */

const POR_PAGINA = 15;
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(", ", " ");

type Estado = "cuadra" | "no_cuadra" | "incompleto";
const TXT: Record<Estado, string> = { cuadra: "CUADRA", no_cuadra: "NO CUADRA", incompleto: "INCOMPLETO" };
/** El peor de varios estados: si uno no cuadra, el par no cuadra; si falta algo, está incompleto. */
const peor = (l: Estado[]): Estado => (l.includes("no_cuadra") ? "no_cuadra" : l.includes("incompleto") ? "incompleto" : "cuadra");

type Par = { ini: CorteT; fin: CorteT; a: Analisis; dia: string; porDefecto: string | null };

export function Historial({ cortes, lineas, ubicaciones, materiales, conteos, lineasConteo, manda, borrar, ocupado, onBorrar, onConfirmar, verProceso }: {
  cortes: CorteT[]; lineas: LineaC[]; ubicaciones: UbiC[]; materiales: MatC[];
  conteos: ConteoRef[]; lineasConteo: LineaConteo[];
  manda: boolean; borrar: string | null; ocupado: boolean;
  onBorrar: (id: string | null) => void; onConfirmar: (id: string) => void;
  /** Quien administra: el ojito de cada corte, que abre su proceso (inicial → final → cruce). */
  verProceso?: (inicialId: string) => ReactNode;
}) {
  const [ojos, setOjos] = useState<Record<string, boolean>>({});
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [linea, setLinea] = useState("");
  const [estado, setEstado] = useState<"" | Estado>("");
  const [escogidos, setEscogidos] = useState<Record<string, string>>({});
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  const mat = useMemo(() => new Map(materiales.map((m) => [m.id, m])), [materiales]);
  const ubi = useMemo(() => new Map(ubicaciones.map((u) => [u.id, u])), [ubicaciones]);
  const nombreUbi = useMemo(() => (id: string) => {
    const u = ubi.get(id);
    return u ? `${u.calle} · ${u.modulo} · ${u.lado ?? "—"}` : "—";
  }, [ubi]);
  const porConteo = useMemo(() => {
    const m = new Map<string, LineaConteo[]>();
    for (const l of lineasConteo) { const x = m.get(l.conteo_id); if (x) x.push(l); else m.set(l.conteo_id, [l]); }
    return m;
  }, [lineasConteo]);

  /* Los pares cerrados, el más reciente primero, con su análisis (que no depende del conteo). */
  const pares = useMemo<Par[]>(() => {
    const finalDe = new Map(cortes.filter((c) => c.tipo === "final").map((c) => [c.inicial_id!, c]));
    const porEstiba = (id: string | null) => (id ? mat.get(id)?.cajas_por_estiba ?? null : null);
    return cortes.filter((c) => c.tipo === "inicial" && finalDe.has(c.id)).map((ini) => {
      const fin = finalDe.get(ini.id)!;
      return { ini, fin, a: analizar(ini, fin, porEstiba, nombreUbi), dia: diaColombia(ini.cortado_en), porDefecto: conteoDelPar(ini, fin, conteos) };
    });
  }, [cortes, mat, nombreUbi, conteos]);

  /* El estado de cada par contra SU conteo (el escogido, o el que toca por defecto). */
  const ctx = useMemo(() => ({
    conteos, lineasPorConteo: porConteo,
    envaseDe: (r: { envase_id: string | null; material_id: string | null }) => envaseDelRenglon(r.envase_id, r.material_id, materiales).m?.id ?? null,
  }), [conteos, porConteo, materiales]);
  const filas = useMemo(() => pares.map((p) => {
    const conteoId = escogidos[p.ini.id] ?? p.porDefecto;
    const porEstiba = (id: string | null) => (id ? mat.get(id)?.cajas_por_estiba ?? null : null);
    /* Si los módulos salen del FEFO, el análisis depende del recorrido escogido. */
    const par = armarPar(p.ini, p.fin, porEstiba, nombreUbi, ctx, conteoId);
    const tablas = tablasDelPar(par.a, conteoId, porConteo, nombreUbi);
    return { p, par, conteoId, tablas };
  }), [pares, escogidos, porConteo, nombreUbi, ctx, mat]);

  const estadoDe = (f: (typeof filas)[number]): Estado => {
    const t = linea ? f.tablas.filter((x) => x.linea === linea) : f.tablas;
    return t.length === 0 ? "incompleto" : peor(t.map((x) => x.estado));
  };

  const visibles = filas.filter((f) =>
    (!desde || f.p.dia >= desde) && (!hasta || f.p.dia <= hasta) &&
    (!linea || f.tablas.some((t) => t.linea === linea)) &&
    (!estado || estadoDe(f) === estado));
  const cuenta = (e: Estado) => visibles.filter((f) => estadoDe(f) === e).length;
  const hayFiltros = Boolean(desde || hasta || linea || estado);
  const quitar = () => { setDesde(""); setHasta(""); setLinea(""); setEstado(""); setMostrar(POR_PAGINA) };
  const lineasDelHistorial = lineas.filter((l) => pares.some((p) => p.a.filas.some((f) => f.linea === l.clave)));
  const f1 = (fn: () => void) => () => { fn(); setMostrar(POR_PAGINA) };

  return (
    <div className="dq-hist">
      {pares.length > 1 && (
        <form className="dq-filtros" role="search" aria-label="Filtrar el historial" onSubmit={(e) => e.preventDefault()}>
          <label><span className="dq-eti">Desde</span><input type="date" value={desde} max={hasta || undefined} onChange={(e) => f1(() => setDesde(e.target.value))()} /></label>
          <label><span className="dq-eti">Hasta</span><input type="date" value={hasta} min={desde || undefined} onChange={(e) => f1(() => setHasta(e.target.value))()} /></label>
          <label>
            <span className="dq-eti">Línea</span>
            <select value={linea} onChange={(e) => f1(() => setLinea(e.target.value))()}>
              <option value="">Todas</option>
              {lineasDelHistorial.map((l) => <option key={l.clave} value={l.clave}>{l.nombre}</option>)}
            </select>
          </label>
          <div className="dq-estados" role="group" aria-label="Estado">
            {([["", "Todos"], ["no_cuadra", "No cuadra"], ["incompleto", "Incompleto"], ["cuadra", "Cuadra"]] as const).map(([v, t]) => (
              <button key={v} type="button" className={"dq-est " + v} aria-pressed={estado === v} onClick={f1(() => setEstado(v))}>{t}</button>
            ))}
          </div>
          {hayFiltros && <button type="button" className="btn plano" onClick={quitar}>Quitar filtros</button>}
        </form>
      )}

      {pares.length > 1 && (
        <p className="dq-resumen" role="status">
          <b>{visibles.length}</b> {visibles.length === 1 ? "par" : "pares"}
          {hayFiltros ? ` de ${pares.length}` : ""}
          {visibles.length > 0 && <> · {cuenta("cuadra")} cuadran · {cuenta("no_cuadra")} no cuadran · {cuenta("incompleto")} incompletos</>}
        </p>
      )}

      {visibles.length === 0 ? (
        <p className="fe-vacio">Ningún par con esos filtros. <button type="button" className="btn plano" onClick={quitar}>Quitar filtros</button></p>
      ) : (
        <div className="fe-lista">
          {visibles.slice(0, mostrar).map((f) => {
            const { p } = f;
            const abierto = tocados[p.ini.id] ?? false; /* CERRADO al entrar: se abre solo el que se toca */
            const est = estadoDe(f);
            const pastillas = f.tablas.filter((t) => !linea || t.linea === linea);
            return (
              <article key={p.ini.id} className="fe-fila cl-par dq">
                <div className="dq-filaw">
                <button type="button" className="dq-fila" aria-expanded={abierto}
                        onClick={() => setTocados((x) => ({ ...x, [p.ini.id]: !abierto }))}>
                  <span className="dq-fila-t">
                    <b>{hora(p.ini.cortado_en)} → {hora(p.fin.cortado_en)}</b>
                    <small>{duracion(p.a.horas)} · {nf.format(p.a.totalPasadas)} cajas por la depa</small>
                  </span>
                  <span className="dq-minis" aria-label="Estado por línea">
                    {pastillas.map((t) => <i key={t.linea} className={"dq-mini " + t.estado} title={`${t.linea}: ${TXT[t.estado]}`}>{t.linea}</i>)}
                  </span>
                  <span className={"dq-chip " + est}>{TXT[est]}</span>
                  <span className="dq-caret" aria-hidden>{abierto ? "▴" : "▾"}</span>
                </button>
                {verProceso && (
                  <button type="button" className="dq-ojo" aria-pressed={ojos[p.ini.id] ?? false}
                          aria-label={ojos[p.ini.id] ? "Ocultar el proceso de este corte" : "Ver el proceso de este corte"}
                          title={ojos[p.ini.id] ? "Ocultar el proceso de este corte" : "Ver el proceso de este corte"}
                          onClick={() => setOjos((x) => ({ ...x, [p.ini.id]: !x[p.ini.id] }))}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                )}
                </div>
                {verProceso && ojos[p.ini.id] && <div className="dq-proceso">{verProceso(p.ini.id)}</div>}
                {abierto && (
                  <ParDiferencia a={f.par.a} ini={f.par.ini} fin={f.par.fin} conteos={conteos} lineasPorConteo={porConteo}
                    conteoId={f.conteoId} onConteo={(id) => setEscogidos((x) => ({ ...x, [p.ini.id]: id }))}
                    soloLinea={linea || undefined} sinTitulo lineas={lineas} mat={mat} nombreUbi={nombreUbi}
                    manda={manda} borrar={borrar} ocupado={ocupado} onBorrar={onBorrar} onConfirmar={onConfirmar} />
                )}
              </article>
            );
          })}
          {visibles.length > mostrar && (
            <button type="button" className="btn plano dq-mas" onClick={() => setMostrar((m) => m + POR_PAGINA)}>
              Ver más ({visibles.length - mostrar})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
