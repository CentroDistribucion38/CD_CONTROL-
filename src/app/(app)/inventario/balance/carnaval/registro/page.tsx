import "../../../../sider/sider.css";
import "../../../fefo.css";
import "../../balance.css";
import "../../cuadre/cuadre.css";
import "../carnaval.css";
import { misPermisos } from "@/lib/permisos";
import { hoyCO } from "@/modulos/carnaval/logica";
import { faltaTabla, productosYCorte, RUTA_CONTROL, RUTA_REGISTRO, SQL_FALTA, ultimosMovimientos } from "@/modulos/carnaval/datos";
import { Hojas } from "../Hojas";
import { Registro } from "./Registro";

export const dynamic = "force-dynamic";

/** AG07 CARNAVAL · REGISTRO — se carga el archivo diario de Peldar (suma) y se registran trasiegos (resta) y ajustes (± con nota). */
export default async function RegistroPage() {
  const perm = await misPermisos();
  const pc = await productosYCorte();
  const mv = pc.error ? null : await ultimosMovimientos();
  const error = pc.error ? (faltaTabla(pc.error) ? SQL_FALTA : pc.error) : mv?.error ? (faltaTabla(mv.error) ? SQL_FALTA : mv.error) : null;
  return (
    <div className="fe bal cs">
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · BALANCE · CUADRE SAP</p>
        <h1>AG07 · Carnaval</h1>
        <p className="sub">Aquí se carga lo que entra de Peldar y se registran los trasiegos y los ajustes. Lo que hay por código se ve en Control.</p>
      </div></section>
      <Hojas activa="registro" verRegistro verControl={perm.puedeVer(RUTA_CONTROL)} />
      {error ? <p className="cv-msg mal">{error}</p>
        : <Registro productos={pc.productos} corte={pc.corte} hoy={hoyCO()} puedeEditar={perm.puedeEditar(RUTA_REGISTRO)} movimientos={mv?.filas ?? []} />}
    </div>
  );
}
