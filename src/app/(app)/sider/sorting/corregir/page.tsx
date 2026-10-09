import { redirect } from "next/navigation";

/**
 * «CORREGIR REVISIÓN AI» NO ES UNA PANTALLA APARTE: es el botón «Corregir»
 * de «Hechas», dentro de «Revisión AI». Esta ruta existe SOLO para que el
 * permiso tenga su casilla en Administración → Roles (las casillas salen
 * del registro, y cada ruta del registro necesita su página). Quien llegue
 * aquí va a la pantalla donde está el botón.
 */
export default function CorregirRevisionPage() {
  redirect("/sider/sorting");
}
