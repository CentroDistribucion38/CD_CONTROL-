
import { createRoot } from "react-dom/client";
import { EnSitio } from "../src/app/(app)/roturas/en-sitio/EnSitio";

const base = {
  material: "PT-1", tipo: "producto_terminado", color: null,
  contaminadas: null, botellas: null, unidades_liquido: 0,
  area: "plazoleta", area_nombre: "Plazoleta",
  exige_foto: false, descripcion: null,
  lat: null, lng: null, precision_m: null,
  decidida_por: null, decidida_en: null, nota_decision: null,
  reportada_en: "2026-09-23T12:00:00Z",
};
const roturas = [
  { ...base, id: "r10", codigo: "RB-0010",
    material_nombre: "Águila Lig R 750cc X16", unidades: 20, unidades_vidrio: 20,
    proceso: "t1", proceso_nombre: "T1",
    causa: "mal_arrumado", causa_nombre: "Mal estibado", grupo: "asumida",
    estado: "esperando", esperando: true, cuenta: false,
    reportada_por: "u1", fotos: 1, le_falta_foto: false, minutos: 0 },
  { ...base, id: "r9", codigo: "RB-0009",
    material_nombre: "Águila RN 330cc X30", unidades: 100, unidades_vidrio: 100,
    contaminadas: 200, botellas: 100, unidades_liquido: 300,
    proceso: "t1", proceso_nombre: "T1",
    causa: "", causa_nombre: "", grupo: "asumida",
    estado: "cuenta", esperando: false, cuenta: true,
    reportada_por: "u2", fotos: 1, le_falta_foto: false, minutos: 1080 },
  { ...base, id: "r8", codigo: "RB-0008",
    material_nombre: "Águila RN 330cc X30", unidades: 1, unidades_vidrio: 1,
    proceso: "lineas", proceso_nombre: "Líneas",
    causa: "", causa_nombre: "", grupo: "asumida",
    estado: "esperando", esperando: true, cuenta: false,
    reportada_por: "u1", fotos: 1, le_falta_foto: false, minutos: 1080 },
  { ...base, id: "r7", codigo: "RB-0007",
    material_nombre: "Poker R 330cc X30", unidades: 7, unidades_vidrio: 7,
    proceso: "sorting", proceso_nombre: "Sorting",
    causa: "falla_depa", causa_nombre: "Falla del pallet DEPA", grupo: "no_asumida",
    estado: "esperando", esperando: true, cuenta: false, exige_foto: true,
    reportada_por: "u2", fotos: 0, le_falta_foto: true, minutos: 200 },
  { ...base, id: "r6", codigo: "RB-0006",
    material_nombre: "Costeña R 330cc X30", unidades: 5, unidades_vidrio: 5,
    proceso: "lineas", proceso_nombre: "Líneas",
    causa: "estibas_malas", causa_nombre: "Estibas en mal estado", grupo: "asumida",
    estado: "anulada", esperando: false, cuenta: false,
    reportada_por: "u1", fotos: 0, le_falta_foto: false, minutos: 4000 },
];
const procesos = [
  { clave: "lineas", nombre: "Líneas", activo: true, orden: 1 },
  { clave: "t1", nombre: "T1", activo: true, orden: 2 },
  { clave: "sorting", nombre: "Sorting", activo: true, orden: 5 },
];
createRoot(document.getElementById("r")!).render(
  <EnSitio esperando={3} roturas={roturas as any}
           nombres={{ u1: "admin", u2: "sleal" }}
           materiales={[] as any} materialesDe="inventario"
           procesos={procesos as any} areas={[] as any} causas={[] as any} puedeEditar />);
