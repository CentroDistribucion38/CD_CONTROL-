import { leerCertificaciones } from "@/modulos/seguridad/datos";
import { hoyCo } from "@/modulos/seguridad/certificaciones";
import { misPermisos } from "@/lib/permisos";
import { PersonasCert } from "./PersonasCert";
import { FaltaCert } from "../Falta";
import "../../seguridad.css";

export const dynamic = "force-dynamic";

/** SEGURIDAD · CERTIFICACIONES · PERSONAS — la base organizada: registrar, renovar, cambiar estado e historial. */
export default async function PersonasPage() {
  const [d, permisos] = await Promise.all([leerCertificaciones(), misPermisos()]);
  if (d.falta || d.error) return <FaltaCert titulo="Personas" error={d.error} />;
  return (
    <PersonasCert personas={d.personas} hoy={hoyCo()} config={d.reglas} empresas={d.empresas} grupos={d.grupos}
      responsables={d.responsables} validadores={d.validadores}
      puedeEditar={permisos.puedeEditar("/seguridad/certificaciones/personas")} />
  );
}
