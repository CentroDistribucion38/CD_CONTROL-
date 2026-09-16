import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { maestroFefo } from "@/modulos/fefo/datos";
import "./fefo.css";

export const dynamic = "force-dynamic";

/**
 * FEFO · LA PORTADA.
 *
 * Mientras el módulo esté a medio construir, esta pantalla dice EN QUÉ VA
 * en vez de fingir que está completo. No es un adorno: alguien que entra
 * y encuentra una sola sección no puede distinguir «esto es todo» de
 * «esto está roto», y termina preguntando.
 *
 * Cuando exista la pantalla de contar, esto pasa a ser lo que tiene que
 * ser: el resumen del período —qué se vence primero, qué ya se pasó de su
 * fecha de salida— que es para lo que el conteo existe.
 */
export default async function FefoPage() {
  const [permisos, m] = await Promise.all([misPermisos(), maestroFefo()]);
  const puedeMaestro = permisos.puedeVer("/fefo/maestro");

  const sinFactor = m.materiales.filter((x) => x.activo && x.cajas_por_estiba == null).length;

  return (
    <div className="fe">
      <section className="cabeza">
        <div>
          <p className="ojo">FEFO · VENCIMIENTOS</p>
          <h1>Conteo por ubicación</h1>
          <p className="sub">
            El almacén se camina módulo por módulo y se anota qué hay en cada uno: el
            material, cuántas estibas o cajas, y la fecha de vencimiento impresa. De ahí
            sale qué se despacha primero y qué se está por vencer.
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">EN EL MAESTRO</div>
          <div className="num">{m.falta ? "—" : m.materiales.length}</div>
          <div className="pie">
            {m.falta ? "falta correr el SQL" : `materiales · ${m.ubicaciones.length} ubicaciones`}
          </div>
        </div>
      </section>

      {m.falta ? (
        <section className="sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta <code>supabase/modulos/fefo.sql</code> y después{" "}
            <code>supabase/datos/fefo-maestro.sql</code>, en ese orden — el segundo tiene
            llaves foráneas contra las tablas del primero.
          </p>
        </section>
      ) : (
        <>
          {sinFactor > 0 && (
            <section className="fe-faltan">
              <p>
                <b>{sinFactor} material{sinFactor > 1 ? "es activos" : " activo"} sin cajas por
                estiba</b> — sin esa cifra, lo que se cuente de ellos sale en cero. Se
                completan en el maestro.
              </p>
            </section>
          )}

          <section className="fe-pasos">
            <h2>En qué va</h2>
            <ol>
              <li className="listo">
                <b>La base</b>
                <span>
                  Maestro, ubicaciones, conteos y renglones. Las seis cuentas del Excel
                  —total cajas, vencimiento, días para vencer, días para salir— las hace la
                  base con las mismas fórmulas, no la pantalla.
                </span>
              </li>
              <li className={m.materiales.length > 0 ? "listo" : undefined}>
                <b>El maestro</b>
                <span>
                  {m.materiales.length > 0
                    ? <>Los {m.materiales.length} materiales y las {m.ubicaciones.length}{" "}
                       ubicaciones están cargados y se corrigen desde la pantalla.{" "}
                       {puedeMaestro && <Link href="/fefo/maestro">Abrir el maestro</Link>}</>
                    : <>Está vacío: falta correr <code>supabase/datos/fefo-maestro.sql</code>.</>}
                </span>
              </li>
              <li>
                <b>Contar desde el celular</b>
                <span>
                  Lo que sigue. Se escoge el módulo una vez, se agregan los materiales que
                  hay ahí, y cada renglón queda guardado al momento con el nombre de quien
                  lo contó — para que una señal que se cae no borre la mañana.
                </span>
              </li>
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
