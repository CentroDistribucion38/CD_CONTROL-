"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { duracion, horaCo, hoyCo, porHora, ranking, sumarDias, type FilaTiempo } from "@/modulos/inventario/tiempos";

/**
 * INVENTARIO · CONTEO · TIEMPOS
 *
 * Cada conteo: a qué hora se anotó el primer renglón, a qué hora se envió, cuánto
 * duró y cuánto de eso fue trabajo (sin las pausas de más de 30 minutos). Y el
 * ranking por persona: renglones por hora activa.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const diaTxt = (iso: string) => { const f = new Date(iso + "T12:00:00Z"); return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} ${MES[f.getUTCMonth()]}` };

type Rango = "hoy" | "ayer" | "7" | "30" | "otro";

export function Tiempos() {
  const supabase = useMemo(() => createClient(), []);
  const hoy = hoyCo();
  const [rango, setRango] = useState<Rango>("7");
  const [desde, setDesde] = useState(sumarDias(hoy, -6));
  const [hasta, setHasta] = useState(hoy);
  const [persona, setPersona] = useState("");
  const [filas, setFilas] = useState<FilaTiempo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [falta, setFalta] = useState(false);

  const escoger = (r: Rango) => {
    setRango(r);
    if (r === "hoy") { setDesde(hoy); setHasta(hoy) }
    if (r === "ayer") { const a = sumarDias(hoy, -1); setDesde(a); setHasta(a) }
    if (r === "7") { setDesde(sumarDias(hoy, -6)); setHasta(hoy) }
    if (r === "30") { setDesde(sumarDias(hoy, -29)); setHasta(hoy) }
  };

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: e } = await supabase.rpc("conteo_tiempos", { p_desde: desde, p_hasta: hasta });
    if (e) {
      if (/does not exist|schema cache|Could not find/i.test(e.message)) setFalta(true); else setError(e.message);
      setFilas([]); return;
    }
    setFalta(false);
    setFilas((data ?? []) as FilaTiempo[]);
  }, [supabase, desde, hasta]);
  useEffect(() => { void cargar() }, [cargar]);

  const personas = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of filas ?? []) if (f.responsable_id) m.set(f.responsable_id, f.persona ?? "Sin nombre");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [filas]);

  const vistas = useMemo(() => (filas ?? []).filter((f) => !persona || f.responsable_id === persona), [filas, persona]);
  const rank = useMemo(() => ranking(vistas), [vistas]);
  const hechos = vistas.filter((f) => f.enviado);
  const tot = hechos.reduce((a, f) => ({ r: a.r + f.renglones, act: a.act + Number(f.activo_min), bru: a.bru + Number(f.bruto_min) }), { r: 0, act: 0, bru: 0 });
  const rphTodos = porHora(tot.r, tot.act);

  if (falta) {
    return <section className="sin-tablas"><h2>Falta preparar los tiempos del conteo en Supabase</h2><p>Abre el SQL Editor y ejecuta <code>supabase/migraciones/2026-10-conteo-tiempos.sql</code>. Después recarga esta pantalla.</p></section>;
  }

  return (
    <section className="tp">
      <section className="tp-panel" aria-label="Filtros de tiempos">
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
          <span className="tp-lb">Persona</span>
          <div className="tp-sel">
            <select value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Persona">
              <option value="">Todas</option>
              {personas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </div>
          <p className="tp-res">Viendo <b>{desde === hasta ? diaTxt(desde) : `${diaTxt(desde)} – ${diaTxt(hasta)}`}</b> · {persona ? personas.find(([i]) => i === persona)?.[1] : "todas las personas"}</p>
        </div>
      </section>

      {error && <p className="tp-error" role="alert">{error}</p>}

      <div className="tp-kpis">
        <div className="tp-kpi grande"><span>Conteos enviados</span><b>{nf.format(hechos.length)}</b></div>
        <div className="tp-kpi"><span>Renglones</span><b>{nf.format(tot.r)}</b></div>
        <div className="tp-kpi"><span>Tiempo activo</span><b>{duracion(tot.act)}</b></div>
        <div className="tp-kpi"><span>Renglones por hora</span><b>{rphTodos == null ? "—" : nf1.format(rphTodos)}</b></div>
      </div>

      <h2 className="tp-h">Ranking <small>renglones por hora activa · solo conteos enviados</small></h2>
      {filas == null ? <p className="fe-vacio">Cargando…</p> : rank.length === 0 ? (
        <p className="fe-vacio">Todavía no hay conteos enviados en este periodo.</p>
      ) : (
        <div className="tp-tabla" tabIndex={0} aria-label="Ranking por persona">
          <table>
            <thead><tr><th className="tp-pos">#</th><th className="tp-izq">Persona</th><th>Conteos</th><th>Renglones</th><th>Tiempo activo</th><th>Pausas</th><th>Renglones / hora</th><th>Mejor conteo</th></tr></thead>
            <tbody>
              {rank.map((p, i) => (
                <tr key={p.id} className={i === 0 && p.rph != null ? "tp-primero" : undefined}>
                  <td className="tp-pos">{p.rph == null ? "·" : i + 1}</td>
                  <th scope="row" className="tp-izq">{p.persona}</th>
                  <td>{nf.format(p.conteos)}</td>
                  <td>{nf.format(p.renglones)}</td>
                  <td>{duracion(p.activo_min)}</td>
                  <td>{duracion(p.pausas_min)}</td>
                  <td className="tp-rph">{p.rph == null ? "—" : nf1.format(p.rph)}</td>
                  <td>{p.mejor == null ? "—" : `${nf1.format(p.mejor)} /h`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="tp-h">Conteo por conteo <small>inicio = primer renglón · fin = envío · activo = sin pausas de más de 30 min</small></h2>
      {filas == null ? null : vistas.length === 0 ? (
        <p className="fe-vacio">No hay conteos en este periodo.</p>
      ) : (
        <div className="tp-tabla" tabIndex={0} aria-label="Tiempos de cada conteo">
          <table>
            <thead><tr><th className="tp-izq">Día</th><th className="tp-izq">Persona</th><th>Inició</th><th>Finalizó</th><th>Duración</th><th>Activo</th><th>Pausas</th><th>Renglones</th><th>Módulos</th><th>Renglones / hora</th></tr></thead>
            <tbody>
              {vistas.map((f) => {
                const r = porHora(f.renglones, Number(f.activo_min));
                return (
                  <tr key={f.conteo_id}>
                    <td className="tp-izq">{diaTxt(f.dia)}</td>
                    <th scope="row" className="tp-izq">{f.persona ?? "Sin nombre"}</th>
                    <td>{horaCo(f.primer_renglon)}</td>
                    <td>{f.enviado ? horaCo(f.fin) : <span className="tp-curso">En curso</span>}</td>
                    <td>{f.enviado ? duracion(Number(f.bruto_min)) : "—"}</td>
                    <td>{duracion(Number(f.activo_min))}</td>
                    <td>{Number(f.pausas_min) > 0 ? duracion(Number(f.pausas_min)) : "·"}</td>
                    <td>{nf.format(f.renglones)}</td>
                    <td>{nf.format(f.ubicaciones)}</td>
                    <td className="tp-rph">{r == null ? "—" : nf1.format(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
