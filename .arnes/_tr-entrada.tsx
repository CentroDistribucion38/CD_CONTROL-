
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
createRoot(document.getElementById("r")!).render(
  <Transito viajes={viajes as any} nombres={{ u1: "arenosa" }}
            esEditor esAdmin={false}
            manda={(window as any).MANDA !== false}
            origenes={origenes} skus={skus}
            maestrosAi={null} trabados={1} sinEvidencia={0}
            cabeza={<div className="cabeza"><h1>En tránsito</h1></div>} />);
