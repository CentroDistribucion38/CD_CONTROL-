import { conUnidad, textoMeta } from "@/modulos/gestion/semaforo";
import type { Nodo } from "@/modulos/gestion/mapa";
import { Semaforo } from "./comunes";

/** La caja de un indicador: código, nombre, meta, cómo va y si tiene disparador. Sirve en el árbol y en el flujo. */
export function Ficha({ n, proceso }: { n: Nodo; proceso?: string }) {
  const { i } = n;
  const resultado = n.n === 0 ? "Sin captura" : n.n === 1 ? conUnidad(n.valor, i) : `${n.cumplen} de ${n.n} cumplen`;
  return (
    <div className={`gm-ficha ${n.estado ?? "sin"} ${i.tipo}`}>
      <div className="gm-fila">
        <span className="gm-tipo">{i.tipo === "kpi" ? "KPI" : "PI"}</span>
        <span className="mono">{i.codigo}</span>
        {n.disparo && <span className="gm-disp" title="Tiene un disparador activo">Disparador</span>}
      </div>
      <b className="gm-nombre">{i.nombre}</b>
      {proceso && <small className="gm-otro">{proceso}</small>}
      <div className="gm-dato">
        <span>Meta <b>{textoMeta(i)}</b></span>
        <span>{resultado}</span>
      </div>
      <Semaforo estado={n.estado} />
    </div>
  );
}
