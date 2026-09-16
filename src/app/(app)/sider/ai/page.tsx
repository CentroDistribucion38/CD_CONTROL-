import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { pendientesAi, revisionesAi, maestrosAi } from "@/modulos/sider/ai";
import "../sider.css";
import "./ai.css";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const dia = (f: string) =>
  new Date(Date.parse(f + "T12:00:00")).toLocaleDateString("es-CO",
    { day: "numeric", month: "short", year: "numeric" });

/**
 * REVISIÓN AI — la lista.
 *
 * DOS COSAS EN UNA PANTALLA, y en este orden: primero lo que hay que
 * hacer, después lo que ya se hizo. Un camión marcado que nadie revisó
 * es un cobro que se pierde, así que los pendientes van arriba, no
 * escondidos en una pestaña.
 */
export default async function AiPage() {
  const [permisos, pen, rev, m] = await Promise.all([
    misPermisos(), pendientesAi(), revisionesAi(), maestrosAi(),
  ]);
  const puedeEditar = permisos.puedeEditar("/sider/transito");

  if (pen.falta || m.falta) {
    return (
      <div className="sd ai">
        <section className="sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta <code>supabase/modulos/sider-ai.sql</code>. Ese
            archivo crea las tablas, siembra los catorce tipos de defecto, los dieciocho
            envases con su litraje y los socios. Se puede correr varias veces sin romper
            nada.
          </p>
        </section>
      </div>
    );
  }

  const noAbonoTotal = rev.revisiones.reduce((a, r) => a + Number(r.no_abono), 0);

  return (
    <div className="sd ai">
      <section className="ai-cabeza">
        <div>
          <p className="ai-ojo">SIDER · REVISIÓN AI DEL ENVASE</p>
          <h1>Revisión AI</h1>
          <p className="ai-sub">
            A los vehículos que marca el administrador en Tránsito se les revisa una
            muestra del envase que traen. De los defectos sale el <b>índice de cobro</b>,
            y de ahí las unidades que no se le abonan al socio.
          </p>
        </div>
        <div className="ai-panel">
          <div className="ai-corte" aria-hidden />
          <div className="ai-rot">PENDIENTES</div>
          <div className="ai-num">{pen.pendientes.length}</div>
          <div className="ai-pie-p">
            {pen.pendientes.length === 0
              ? "ningún camión esperando revisión"
              : `camión${pen.pendientes.length === 1 ? "" : "es"} llegado${pen.pendientes.length === 1 ? "" : "s"} y sin revisar`}
          </div>
        </div>
      </section>

      {/* 1 ─ LO QUE HAY QUE HACER */}
      <section className="ai-caja">
        <div className="ai-cab">
          <h2>Esperando revisión</h2>
          <p>
            Los marcó un administrador, ya llegaron, y nadie ha llenado el formulario.
            Mientras estén aquí, ese cobro no existe.
          </p>
        </div>

        {pen.pendientes.length === 0 ? (
          <div className="ai-vacio">
            No hay nada pendiente. Para pedir una revisión, entra a{" "}
            <Link href="/sider/transito">Tránsito</Link> y marca el vehículo.
          </div>
        ) : (
          <ul className="ai-lista">
            {pen.pendientes.map((p) => (
              <li key={p.viaje_id}>
                <div className="ai-l-que">
                  <b>{p.placa}</b>
                  <span>{p.planta} · {p.sku} · {dia(p.fecha)}</span>
                  {p.ai_motivo && <em>{p.ai_motivo}</em>}
                </div>
                {puedeEditar ? (
                  <Link className="ai-btn si" href={`/sider/ai/${p.viaje_id}`}>Revisar</Link>
                ) : (
                  <span className="ai-solo-ver">Solo un supervisor puede revisar</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2 ─ LO QUE YA SE HIZO */}
      <section className="ai-caja">
        <div className="ai-cab">
          <h2>Revisiones hechas</h2>
          <p>
            {rev.revisiones.length === 0
              ? "Todavía no hay ninguna."
              : <>{rev.revisiones.length} revisión{rev.revisiones.length === 1 ? "" : "es"} ·{" "}
                 <b>{nf.format(noAbonoTotal)}</b> unidades no abonadas en total.</>}
          </p>
        </div>

        {rev.revisiones.length > 0 && (
          <div className="ai-tabla">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Placa</th><th>Socio</th><th>Envase</th>
                  <th className="n">Recibidas</th><th className="n">Revisadas</th>
                  <th className="n">Con defecto</th><th className="n">Índice</th>
                  <th className="n">No abona</th><th className="n">Abono SAP</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rev.revisiones.map((r) => (
                  <tr key={r.id}>
                    <td>{dia(r.fecha)}</td>
                    <td><b>{r.placa}</b> <em>{r.turno}</em></td>
                    <td>{r.socio_nombre ?? r.canal_nombre}</td>
                    <td>{r.envase}</td>
                    <td className="n">{nf.format(r.recibidas)}</td>
                    <td className="n">{nf.format(r.revisadas)}</td>
                    <td className="n">
                      {nf.format(r.defectos)}
                      {r.otros > 0 && <i title="cuentan pero no cobran"> +{nf.format(r.otros)}</i>}
                    </td>
                    <td className="n dato">{(Number(r.indice) * 100).toFixed(3)} %</td>
                    <td className="n dato">{nf.format(r.no_abono)}</td>
                    <td className="n">{nf.format(r.abono_sap)}</td>
                    <td className="n">
                      {puedeEditar && (
                        <Link className="ai-enlace" href={`/sider/ai/${r.viaje_id}`}>
                          {r.ediciones > 0 ? `Corregir ·${r.ediciones}` : "Corregir"}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
