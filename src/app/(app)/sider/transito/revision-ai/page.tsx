import { redirect } from "next/navigation";

/**
 * «PEDIR / QUITAR REVISIÓN AI» NO ES UNA PANTALLA APARTE: es el botón de cada
 * vehículo dentro de «En tránsito». Esta ruta existe SOLO para que el permiso
 * tenga su casilla en Administración → Roles (las casillas salen del registro,
 * y cada ruta del registro necesita su página). Quien llegue aquí por un
 * enlace va a la pantalla donde están los botones.
 */
export default function PedirRevisionAiPage() {
  redirect("/sider/transito");
}
