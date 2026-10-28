import "../../../../sider/sider.css";
import "../../../fefo.css";
import "../../balance.css";
import "../../cuadre/cuadre.css";
import "../carnaval.css";
import { misPermisos } from "@/lib/permisos";
import { hoyCO } from "@/modulos/carnaval/logica";
import { productosYCorte, RUTA_CONTROL, RUTA_REGISTRO, saldosA, SQL_FALTA, faltaTabla } from "@/modulos/carnaval/datos";
import { Hojas } from "../Hojas";
import { Control } from "./Control";

export const dynamic = "force-dynamic";

/** AG07 CARNAVAL · CONTROL — el inventario de envase vacío por código: pallets, unidades, HL y total. */
export default async function ControlPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const q = await searchParams;
  const hoy = hoyCO();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(q.fecha ?? "") ? q.fecha! : hoy;
  const perm = await misPermisos();
  const pc = await productosYCorte();
  const s = pc.error ? null : await saldosA(fecha);
  const error = pc.error ? (faltaTabla(pc.error) ? SQL_FALTA : pc.error) : s?.error ? (faltaTabla(s.error) ? SQL_FALTA : s.error) : null;
  const filas = pc.productos.map((p) => ({ codigo: p.codigo, descripcion: p.descripcion, undPorPallet: p.und_por_pallet, cc: p.cc, pallets: s?.saldos.get(p.codigo) ?? 0 }));
  return (
    <div className="fe bal cs">
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · BALANCE · CUADRE SAP</p>
        <h1>AG07 · Carnaval</h1>
        <p className="sub">Envase vacío de Peldar en el almacén de Carnaval, por pallets. Control es lo que hay por código; Registro es donde se carga lo que entra y sale.</p>
      </div></section>
      <Hojas activa="control" verControl verRegistro={perm.puedeVer(RUTA_REGISTRO)} />
      {error ? <p className="cv-msg mal">{error}</p> : <Control fecha={fecha} hoy={hoy} filas={filas} />}
    </div>
  );
}
