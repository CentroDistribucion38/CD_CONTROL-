import { misPermisos } from "@/lib/permisos";
import { materialesCasco, sitiosCasco } from "@/modulos/casco/datos";
import "../fefo.css";
import "./casco.css";
import { Casco } from "./Casco";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · CASCO DE VIDRIO · REGISTRAR.
 *
 * «Dentro de inventario un módulo que se llame CASCO DE VIDRIO: COD, la
 *  descripción la traes del maestro, el inventario, extrasucio con baja,
 *  el HL lo calculas tú y la ubicación como desplegable.»
 *
 * Es el Excel de las cuatro tablas, pero cada cantidad se teclea como en
 * el Excel (24+15-36) y el HL sale del maestro, no de una fórmula que
 * cada quien copia con un factor distinto.
 */
export default async function CascoPage() {
  const [permisos, sitios, materiales] = await Promise.all([
    misPermisos(), sitiosCasco(), materialesCasco(),
  ]);

  if (sitios.sinTabla) {
    return (
      <div className="fe">
        <section className="cabeza">
          <div>
            <p className="ojo">INVENTARIO · CASCO DE VIDRIO</p>
            <h1>Falta crear esta parte en Supabase</h1>
            <p className="sub">
              Abre el editor de SQL y corre <b>supabase/migraciones/2026-10-casco-de-vidrio.sql</b>
              y, después, <b>2026-10-casco-historial-partir.sql</b> para cargar tu historial.
              Se pueden correr varias veces sin romper nada.
            </p>
          </div>
        </section>
      </div>
    );
  }

  /* LA FECHA DE HOY, EN HORA DE COLOMBIA. `new Date()` del servidor es
     UTC y después de las 7 p. m. ya sería «mañana». */
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());

  return (
    <div className="fe cas">
      <Casco
        sitios={sitios.lista}
        materiales={materiales}
        hoy={hoy}
        puedeEditar={permisos.puedeEditar("/inventario/casco")}
      />
    </div>
  );
}
