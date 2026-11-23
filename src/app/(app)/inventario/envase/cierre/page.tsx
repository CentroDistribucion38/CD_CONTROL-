import Link from "next/link";
import { cierreDeSemanas } from "@/modulos/inventario/envase/semana";
import "../../fefo.css";
import "../envase.css";
import { CierreSemanas } from "../cargar/CierreSemanas";
import { Pasos } from "../Pasos";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO › PLAN VS NOTIFICADO › CIERRE DE LA SEMANA (paso 6, cada semana).
 * La semana pasada y la actual: plan inicial, plan vigente, REAL (reporte de adherencia), notificado y lo que quedó pendiente
 * por notificar SKU por SKU, en HL, unidades, cajas o estibas. Antes vivía arriba en Cargar; Cargar quedó solo para subir.
 */
export default async function CierrePage() {
  const sem = await cierreDeSemanas();
  return (
    <div className="fe pe">
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · PLAN VS NOTIFICADO</p>
        <h1>Cierre de la semana</h1>
        <p className="sub">La semana pasada contra lo <b>real</b> (el reporte de adherencia) y cómo va la actual: plan, real, notificado y lo que quedó
          pendiente por notificar, SKU por SKU. El reporte de adherencia y la MB51 se suben en <Link href="/inventario/envase/cargar">Cargar archivos</Link>.</p>
      </div></section>
      <Pasos ruta="/inventario/envase/cierre" />
      {sem.error && <p className="pe-error">No se pudo leer todo: {sem.error}</p>}
      <CierreSemanas semanas={sem.semanas} maestro={sem.maestro} mb51={sem.mb51} faltaAdh={sem.faltaAdh} />
    </div>
  );
}
