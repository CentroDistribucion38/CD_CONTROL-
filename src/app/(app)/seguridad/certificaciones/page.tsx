import { leerCertificaciones, leerHistorialValidaciones } from "@/modulos/seguridad/datos";
import { hoyCo } from "@/modulos/seguridad/certificaciones";
import { AlertasCert } from "./AlertasCert";
import { FaltaCert } from "./Falta";
import "../seguridad.css";

export const dynamic = "force-dynamic";

/** SEGURIDAD · CERTIFICACIONES · ALERTAS — las licencias VACA que ya vencieron o vencen este mes, y a quién exigirle. */
export default async function AlertasPage() {
  const [d, hist] = await Promise.all([leerCertificaciones(), leerHistorialValidaciones()]);
  if (d.falta || d.error) return <FaltaCert titulo="Alertas" error={d.error} />;
  const { departamentos, ...config } = d.reglas;
  return <AlertasCert personas={d.personas} hist={hist} hoy={hoyCo()} config={config} departamentos={departamentos} />;
}
