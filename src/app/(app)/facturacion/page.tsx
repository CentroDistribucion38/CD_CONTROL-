import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { bandejaFacturacion } from "@/modulos/traspasos/datos";
import "../traspasos/traspasos.css";
import "./facturacion.css";
import { Bandeja } from "./Bandeja";

export const dynamic = "force-dynamic";

/**
 * FACTURACIÓN — donde esperan los viajes su número de documento.
 *
 * «Un módulo de facturación, donde reposarían los viajes para que el de
 * facturación ponga el número de documento y confirme la salida.»
 *
 * UNA SOLA PANTALLA Y UNA SOLA PREGUNTA: ¿qué viajes están esperando? La
 * respuesta va arriba y en grande —cuántos—, y debajo cada viaje con su
 * orden de cargue, que es el papel que facturación tiene en la mano, y
 * el campo para el número. Lo que ya salió va después, para ver lo que
 * se acaba de hacer.
 */
export default async function FacturacionPage() {
  const [permisos, b, nombres] = await Promise.all([
    misPermisos(), bandejaFacturacion(), nombresTodos(),
  ]);

  if (!permisos.puedeVer("/facturacion")) {
    return (
      <div className="tp">
        <section className="caja">
          <div className="cab"><div>
            <h2>Esta pantalla no es para tu rol</h2>
            <p>Facturación la ve quien tenga el rol Facturación o lo tenga asignado en
              Administración → Roles.</p>
          </div></div>
        </section>
      </div>
    );
  }

  if (b.falta) {
    return (
      <div className="tp">
        <section className="sin-tablas">
          <h2>Falta preparar Facturación en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta{" "}
            <code>supabase/migraciones/2026-09-traspasos-facturacion.sql</code>. Crea el
            número de documento y la salida de cada viaje, el rol Facturación y el cruce con
            SAP contra ese número. Se puede correr varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  return (
    <Bandeja pendientes={b.pendientes} salieron={b.salieron} nombres={nombres}
             puedeConfirmar={permisos.puedeEditar("/facturacion")}
             puedeReabrir={permisos.manda} />
  );
}
