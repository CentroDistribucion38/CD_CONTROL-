/* EL OJITO con una salida SIN FOTOS — el caso de JYN245, el que quedaba
   trabado para siempre. Se comprueba que los tres huecos son botones,
   que sin ubicación no dejan tocar, y que con ubicación sí. */
import { createRoot } from "react-dom/client";
import { OjoEvidencia } from "@/app/(app)/sider/Evidencia";
import type { Viaje } from "@/modulos/sider/comun";

const viaje = {
  id: "11111111-1111-1111-1111-111111111111",
  placa: "JYN245", cd_origen: "CD Galapa", cd_destino: "CD38", planta: "Galapa",
  sku: "3500028", descripcion: "AGUILA 330 RET", estibas: 24, sider: 1,
  cajas: 1200, unidades: 28800, hl: 95.04,
  estado: "en_transito", importado: false, faltan_factores: false,
  fotos_salida: 0, fotos_llegada: 3,
  creado_por: "u1", creado_en: "2026-09-08T10:05:00Z",
  observacion: null, salida_en: "2026-09-08T10:05:00Z", en_camino: "3:40:00",
} as unknown as Viaje;

/* La respuesta que daría /api/sider/evidencia/<id>: la salida sin
   ninguna foto y la llegada completa, con su observación. */
const RESPUESTA = {
  puntas: [
    {
      id: "aaaa1111-1111-1111-1111-111111111111", punta: "salida",
      lat: 10.90312, lng: -74.88710, precision_m: 12,
      ubicado_en: "2026-09-08T10:05:00Z", direccion: "Vía 40, Galapa",
      nota: null, hecha_por: "u1", hecha_en: "2026-09-08T10:05:00Z",
      fotos: [],
    },
    {
      id: "bbbb1111-1111-1111-1111-111111111111", punta: "llegada",
      lat: 10.97435, lng: -74.77080, precision_m: 92,
      ubicado_en: "2026-09-08T13:45:00Z", direccion: "Avenida Carrera 38, El Boliche",
      nota: "Llegó con el sello de la puerta izquierda roto.",
      hecha_por: "u1", hecha_en: "2026-09-08T13:45:00Z",
      fotos: ["costado_izq", "costado_der", "placa", "observacion"].map((r) => ({
        ranura: r, ruta: `x/llegada/${r}.jpg`, url: null,
        bytes: 240000, ancho: 1600, alto: 1200, subida_en: "2026-09-08T13:46:00Z",
      })),
    },
  ],
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
    <OjoEvidencia viaje={viaje} nombres={{ u1: "Cristian Pavi" }} esEditor />
  </div>
);
