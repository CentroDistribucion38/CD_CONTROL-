import { leerCertificaciones } from "@/modulos/seguridad/datos";
import { hoyCo } from "@/modulos/seguridad/certificaciones";
import { misPermisos } from "@/lib/permisos";
import { PersonasCert } from "./PersonasCert";
import { FaltaCert } from "../Falta";
import "../../seguridad.css";

export const dynamic = "force-dynamic";

/** SEGURIDAD · CERTIFICACIONES · PERSONAS — la base organizada: registrar, renovar, cambiar estado e historial. */
export default async function PersonasPage({ searchParams }: { searchParams: Promise<{ cedula?: string; renovar?: string }> }) {
  const [d, permisos, q] = await Promise.all([leerCertificaciones(), misPermisos(), searchParams]);
  if (d.falta || d.error) return <FaltaCert titulo="Base de datos" error={d.error} />;
  return (
    <PersonasCert personas={d.personas} hoy={hoyCo()} config={d.reglas} empresas={d.empresas} grupos={d.grupos}
      responsables={d.responsables} validadores={d.validadores}
      puedeEditar={permisos.puedeEditar("/seguridad/certificaciones/personas")}
      abrir={q.cedula} renovar={q.renovar} />
  );
}
