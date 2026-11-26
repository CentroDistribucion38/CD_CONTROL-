import { misPermisos } from "@/lib/permisos";
import { AppTraccar } from "./AppTraccar";
import "../traspasos.css";
import "./compartir.css";
import { Compartir } from "./Compartir";

export const dynamic = "force-dynamic";

/**
 * TRASPASOS · COMPARTIR UBICACIÓN.
 *
 * Para el conductor: abre esta pantalla en su celular, escribe la placa y deja la pantalla encendida. Su posición
 * alimenta Tiempos GPS sin necesitar Traccar. Con la parte 2 (en prueba, solo superadmin) ve también los viajes
 * de su placa que facturación ya dejó salir, marca el que va a hacer y se cierra solo al entrar a la geocerca destino.
 */
export default async function CompartirUbicacionPage() {
  const permisos = await misPermisos();
  return (
    <div className="tp">
      <Compartir conViajes={permisos.manda || permisos.puedeVer("/traspasos/compartir-ubicacion")} />
      <AppTraccar />
    </div>
  );
}
