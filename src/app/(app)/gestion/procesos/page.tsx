import "../../inventario/fefo.css";
import "../gestion.css";
import "../mapa.css";
import "../referencia.css";
import Link from "next/link";
import { CRITICIDAD } from "@/modulos/gestion/referencia/criticidad-datos";
import { DIAGRAMAS } from "@/modulos/gestion/referencia/diagramas-datos";
import { Diagrama } from "../Diagrama";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · MAPA DE PROCESOS — el «Mapa de Procesos de Logística» del Excel: el mapeo N1 macroproceso · N2 procesos · N3 actividades,
 * los cuatro flujos con sus PI y documentos críticos, y la matriz de criticidad (qué actividades y tareas son críticas).
 * Es de consulta: los datos salen de src/modulos/gestion/referencia (generados desde el Excel).
 */
const VISTAS = [
  { id: "mapa", nombre: "Mapa N1 · N2 · N3", diag: "mapa" },
  { id: "envase", nombre: "Clasificación de envase", diag: "envase" },
  { id: "vehiculos", nombre: "Cargue y descargue de vehículos", diag: "vehiculos" },
  { id: "estibas", nombre: "Reparación de estibas", diag: "estibas" },
  { id: "contenedor", nombre: "Cargue de contenedor", diag: "contenedor" },
  { id: "criticidad", nombre: "Criticidad", diag: "" },
] as const;

const TEXTO: Record<string, string> = {
  mapa: "Los macroprocesos arriba (N1), los procesos en el medio (N2) y las actividades de cada uno abajo (N3). Cada figura es una actividad, una entrada o una salida.",
  envase: "Desde que llega el envase a la DEPA hasta que queda clasificado para las líneas: con sus decisiones, los PI de cada paso y los documentos críticos.",
  vehiculos: "El ciclo del vehículo: parqueo, descarpe, verificación, descargue, cargue y carpe, con los PI y los documentos que se exigen.",
  estibas: "Recibo, clasificación y reparación de estibas, hasta dejarlas listas en el área.",
  contenedor: "Del ingreso del contenedor a la báscula hasta su salida, con la validación de HONOR y los documentos del cargue.",
};

const COLS = ["Quejas del cliente", "Calidad", "Costo", "Capacidad de entrega", "Riesgo de seguridad", "Tiempo / dificultad"];
const LIMITE = 22;

export default async function ProcesosPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const sp = await searchParams;
  const vista = VISTAS.find((v) => v.id === sp.vista) ?? VISTAS[0];
  const d = vista.diag ? DIAGRAMAS.find((x) => x.id === vista.diag) : undefined;

  const criticas = CRITICIDAD.flatMap((c) => c.bloques.flatMap((b) => b.filas.filter((f) => f.c).map((f) => ({ nivel: c.id.toUpperCase().replace("N", "Nivel "), proceso: b.proceso, ...f }))));
  const totalActs = CRITICIDAD.reduce((s, c) => s + c.bloques.reduce((x, b) => x + b.filas.length, 0), 0);

  return (
    <div className="fe gs gm rf">
      <section className="cabeza">
        <div>
          <p className="ojo">GESTIÓN · MAPA DE PROCESOS</p>
          <h1>Mapa de procesos de Logística</h1>
          <p className="sub">
            El mapeo de procesos, los flujos con sus PI y documentos críticos, y la matriz que dice qué actividades son críticas.
            Viene del Excel «Mapa de Procesos Logística». Los indicadores de cada proceso están en <Link href="/gestion/flujos">Flujo de procesos</Link>.
          </p>
        </div>
      </section>

      <nav className="rf-tabs" aria-label="Vista">
        {VISTAS.map((v) => <Link key={v.id} href={`/gestion/procesos?vista=${v.id}`} className={v.id === vista.id ? "on" : ""}>{v.nombre}</Link>)}
      </nav>

      {d && (
        <section className="rf-sec">
          <p className="rf-nota">{TEXTO[vista.id]}</p>
          <Diagrama d={d} />
        </section>
      )}

      {vista.id === "criticidad" && (
        <>
          <div className="rf-resumen">
            <div className="rf-cif"><span>Actividades y tareas calificadas</span><b>{totalActs}</b></div>
            <div className="rf-cif mal"><span>Críticas</span><b>{criticas.length}</b></div>
            <div className="rf-cif"><span>Se considera crítica con</span><b>{LIMITE}+</b></div>
          </div>
          <p className="rf-nota">
            Cada actividad se califica de 1 a 5 en seis criterios (5 = impacto alto o difícil de hacer · 3 = medio · 1 = bajo o fácil). La suma es el total;
            desde {LIMITE} puntos la actividad es <b>crítica</b> y entra a «PI tareas críticas» del flujo.
          </p>
          <section className="rf-sec">
            <h2>Las críticas <small>{criticas.length}</small></h2>
            <div className="rf-criticas">
              {criticas.map((c, i) => <span key={i}>{c.a}<small>{c.proceso} · {c.nivel}</small><b>{c.t}</b></span>)}
            </div>
          </section>
          {CRITICIDAD.map((c) => (
            <section key={c.id} className="rf-sec">
              <h2>{c.titulo}</h2>
              {c.bloques.map((b, i) => {
                const n = b.filas.filter((f) => f.c).length;
                return (
                  <div key={i} className="rf-bloque">
                    <h3>{b.proceso}<small>{n ? `${n} crítica${n > 1 ? "s" : ""} de ${b.filas.length}` : `${b.filas.length} actividades · ninguna crítica`}</small></h3>
                    <div className="rf-scroll">
                      <table className="rf-crit">
                        <thead>
                          <tr><th className="a">Actividad</th>{COLS.map((x) => <th key={x}>{x}</th>)}<th>Total</th><th>¿Crítica?</th></tr>
                        </thead>
                        <tbody>
                          {b.filas.map((f, k) => (
                            <tr key={k} className={f.c ? "c" : ""}>
                              <td className="a">{f.a}</td>
                              {f.p.map((v, j) => <td key={j} className={"p" + v}>{v}</td>)}
                              <td className="t">{f.t}</td>
                              <td className="s">{f.c ? <span>Crítica</span> : <em>No</em>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
