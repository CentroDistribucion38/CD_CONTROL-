import { leerCronograma5S, leerHallazgos5S, leerInspecciones5S, leerMaestro5S, leerNoCumple5S } from "@/modulos/cinco-s/datos";
import { Tablero } from "./Tablero";
import { Falta5S } from "../Falta";
import "../cinco-s.css";

export const dynamic = "force-dynamic";

/** 5S · TABLERO — cómo va cada área y cada S, la tendencia, los responsables y lo que más se repite. */
export default async function Tablero5SPage() {
  const [h, m, c, nc, hz] = await Promise.all([leerInspecciones5S(), leerMaestro5S(), leerCronograma5S(), leerNoCumple5S(), leerHallazgos5S()]);
  if (h.falta || h.error) return <Falta5S titulo="Tablero" error={h.error} />;
  return <Tablero filas={h.filas} areas={m.areas} responsables={m.responsables} meta={m.meta} plan={c.filas} noCumple={nc} hallazgos={hz.falta || hz.error ? undefined : hz.filas} formatos={m.formatos} />;
}
