import type { EnLinea } from "@/modulos/inventario/analisis-dif";

/* EN LÍNEA EN TODO EL FLUJO: lo que el plan de envase pone a correr ese día se marca igual en el Análisis, Todos los almacenes,
   Ajustes, Análisis final y Valor: la línea toma envase mientras se cuenta, así que esa diferencia puede no ser real. */
export type MapaEnLinea = Record<string, EnLinea[]>;
const T = ["", "T1", "T2", "T3"];
export const detalleEnLinea = (xs: EnLinea[]) =>
  xs.map((x) => `${x.tren} · ${x.sku} (${x.sap}) · ${x.turnos.map((t) => T[t] ?? t).join(", ")}${x.por === "caja" ? " · su caja" : ""}`).join("\n");

/** La etiqueta de una fila; no pinta nada si ese código no está en línea. */
export function EtiquetaEnLinea({ xs }: { xs?: EnLinea[] }) {
  if (!xs?.length) return null;
  return <span className="ad-enl" title={"En línea según el plan de envase:\n" + detalleEnLinea(xs)}>EN LÍNEA · {[...new Set(xs.map((x) => x.tren))].join(" · ")}</span>;
}

/** La leyenda de arriba de la tabla: cuántos de los códigos que se ven están en línea. */
export function LeyendaEnLinea({ codigos, enLinea }: { codigos: string[]; enLinea: MapaEnLinea }) {
  const n = new Set(codigos.filter((c) => enLinea[c]?.length)).size;
  if (!n) return null;
  return <p className="ad-enl-ley"><span className="ad-enl">EN LÍNEA</span> {n} {n === 1 ? "código está" : "códigos están"} en producción ese día según el plan de envase: la línea los está tomando mientras se cuenta, así que su diferencia puede no ser real. Pasa el mouse por la etiqueta para ver el SKU y el turno.</p>;
}
