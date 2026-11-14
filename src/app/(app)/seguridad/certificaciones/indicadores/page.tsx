import { leerCertificaciones, leerHistorialValidaciones } from "@/modulos/seguridad/datos";
import { hoyCo } from "@/modulos/seguridad/certificaciones";
import { IndicadoresCert } from "./IndicadoresCert";
import { FaltaCert } from "../Falta";
import "../../seguridad.css";

export const dynamic = "force-dynamic";

/** SEGURIDAD · CERTIFICACIONES · INDICADORES — cumplimiento, ritmo de validación, cobertura y empresas. */
export default async function IndicadoresPage() {
  const [d, hist] = await Promise.all([leerCertificaciones(), leerHistorialValidaciones()]);
  if (d.falta || d.error) return <FaltaCert titulo="Dashboard licencias" error={d.error} />;
  const { departamentos, ...config } = d.reglas;
  return <IndicadoresCert personas={d.personas} hist={hist} hoy={hoyCo()} config={config} departamentos={departamentos} />;
}
