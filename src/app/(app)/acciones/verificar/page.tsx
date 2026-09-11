import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { accionesPorVerificar, carga, parametros } from "@/modulos/acciones/datos";
import "../acciones.css";
import { SinTablas } from "../comunes";
import { Verificar } from "./Verificar";

export const dynamic = "force-dynamic";

export default async function VerificarPage() {
  const [permisos, datos, quienes, par, nombres] = await Promise.all([
    misPermisos(),
    accionesPorVerificar(),
    carga(),
    parametros(),
    nombresTodos(),
  ]);

  if (datos.falta) return <div className="ac"><SinTablas /></div>;

  return (
    <div className="ac">
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES CORRECTIVAS · CD38 AG01</p>
          <h1>Por verificar</h1>
          <p className="sub">
            Acciones cerradas esperando que alguien vaya a mirar si de verdad sirvió. Esta
            pantalla es la que sostiene el indicador: si cerrar y resolver fueran lo mismo,
            bastaría con cerrar para que todo se viera verde.
          </p>
        </div>
      </section>

      <Verificar
        acciones={datos.acciones}
        carga={quienes}
        nombres={nombres}
        veces={par.par["reincidencia_veces"] ?? 3}
        puedeEditar={permisos.puedeEditar("/acciones/verificar")}
        manda={permisos.manda}
      />
    </div>
  );
}
