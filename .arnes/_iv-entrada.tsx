
import { createRoot } from "react-dom/client";
import { Base } from "../src/app/(app)/inventario/base/Base";

/* Dos FEFO del mismo día: es el caso normal y el que hace más ancha la
   botonera —el botón pasa a decir «Exportar 1 de 2 FEFO»—. */
const conteos = [1, 2].map((i) => ({
  id: "c" + i, codigo: "FEFO-20260919-0" + i, estado: "cerrado",
  fecha_analisis: "2026-09-19", bodega: "CD38",
  responsable: "Santiago Leal", enviado_en: "2026-09-19T15:49:00Z",
  renglones: 11, ubicaciones: 11, total_cajas: 107673,
})) as any;

createRoot(document.getElementById("r")!).render(
  <Base enviadas={[] as any} abiertas={[] as any} conteos={conteos} tope={false} />);
