
import { createRoot } from "react-dom/client";
import { Averias } from "../src/app/(app)/inventario/averias/Averias";

/* DOS CALLES, Y UNA CON MÓDULO DE UN SOLO LADO Y OTRA DE DOS: con
   todos iguales, «si el módulo no tiene lados se escoge solo» pasaría
   sin probar nada. */
const ubicaciones = [
  { id: "u1", clave: "A03_IZQ", calle: "A03", modulo: "M12", lado: "IZQ", activa: true },
  { id: "u2", clave: "A03_DER", calle: "A03", modulo: "M12", lado: "DER", activa: true },
  { id: "u3", clave: "A03_M13", calle: "A03", modulo: "M13", lado: null, activa: true },
  { id: "u4", clave: "B01_IZQ", calle: "B01", modulo: "M01", lado: "IZQ", activa: true },
];

/* CIEN PRODUCTOS: con siete, un desplegable nativo bastaba y el
   buscador no probaría nada. */
const productos = Array.from({ length: 100 }, (_, i) => ({
  sku: "SKU" + String(1000 + i),
  nombre: (i === 42 ? "Aguila Cero Lta 355Cc X 24" : "Producto de prueba " + i),
}));

const causales = [
  { clave: "transporte", nombre: "Avería transporte", externa: true, activo: true, orden: 1 },
  { clave: "deposito", nombre: "Avería depósito", externa: false, activo: true, orden: 2 },
];

createRoot(document.getElementById("r")!).render(
  <Averias lista={[]} causales={causales as any} productos={productos as any}
           ubicaciones={ubicaciones as any} puedeEditar manda
           quien="Administrador" modo="registrar" />);
