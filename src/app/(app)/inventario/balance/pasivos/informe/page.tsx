import { diasConPasivos, leerMaestroPasivos, leerPasivos } from "@/modulos/pasivos/datos";
import "../../../../sider/sider.css";
import "../../../fefo.css";
import "../../balance.css";
import "../pasivos.css";
import "./informe.css";
import { InformePasivo } from "./InformePasivo";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · PASIVOS · INFORME — la hoja INFORME de BLOQUEADOS.xlsx, hecha pantalla.
 *
 * Del día escogido: total de pasivos en HL y en pesos, por almacén, por SKU (HL y $), las cajas
 * plásticas comprometidas y el consolidado (la TD). Del mes hasta ese día: los EER bloqueados por
 * día (por estado) y la línea de HL diarios. Todo sale de la base de Pasivos (v_pasivos_base).
 */
export default async function InformePasivoPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const q = await searchParams;
  const [dias, maestro] = await Promise.all([diasConPasivos(), leerMaestroPasivos()]);
  const pedido = /^\d{4}-\d{2}-\d{2}$/.test(q.dia ?? "") ? q.dia! : null;
  const dia = pedido && dias.includes(pedido) ? pedido : (dias[dias.length - 1] ?? null);
  const desde = dia ? `${dia.slice(0, 7)}-01` : null;
  const filas = dia && desde ? await leerPasivos(desde, dia) : { data: [], error: null };
  const cajas = Object.fromEntries(maestro.data.map((m) => [m.codigo, m.descripcion]));

  return (
    <div className="fe bal pas ipas">
      <InformePasivo dia={dia} dias={dias} filas={filas.data} error={filas.error} nombresCaja={cajas} />
    </div>
  );
}
