import { nombresTodos } from "@/modulos/sider/datos";
import { acciones as leerAcciones, porArea, parametros } from "@/modulos/acciones/datos";
import "../acciones.css";
import { SinTablas } from "../comunes";
import { Tablero } from "./Tablero";

export const dynamic = "force-dynamic";

export default async function TableroPage() {
  const [datos, areas, par, nombres] = await Promise.all([
    leerAcciones(),
    porArea(),
    parametros(),
    nombresTodos(),
  ]);

  if (datos.falta) return <div className="ac"><SinTablas /></div>;

  return (
    <div className="ac" style={{ minHeight: 0, flex: "1 1 auto" }}>
      <Tablero
        acciones={datos.acciones}
        areas={areas}
        nombres={nombres}
        meta={par.par["meta_efectividad"] ?? 90}
      />
    </div>
  );
}
