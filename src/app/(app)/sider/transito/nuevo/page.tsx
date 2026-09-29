import { redirect } from "next/navigation";

/**
 * «CAMIÓN INTERNO (+)» NO ES UNA PANTALLA.
 *
 * Es un botón flotante dentro de En tránsito. Esta ruta existe SOLO para
 * que el permiso tenga casilla propia en Roles (los permisos se guardan
 * con el texto de la ruta). Quien llegue aquí por la dirección va a
 * En tránsito, que es donde está el botón.
 */
export default function CamionInternoPage() {
  redirect("/sider/transito");
}
