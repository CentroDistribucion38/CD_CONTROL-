
import { createRoot } from "react-dom/client";
import { Hallazgos } from "../src/app/(app)/acciones/abi/hallazgos/Hallazgos";
import { Informe } from "../src/app/(app)/acciones/abi/informe/Informe";

const base = (i: number, o: any = {}) => ({
  id: "h" + i, codigo: "HZ-000" + i, fecha: "2026-09-10",
  tema: "inocuidad", tema_nombre: "Inocuidad", severidad: "hallazgo",
  area: "almacenamiento", area_nombre: "Almacenamiento",
  zona: "P3", zona_nombre: "Pasillo 3", ubicacion: "Estiba del fondo",
  lo_que_se_vio: "Había una estiba de producto terminado pegada a la pared del pasillo tres, " +
                 "tapando el extintor.",
  redaccion: null, redactado_por: null, redactado_en: null,
  ia_borrador: null, ia_en: null, recomendacion: "Reubicar la estiba y demarcar el acceso.",
  estado: "borrador", accion_id: null, accion_codigo: null, accion_estado: null,
  creado_por: "u1", creado_en: "2026-09-10T12:00:00Z",
  anulado_en: null, motivo_anulacion: null,
  fotos: 1, fotos_antes: 1, fotos_despues: 0,
  falta_redaccion: true, tal_cual_de_la_ia: false, tiene_accion: false, ...o,
});

/* DOS SIN REDACTAR Y DOS APROBADOS A PROPÓSITO: con todos iguales, «al
   informe solo entra lo aprobado» pasaría sin probar nada. */
const REDACTADO = {
  redaccion: "Se evidencia una estiba de producto terminado ubicada contra el muro del pasillo " +
             "tres, obstruyendo el acceso al extintor.",
  redactado_por: "u2", redactado_en: "2026-09-11T12:00:00Z",
  estado: "firme", falta_redaccion: false,
};
const hallazgos = [
  base(1),
  base(2, { severidad: "critico" }),
  base(3, REDACTADO),
  base(4, { ...REDACTADO, fotos: 2, fotos_antes: 1, fotos_despues: 1,
            tiene_accion: true, accion_id: "a1", accion_codigo: "AC-0042" }),
];

const cual = (window as any).__QUE__;
createRoot(document.getElementById("r")!).render(
  cual === "informe"
    ? <Informe hallazgos={hallazgos as any}
               temas={[{ clave: "inocuidad", nombre: "Inocuidad", activo: true, orden: 1 }]}
               nombres={{ u1: "Genesis Visbal", u2: "Cristian Pavia" }}
               hoy="2026-09-24" />
    : <Hallazgos hallazgos={hallazgos as any}
                 nombres={{ u1: "Genesis Visbal", u2: "Cristian Pavia" }}
                 motivos={[{ clave: "orden", nombre: "Orden y aseo" } as any]}
                 puedeEditar manda={(window as any).__MANDA__} />);
