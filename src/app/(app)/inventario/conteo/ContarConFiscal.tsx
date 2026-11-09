"use client";

import type { ReactNode } from "react";
import type { Material, Ubicacion } from "@/modulos/inventario/fefo";
import type { HojaParaContar } from "@/modulos/inventario/fiscal";
import { ContarFiscal } from "./ContarFiscal";

/* ===================================================================
   MIENTRAS HAYA UN INVENTARIO FISCAL PARA HOY SIN FINALIZAR, SOLO SE VE EL FISCAL

   Quien tiene una hoja del fiscal asignada para hoy NO ve el conteo diario (FEFO) ni elige entre los dos:
   cuenta el fiscal. Cuando el fiscal culmina su hoja, vuelve el conteo normal.
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
  const activas = hojas.filter((h) => h.puedeContar && !h.finalizada);
  if (activas.length === 0) return <>{children}</>;
  return <ContarFiscal hojas={activas} bodegaId={bodegaId} materiales={materiales} ubicaciones={ubicaciones} />;
}
