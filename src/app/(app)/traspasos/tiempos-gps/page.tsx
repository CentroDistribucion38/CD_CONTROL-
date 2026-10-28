import { misPermisos } from "@/lib/permisos";
import "../traspasos.css";
import "./tiempos-gps.css";
import { TiemposGps } from "./TiemposGps";

export const dynamic = "force-dynamic";

/**
 * TRASPASOS · TIEMPOS GPS.
 *
 * El mapa de los vehículos con sus zonas (Fábrica, Bodega 38, Arenosa, Exportación…): cuando uno entra a una zona
 * se marca el inicio, cuando sale se marca el final y queda en tránsito hasta la siguiente. De ahí salen los tiempos
 * por zona y los flujos. Las posiciones vienen de Traccar; sin él corre en modo demo.
 */
export default async function TiemposGpsPage() {
  const permisos = await misPermisos();
  return (
    <div className="tp">
      <TiemposGps puedeEditar={permisos.puedeEditar("/traspasos/tiempos-gps")} />
    </div>
  );
}
