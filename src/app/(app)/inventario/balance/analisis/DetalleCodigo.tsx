"use client";

import type { FilaAnalisis, Partida } from "@/modulos/inventario/analisis-dif";
import { UbicacionesDif } from "./UbicacionesDif";

/**
 * EL DETALLE DE UN CÓDIGO EN AJUSTES Y EN EL ANÁLISIS FINAL — lo mismo que se despliega en el paso 1 al tocar el código:
 * de qué partidas sale SAP, de cuáles sale el CONTEO y el ícono de sus ubicaciones. Sale del análisis GUARDADO (la misma
 * foto de la que salen los ajustes). Si el código se compensa con otro (el R con su NR nuevo), debajo va el detalle
 * del otro con SUS ubicaciones: «me deberían salir esas ubicaciones asociadas».
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));

function Lista({ xs }: { xs: Partida[] }) {
  if (!xs.length) return <ul><li><span>—</span></li></ul>;
  return (
    <ul>{xs.map((p) => p.detalle?.length ? (
      <li key={p.nombre} className="ad-grp"><details><summary><span>{p.nombre} <small>({p.detalle.length} {p.detalle.length === 1 ? "producto" : "productos"} · ver cuáles)</small></span><em>{n(p.cantidad)}</em></summary>
        <ul>{p.detalle.map((d) => <li key={d.nombre}><span>{d.nombre}</span><em>{n(d.cantidad)}</em></li>)}</ul></details></li>
    ) : <li key={p.nombre}><span>{p.nombre}</span><em>{n(p.cantidad)}</em></li>)}</ul>
  );
}

function Dos({ f, fecha }: { f: FilaAnalisis; fecha: string }) {
  return (
    <div className="ad-det-dos">
      <div><b>SAP · {n(f.sap)}</b><Lista xs={f.deSap} />
        {f.pendSap && f.pendSap.length > 0 && (<><b>BALANCE y DESCUADRE de otros almacenes (no sumó) · {n(f.pendSap.reduce((t, p) => t + p.cantidad, 0))}</b><Lista xs={f.pendSap} /></>)}
      </div>
      <div><span className="ad-ub-pos"><UbicacionesDif fila={f} fecha={fecha} /></span><b>CONTEO · {n(f.conteo)}</b><Lista xs={f.deConteo} />
        {f.fuera && f.fuera.length > 0 && (<><b>OTROS ALMACENES · ya cuadrados allá (no suma)</b><Lista xs={f.fuera} /></>)}
      </div>
    </div>
  );
}

export function DetalleCodigo({ analisis, codigo, par, fecha }: { analisis: FilaAnalisis[]; codigo: string; par?: string | null; fecha: string }) {
  const f = analisis.find((x) => x.codigo === codigo);
  const p = par ? analisis.find((x) => x.codigo === par) : null;
  if (!f) return <p className="ad-nota">Este código no trae detalle en el análisis guardado: vuelve a guardar el análisis del día.</p>;
  return (
    <>
      <Dos f={f} fecha={fecha} />
      {par && (p ? (
        <>
          <p className="ad-nota"><b>Se compensa con {p.codigo} · {p.descripcion}</b> — SAP {n(p.sap)} · conteo {n(p.conteo)} · diferencia {signo(p.diferencia)}. Sus partidas y sus ubicaciones:</p>
          <Dos f={p} fecha={fecha} />
        </>
      ) : <p className="ad-nota">Se compensa con <b>{par}</b>, que no está en el análisis guardado de este día.</p>)}
    </>
  );
}
