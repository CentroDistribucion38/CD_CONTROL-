import { misPermisos } from "@/lib/permisos";
import { usuarioActual } from "@/lib/sesion";
import { misAcciones, zonas, motivos, parametros } from "@/modulos/acciones/datos";
import "../acciones.css";
import { SinTablas } from "../comunes";
import { Mias } from "./Mias";

export const dynamic = "force-dynamic";

export default async function MisAccionesPage() {
  const user = await usuarioActual();

  const [permisos, datos, zs, ms, par] = await Promise.all([
    misPermisos(),
    misAcciones(user?.id ?? ""),
    zonas(),
    motivos(),
    parametros(),
  ]);

  if (datos.falta) return <div className="ac"><SinTablas /></div>;

  return (
    <div className="ac">
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES CORRECTIVAS · CD38 AG01</p>
          <h1>Mis acciones</h1>
          <p className="sub">
            Lo tuyo de hoy. El tablero queda de segundo: en el celular no se analiza, se resuelve.
            Cerrar una acción es decir qué hiciste — después alguien va a ir a mirar si sirvió.
          </p>
        </div>
      </section>

      <Mias
        acciones={datos.acciones}
        zonas={zs}
        motivos={ms}
        plazos={par.plazos}
        puedeEditar={permisos.puedeEditar("/acciones/mias")}
      />
    </div>
  );
}
