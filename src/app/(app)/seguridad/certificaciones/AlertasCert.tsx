"use client";

/**
 * SEGURIDAD · CERTIFICACIONES · ALERTAS — las licencias VACA que hay que exigir, en tres columnas:
 *   VENCIDAS · TRABAJANDO (exigir hoy)   VENCEN EN 7 DÍAS (programar la renovación)   VENCEN ESTE MES (pedir fecha)
 * Cada tarjeta dice a quién se le exige (Interventor ABI y Coordinador de la contratista). Copiar alertas (texto para
 * WhatsApp/correo) e Imagen (copiar, compartir, descargar), como los cierres de turno.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  URGENCIA, armarTablero, claveTexto, fechaCorta, textoAlertas, textoLista, PERMISOS,
  type Alerta, type ConfigCert, type PersonaCert, type Urgencia, type ValidacionHist,
} from "@/modulos/seguridad/certificaciones";
import { BotonDashboard, useFotosVaca } from "./FotosVaca";
import { FiltroCol, VACIAS } from "./FiltroCol";

const nf = new Intl.NumberFormat("es-CO");
const COLS: { k: Exclude<Urgencia, "vigente">; t: string; sub: string }[] = [
  { k: "vencida", t: "VENCIDAS · TRABAJANDO", sub: "exigir hoy" },
  { k: "critica", t: "VENCEN EN 7 DÍAS", sub: "programar ya la renovación" },
  { k: "aviso", t: "VENCEN ESTE MES", sub: "pedir fecha de renovación" },
];
const MOSTRAR = 12;
const capi = (x: string) => x.charAt(0) + x.slice(1).toLowerCase();
const CAMPOS_A: { id: string; t: string; de: (p: PersonaCert) => string[] }[] = [
  { id: "empresa", t: "Empresa", de: (p) => [p.empresa.trim().toUpperCase() || VACIAS] },
  { id: "interventor", t: "Interventor ABI", de: (p) => [p.interventor || VACIAS] },
  { id: "coordinador", t: "Coordinador", de: (p) => [p.coordinador || VACIAS] },
  { id: "nivel", t: "Nivel", de: (p) => [p.nivel ? capi(p.nivel) : VACIAS] },
  { id: "permisos", t: "Permisos", de: (p) => p.permisos.length ? p.permisos.map((k) => PERMISOS.find((x) => x.k === k)?.t ?? k) : [VACIAS] },
  { id: "grupo", t: "Grupo", de: (p) => [p.grupo || VACIAS] },
];

export function AlertasCert({ personas, hist, hoy, config, departamentos }: {
  personas: PersonaCert[]; hist: ValidacionHist[]; hoy: string; config: ConfigCert; departamentos: string[];
}) {
  const caja = useRef<HTMLDivElement>(null);
  /* FILTROS COMO LA BD: «＋ Filtrar por campo», varios valores a la vez, chips de lo que está puesto. */
  const [fCol, setFCol] = useState<Record<string, ReadonlySet<string>>>({});
  const [abierto, setAbierto] = useState<{ id: string; x: number; y: number } | null>(null);
  const [busca, setBusca] = useState("");
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState<string | null>(null);

  function pasa(p: PersonaCert, menos?: string) {
    for (const id in fCol) { if (id === menos) continue; const c = CAMPOS_A.find((x) => x.id === id); if (c && !c.de(p).some((v) => fCol[id].has(v))) return false }
    return true;
  }
  const valoresDe = (id: string) => {
    const c = CAMPOS_A.find((x) => x.id === id)!; const m = new Map<string, number>();
    for (const p of personas) { if (p.estado !== "ACTIVO" || !pasa(p, id)) continue; for (const v of new Set(c.de(p))) m.set(v, (m.get(v) ?? 0) + 1) }
    for (const v of fCol[id] ?? []) if (!m.has(v)) m.set(v, 0);
    return [...m].sort((a, b) => a[0] === VACIAS ? 1 : b[0] === VACIAS ? -1 : a[0].localeCompare(b[0], "es")).map(([v, n]) => ({ v, n }));
  };
  const abrirFiltro = (id: string, el: HTMLElement) => { const b = el.getBoundingClientRect(); setAbierto((x) => (x?.id === id ? null : { id, x: b.left, y: b.bottom + 4 })) };
  const ponerFiltro = (id: string, set: ReadonlySet<string> | null) => { setFCol((f) => { const n = { ...f }; if (set) n[id] = set; else delete n[id]; return n }); setAbierto(null) };
  const cerrarFiltro = useCallback(() => setAbierto(null), []);
  const filtradas = useMemo(() => personas.filter((p) =>
    pasa(p) &&
    (!busca || claveTexto(`${p.nombre} ${p.cedula}`).includes(claveTexto(busca)))), // eslint-disable-next-line react-hooks/exhaustive-deps
    [personas, fCol, busca]);
  const t = useMemo(() => armarTablero(filtradas, hoy, config), [filtradas, hoy, config]);
  const todas = useMemo(() => armarTablero(personas, hoy, config), [personas, hoy, config]);
  const deptos = departamentos.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(", ");

  /* LAS IMÁGENES: Dashboard y cada lista por separado (vencidas, 7 días, este mes), con los filtros puestos. */
  const foto = useFotosVaca({ personas: filtradas, hist, hoy, config, departamentos, caja });

  const DEPTO = departamentos.join(", ").replace("LOGISTICA", "LOGÍSTICA");
  /* Se copia cada lista sola (vencidas, 7 días, este mes) o las tres seguidas. */
  async function copiar(u?: "vencida" | "critica" | "aviso") {
    const txt = u ? textoLista(t, u, DEPTO) : textoAlertas(t, DEPTO);
    const nom = u ? COLS.find((c) => c.k === u)!.t.toLowerCase() : "las tres listas";
    try { await navigator.clipboard.writeText(txt); setAviso(`Copiado: ${nom}. Pégalo en WhatsApp o en el correo.`) }
    catch { setAviso("Este navegador no dejó copiar.") }
    window.setTimeout(() => setAviso(null), 3500);
  }

  const tarjeta = (a: Alerta) => {
    const U = URGENCIA[a.urgencia];
    return (
      <div key={a.cedula} className="sg-tj">
        <div className="sg-tj-d" style={{ color: a.urgencia === "vencida" ? "#2A2A2A" : U.texto }}>
          <b>{Math.abs(a.dias)}</b><span>{a.dias < 0 ? "días vencida" : a.dias === 0 ? "vence hoy" : a.dias === 1 ? "día" : "días"}</span>
        </div>
        <div className="sg-tj-i">
          <b title={a.nombre}>{a.nombre}</b>
          <small>{a.empresa} · CC {a.cedula}{a.nivel ? ` · ${a.nivel}` : ""}</small>
          {a.permisos.length > 0 && <div className="sg-pm">{a.permisos.map((k) => <i key={k}>{PERMISOS.find((x) => x.k === k)?.t ?? k}</i>)}</div>}
          <div className="sg-tj-r">{a.interventor || a.coordinador ? `${a.interventor ?? "Sin interventor"} → ${a.coordinador ?? "sin coordinador"}` : "Sin interventor ABI ni coordinador"}</div>
        </div>
        <div className="sg-tj-f">
          {fechaCorta(a.vencimiento)}
          {/* Ya la validaron: se registra la renovación de una, sin buscarla. */}
          <Link href={`/seguridad/certificaciones/personas?renovar=${a.cedula}`} className="sg-renovar" title={`Registrar la renovación de ${a.nombre}`}>Renovar →</Link>
        </div>
      </div>
    );
  };

  return (
    <div className="sg" ref={caja}>
      <header className="sg-cab">
        <div>
          <p className="sg-ojo">SEGURIDAD · CERTIFICACIONES</p>
          <h1>Licencias VACA <span className="sg-tag">{deptos}</span></h1>
          <p className="sg-sub">
            {nf.format(todas.activos)} personas trabajando · {todas.alertas.length} con alerta · aviso con {config.diasAviso} días de antelación
          </p>
        </div>
        <div className="sg-acc">
          <button type="button" className="sg-bt" onClick={() => copiar()} disabled={!t.alertas.length}>
            <svg viewBox="0 0 24 24" aria-hidden><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></svg>Copiar las 3 listas
          </button>
          <BotonDashboard foto={foto} />
        </div>
      </header>
      {aviso && <p className="sg-aviso" role="status">{aviso}</p>}

      <div className="sg-filtros">
        <input type="search" className="sg-buscar" placeholder="Buscar nombre o cédula" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar persona" />
        <select value="" onChange={(e) => { const id = e.target.value; if (id) abrirFiltro(id, e.currentTarget) }} aria-label="Filtrar por campo" className="sg-campo-sel">
          <option value="">＋ Filtrar por campo…</option>
          {CAMPOS_A.map((c) => <option key={c.id} value={c.id}>{c.t}{fCol[c.id] ? " ●" : ""}</option>)}
        </select>
        {Object.entries(fCol).map(([id, set]) => {
          const c = CAMPOS_A.find((x) => x.id === id); if (!c) return null;
          const vs = [...set];
          return (
            <span key={id} className="sg-fchip">
              <button type="button" onClick={(e) => abrirFiltro(id, e.currentTarget)} title="Cambiar este filtro">
                <b>{c.t}:</b> {vs.length === 0 ? "nada" : vs.length <= 2 ? vs.join(", ") : `${vs.slice(0, 2).join(", ")} +${vs.length - 2}`}
              </button>
              <button type="button" className="x" aria-label={`Quitar el filtro de ${c.t}`} onClick={() => ponerFiltro(id, null)}>×</button>
            </span>
          );
        })}
        {(Object.keys(fCol).length > 0 || busca) && <button type="button" className="sg-link" onClick={() => { setFCol({}); setBusca("") }}>Quitar filtros</button>}
      </div>
      {abierto && (
        <FiltroCol key={abierto.id} titulo={CAMPOS_A.find((x) => x.id === abierto.id)!.t} valores={valoresDe(abierto.id)} elegidos={fCol[abierto.id] ?? null}
                   pos={{ x: abierto.x, y: abierto.y }} aplicar={(set) => ponerFiltro(abierto.id, set)} cerrar={cerrarFiltro} />
      )}

      <div className="sg-kb">
        {COLS.map((c) => {
          const L = t.alertas.filter((a) => a.urgencia === c.k);
          const ver = abiertas[c.k] ? L : L.slice(0, MOSTRAR);
          return (
            <section key={c.k} className={"sg-kb-col " + c.k} aria-label={c.t}>
              <header>
                <span>{c.t}</span><b>{L.length}</b><small>{c.sub}</small>
                <button type="button" className="sg-kb-copiar" onClick={() => copiar(c.k)} disabled={!L.length} aria-label={`Copiar la lista: ${c.t}`}>
                  <svg viewBox="0 0 24 24" aria-hidden><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></svg>Copiar lista
                </button>
              </header>
              <div className="sg-kb-lista">
                {L.length === 0 && <div className="sg-kb-nada">Nadie en esta columna.</div>}
                {ver.map(tarjeta)}
                {L.length > MOSTRAR && (
                  <button type="button" className="sg-mas" onClick={() => setAbiertas((x) => ({ ...x, [c.k]: !x[c.k] }))}>
                    {abiertas[c.k] ? "Ver menos" : `Ver las ${L.length - MOSTRAR} restantes`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {foto.vista}
    </div>
  );
}
