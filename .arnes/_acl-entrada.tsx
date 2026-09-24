
import { createRoot } from "react-dom/client";
import { Todas } from "../src/app/(app)/acciones/Todas";

const base = (i, o = {}) => ({
  id: "a" + i, codigo: "AC-000" + i, tipo: "correctiva",
  titulo: "Pasillo obstruido " + i, descripcion: null,
  motivo: "orden", motivo_nombre: "Orden y aseo", motivo_critico: false,
  area: "almacenamiento", area_nombre: "Almacenamiento",
  zona: null, zona_nombre: null, zona_proceso: null, ubicacion: "Pasillo " + i,
  lat: null, lng: null, precision_m: null,
  prioridad: "media", plazo: null, vence_en: "2026-09-20T12:00:00Z",
  estado: "abierta", viva: true, vencida: true, horas_restantes: -50, dias: 2,
  equipo: null, equipo_nombre: null, responsable: null, sin_dueno: true,
  reportada_por: "u1", reportada_en: "2026-09-18T12:00:00Z", fotos: 0,
  que_se_hizo: null, cerrada_por: null, ...o,
});
/* CUATRO VIVAS Y DOS CERRADAS a propósito: con todas en el mismo
   estado, «se avisa lo ya cerrado» y «todas es todas LAS QUE SE VEN»
   pasarían sin probar nada —el filtro arranca en «abiertas»—. */
const acciones = [
  base(1), base(2), base(3), base(4),
  base(5, { estado: "cerrada", viva: false, vencida: false, que_se_hizo: "Se despejó" }),
  base(6, { estado: "cerrada", viva: false, vencida: false, que_se_hizo: "Se despejó" }),
];
createRoot(document.getElementById("r")!).render(
  <Todas acciones={acciones as any} nombres={{ u1: "Genesis Visbal" }}
         zonas={[]} motivos={[]} areas={[{ clave: "almacenamiento", nombre: "Almacenamiento" }]}
         plazos={{}} gente={[]} puedeEditar
         manda={(window as any).__MANDA__} />);
