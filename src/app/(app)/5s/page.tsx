import { misPermisos } from "@/lib/permisos";
import { leerMaestro5S, leerUsuarios5S, miId, miNombre } from "@/modulos/cinco-s/datos";
import { Inspeccionar } from "./Inspeccionar";
import { Falta5S } from "./Falta";
import "./cinco-s.css";

export const dynamic = "force-dynamic";

/** 5S · INSPECCIONAR — la auditoría de un área con el checklist por S, fotos y el marcador en vivo. */
export default async function Inspeccionar5SPage() {
  const [m, permisos, auditor, usuarios, yo] = await Promise.all([leerMaestro5S(), misPermisos(), miNombre(), leerUsuarios5S(), miId()]);
  if (m.falta || m.error) return <Falta5S titulo="Inspeccionar" error={m.error} />;
  return <Inspeccionar areas={m.areas} responsables={m.responsables} usuarios={usuarios} puntos={m.puntos} zonas={m.zonas} formatos={m.formatos} metaGeneral={m.meta}
                       auditor={auditor} auditorCargo={usuarios.find((u) => u.id === yo)?.cargo ?? null} puedeEditar={permisos.puedeEditar("/5s")} />;
}
