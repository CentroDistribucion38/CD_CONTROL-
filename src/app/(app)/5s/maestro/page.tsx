import { misPermisos } from "@/lib/permisos";
import { leerMaestro5S } from "@/modulos/cinco-s/datos";
import { Maestro5S } from "./Maestro5S";
import { Falta5S } from "../Falta";
import "../cinco-s.css";

export const dynamic = "force-dynamic";

/** 5S · MAESTRO — responsables, áreas (con su meta) y el checklist por S. */
export default async function Maestro5SPage() {
  const [m, permisos] = await Promise.all([leerMaestro5S(), misPermisos()]);
  if (m.falta || m.error) return <Falta5S titulo="Maestro" error={m.error} />;
  return <Maestro5S meta={m.meta} areas={m.areas} responsables={m.responsables} puntos={m.puntos} zonas={m.zonas} formatos={m.formatos}
                    puedeEditar={permisos.puedeEditar("/5s/maestro")} />;
}
