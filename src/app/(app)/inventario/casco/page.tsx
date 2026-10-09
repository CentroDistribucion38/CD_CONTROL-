import { misPermisos } from "@/lib/permisos";
import { materialesCasco, puestosUsados, sitiosCasco } from "@/modulos/casco/datos";
import { PUESTOS_BASE } from "@/modulos/casco/puestos";
import { ubicacionesDelInventario } from "@/modulos/casco/ubicaciones-inventario";
import "../fefo.css";
import "./casco.css";
import { Casco } from "./Casco";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · CASCO DE VIDRIO · CONTROL (antes «Registrar»; ahora Registrar es donde entran las bajas y los movimientos).
 *
 * «Dentro de inventario un módulo que se llame CASCO DE VIDRIO: COD, la
 *  descripción la traes del maestro, el inventario, extrasucio con baja,
 *  el HL lo calculas tú y la ubicación como desplegable.»
 *
 * Es el Excel de las cuatro tablas, pero cada cantidad se teclea como en
 * el Excel (24+15-36) y el HL sale del maestro, no de una fórmula que
 * cada quien copia con un factor distinto.
 */
export default async function CascoPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const [permisos, sitios, materiales, usados, delInventario] = await Promise.all([
    misPermisos(), sitiosCasco(), materialesCasco(), puestosUsados(),
    /* Las ubicaciones de Fábrica (LAVADO) y Bodega 38 (BAJA) salen del último inventario. */
    ubicacionesDelInventario(),
  ]);
  const puestos = [...new Set([...PUESTOS_BASE, ...usados])];

  if (sitios.sinTabla) {
    return (
      <div className="fe">
        <section className="cabeza">
          <div>
            <p className="ojo">INVENTARIO · CASCO DE VIDRIO · CONTROL</p>
            <h1>Falta crear esta parte en Supabase</h1>
            <p className="sub">
              Abre el editor de SQL y corre <b>supabase/migraciones/2026-10-casco-de-vidrio.sql</b>
              luego <b>2026-10-casco-puesto-calidad.sql</b> y, al final, <b>2026-10-casco-historial-partir.sql</b> para cargar tu historial.
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
  /* `?fecha=2026-09-24` abre Control en ese día (el enlace que deja Registrar tras aplicar una baja). */
  const pedida = (await searchParams).fecha;
  const inicio = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida <= hoy ? pedida : hoy;

  return (
    <div className="fe cas">
      <Casco
        sitios={sitios.lista}
        materiales={materiales}
        hoy={hoy}
        inicio={inicio}
        puestos={puestos}
        puedeEditar={permisos.puedeEditar("/inventario/casco")}
        delInventario={delInventario}
      />
    </div>
  );
}
