import { misPermisos } from "@/lib/permisos";
import { leerInspecciones5S, leerMaestro5S } from "@/modulos/cinco-s/datos";
import { Historial } from "./Historial";
import { Falta5S } from "../Falta";
import "../cinco-s.css";

export const dynamic = "force-dynamic";

/** 5S · HISTORIAL — las inspecciones guardadas, con su % por S, hallazgos y fotos. */
export default async function Historial5SPage() {
  const [h, m, permisos] = await Promise.all([leerInspecciones5S(), leerMaestro5S(), misPermisos()]);
  if (h.falta || h.error) return <Falta5S titulo="Historial" error={h.error} />;
  return <Historial filas={h.filas} areas={m.areas} formatos={m.formatos} puedeBorrar={permisos.puedeEditar("/5s/historial")} />;
}
