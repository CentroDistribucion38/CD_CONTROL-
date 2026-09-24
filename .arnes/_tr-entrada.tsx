
import { createRoot } from "react-dom/client";
import { Transito } from "@/app/(app)/sider/transito/Transito";
const ahora = Date.now();
const v = (id, placa, cd, horas) => ({
  id, placa, planta: "Barranquilla", cd_origen: cd, cd_destino: "Barranquilla", sku: "3500887",
  descripcion: "BOTELLA FLINT 1000R", tipo_envase: "EER", estibas: 30, factura: null, lote: null,
  estado: "en_transito", importado: false, observacion: null, motivo_anulacion: null, anulado_en: null,
  anulado_por: null, creado_por: null, creado_en: new Date(ahora - horas * 3600e3).toISOString(),
  fecha: "2026-09-20", num_mes: 9, semana: 38, anio: 2026, sider: 0.83, cajas: 1080, unidades: null, hl: 140.4,
  faltan_factores: false, cert_salida_id: "c" + id, salida_en: new Date(ahora - horas * 3600e3).toISOString(),
  salida_lat: null, salida_lng: null, salida_precision: null, salida_direccion: "Avenida Carrera 38",
  cert_llegada_id: null, llegada_en: null, llegada_lat: null, llegada_lng: null, llegada_precision: null,
  llegada_direccion: null, fotos_salida: 3, fotos_llegada: 0, en_camino: horas + " hours",
  requiere_ai: false, ai_pendiente: false,
});
window.VIAJES = [v("1", "JGY577", "CD Unión Apartado", 5), v("2", "ABC123", "CD La Arenosa", 30),
                 v("3", "KLM456", "CD Galapa", 2), v("4", "XYZ98A", "CD Galapa", 8)];
createRoot(document.getElementById("r")).render(
  <Transito viajes={window.VIAJES} nombres={{}} esEditor={true} esAdmin={false} maestrosAi={null}
            trabados={1} sinEvidencia={0} cabeza={<h1>En tránsito</h1>} />);
