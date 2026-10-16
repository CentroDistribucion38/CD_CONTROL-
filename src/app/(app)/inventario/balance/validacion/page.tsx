import { misPermisos } from "@/lib/permisos";
import { validacionPasivo } from "@/modulos/inventario/validacion-pasivo";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../balance.css";
import "./validacion.css";
import { Validacion } from "./Validacion";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · VALIDACIÓN DE PASIVO — conteo físico − pasivo = pendiente por baja, y pasivo + pendiente tiene que dar la
 * existencia final del Cuadre SAP AG18. Desde aquí el pendiente por baja se ENVÍA a la Base de pasivos (BAJA · PENDIENTE BAJA · AG18).
 */
export default async function ValidacionPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const q = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.fecha ?? "") ? q.fecha! : null;
  const [d, permisos] = await Promise.all([validacionPasivo(dia), misPermisos()]);
  return (
    <div className="fe bal va">
      <Validacion datos={d} puedeEnviar={permisos.puedeEditar("/inventario/balance/pasivos")} />
    </div>
  );
}
