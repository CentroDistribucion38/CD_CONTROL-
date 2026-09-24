import { misPermisos } from "@/lib/permisos";
import { operarios } from "@/modulos/roturas/datos";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Operarios } from "../../Operarios";

export const dynamic = "force-dynamic";

/**
 * LOS OPERARIOS OPM Y SU PIN.
 *
 * Van en su propia pantalla y no como una hoja más del Maestro: el
 * Maestro de En sitio es «lo que se puede escoger» —materiales,
 * procesos, áreas, causas—, cosas que todo el que registra ve en un
 * desplegable. Esto es lo contrario: son los PIN, y justamente no se
 * le enseñan a quien registra. Una hoja más en esa pantalla habría
 * hecho que el permiso de todo el Maestro tuviera que apretarse al
 * de los PIN, o que los PIN quedaran con el permiso del Maestro.
 */
export default async function OperariosPage() {
  const [permisos, ops] = await Promise.all([misPermisos(), operarios()]);

  if (ops.sinTabla) return <div className="rt"><SinTablas /></div>;

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · OPERARIOS</p>
          <h1>Quién reporta, y con qué PIN</h1>
          <p className="sub">
            Cada OPM tiene cuatro dígitos. Al registrar una rotura reportada, quien la carga
            teclea ese PIN y la pantalla enseña el nombre antes de dejar seguir: así queda
            escrito quién la vio, en qué turno y a qué hora, sin que el operario tenga que
            entrar a nada. Esta pantalla es del administrador porque aquí se ven los PIN.
          </p>
        </div>
      </section>

      <Operarios lista={ops.lista}
                 puedeEditar={permisos.puedeEditar("/roturas/en-sitio/operarios")} />
    </div>
  );
}
