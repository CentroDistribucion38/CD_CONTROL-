import { leerCertificaciones } from "@/modulos/seguridad/datos";
import { misPermisos } from "@/lib/permisos";
import { MaestroCert } from "./MaestroCert";
import { FaltaCert } from "../Falta";
import "../../seguridad.css";

export const dynamic = "force-dynamic";

/** SEGURIDAD · CERTIFICACIONES · MAESTRO — empresas (con su Interventor ABI y Coordinador), grupos, validadores, responsables y reglas. */
export default async function MaestroPage() {
  const [d, permisos] = await Promise.all([leerCertificaciones(), misPermisos()]);
  if (d.falta || d.error) return <FaltaCert titulo="Maestro" error={d.error} />;
  return <MaestroCert personas={d.personas} reglas={d.reglas} empresas={d.empresas} grupos={d.grupos}
    responsables={d.responsables} validadores={d.validadores}
    puedeEditar={permisos.puedeEditar("/seguridad/certificaciones/maestro")} />;
}
