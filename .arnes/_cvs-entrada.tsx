
import { createRoot } from "react-dom/client";
import { Inventario } from "../src/app/(app)/inventario/balance/cuadre/carnaval/Inventario";
const secs = [
  { titulo: "ENVASE", colA: "ESTIBA", colB: "CAJA", filas: [{ concepto: "Envase Marron 330R", codigo: "412644", a: 53, b: 33 }] },
  { titulo: "CAJA MALA", colA: "ESTIBA", colB: "CAJA", filas: [{ concepto: "Caja 330", codigo: "3500159", a: 33, b: 31 }] },
  { titulo: "CASCO VIDRIO CERVECERIA ATLANTICO", colA: "ESTIBA", colB: "", filas: [] },
];
const maestro = [{ codigo: "412644", descripcion: "ENVASE MARRON 330NR NUEVO" }, { codigo: "3501225", descripcion: "BOTELLA FLINT 250 CC" }, { codigo: "3500159", descripcion: "Caja Plástica Café 330cc X 30" }];
createRoot(document.getElementById("r")!).render(
  <Inventario fecha="2026-11-17" hoy="2026-11-17" guardado={{ fecha: "2026-11-17", secciones: secs, validacion: [], actualizado_en: "2026-11-17T19:30:00Z" }}
    base={null} dias={["2026-11-17"]} puedeEditar maestro={maestro as any}
    ctx={{ fecha: "2026-11-17", pallets: {}, carnaval: [], casco: { CA22: { nombre: "CA22 ERR Atlántico", fecha: "2026-11-17", filas: [{ sku: "3500162", descripcion: "Envase Marron 330R", estibas: 45 }] } } } as any} />);
