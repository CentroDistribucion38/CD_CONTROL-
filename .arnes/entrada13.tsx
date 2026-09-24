/* EL SIMULADOR: guardar agosto, irse a septiembre y volver a agosto.
   El bug era que al volver mostraba el agosto VIEJO, porque `guardados`
   viene del render del servidor y no cambia porque uno guarde. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TableroQuiebra } from "@/components/TableroQuiebra";

const metas = Array.from({ length: 12 }, (_, i) => ({ anio: 2026, mes: i + 1, meta: 0.016 }));
const meses = [
  { anio: 2026, num_mes: 8, produccion: 94352629, baja: 2494333, pct: 0.0264, dias_escritos: 31 },
  { anio: 2026, num_mes: 9, produccion: 13365109, baja: 0, pct: 0, dias_escritos: 0 },
];
const bajas = [
  { fecha: "2026-08-10", causal: "Otros", almacen: "AG18", material: "3500028", denominacion: "X", cantidad: 2494333 },
  { fecha: "2026-09-05", causal: "Otros", almacen: "AG18", material: "3500028", denominacion: "X", cantidad: 0 },
];
const produccion = [
  { fecha: "2026-08-10", linea: 1, cantidad: 94352629 },
  { fecha: "2026-09-05", linea: 1, cantidad: 13365109 },
];

function Arnes() {
  /* Nada guardado de entrada: se guarda agosto desde la pantalla. */
  const [sims] = useState<never[]>([]);
  return (
    <>
      <TableroQuiebra bajas={bajas as never[]} produccion={produccion as never[]}
                      metas={metas} ultimaCarga={null} esEditor meses={meses as never[]}
                      simuladores={sims} />
    </>
  );
}
createRoot(document.getElementById("r")!).render(<Arnes />);
