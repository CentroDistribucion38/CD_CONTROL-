import { nombresTodos } from "@/modulos/sider/datos";
import { misPermisos } from "@/lib/permisos";
import { acciones as leerAcciones, porArea, parametros } from "@/modulos/acciones/datos";
import "../acciones.css";
import "./tablero.css";
import { SinTablas } from "../comunes";
import { Tablero } from "./Tablero";

export const dynamic = "force-dynamic";

export default async function TableroPage() {
  const [datos, areas, par, nombres, permisos] = await Promise.all([
    leerAcciones(),
    porArea(),
    parametros(),
    nombresTodos(),
    misPermisos(),
  ]);

  if (datos.falta) return <div className="ac"><SinTablas /></div>;

  return (
    <div className="ac" style={{ minHeight: 0, flex: "1 1 auto" }}>
      <Tablero
        acciones={datos.acciones}
        areas={areas}
        nombres={nombres}
        meta={par.par["meta_efectividad"] ?? 90}
        puedeReportar={permisos.puedeEditar("/acciones/todas")}
        puedeEditar={permisos.puedeEditar("/acciones/todas")}
        manda={permisos.manda}
      />
    </div>
  );
}
