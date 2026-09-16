import { misPermisos } from "@/lib/permisos";
import { maestroFefo } from "@/modulos/fefo/datos";
import "../fefo.css";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

/**
 * FEFO · MAESTRO.
 *
 * Los materiales y las ubicaciones con las que se cuenta. El SQL los
 * siembra una vez desde el Excel y de ahí en adelante manda esta
 * pantalla: se agrega, se corrige y se quita.
 *
 * SIN MAESTRO NO HAY CONTEO, y por eso esta pantalla va primera en el
 * menú aunque sea la que menos se abre: el código que se teclea en el
 * muelle no trae descripción si no está aquí, y sin «cajas por estiba»
 * no hay forma de convertir una estiba en cajas.
 */
export default async function FefoMaestroPage() {
  const [permisos, m] = await Promise.all([misPermisos(), maestroFefo()]);
  const esEditor = permisos.puedeEditar("/fefo/maestro");

  if (m.falta) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta <code>supabase/modulos/fefo.sql</code> y después{" "}
            <code>supabase/datos/fefo-maestro.sql</code>, en ese orden — el segundo tiene
            llaves foráneas contra las tablas del primero. Los dos se pueden correr varias
            veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  /* LOS MATERIALES SIN «CAJAS POR ESTIBA» SE CUENTAN AQUÍ Y SE DICEN.
     Es el único dato del maestro del que dependen las cuentas: sin él,
     una estiba no se puede convertir a cajas y el conteo de ese material
     sale en cero sin avisar. Está en null a propósito —poner un 1 sería
     inventárselo— así que lo que corresponde es decir cuáles son. */
  const sinFactor = m.materiales.filter((x) => x.activo && x.cajas_por_estiba == null);

  return (
    <div className="fe">
      <section className="cabeza">
        <div>
          <p className="ojo">FEFO · MAESTRO</p>
          <h1>Materiales y ubicaciones</h1>
          <p className="sub">
            Con lo que se cuenta. El código trae la descripción y las cifras que hacen las
            cuentas; la ubicación es la lista de módulos por la que se camina.{" "}
            {esEditor
              ? "Se agrega, se corrige y se quita desde aquí."
              : "Corregir el maestro requiere rol de supervisor."}
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">EN EL MAESTRO</div>
          <div className="num">{m.materiales.length}</div>
          <div className="pie">materiales · {m.ubicaciones.length} ubicaciones</div>
        </div>
      </section>

      {sinFactor.length > 0 && (
        <section className="fe-faltan">
          <p>
            <b>{sinFactor.length} material{sinFactor.length > 1 ? "es" : ""} sin cajas por
            estiba</b> — de esa cifra sale el total de cajas de cada estiba contada. Sin
            ella, lo que se cuente de esos materiales sale en cero.
          </p>
          <p className="cuales">
            {sinFactor.slice(0, 12).map((x) => x.descripcion).join(" · ")}
            {sinFactor.length > 12 && ` … y ${sinFactor.length - 12} más`}
          </p>
        </section>
      )}

      <Maestro materiales={m.materiales} ubicaciones={m.ubicaciones} esEditor={esEditor} />
    </div>
  );
}
