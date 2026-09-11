import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import {
  roturas as leerRoturas, materiales, procesos, causas,
} from "@/modulos/roturas/datos";
import "../roturas.css";
import { SinTablas } from "../comunes";
import { EnSitio } from "./EnSitio";

export const dynamic = "force-dynamic";

/**
 * EN SITIO. Las seis consultas van en una sola tanda: en serie la
 * pantalla tardaría lo que suman, y aquí ninguna depende de otra.
 */
export default async function RoturasPage() {
  const [permisos, datos, mats, pros, cas, nombres] = await Promise.all([
    misPermisos(), leerRoturas(), materiales(), procesos(), causas(), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  const esperando = datos.roturas.filter((r) => r.esperando).length;

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · CD38 AG01</p>
          <h1>Lo que se rompió</h1>
          <p className="sub">
            Se cuenta en unidades, por causa y por proceso: es lo que contesta de quién fue la
            rotura y de dónde salió. Los kilos son otra cosa y viven en Salidas —el vidrio se
            acumula días antes de salir y parte de lo que se pesa nunca se contó aquí—, así que
            las dos cifras no se cuadran entre sí a propósito.
          </p>
        </div>
        <div className="kpi">
          <div className="corte" aria-hidden />
          <div className="rot">ESPERANDO VISTO BUENO</div>
          <div className="num">{esperando}<span className="u">roturas</span></div>
          <div className="pie">ABI decide si cuentan o no</div>
        </div>
      </section>

      <EnSitio
        roturas={datos.roturas}
        nombres={nombres}
        materiales={mats}
        procesos={pros}
        causas={cas}
        puedeEditar={permisos.puedeEditar("/roturas/en-sitio")}
      />
    </div>
  );
}
