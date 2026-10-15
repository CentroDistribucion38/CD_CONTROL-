import "../../inventario/fefo.css";
import "../gestion.css";
import "../mapa.css";
import Link from "next/link";
import { leerGestion } from "@/modulos/gestion/datos";
import { armarArbol, nodosDelDia } from "@/modulos/gestion/mapa";
import { diaCorto, hoyBogota, inicioPeriodo } from "@/modulos/gestion/semaforo";
import { Falta } from "../comunes";
import { BarraMapa } from "../mapa-comun";
import { Ficha } from "../mapa-ficha";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · ÁRBOL DE KPI — cada KPI con los PI que lo explican, por proceso, con el color de cumple / no cumple del día.
 * Se arma solo con lo que está en Maestro (el «KPI padre» de cada PI). No se digita nada aquí.
 */
export default async function ArbolPage({ searchParams }: { searchParams: Promise<{ fecha?: string; proceso?: string }> }) {
  const sp = await searchParams;
  const hoy = hoyBogota();
  const fecha = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) ? sp.fecha : hoy;
  const proceso = sp.proceso || "todos";
  const desde = [fecha, inicioPeriodo(fecha, "semana"), inicioPeriodo(fecha, "mes")].sort()[0];
  const datos = await leerGestion(desde, fecha);
  if (datos.error) return <Falta ojo="GESTIÓN · ÁRBOL DE KPI" falta={datos.falta} error={datos.error} />;

  const nodos = nodosDelDia(datos.indicadores, datos.resultados, datos.disparadores, fecha);
  const todos = armarArbol(datos.procesos, nodos);
  const grupos = proceso === "todos" ? todos : todos.filter((g) => g.id === proceso);
  const planos = grupos.flatMap((g) => g.raices.flatMap((r) => [r, ...r.hijos]));
  const cumplen = planos.filter((n) => n.estado === "verde").length;
  const no = planos.filter((n) => n.estado === "rojo").length;
  const sin = planos.filter((n) => n.estado == null).length;
  const nombreProc = new Map(datos.procesos.map((p) => [p.id, p.nombre]));

  return (
    <div className="fe gs gm">
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · ÁRBOL DE KPI</p>
          <h1>Árbol de KPI</h1>
          <p className="sub">
            Cada KPI con los PI que lo explican, por proceso, y cómo van el <b>{diaCorto(fecha)}</b>. El árbol sale solo del
            «KPI padre» que se pone en <Link href="/gestion/maestro">Maestro</Link>; si un PI no aparece bajo su KPI, revisa ese campo.
          </p>
        </div>
      </section>

      <BarraMapa base="/gestion/arbol" fecha={fecha} hoy={hoy} proceso={proceso} procesos={datos.procesos} conProceso />

      <div className="gs-cifras c4">
        <div className="gs-cif"><span>Indicadores</span><b>{planos.length}</b></div>
        <div className="gs-cif bien"><span>Cumplen</span><b>{cumplen}</b></div>
        <div className="gs-cif mal"><span>No cumplen</span><b>{no}</b></div>
        <div className="gs-cif"><span>Sin captura</span><b>{sin}</b></div>
      </div>

      {!grupos.length && (
        <p className="gs-vacio">
          {datos.indicadores.some((i) => i.activo)
            ? "Ningún indicador cumple ese filtro."
            : <>Todavía no hay indicadores. Créalos en <Link href="/gestion/maestro">Maestro</Link> o cárgalos masivamente en <Link href="/gestion/importar">Importar</Link>.</>}
        </p>
      )}

      {grupos.map((g) => (
        <section key={g.id} className="gm-proceso">
          <h2>{g.nombre}<small>{g.raices.length} KPI · {g.raices.reduce((s, r) => s + r.hijos.length, 0)} PI</small></h2>
          <div className="gm-ramas">
            {g.raices.map((r) => (
              <div key={r.i.id} className="gm-rama">
                <Ficha n={r} />
                {r.hijos.length > 0 && (
                  <ul className="gm-pis">
                    {r.hijos.map((h) => (
                      <li key={h.i.id}>
                        <Ficha n={h} proceso={h.i.proceso_id && h.i.proceso_id !== r.i.proceso_id ? nombreProc.get(h.i.proceso_id) : undefined} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
