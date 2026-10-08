import { misPermisos } from "@/lib/permisos";
import { materialesCasco, sitiosCasco } from "@/modulos/casco/datos";
import "../../fefo.css";
import "../casco.css";
import "./registrar.css";
import { Registrar } from "./Registrar";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · CASCO DE VIDRIO · REGISTRAR.
 *
 * «Dentro de Registrar debe estar si haré un MOVIMIENTO o una BAJA. Empezamos por la baja: es la hoja
 *  de baja, donde la cantidad la tenemos en unidades; con el maestro y sus factores la convertimos
 *  a estibas.»
 *
 * De aquí se alimenta CONTROL (las cuatro tablas): lo que se registra aquí se suma allá, y de allá
 * sale el tablero. La cuenta la hace la base (`casco_registrar_bajas`).
 */
export default async function RegistrarCascoPage() {
  const [permisos, sitios, materiales] = await Promise.all([misPermisos(), sitiosCasco(), materialesCasco()]);

  if (sitios.sinTabla) {
    return (
      <div className="fe">
        <section className="cabeza"><div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · REGISTRAR</p>
          <h1>Falta crear esta parte en Supabase</h1>
          <p className="sub">
            Abre el editor de SQL y corre <b>supabase/migraciones/2026-10-casco-de-vidrio.sql</b> y después
            <b> 2026-10-casco-registrar-baja.sql</b>. Se pueden correr varias veces sin romper nada.
          </p>
        </div></section>
      </div>
    );
  }

  return (
    <div className="fe cas reg">
      <Registrar
        sitios={sitios.lista}
        materiales={materiales}
        puedeEditar={permisos.puedeEditar("/inventario/casco/registrar")}
      />
    </div>
  );
}
