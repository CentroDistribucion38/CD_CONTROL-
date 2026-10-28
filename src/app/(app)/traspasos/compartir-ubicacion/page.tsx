import "../traspasos.css";
import "./compartir.css";
import { Compartir } from "./Compartir";

export const dynamic = "force-dynamic";

/**
 * TRASPASOS · COMPARTIR UBICACIÓN.
 *
 * Para el conductor: abre esta pantalla en su celular, escribe la placa y deja la pantalla encendida. Su posición
 * alimenta Tiempos GPS sin necesitar Traccar.
 */
export default function CompartirUbicacionPage() {
  return (
    <div className="tp">
      <Compartir />
    </div>
  );
}
