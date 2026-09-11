import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";
import { misPermisos } from "@/lib/permisos";
import { diasConDatos, seguimientoSider, zldeDelRango } from "@/modulos/sider/datos";
import { mesCompleto, nombreRango } from "@/modulos/sider/comun";
import "../sider.css";
import { Seguimiento } from "./Seguimiento";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * EL RANGO QUE SE VA A MIRAR.
 *
 * De la URL, y si no viene, el último mes que tenga algo. Se acepta
 * también ?mes=2026-08 —la forma vieja— para que un enlace guardado o
 * un favorito no lleve a una pantalla vacía.
 *
 * Las dos fechas se ordenan: alguien que escriba desde=31 y hasta=1 en
 * la URL vería el informe en blanco y creería que no hay datos.
 */
function normaliza(
  q: { desde?: string; hasta?: string; mes?: string },
  dias: string[]
): { desde: string; hasta: string } | null {
  if (q.desde && q.hasta && FECHA.test(q.desde) && FECHA.test(q.hasta)) {
    return q.desde <= q.hasta
      ? { desde: q.desde, hasta: q.hasta }
      : { desde: q.hasta, hasta: q.desde };
  }
  if (q.desde && FECHA.test(q.desde)) return { desde: q.desde, hasta: q.desde };
  if (q.mes && /^\d{4}-\d{2}$/.test(q.mes)) return mesCompleto(q.mes);
  /* Sin nada en la URL: el mes del día más reciente con datos. */
  return dias.length ? mesCompleto(dias[0].slice(0, 7)) : null;
}

export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; mes?: string }>;
}) {
  const q = await searchParams;
  const supabase = await createClient();
  const user = await usuarioActual();
  const [{ data: perfil }, { dias, falta }] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    diasConDatos(),
  ]);
  /* El permiso es de ESTA pantalla, no un "es admin o supervisor"
     global: un rol puede certificar y no tocar el maestro. */
  const esEditor = (await misPermisos()).puedeEditar("/sider/seguimiento");

  if (falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta crear el seguimiento en Supabase</h2>
          <p>
            Vuelve a ejecutar <code>supabase/modulos/sider.sql</code> en el SQL Editor: el
            archivo creció con la tabla de ZLDE y la vista del informe. Se puede correr
            varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  const rango = normaliza(q, dias.map((d) => d.fecha));
  /* Dos consultas y no una: el informe sale de la función —clavada en
     Barranquilla y EER, porque eso es el indicador— y la pantalla de
     ZLDE sale de la tabla cruda, para poder mover planta y clase como
     los segmentadores del pivote. */
  const [{ filas }, { filas: zlde }] = rango
    ? await Promise.all([
        seguimientoSider(rango.desde, rango.hasta),
        zldeDelRango(rango.desde, rango.hasta),
      ])
    : [{ filas: [] }, { filas: [] }];

  const dentro = filas.filter((f) => f.aplica_sider);
  const recibido = dentro.reduce((s, f) => s + Number(f.hl_recibido), 0);
  const real = dentro.reduce((s, f) => s + Number(f.real_mtd), 0);
  const meta = filas[0]?.meta ?? 0.1;
  const pct = recibido > 0 ? real / recibido : null;
  const nombreMes = rango ? nombreRango(rango.desde, rango.hasta) : "—";

  return (
    <div className="sd">
      {/* La cabecera del mockup: rótulo arriba, título, y las dos
          acciones con el KPI a la derecha. El KPI lleva la distancia a
          la meta en pastilla —"6,6 pp por debajo"— porque un 3,4% suelto
          no dice si eso está bien o mal. */}
      <section className="cabeza">
        <div>
          <p className="ojo">ENVASE CERTIFICADO · CD38 AG01 BARRANQUILLA</p>
          <h1>Seguimiento</h1>
          <p className="sub">
            Cuánto del envase que llegó a Barranquilla vino certificado. Son tres tablas
            encadenadas: lo que <b>ZLDE</b> dice que llegó, lo que{" "}
            <Link href="/sider">la Fuente principal</Link> dice que se certificó, y el
            informe que sale de las dos.
          </p>
        </div>
        <div className="sg-der">
          <div className="acciones-informe">
            {esEditor && (
              <Link className="accion" href="/sider/importar">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 14.5V3.5M8.5 7L12 3.5 15.5 7" />
                  <path d="M4 14v4.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V14" />
                </svg>
                Importar
              </Link>
            )}
            <a className="accion"
               href={`/api/sider/exportar?desde=${rango?.desde ?? ""}&hasta=${rango?.hasta ?? ""}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3.5V14M8.5 10.5L12 14l3.5-3.5" />
                <path d="M4 15v3.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V15" />
              </svg>
              Exportar a Excel
            </a>
          </div>
          <div className={"kpi" + (pct != null && pct < meta ? " corto" : "")}>
            <div className="corte" />
            <div className="rot">CERTIFICACIÓN · {nombreMes.toUpperCase()}</div>
            <div className="num">
              {pct == null ? "—" : (pct * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })}
              <span className="u">%</span>
            </div>
            <div className="pie">
              <span>Meta <b>{(meta * 100).toLocaleString("es-CO", { maximumFractionDigits: 0 })}%</b></span>
              {pct != null && (
                <span className="delta">
                  {Math.abs((pct - meta) * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} pp
                  {pct < meta ? " por debajo" : " por encima"}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {!rango ? (
        <section className="sin-tablas">
          <h2>Todavía no hay nada que seguir</h2>
          <p>
            El seguimiento necesita las dos puntas: el <b>HL EER recibido</b> de ZLDE y los
            viajes certificados. Empieza por{" "}
            {esEditor
              ? <Link href="/sider/importar">importar el archivo de ZLDE</Link>
              : "pedirle a un supervisor que cargue el archivo de ZLDE"}.
          </p>
        </section>
      ) : (
        <Seguimiento
          filas={filas}
          zlde={zlde}
          desde={rango.desde}
          hasta={rango.hasta}
          dias={dias}
          nombreMes={nombreMes}
          esEditor={esEditor}
        />
      )}
    </div>
  );
}
