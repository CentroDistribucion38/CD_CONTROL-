import { validacionPasivo } from "@/modulos/inventario/validacion-pasivo";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../balance.css";
import "./validacion.css";
import { Validacion } from "./Validacion";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · VALIDACIÓN DE PASIVO — hoja aparte, solo para validar: conteo físico − pasivo = pendiente por baja,
 * y pasivo + pendiente tiene que dar la existencia final del Cuadre SAP AG18. No cambia ni el Cuadre ni la Base de pasivos.
 */
export default async function ValidacionPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const q = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.fecha ?? "") ? q.fecha! : null;
  const d = await validacionPasivo(dia);
  return (
    <div className="fe bal va">
      <Validacion datos={d} />
    </div>
  );
}
