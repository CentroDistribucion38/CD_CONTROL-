
import { createRoot } from "react-dom/client";
import { Salidas } from "../src/app/(app)/roturas/salida/Salidas";

const sal = (i, o) => ({
  id: "s" + i, codigo: "SR-000" + i, estado: "cerrada", placa: "ABC12" + i,
  observacion: null, creada_por: "u1", creada_en: "2026-09-22T12:00:00Z",
  tolvas: 1, neto_kg: 100 * i, bruto_kg: 100 * i + 111, tara_kg: 111,
  firmas: 2, completa: true, mismo_firmante: false,
  supervisora_en: "2026-09-22T13:00:00Z", verificador_en: "2026-09-22T14:00:00Z",
  validador_en: null, despachada_en: null, viaje_codigo: null,
  reaperturas: 0, reabierta_nota: null, motivo_anulacion: null, anulada_en: null, ...o,
});
const nombres = { u1: "Genesis Visbal" };

/* TRES ABIERTAS Y DOS QUE YA SALIERON: es lo que hace medible que
   «todas» sea todas LAS QUE SE VEN y no todas las que hay. Con las
   cinco en el mismo estado, esa prueba pasaría sin probar nada. */
/* LOS CUATRO ESTADOS, uno de cada: con tres despachadas y ninguna
   anulada, «cada estado tiene su chip» pasaría sin probar tres de los
   cuatro. */
const salidas = [
  sal(1, { estado: "abierta", firmas: 0, completa: false, supervisora_en: null,
           verificador_en: null }),
  sal(2, { estado: "abierta", firmas: 0, completa: false, supervisora_en: null,
           verificador_en: null }),
  sal(3, { estado: "abierta", firmas: 0, completa: false, supervisora_en: null,
           verificador_en: null }),
  sal(4, { despachada_en: "2026-09-23T10:00:00Z", viaje_codigo: "VJ-9",
           mismo_firmante: true }),
  sal(5),                                   // cerrada sin despachar
  sal(6, { firmas: 1, completa: false, verificador_en: null }),  // media firma
  sal(7, { estado: "anulada", firmas: 0, completa: false,
           supervisora_en: null, verificador_en: null, placa: null }),
];
createRoot(document.getElementById("r")!).render(
  <Salidas salidas={salidas as any} nombres={nombres}
           puedeAbrir manda={(window as any).__MANDA__} />);
