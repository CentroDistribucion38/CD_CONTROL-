
import { createRoot } from "react-dom/client";
import { Transito } from "../src/app/(app)/sider/transito/Transito";

const base = {
  planta: "P01", cd_origen: "CD Unión Apartado", sku: "3500887",
  descripcion: "BOTELLA FLINT 1000R", clase: "EER",
  estibas: 30, sider: 0.83, cajas: 1080, unidades: 14040, hl: 140.4,
  estado: "en_transito", importado: false, faltan_factores: false,
  observacion: null, motivo_anulacion: null, anulado_en: null, anulado_por: null,
  salida_en: "2026-09-10T12:41:00Z", llegada_en: null, en_camino: "357:00:00",
  fotos_salida: 3, fotos_llegada: 0,
  creado_por: "u1", salida_direccion: "Avenida Carrera 38",
  requiere_ai: false, ai_pendiente: false, ai_motivo: null,
  ai_pedido_por: null, ai_pedido_en: null,
};
const viajes = [
  { ...base, id: "v1", placa: "JGY577" },
  { ...base, id: "v2", placa: "JYN245", cd_origen: "CD OL Curumani",
    sku: "3501226", descripcion: "BOTELLA MARRON 250 CC", estibas: 20, sider: 0.56 },
  /* EL QUE LLEGÓ Y ESPERA QUE ALGUIEN CUENTE LA MUESTRA. A este no se
     le ofrece corregir: cambiarle las estibas justo antes de
     contrastarlas es cambiar el dato que se va a contrastar. */
  { ...base, id: "v3", placa: "KKL900", requiere_ai: true, ai_pendiente: true,
    llegada_en: "2026-09-24T10:00:00Z" },
  /* UN SEGUNDO ANULABLE EN EL MISMO CD QUE KKL900. Sin él, ese grupo
     tenía un anulable y un pendiente de muestra, y el «todos» del CD
     —que solo aparece con dos o más— no se podía medir. Con los tres
     juntos se comprueba lo que de verdad importa: que «los 2» escoja
     DOS y deje fuera al que espera la muestra. */
  { ...base, id: "v4", placa: "LMN321" },
];
const origenes = [
  { planta: "P01", cd_origen: "CD Unión Apartado" },
  { planta: "P02", cd_origen: "CD OL Curumani" },
  { planta: "P03", cd_origen: "CD La Arenosa" },
];
const skus = [
  { sku: "3500887", descripcion: "BOTELLA FLINT 1000R" },
  { sku: "3501226", descripcion: "BOTELLA MARRON 250 CC" },
];
/* LOS MAESTROS DE LA REVISIÓN AI, para poder ABRIRLA y medirla. En
   nulo, la pantalla no pinta el formulario y el camino de pasos —donde
   estaba el defecto— no existiría nunca en el arnés.
   SIN COMILLAS INVERTIDAS EN ESTE COMENTARIO: vive dentro de una
   plantilla, y una sola la cierra antes de tiempo. */
const maestrosAi = { falta: false,
  defectos: [ { clave: "rota", nombre: "Rota o despicado", cobra: true, orden: 1, activo: true },
              { clave: "faltante", nombre: "Faltante", cobra: true, orden: 2, activo: true } ],
  envases: [ { clave: "CB320", descripcion: "Costeña Bacana 320 R", litros: 0.32, activo: true } ],
  socios: [ { clave: "bdc", nombre: "Bebidas De La Costa S.A.S", activo: true } ],
  canales: [ { clave: "socios", nombre: "Socios", activo: true } ] };

createRoot(document.getElementById("r")!).render(
  <Transito viajes={viajes as any} nombres={{ u1: "arenosa" }}
            esEditor esAdmin={false}
            manda={(window as any).MANDA !== false}
            origenes={origenes} skus={skus}
            maestrosAi={maestrosAi as any} trabados={1} sinEvidencia={0}
            cabeza={<div className="cabeza"><h1>En tránsito</h1></div>} />);
