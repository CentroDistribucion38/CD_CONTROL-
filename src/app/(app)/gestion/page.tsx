import "../inventario/fefo.css";
import "./gestion.css";
import { leerGestion } from "@/modulos/gestion/datos";
import { hoyBogota, inicioPeriodo, sumarDias } from "@/modulos/gestion/semaforo";
import { Falta } from "./comunes";
import { Tablero } from "./Tablero";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · TABLERO — KPI · PI · META.
 *
 * La foto del día: cada indicador con su meta, cómo va en cada turno, su semáforo y cómo vienen los últimos 7 días.
 * Aquí no se captura nada: los números se digitan en «Resultado por turno» y las reglas se mueven en «Maestro».
 */
export default async function GestionTablero({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const sp = await searchParams;
  const hoy = hoyBogota();
  const fecha = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) ? sp.fecha : hoy;
  /* Siete días para la tira, y el comienzo del mes por si hay indicadores mensuales. */
  const desde = [sumarDias(fecha, -6), inicioPeriodo(fecha, "mes")].sort()[0];
  const datos = await leerGestion(desde, fecha);
  if (datos.error) return <Falta ojo="GESTIÓN · TABLERO" falta={datos.falta} error={datos.error} />;

  return (
    <div className="fe gs">
      <Tablero
        fecha={fecha} hoy={hoy}
        turnos={datos.turnos} procesos={datos.procesos} indicadores={datos.indicadores}
        resultados={datos.resultados} disparadores={datos.disparadores}
      />
    </div>
  );
}
