import "../fefo.css";
import "./plan-fifo.css";
import { planFifo } from "@/modulos/inventario/plan-fifo";
import { PlanFifo } from "./PlanFifo";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · DESPACHO FIFO.
 *
 * Elegir 1, 2 o 3 materiales y ver, módulo por módulo, de dónde sacarlos para cumplir el FIFO (primero lo que
 * más tiempo lleva quieto en su ubicación), con el acumulado de cajas, y poder imprimirlo como hoja de salida.
 * Solo lee el conteo ENVIADO de un día; no escribe nada.
 */
export default async function DespachoFifoPage({ searchParams }: { searchParams?: Promise<{ dia?: string; sku?: string }> }) {
  const sp = (await searchParams) ?? {};
  const datos = await planFifo(sp.dia);
  const inicial = (sp.sku ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  return (
    <div className="fe pf">
      <section className="cabeza pf-no-papel">
        <div>
          <p className="ojo">INVENTARIO · CONTEOS · ENVASE</p>
          <h1>Plan de despacho FIFO</h1>
          <p className="sub">
            Escoge uno, dos o tres materiales y te digo qué módulos tomar, en orden: primero lo que más tiempo lleva
            quieto en su ubicación. Lo imprimes y sales a la bodega con la hoja.
          </p>
        </div>
      </section>
      <PlanFifo datos={datos} inicial={inicial} />
    </div>
  );
}
