
import { createRoot } from "react-dom/client";
import { Registrar } from "../src/app/(app)/traspasos/Registrar";
(window as any).disp = [
  { sku: "3500162", descripcion: "Envase Marron 330R", inventario: 32, apartado: 12, disponible: 20, hl_estiba: 44.55 },
  { sku: "3500888", descripcion: "Botella Marron 1000CC", inventario: 6, apartado: 0, disponible: 6, hl_estiba: 46.8 },
  { sku: "3500213", descripcion: "Envase Flint 330R", inventario: 4, apartado: 4, disponible: 0, hl_estiba: 44.55 },
];
const tipos = [
  { clave: "casco_vidrio", nombre: "Casco vidrio", activo: true, orden: 1, cuenta_plan: true, pregunta_arenosa: false, materiales: "casco" },
  { clave: "pet", nombre: "PET", activo: true, orden: 2, cuenta_plan: true, pregunta_arenosa: false, materiales: "pet" },
];
const puntos = [
  { clave: "bodega38", nombre: "BODEGA 38", externo: false, activo: true, orden: 1, descripcion: "AG22", casco_ubicacion: "BODEGA 38" },
  { clave: "carnaval", nombre: "CARNAVAL", externo: false, activo: true, orden: 2, descripcion: "AG07", casco_ubicacion: "CARNAVAL" },
  { clave: "arenosa", nombre: "ARENOSA", externo: true, activo: true, orden: 3, descripcion: "Externo", casco_ubicacion: null },
];
createRoot(document.getElementById("r")!).render(
  <Registrar tipos={tipos as any} puntos={puntos as any} placas={[{ placa: "FSV898", veces: 9 }]}
             placasM={[{ placa: "FSV898", nota: null, activo: true, orden: 1 }] as any}
             fecha="2026-11-17" turnoSugerido="A" planTurno={{ A: 10 }} hechosTurno={{ A: 6 }}
             planPorTipo={{}} viajes={[] as any} nombres={{}} />);
