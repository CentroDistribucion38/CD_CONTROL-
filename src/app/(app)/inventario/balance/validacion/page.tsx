import Link from "next/link";
import { cascoCarnaval, validacionPasivoAG22 } from "@/modulos/inventario/validacion-pasivo";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../balance.css";
import "./validacion.css";
import { CascoCarnaval } from "./CascoCarnaval";
import { FisicoBodega38 } from "./FisicoBodega38";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · VALIDACIÓN — AG18: lista simple del casco físico que ya tiene baja en SAP (para Carnaval), sin enviar nada.
 * AG22: la validación contra la Base de pasivos.
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
    const d = await validacionPasivoAG22(dia);
    return <div className="fe bal va">{hojas}<FisicoBodega38 datos={d} /></div>;
  }
  const d = await cascoCarnaval(dia);
  return <div className="fe bal va">{hojas}<CascoCarnaval datos={d} /></div>;
}
