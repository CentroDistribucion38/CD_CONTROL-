
import { createRoot } from "react-dom/client";
import { Averias } from "../src/app/(app)/inventario/averias/Averias";

const hoy = "2026-09-24";
const d = (n) => {
  const x = new Date("2026-09-24T12:00:00Z"); x.setUTCDate(x.getUTCDate() - n);
  return x.toISOString().slice(0, 10);
};
const base = (i, o) => ({
  id: "a" + i, codigo: "AV-000" + i, fecha: d(3), ubicacion: "A03 · M12",
  producto_sku: "3128", producto: "Aguila RN 330cc X30",
  cajas: 6, unidades: 0, vence: null,
  causal: "deposito", causal_nombre: "Avería depósito", externa: false,
  reporto: "Genesis Visbal", documento: null, documento_en: null, nota: null,
  creado_por: "u1", creado_en: d(3) + "T10:00:00Z",
  anulada_en: null, motivo_anulacion: null,
  pendiente_baja: true, dias_baja: null, dias_para_vencer: null, fotos: 0, ...o,
});
const lista = [
  /* LA VIEJA SIN BAJA: 28 dias. Es la que la pantalla tiene que poner
     por delante, y la que enciende la alerta de «la mas vieja». */
  base(1, { fecha: d(28), cajas: 14, ubicacion: "A07 · M02" }),
  /* UNA QUE SE VENCE Y ADEMAS SIGUE CONTANDO: lo peor de los dos
     mundos —producto que ya no sirve y que el sistema cree que esta—. */
  base(2, { fecha: d(5), vence: d(-12), dias_para_vencer: 12, cajas: 9,
            ubicacion: "A02 · M05" }),
  /* DE AFUERA: llega averiado, es del transportador. */
  base(3, { fecha: d(9), causal: "transporte", causal_nombre: "Avería transporte",
            externa: true, cajas: 4, unidades: 7, ubicacion: "B01 · M01" }),
  /* YA DADA DE BAJA: no cuenta, y a esta NO se le puede ofrecer borrar. */
  base(4, { fecha: d(20), documento: "4900123456", documento_en: d(14) + "T09:00:00Z",
            pendiente_baja: false, dias_baja: 6, cajas: 11, ubicacion: "C03 · M08" }),
  /* ANULADA: la fila se queda, con el motivo. */
  base(5, { fecha: d(15), anulada_en: d(14) + "T09:00:00Z",
            motivo_anulacion: "Se conto dos veces", pendiente_baja: false,
            cajas: 3, ubicacion: "A07 · M02" }),
];
const causales = [
  { clave: "transporte", nombre: "Avería transporte", externa: true, activo: true, orden: 1 },
  { clave: "deposito", nombre: "Avería depósito", externa: false, activo: true, orden: 2 },
  { clave: "contaminado", nombre: "Producto contaminado", externa: false, activo: true, orden: 3 },
];
const productos = [
  { sku: "3128", nombre: "Aguila RN 330cc X30" },
  { sku: "2512", nombre: "Poker R 330cc X30" },
];

createRoot(document.getElementById("r")!).render(
  <Averias lista={lista as any} causales={causales as any} productos={productos as any}
           ubicaciones={[]} puedeEditar={false} manda={false} quien="Mirón" />);
