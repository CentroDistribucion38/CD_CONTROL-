
import { createRoot } from "react-dom/client";
import { VistoBueno } from "../src/app/(app)/roturas/en-sitio/visto-bueno/VistoBueno";

const base = (i, o) => ({
  id: "r" + i, codigo: "RB-000" + i, material: "EER-AMBAR",
  material_nombre: "Envase retornable ámbar", tipo: "eer", color: "ambar",
  unidades: 10, contaminadas: null, botellas: null,
  unidades_liquido: 0, unidades_vidrio: 10,
  proceso: "lineas", proceso_nombre: "Líneas",
  area: "plazoleta", area_nombre: "Plazoleta",
  causa: "estibas_malas", causa_nombre: "Estibas en mal estado",
  grupo: "asumida", exige_foto: false, descripcion: "Se cayó una estiba",
  lat: null, lng: null, precision_m: null,
  estado: "esperando", esperando: true, cuenta: false,
  reportada_por: "u1", reportada_en: "2026-09-20T12:00:00Z",
  decidida_por: null, decidida_en: null, nota_decision: null,
  fotos: 1, le_falta_foto: false, minutos: 400,
  ol_respuesta: null, ol_por: null, ol_en: null, ol_nota: null,
  etapa: "espera_ol", cobro_por: null, fotos_descargo: 0, ...o,
});
const nombres = { u1: "Genesis Visbal", u2: "Easy OL" };

const roturas = [
  base(1),
  /* UNA CON CAUSA QUE EXIGE FOTO Y SIN FOTO: aceptarla dejaría un
     cobro sin con qué sostenerlo, y la pantalla tiene que decirlo. */
  base(2, { causa: "falla_maquinas", causa_nombre: "Falla de las máquinas",
            grupo: "no_asumida", exige_foto: true, le_falta_foto: true, fotos: 0 }),
];
createRoot(document.getElementById("r")!).render(
  <VistoBueno roturas={roturas as any} nombres={nombres} puedeDecidir
              cifras={{ aCobro: 4, enDesacuerdo: 0, noSeCobran: 3 }} />);
