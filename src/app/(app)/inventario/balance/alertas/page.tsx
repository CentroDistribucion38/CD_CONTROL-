import { alertasBalance } from "@/modulos/inventario/balance-alertas";
import "../../../sider/sider.css";
import "../../fefo.css";
import "../balance.css";
import "./alertas.css";
import { Alertas } from "./Alertas";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · ALERTAS — el Balance del día contra el del día anterior con conteo enviado.
 * Dice qué se dejó de contar, qué parece haberse contado con otro estado, y qué diferencia es nueva o sigue igual,
 * para saber si toca recontar, reasignar o ajustar. La cuenta vive en src/modulos/inventario/balance-alertas.ts.
 */
export default async function AlertasPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const q = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.fecha ?? "") ? q.fecha! : null;
  const d = await alertasBalance(dia);
  return (
    <div className="fe bal al">
      <Alertas datos={d} />
    </div>
  );
}
