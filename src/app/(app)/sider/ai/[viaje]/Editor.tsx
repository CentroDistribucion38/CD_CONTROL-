"use client";

/**
 * EL FORMULARIO, CUANDO SE LLEGA A ÉL POR SU PROPIA DIRECCIÓN.
 *
 * El sitio normal de la revisión AI es DENTRO de la certificación de
 * llegada: el administrador marca el vehículo, quien lo recibe cierra la
 * llegada y el formulario sale solo como último paso, sin cambiar de
 * pantalla. Esta ruta es para los dos casos en que eso ya no se puede:
 * el vehículo que llegó y se dejó la revisión para después, y la
 * corrección de una revisión ya guardada.
 *
 * ESTE ARCHIVO EXISTE SOLO PARA DECIR A DÓNDE SE VA DESPUÉS. El
 * formulario dejó de saberlo por dentro —lo sabía, y eso lo ataba a esta
 * pantalla— y ahora lo recibe de quien lo dibuja. Como esa respuesta
 * necesita el router, y el router es del cliente, la página del servidor
 * no puede dárselo: hace falta este pedacito de cliente en medio.
 */

import { useRouter } from "next/navigation";
import { FormularioAi, type ViajeAi } from "@/modulos/sider/FormularioAi";
import type {
  Defecto, EnvaseAi, SocioAi, CanalAi, Revision, DetalleAi,
} from "@/modulos/sider/ai";

export function Editor(props: {
  viaje: ViajeAi;
  revision: Revision | null;
  detalle: DetalleAi[];
  defectos: Defecto[];
  envases: EnvaseAi[];
  socios: SocioAi[];
  canales: CanalAi[];
}) {
  const router = useRouter();
  const volver = () => { router.push("/sider/ai"); router.refresh() };
  return <FormularioAi {...props} alGuardar={volver} alCancelar={volver} />;
}
