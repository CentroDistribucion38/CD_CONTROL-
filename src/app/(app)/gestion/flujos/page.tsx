import "../../inventario/fefo.css";
import "../gestion.css";
import "../mapa.css";
import Link from "next/link";
import { leerGestion } from "@/modulos/gestion/datos";
import { armarFlujo, nodosDelDia } from "@/modulos/gestion/mapa";
import { diaCorto, hoyBogota, inicioPeriodo } from "@/modulos/gestion/semaforo";
import { Falta, Semaforo } from "../comunes";
import { BarraMapa } from "../mapa-comun";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · FLUJO DE PROCESOS — los procesos en su orden, cada uno con sus indicadores y cuántos cumplen,
 * y abajo qué PI de un proceso alimenta un KPI de otro. El orden es el del Maestro (campo «Orden» del proceso).
 */
export default async function FlujosPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const sp = await searchParams;
  const hoy = hoyBogota();
  const fecha = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) ? sp.fecha : hoy;
  const desde = [fecha, inicioPeriodo(fecha, "semana"), inicioPeriodo(fecha, "mes")].sort()[0];
  const datos = await leerGestion(desde, fecha);
  if (datos.error) return <Falta ojo="GESTIÓN · FLUJO DE PROCESOS" falta={datos.falta} error={datos.error} />;

  const nodos = nodosDelDia(datos.indicadores, datos.resultados, datos.disparadores, fecha);
  const { pasos, conexiones } = armarFlujo(datos.procesos, nodos);
  const pct = (a: number, t: number) => (t ? `${(a * 100) / t}%` : "0%");

  return (
    <div className="fe gs gm">
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · FLUJO DE PROCESOS</p>
          <h1>Flujo de procesos</h1>
          <p className="sub">
            Los procesos en su orden y cómo va cada uno el <b>{diaCorto(fecha)}</b>. El orden se cambia en <Link href="/gestion/maestro">Maestro</Link> (campo
            «Orden» del proceso).
          </p>
        </div>
      </section>

      <BarraMapa base="/gestion/flujos" fecha={fecha} hoy={hoy} proceso="todos" procesos={datos.procesos} conProceso={false} />

      {!pasos.length && (
        <p className="gs-vacio">Todavía no hay procesos con indicadores. Créalos en <Link href="/gestion/maestro">Maestro</Link> o en <Link href="/gestion/importar">Importar</Link>.</p>
      )}

      <div className="gm-flujo" role="list">
        {pasos.map((p, k) => (
          <div key={p.id} className="gm-pasoW" role="listitem">
            <article className={"gm-paso" + (p.no ? " mal" : p.cumplen && !p.sin ? " bien" : "")}>
              <header>
                {p.orden > 0 && <span className="gm-n">{p.orden}</span>}
                <h2>{p.nombre}</h2>
              </header>
              <div className="gm-cuenta"><b>{p.cumplen}</b><span>de {p.total} cumplen</span></div>
              <div className="gm-barra2" role="img" aria-label={`${p.cumplen} cumplen, ${p.no} no cumplen, ${p.sin} sin captura`}>
                <i className="v" style={{ width: pct(p.cumplen, p.total) }} />
                <i className="r" style={{ width: pct(p.no, p.total) }} />
              </div>
              <div className="gm-resumen">
                <span>No cumplen <b>{p.no}</b></span>
                <span>Sin captura <b>{p.sin}</b></span>
                {p.disparos > 0 && <span className="gm-alerta">Disparadores <b>{p.disparos}</b></span>}
              </div>
              <ul className="gm-lista">
                {p.nodos.map((n) => (
                  <li key={n.i.id} className={n.estado ?? "sin"}>
                    <i aria-hidden />
                    <span className="mono">{n.i.codigo}</span>
                    <span className="gm-ln">{n.i.nombre}</span>
                    {n.disparo && <em>!</em>}
                  </li>
                ))}
              </ul>
            </article>
            {k < pasos.length - 1 && p.orden > 0 && pasos[k + 1].orden > 0 && <span className="gm-flecha" aria-hidden>→</span>}
          </div>
        ))}
      </div>

      {conexiones.length > 0 && (
        <section className="gm-conex">
          <h2>Dónde un proceso depende de otro<small>{conexiones.length} conexión{conexiones.length === 1 ? "" : "es"}</small></h2>
          <p className="gm-nota">Un PI de un proceso explica el KPI de otro: si el PI no cumple, mira ahí primero.</p>
          <div className="gs-scroll">
            <table className="gs-t">
              <thead><tr><th>PI</th><th>Proceso</th><th /><th>Alimenta al KPI</th><th>Proceso</th><th>Hoy</th></tr></thead>
              <tbody>
                {conexiones.map((c) => (
                  <tr key={c.desde.id}>
                    <td><span className="mono">{c.desde.codigo}</span> {c.desde.nombre}</td>
                    <td>{c.desdeProceso}</td>
                    <td className="gm-flecha-t">→</td>
                    <td><span className="mono">{c.hacia.codigo}</span> {c.hacia.nombre}</td>
                    <td>{c.haciaProceso}</td>
                    <td><Semaforo estado={c.desdeEstado} corto /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
