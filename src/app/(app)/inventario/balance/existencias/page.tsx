import { existenciasPasivo } from "@/modulos/inventario/existencias-pasivo";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../balance.css";
import "../validacion/validacion.css";
import "./existencias.css";
import { Existencias } from "./Existencias";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · PASIVOS · EXISTENCIAS — hoja de validación: la existencia de SAP de AG18 y de AG22 (lo último cargado ese día
 * en el Cuadre SAP) contra la Base de pasivos. Tiene que dar cero. Solo lee.
 */
export default async function ExistenciasPage({ searchParams }: { searchParams: Promise<{ fecha?: string; alm?: string }> }) {
  const q = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.fecha ?? "") ? q.fecha! : null;
  const d = await existenciasPasivo(dia);
  return (
    <div className="fe bal va ex">
      <Existencias datos={d} inicial={q.alm === "AG22" ? "AG22" : "AG18"} />
    </div>
  );
}
