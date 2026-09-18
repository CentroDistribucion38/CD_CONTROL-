import { misPermisos } from "@/lib/permisos";
import { importacionesSap } from "@/modulos/traspasos/datos";
import { Importar } from "./Importar";
import "../traspasos.css";
import "./importar.css";

export const dynamic = "force-dynamic";

/**
 * TRASPASOS · IMPORTAR EL CORTE DE SAP.
 *
 * SOLO SUBE. Aquí no se mira el cruce: se sube el Excel del día y ya. Las
 * diferencias —qué salió en SAP y nadie registró— salen AL PIE DE
 * CONTROL, que es la pantalla que ya se abre todos los días para mirar
 * los números del turno.
 *
 * Tenerlo en dos pantallas era el error: subir el archivo es una acción
 * de una vez al día, y mirar lo que faltó es una pregunta del tablero.
 * Puestas juntas, la pregunta se quedaba esperando a que alguien se
 * acordara de entrar aquí.
 *
 * LA DIRECCIÓN SIGUE SIENDO /traspasos/cruce Y NO SE TOCA. Los permisos
 * de cada persona están guardados EN LA BASE como el texto de la
 * dirección —«/traspasos/cruce»—, en rol_permisos y en los permisos
 * extra de cada perfil. Cambiar la ruta porque cambió el nombre visible
 * deja esas filas apuntando a algo que no existe y la gente pierde la
 * pantalla EN SILENCIO: no da error, deja de verse.
 */
export default async function ImportarPage() {
  const [permisos, imp] = await Promise.all([misPermisos(), importacionesSap()]);

  if (!permisos.puedeVer("/traspasos/cruce")) {
    return (
      <div className="tp">
        <section className="caja">
          <div className="cab"><div>
            <h2>Esta pantalla no es para tu rol</h2>
            <p>Importar el corte de SAP lo ve quien lo tenga asignado en Administración → Roles.</p>
          </div></div>
        </section>
      </div>
    );
  }

  if (imp.falta) {
    return (
      <div className="tp">
        <section className="sin-tablas">
          <h2>Falta preparar el cruce en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta{" "}
            <code>supabase/migraciones/2026-09-traspasos-cruce-sap.sql</code>. Ese archivo
            crea la tabla del corte de SAP, la vista del cruce y la de las importaciones.
            Se puede correr varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="tp">
      <section className="cabeza-ctl">
        <div>
          <p className="ojo">TRASPASOS · SAP</p>
          <h1>Importar</h1>
          <p className="sub">
            El corte de SAP contra lo que se registró. Sirve para ver{" "}
            <b>qué documentos salieron y nadie registró</b> — y eso sale al pie de
            Control, no aquí: aquí solo se sube el archivo.
          </p>
        </div>
      </section>

      <Importar puedeImportar={permisos.puedeEditar("/traspasos/cruce")}
                importaciones={imp.lista} />
    </div>
  );
}
