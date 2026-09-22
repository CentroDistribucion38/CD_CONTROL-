import { nombresTodos } from "@/modulos/sider/datos";
import { accionesParaMedir, antesDespues, parametros, zonas } from "@/modulos/acciones/datos";
import "../acciones.css";
import "./indicadores.css";
import { SinTablas } from "../comunes";
import { Indicadores } from "./Indicadores";

export const dynamic = "force-dynamic";

/**
 * INDICADORES — cómo vamos, qué tan rápido, dónde se repite y quién.
 *
 * Se traen de una vez los últimos 180 días (más lo que sigue abierto de
 * antes) y el periodo —30, 90 o 180 días— se cambia en el navegador sin
 * volver a consultar. Todo lo que se mide sale de lo que ya se registra:
 * cuándo se reportó, se asignó, se cerró y se verificó.
 */
export default async function IndicadoresPage() {
  const [datos, par, nombres, zs, fotos] = await Promise.all([
    accionesParaMedir(180), parametros(), nombresTodos(), zonas(), antesDespues(6),
  ]);
  if (datos.falta) return <div className="ac"><SinTablas /></div>;

  return (
    <div className="ac">
      <Indicadores
        acciones={datos.acciones}
        nombres={nombres}
        zonas={zs.filter((z) => z.activo)}
        metas={{ efectividad: par.par["meta_efectividad"] ?? 90, aTiempo: par.par["meta_a_tiempo"] ?? 95 }}
        fotos={fotos}
        ahora={new Date().toISOString()}
      />
    </div>
  );
}
