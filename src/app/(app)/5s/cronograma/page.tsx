import { misPermisos } from "@/lib/permisos";
import { leerCronograma5S, leerMaestro5S } from "@/modulos/cinco-s/datos";
import { Cronograma } from "./Cronograma";
import { Falta5S } from "../Falta";
import "../cinco-s.css";

export const dynamic = "force-dynamic";

/** 5S · CRONOGRAMA — las auditorías programadas en Gantt, con su estado calculado contra las inspecciones. */
export default async function Cronograma5SPage() {
  const [c, m, permisos] = await Promise.all([leerCronograma5S(), leerMaestro5S(), misPermisos()]);
  if (c.falta || c.error) return <Falta5S titulo="Cronograma" error={c.error} sql="2026-11-cinco-s-2.sql" />;
  return <Cronograma filas={c.filas} areas={m.areas} responsables={m.responsables} puedeEditar={permisos.puedeEditar("/5s/cronograma")} />;
}
