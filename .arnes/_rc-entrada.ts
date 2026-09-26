
import { rotulosPdf, calcularVence } from "../src/modulos/inventario/rotulo";

const comun = {
  ubicacion: "A03-M12-IZQ", recibido_por: "Genesis Visbal",
  recibido_en: "26/09/2026, 10:30", placa: "JGY577",
};
const rotulos = [
  { ...comun, folio: "20260926-9845-AB12-01", tipo: "producto" as const,
    sku: "9845", nombre: "Aguila Tw 330Cc X 30", cantidad: 1080, unidad: "cajas" as const,
    numero: 1, total: 3, producido: "2026-09-20",
    vence: calcularVence("2026-09-20", 180), lote: "L-4471" },
  { ...comun, folio: "20260926-9845-AB12-02", tipo: "producto" as const,
    sku: "9845", nombre: "Aguila Tw 330Cc X 30", cantidad: 1080, unidad: "cajas" as const,
    numero: 2, total: 3, producido: "2026-09-20",
    vence: calcularVence("2026-09-20", 180), lote: "L-4471" },
  /* SIN VIDA ÚTIL EN EL MAESTRO: el vencimiento sale null y el rótulo
     tiene que decirlo, no dejar el renglón en blanco. */
  { ...comun, folio: "20260926-9845-AB12-03", tipo: "producto" as const,
    sku: "9845", nombre: "Aguila Tw 330Cc X 30", cantidad: 1080, unidad: "cajas" as const,
    numero: 3, total: 3, producido: "2026-09-20",
    vence: calcularVence("2026-09-20", null), lote: null },
  { ...comun, folio: "20260926-3500162-CD34-01", tipo: "envase" as const,
    sku: "3500162", nombre: "Envase Marron 330R", cantidad: 900, unidad: "unidades" as const,
    numero: 1, total: 1, color: "Ámbar", origen: "CD Unión Apartado" },
];

(async () => {
  try {
    const pdf = await rotulosPdf(rotulos as any, { base: "https://cd38.example" });
    (window as any).__PDF__ = pdf.output("datauristring");
    (window as any).__LISTO__ = true;
  } catch (e: any) {
    (window as any).__LISTO__ = false;
    (window as any).__MAL__ = String(e && e.message || e);
  }
})();

/* Y LO QUE NO SE PUEDE CALCULAR, NO SE CALCULA. Se mide aquí y no en
   node porque es el mismo código que corre en el navegador. */
(window as any).__VENCE__ = {
  bien: calcularVence("2026-09-20", 180),
  sinVida: calcularVence("2026-09-20", null),
  sinFecha: calcularVence(null, 180),
  vidaCero: calcularVence("2026-09-20", 0),
  basura: calcularVence("no-es-fecha", 180),
};
