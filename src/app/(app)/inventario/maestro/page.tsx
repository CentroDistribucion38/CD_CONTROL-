import { misPermisos } from "@/lib/permisos";
import { maestroInventario } from "@/modulos/inventario/fefo";
import "../fefo.css";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · MAESTRO.
 *
 * Los materiales y las ubicaciones con las que se cuenta. El SQL los
 * siembra una vez desde «FEFO 002.xlsx» y de ahí en adelante manda esta
 * pantalla: se agrega, se corrige y se apaga.
 *
 * SIN MAESTRO NO HAY CONTEO, y por eso va primero en el menú aunque sea
 * lo que menos se abre: el código que se teclea en el muelle no trae
 * descripción si no está aquí, y sin factor estibado no hay forma de
 * convertir una estiba en cajas.
 */
export default async function InventarioMaestroPage() {
  const [permisos, m] = await Promise.all([misPermisos(), maestroInventario()]);
  const esEditor = permisos.puedeEditar("/inventario/maestro");

  if (m.falta) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>Falta preparar el maestro en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta{" "}
            <code>supabase/migraciones/2026-09-inventario-fefo.sql</code> y después{" "}
            <code>supabase/datos/inventario-maestro-cd38.sql</code>, en ese orden — el
            segundo escribe en las columnas que crea el primero. Los dos se pueden correr
            varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  /* LOS MATERIALES SIN FACTOR ESTIBADO SE CUENTAN AQUÍ Y SE DICEN.
     Es el único dato del maestro del que dependen las cuentas: sin él,
     una estiba no se puede convertir a cajas y el conteo de ese material
     sale en CERO sin avisar. Está en null a propósito —poner un 1 sería
     inventárselo— así que lo que corresponde es decir cuáles son. */
  const sinFactor = m.materiales.filter((x) => x.activo && x.cajas_por_estiba == null);
  const envases = m.materiales.filter((x) => x.tipo_material === "ENVASE").length;

  return (
    <div className="fe">
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · MAESTRO</p>
          <h1>Las bases del conteo</h1>
          <p className="sub">
            Con lo que se cuenta: los materiales, los módulos por los que se camina y las
            bodegas de las que cuelgan. El código trae la descripción y el factor estibado que
            hacen las cuentas.{" "}
            {esEditor
              ? "Se agrega, se corrige y se apaga desde aquí."
              : "Corregir el maestro requiere rol de supervisor."}
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">EN EL MAESTRO</div>
          <div className="num">{m.materiales.length}</div>
          <div className="pie">
            materiales ({envases} envases) · {m.ubicaciones.length} ubicaciones ·{" "}
            {m.bodegas.length} bodega{m.bodegas.length === 1 ? "" : "s"}
          </div>
        </div>
      </section>

      {/* EL CRUCE SIN CORRER SE DICE AQUÍ Y NO SE DISIMULA.
          Sin él, categoría, tipo de envase, HL y referencia salen todas
          en raya, y desde la pantalla eso se ve exactamente igual que
          «el maestro no tiene ese dato». Son dos cosas distintas: una se
          arregla con un SQL y la otra yendo a pedirle el dato a la
          cervecería. */}
      {!m.cruce && (
        <section className="fe-faltan">
          <p>
            <b>Falta correr el cruce del maestro.</b> Categoría, tipo de envase, HL y
            referencia todavía no existen como columnas, así que salen vacías en los{" "}
            {m.materiales.length} materiales — no es que falte el dato, es que falta el SQL.
          </p>
          <p className="cuales">
            Abre el SQL Editor de Supabase y corre{" "}
            <code>supabase/migraciones/2026-09-maestro-cruce-2026-09-26.sql</code>. Se puede
            correr varias veces sin romper nada.
          </p>
        </section>
      )}

      {sinFactor.length > 0 && (
        <section className="fe-faltan">
          <p>
            <b>{sinFactor.length} material{sinFactor.length > 1 ? "es" : ""} sin factor
            estibado</b> — de esa cifra sale el total de cajas de cada estiba contada. Sin
            ella, lo que se cuente de esos materiales sale en cero.
          </p>
          <p className="cuales">
            {sinFactor.slice(0, 12).map((x) => x.nombre).join(" · ")}
            {sinFactor.length > 12 && ` … y ${sinFactor.length - 12} más`}
          </p>
        </section>
      )}

      <Maestro materiales={m.materiales} ubicaciones={m.ubicaciones}
               bodegas={m.bodegas} esEditor={esEditor} />
    </div>
  );
}
