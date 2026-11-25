import "../inventario/fefo.css";
import "./gestion.css";
import "./tablero.css";
import { misPermisos } from "@/lib/permisos";
import { leerAnalisis, leerGestion } from "@/modulos/gestion/datos";
import { procesos as procesosRoturas } from "@/modulos/roturas/datos";
import { hoyBogota, inicioPeriodo, sumarDias } from "@/modulos/gestion/semaforo";
import { Falta } from "./comunes";
import { Tablero } from "./Tablero";

export const dynamic = "force-dynamic";

const esDia = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const MAX_DIAS = 31;

/**
 * GESTIÓN · TABLERO.
 *
 * Indicador · Meta · Disparador fijos a la izquierda (se cambian ahí mismo) y, a la derecha, un bloque por día del rango
 * con sus turnos en el orden del Maestro (C · A · B). Debajo, las ocurrencias (disparadores) del rango con su 5W en relevo;
 * en la otra hoja, el plan de acción con todas las acciones correctivas y preventivas.
 * Rango por ?d=AAAA-MM-DD&h=AAAA-MM-DD (por defecto, los últimos 3 días).
 */
export default async function GestionTablero({ searchParams }: { searchParams: Promise<{ d?: string; h?: string; fecha?: string }> }) {
  const sp = await searchParams;
  const hoy = hoyBogota();
  let h = esDia(sp.h) ? sp.h! : esDia(sp.fecha) ? sp.fecha! : hoy;
  if (h > hoy) h = hoy;
  let d = esDia(sp.d) ? sp.d! : sumarDias(h, -2);
  if (d > h) [d, h] = [h, d];
  if (d < sumarDias(h, -(MAX_DIAS - 1))) d = sumarDias(h, -(MAX_DIAS - 1));

  /* Desde el lunes / día 1 del primer día, por si hay indicadores semanales o mensuales. */
  const desde = [d, inicioPeriodo(d, "semana"), inicioPeriodo(d, "mes")].sort()[0];
  const [datos, an, permisos, deRoturas] = await Promise.all([
    leerGestion(desde, h), leerAnalisis(), misPermisos(),
    /* Las áreas que ya usa Roturas (T1, Líneas, Traspaso…), para traerlas de un toque. Si no se pueden leer, nada. */
    procesosRoturas().catch(() => []),
  ]);
  if (datos.error) return <Falta ojo="GESTIÓN · TABLERO" falta={datos.falta} error={datos.error} />;

  return (
    <div className="fe gs">
      <Tablero
        d={d} h={h} hoy={hoy} maxDias={MAX_DIAS}
        turnos={datos.turnos} procesos={datos.procesos} indicadores={datos.indicadores}
        resultados={datos.resultados} disparadores={datos.disparadores}
        analisis={an.analisis} acciones={an.acciones} faltaSql={an.falta}
        puedeIndicador={permisos.puedeEditar("/gestion/maestro")}
        puedeCapturar={permisos.puedeEditar("/gestion/resultados")}
        areasRoturas={deRoturas.map((p) => p.nombre)}
        puede5w={permisos.puedeEditar("/gestion/disparadores")}
      />
    </div>
  );
}
