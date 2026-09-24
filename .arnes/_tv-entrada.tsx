
import { createRoot } from "react-dom/client";
import { Registrar } from "../src/app/(app)/traspasos/Registrar";
const tipos = [
  /* «CASCO VIDRIO (TOLVAS)» ES EL CASO QUE ROMPIÓ ESTO. Con el criterio
     viejo —si el nombre dice «tolva», lleva vidrio— a este le salía el
     bloque, y es justo el tipo al que NO le debe salir. Se deja con ese
     nombre a propósito: si alguien vuelve al criterio del nombre, esta
     línea lo delata. */
  { clave: "casco_vidrio", nombre: "Casco vidrio (tolvas)", activo: true, orden: 1,
    cuenta_plan: true, pregunta_arenosa: false, lleva_vidrio: false },
  /* Y ESTE NO DICE «TOLVA» EN NINGUNA PARTE y sí lo lleva: el criterio
     viejo tampoco lo encontraba. */
  { clave: "tolvas_vidrio", nombre: "Vidrio a granel", activo: true, orden: 10,
    cuenta_plan: false, pregunta_arenosa: false, lleva_vidrio: true },
];
const puntos = [
  { clave: "fabrica", nombre: "FABRICA", externo: false, activo: true, orden: 1, descripcion: "Planta" },
  { clave: "bodega38", nombre: "BODEGA 38", externo: false, activo: true, orden: 2, descripcion: "Bodega propia" },
];
createRoot(document.getElementById("r")!).render(
  <Registrar tipos={tipos as any} puntos={puntos as any}
             placas={[{ placa: "FSV898", veces: 9 }, { placa: "NLW428", veces: 4 }, { placa: "PRUEBA", veces: 1 }]}
             placasM={[{ placa: "FSV898", nota: null, activo: true, orden: 1 },
                       { placa: "NLW428", nota: null, activo: true, orden: 2 },
                       { placa: "PRUEBA", nota: null, activo: true, orden: 3 }] as any}
             vidrio={[
  { id: "c1", cedula: "SR-0044", placa: "NLW428", tolvas: 3, neto_kg: 2412.5,
    observacion: null, dias_esperando: 0 },
  { id: "c2", cedula: "SR-0045", placa: "FSV898", tolvas: 5, neto_kg: 4010.0,
    observacion: null, dias_esperando: 2 },
] as any}
             fecha="2026-09-23" turnoSugerido="A" planTurno={{ A: 10 }} hechosTurno={{ A: 6 }}
             planPorTipo={{}} viajes={[] as any} nombres={{}} />);
