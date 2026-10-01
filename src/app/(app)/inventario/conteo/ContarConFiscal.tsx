"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { Material, Ubicacion } from "@/modulos/inventario/fefo";
import type { HojaParaContar } from "@/modulos/inventario/fiscal";
import { ContarFiscal } from "./ContarFiscal";

/* ===================================================================
   «QUÉ VAS A CONTAR»: EL FEFO DIARIO O LA HOJA DEL FISCAL

   Solo sale para quien tiene una hoja asignada de un inventario fiscal que ya se
   mostró en Contar. Quien no la tiene ve Contar tal cual, sin selector.

   El día del inventario abre en el fiscal —es lo que toca hoy—; los demás días, en
   el FEFO. Las dos pantallas siguen montadas y solo se esconde la que no se usa:
   así lo que se tecleó (o el borrador y la cola del FEFO) no se pierde al cambiar.
   =================================================================== */
export function ContarConFiscal({
  hojas, bodegaId, materiales, ubicaciones, children,
}: {
  hojas: HojaParaContar[];
  bodegaId: string;
  materiales: Material[];
  ubicaciones: Ubicacion[];
  /** El conteo FEFO de siempre (o el aviso de solo lectura). */
  children: ReactNode;
}) {
  const hayHoy = hojas.some((h) => h.puedeContar);
  const [modo, setModo] = useState<"fefo" | "fiscal">(hayHoy ? "fiscal" : "fefo");
  if (hojas.length === 0) return <>{children}</>;

  const unaSola = hojas.length === 1 ? hojas[0] : null;
  return (
    <>
      <div className="fc-modo" role="tablist" aria-label="Qué vas a contar">
        <button type="button" role="tab" aria-selected={modo === "fefo"} className={modo === "fefo" ? "on" : ""}
                onClick={() => setModo("fefo")}>
          <b>FEFO diario</b><span>el recorrido de siempre</span>
        </button>
        <button type="button" role="tab" aria-selected={modo === "fiscal"} className={modo === "fiscal" ? "on" : ""}
                onClick={() => setModo("fiscal")}>
          <b>Fiscal{unaSola ? ` · Hoja ${unaSola.numero}` : ""}</b>
          <span>{hayHoy ? "se cuenta hoy" : "próximamente"}</span>
        </button>
      </div>
      <div hidden={modo !== "fefo"}>{children}</div>
      <div hidden={modo !== "fiscal"}>
        <ContarFiscal hojas={hojas} bodegaId={bodegaId} materiales={materiales} ubicaciones={ubicaciones} />
      </div>
    </>
  );
}
