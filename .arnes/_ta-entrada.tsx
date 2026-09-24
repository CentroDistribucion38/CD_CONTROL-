
import { createRoot } from "react-dom/client";
import { Registrar } from "../src/app/(app)/traspasos/Registrar";
const tipos = [
  { clave: "casco_vidrio", nombre: "Casco vidrio", activo: true, orden: 1, cuenta_plan: true, pregunta_arenosa: false },
  { clave: "estibas", nombre: "Estibas", activo: true, orden: 3, cuenta_plan: true, pregunta_arenosa: true },
  { clave: "tolvas_vidrio", nombre: "Tolvas de Vidrio", activo: true, orden: 10, cuenta_plan: false, pregunta_arenosa: false },
];
const puntos = [
  { clave: "fabrica", nombre: "FABRICA", externo: false, activo: true, orden: 1, descripcion: "Planta" },
  { clave: "bodega38", nombre: "BODEGA 38", externo: false, activo: true, orden: 2, descripcion: "Bodega propia" },
];
createRoot(document.getElementById("r")!).render(
  <Registrar tipos={tipos as any} puntos={puntos as any} placas={[{ placa: "FSV898", veces: 9 }]}
             placasM={[{ placa: "FSV898", nota: null, activo: true, orden: 1 }] as any}
             fecha="2026-09-22" turnoSugerido="A" planTurno={{ A: 10 }} hechosTurno={{ A: 6 }}
             planPorTipo={{}} viajes={[] as any} nombres={{}} />);
