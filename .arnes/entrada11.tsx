/* LA PANTALLA DE LLEGADA con la SALIDA sin fotos — el caso JYN245.
   Se monta el Transito de verdad y se abre "Certificar llegada", para
   ver el aviso nuevo: que diga de QUÉ fotos habla y que traiga los
   huecos para llenarlas ahí mismo. */
import { createRoot } from "react-dom/client";
import { Transito } from "@/app/(app)/sider/transito/Transito";
import type { Viaje } from "@/modulos/sider/comun";

const viaje = {
  id: "11111111-1111-1111-1111-111111111111",
  placa: "JYN245", cd_origen: "CD Galapa", cd_destino: "CD38", planta: "Galapa",
  sku: "3500028", descripcion: "AGUILA 330 RET", estibas: 24, sider: 1,
  cajas: 1200, unidades: 28800, hl: 95.04,
  estado: "en_transito", importado: false, faltan_factores: false,
  fotos_salida: 0, fotos_llegada: 0,
  creado_por: "u1", creado_en: "2026-09-08T10:05:00Z",
  observacion: null, salida_en: "2026-09-08T10:05:00Z", en_camino: "3:40:00",
} as unknown as Viaje;

/* La salida existe como certificación pero sin ninguna foto: es
   exactamente lo que pasa cuando el dato se cae en el patio. */
const RESPUESTA = {
  puntas: [{
    id: "aaaa1111-1111-1111-1111-111111111111", punta: "salida",
    lat: 10.90312, lng: -74.88710, precision_m: 12,
    ubicado_en: "2026-09-08T10:05:00Z", direccion: "Vía 40, Galapa",
    nota: null, hecha_por: "u1", hecha_en: "2026-09-08T10:05:00Z", fotos: [],
  }],
};

const original = window.fetch;
window.fetch = ((u: RequestInfo | URL, ...resto: unknown[]) => {
  if (String(u).includes("/api/sider/evidencia/")) {
    return Promise.resolve(new Response(JSON.stringify(RESPUESTA), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }
  return (original as (...a: unknown[]) => Promise<Response>)(u, ...resto);
}) as typeof window.fetch;

createRoot(document.getElementById("r")!).render(
  <div className="sd">
    <Transito viajes={[viaje]} nombres={{ u1: "Cristian Pavi" }} esEditor
              trabados={0} sinEvidencia={1} cabeza={null} />
  </div>
);
