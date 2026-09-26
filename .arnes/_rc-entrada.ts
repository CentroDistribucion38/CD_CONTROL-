
import { rotulosPdf, calcularVence, limiteDespacho, textoQr } from "../src/modulos/inventario/rotulo";

const comun = { ubicacion: "A03-M12-IZQ", placa: "JGY577", recibido: "2026-09-23",
  ancho: 1, alto: 1, largo: 1 };
const vence = calcularVence("2026-09-23", 365);
const prod = { ...comun, tipo: "producto" as const,
  sku: "16210", nombre: "Pony Malta Lta 330Cc X6 Nuevo",
  cantidad: 40, unidad: "cajas" as const, arrume: 480,
  producido: "2026-09-23", vence, limite: limiteDespacho(vence, 30),
  linea: "42", hora: "06:40" };
const rotulos = [
  { ...prod, folio: "16210-20260923-L42-001", numero: 1, total: 12 },
  { ...prod, folio: "16210-20260923-L42-002", numero: 2, total: 12 },
  /* SIN VIDA ÚTIL EN EL MAESTRO: el vencimiento sale null y la tarjeta
     tiene que gritarlo, no dejar la banda en blanco. */
  { ...prod, folio: "16210-20260923-L42-003", numero: 3, total: 12,
    vence: calcularVence("2026-09-23", null), limite: null, linea: null, hora: null,
    ancho: null, alto: null, largo: null },
  { ...comun, folio: "3500162-20260923-001", tipo: "envase" as const,
    sku: "3500162", nombre: "Envase Marron 330R", cantidad: 900,
    unidad: "unidades" as const, arrume: 900, numero: 1, total: 1,
    color: "Ámbar", origen: "CD Unión Apartado" },
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

/* LO QUE NO SE PUEDE CALCULAR, NO SE CALCULA. Se mide aquí y no en node
   porque es el mismo código que corre en el navegador. */
(window as any).__VENCE__ = {
  bien: calcularVence("2026-09-20", 180),
  sinVida: calcularVence("2026-09-20", null),
  sinFecha: calcularVence(null, 180),
  vidaCero: calcularVence("2026-09-20", 0),
  basura: calcularVence("no-es-fecha", 180),
  limite: limiteDespacho("2027-09-23", 30),
  limiteSinVence: limiteDespacho(null, 30),
  limiteSinDias: limiteDespacho("2027-09-23", null),
};
(window as any).__QR__ = textoQr(rotulos[0] as any, "https://cd38.example");
