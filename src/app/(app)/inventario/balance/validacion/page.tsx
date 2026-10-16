import { misPermisos } from "@/lib/permisos";
import Link from "next/link";
import { validacionPasivo, validacionPasivoAG22 } from "@/modulos/inventario/validacion-pasivo";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../balance.css";
import "./validacion.css";
import { Validacion } from "./Validacion";
import { ValidacionAG22 } from "./ValidacionAG22";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · VALIDACIÓN DE PASIVO — conteo físico − pasivo = pendiente por baja, y pasivo + pendiente tiene que dar la
 * existencia final del Cuadre SAP AG18. Desde aquí el pendiente por baja se ENVÍA a la Base de pasivos (BAJA · PENDIENTE BAJA · AG18).
 */
export default async function ValidacionPage({ searchParams }: { searchParams: Promise<{ fecha?: string; hoja?: string }> }) {
  const q = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.fecha ?? "") ? q.fecha! : null;
  const ag22 = q.hoja === "AG22";
  const sufijo = dia ? `&fecha=${dia}` : "";
  const hojas = (
    <nav className="va-hojas">
      <Link href={`/inventario/balance/validacion?hoja=AG18${sufijo}`} className={ag22 ? "" : "on"}>AG18 · Fábrica</Link>
      <Link href={`/inventario/balance/validacion?hoja=AG22${sufijo}`} className={ag22 ? "on" : ""}>AG22 · Bodega 38</Link>
    </nav>
  );
  if (ag22) {
    const [d, permisos] = await Promise.all([validacionPasivoAG22(dia), misPermisos()]);
    return <div className="fe bal va">{hojas}<ValidacionAG22 datos={d} puedeEnviar={permisos.puedeEditar("/inventario/balance/pasivos")} /></div>;
  }
  const [d, permisos] = await Promise.all([validacionPasivo(dia), misPermisos()]);
  return (
    <div className="fe bal va">
      {hojas}
      <Validacion datos={d} puedeEnviar={permisos.puedeEditar("/inventario/balance/pasivos")} />
    </div>
  );
}
