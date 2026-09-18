import { misPermisos } from "@/lib/permisos";
import { cruceSap } from "@/modulos/traspasos/datos";
import { Cruce } from "./Cruce";
import "../traspasos.css";
import "./cruce.css";

export const dynamic = "force-dynamic";

/**
 * TRASPASOS · EL CRUCE CONTRA SAP.
 *
 * Es la pregunta que no tenía respuesta: ¿lo que registraron es lo que
 * de verdad salió? Hasta ahora se comparaba a ojo, con el Excel en una
 * pantalla y el sistema en la otra, y a ojo no se comparan doscientos
 * documentos.
 *
 * VA EN SU PROPIA PANTALLA Y NO DENTRO DEL TABLERO. Subir un archivo y
 * mirar el turno son dos momentos distintos: el corte se baja de SAP una
 * vez al día, y el tablero se mira cada rato. El tablero se queda con lo
 * que hace falta ahí —cuáles faltaron— y aquí vive lo demás.
 */
export default async function CrucePage() {
  const [permisos, c] = await Promise.all([misPermisos(), cruceSap()]);

  if (!permisos.puedeVer("/traspasos/cruce")) {
    return (
      <div className="tp">
        <section className="caja">
          <div className="cab"><div>
            <h2>Esta pantalla no es para tu rol</h2>
            <p>El cruce contra SAP lo ve quien lo tenga asignado en Administración → Roles.</p>
          </div></div>
        </section>
      </div>
    );
  }

  if (c.falta) {
    return (
      <div className="tp">
        <section className="sin-tablas">
          <h2>Falta preparar el cruce en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta{" "}
            <code>supabase/migraciones/2026-09-traspasos-cruce-sap.sql</code>. Ese archivo
            crea la tabla del corte de SAP y la vista del cruce. Se puede correr varias veces
            sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="tp">
      <section className="cabeza-ctl">
        <div>
          <p className="ojo">TRASPASOS · CRUCE CONTRA SAP</p>
          <h1>El cruce</h1>
          <p className="sub">
            El corte de SAP contra lo registrado. Un documento con varios movimientos
            —salió, se anuló, se rehízo— cuenta <b>una vez</b>; uno que se anuló y quedó en
            cero no cuenta.
          </p>
        </div>
      </section>

      {c.tope && (
        <section className="caja">
          <p className="cr-tope">
            <b>Se llegó al tope de documentos que esta pantalla trae de una.</b> Lo que ves
            está bien, pero no está todo.
          </p>
        </section>
      )}

      <Cruce lineas={c.lineas} resumen={c.resumen}
             puedeImportar={permisos.puedeEditar("/traspasos/cruce")} />
    </div>
  );
}
