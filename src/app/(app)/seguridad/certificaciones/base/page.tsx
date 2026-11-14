import { leerCertificaciones } from "@/modulos/seguridad/datos";
import { misPermisos } from "@/lib/permisos";
import { BaseCert } from "./BaseCert";
import { FaltaCert } from "../Falta";
import "../../seguridad.css";

export const dynamic = "force-dynamic";

/** SEGURIDAD · CERTIFICACIONES · BASE — subir el Excel «Seguimiento VACA» y actualizar todo de una vez. */
export default async function BasePage() {
  const [d, permisos] = await Promise.all([leerCertificaciones(), misPermisos()]);
  if (d.falta || d.error) return <FaltaCert titulo="Base · importar" error={d.error} />;
  return <BaseCert total={d.personas.length} departamentos={d.reglas.departamentos} vigencia={d.reglas.vigencia}
    puedeEditar={permisos.puedeEditar("/seguridad/certificaciones/base")} />;
}
