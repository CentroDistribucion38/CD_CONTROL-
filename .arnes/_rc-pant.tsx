
import { createRoot } from "react-dom/client";
import { Recibir } from "../src/app/(app)/inventario/recibir/Recibir";

const base = { unidades_por_caja: 30, cajas_por_estiba: 36, unidades_por_estiba: 1080,
  contenido: 330, presentacion: "Tw", f_limite_desp: 7, dias_minimo: 30,
  origen: "NACIONAL", foraneo: "LOCAL", activo: true };
const materiales = [
  { ...base, id: "m1", sku: "9845", nombre: "Aguila Tw 330Cc X 30", familia: "Tw",
    vida_util: 180, tipo_material: "PRODUCTO", en_sitio: true },
  /* SIN VIDA ÚTIL EN EL MAESTRO: es el que no se puede ordenar por FEFO
     y la pantalla tiene que avisarlo ANTES de gastar papel. */
  { ...base, id: "m2", sku: "2182", nombre: "Pony Malta R 330cc X 30", familia: "Ret",
    vida_util: null, tipo_material: "PRODUCTO", en_sitio: true },
  { ...base, id: "m3", sku: "3500162", nombre: "Envase Marron 330R", familia: "Ret",
    vida_util: null, tipo_material: "ENVASE", en_sitio: true, cajas_por_estiba: null },
  { ...base, id: "m4", sku: "3500213", nombre: "Envase Flint 330R", familia: "Ret",
    vida_util: null, tipo_material: "ENVASE", en_sitio: false },
];
const ubicaciones = [
  { id: "u1", bodega_id: "b1", clave: "A03-M12-IZQ", calle: "A03", modulo: "M12",
    lado: "IZQ", familia: null, capacidad: 30, activa: true },
  { id: "u2", bodega_id: "b1", clave: "A03-M12-DER", calle: "A03", modulo: "M12",
    lado: "DER", familia: null, capacidad: 30, activa: true },
  { id: "u3", bodega_id: "b1", clave: "B07-M04", calle: "B07", modulo: "M04",
    lado: null, familia: null, capacidad: 20, activa: true },
];
createRoot(document.getElementById("r")!).render(
  <Recibir materiales={materiales as any} ubicaciones={ubicaciones as any}
           quien="Genesis Visbal" puedeRecibir />);
