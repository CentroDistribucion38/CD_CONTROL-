import { diasConPasivos, leerMaestroPasivos, leerPasivos } from "@/modulos/pasivos/datos";
import { ubicacionesParaPasivos } from "@/modulos/pasivos/ubicaciones";
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
  /* LA UBICACIÓN de cada pasivo sale del conteo de ese día (Bodega 38 y Fábrica). */
  const [filas, ubic] = await Promise.all([
    dia && desde ? leerPasivos(desde, dia) : Promise.resolve({ data: [], error: null }),
    dia ? ubicacionesParaPasivos(dia) : Promise.resolve({ fecha: null, mapa: {} }),
  ]);
  const cajas = Object.fromEntries(maestro.data.map((m) => [m.codigo, m.descripcion]));
  /* EL EXTRASUCIO se guarda en la Base como estado LAVADO con causal EXTRASUCIO; en el informe cuenta como su propio estado. */
  const filasInforme = filas.data.map((f) => (["EXTRASUCIO", "PENDIENTE EXTRASUCIO"].includes((f.causal ?? "").trim().toUpperCase()) ? { ...f, estado: "EXTRASUCIO" } : f));

  return (
    <div className="fe bal pas ipas">
      <InformePasivo dia={dia} dias={dias} filas={filasInforme} error={filas.error} nombresCaja={cajas} ubic={ubic} />
    </div>
  );
}
