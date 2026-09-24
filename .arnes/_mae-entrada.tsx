
import { createRoot } from "react-dom/client";
import { Maestro } from "../src/app/(app)/roturas/Maestro";

const proc = (c, n, a = true) => ({ clave: c, nombre: n, activo: a, orden: 0 });
const procesos = [proc("lineas", "Líneas"), proc("t1", "T1"),
                  proc("traspaso", "Traspaso"), proc("sorting", "Sorting", false)];
const areas = [proc("plazoleta", "Plazoleta"), proc("calle_f", "Calle F")];
const causas = [
  { clave: "estibas_malas", nombre: "Estibas en mal estado", activo: true,
    grupo: "asumida", exige_foto: false, orden: 1 },
  { clave: "falla_maquinas", nombre: "Falla de las máquinas", activo: true,
    grupo: "no_asumida", exige_foto: true, orden: 2 },
];
/* USOS DE VERDAD: uno con cero —que SÍ se puede borrar— y otro con
   muchos —que no—. Con todos en cero, «borrar solo aparece cuando
   nadie lo usó» pasaría sin probar nada. */
const uso = {
  materiales: {}, tolvas: {},
  procesos: { lineas: 159, t1: 0, traspaso: 46, sorting: 0 },
  areas: { plazoleta: 11, calle_f: 0 },
  causas: { estibas_malas: 4, falla_maquinas: 0 },
};
createRoot(document.getElementById("r")!).render(
  <Maestro hojas={["procesos", "areas", "causas"]}
           materiales={[]} procesos={procesos as any} areas={areas as any}
           causas={causas as any} tolvas={[]} uso={uso as any} puedeEditar />);
