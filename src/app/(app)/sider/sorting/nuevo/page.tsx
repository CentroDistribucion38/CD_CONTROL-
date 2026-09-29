import { redirect } from "next/navigation";

/**
 * «VH INTERNO (+)» NO ES UNA PANTALLA APARTE: el «+» vive dentro de
 * «Revisión AI». Esta ruta existe SOLO para que el permiso tenga su casilla
 * en Administración → Roles (las casillas salen del registro, y cada ruta
 * del registro necesita su página). Quien llegue aquí por un enlace viejo va
 * a la pantalla donde está el botón.
 */
export default function VhInternoPage() {
  redirect("/sider/sorting");
}
