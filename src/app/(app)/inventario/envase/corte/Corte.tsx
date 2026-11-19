"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { porMaterial, type Partida } from "@/modulos/inventario/envase/calc";

const n0 = (x: number) => Math.round(x).toLocaleString("es-CO");
const fh = (e: string) => `${e.slice(8, 10)}/${e.slice(5, 7)} ${e.slice(11, 16)}`;
const CLASE: Record<string, string> = {
  "261": "consumo a orden (261)", "262": "reverso de consumo (262)", "531": "entrada a AG28 (531)", "532": "reverso de entrada (532)",
  Z01: "notificación (Z01)", Z02: "reverso de notificación (Z02)", Z09: "paso a producto terminado (Z09)", Z10: "reverso de Z09 (Z10)",
  "101": "entrada (101)", "102": "reverso de entrada (102)", "311": "traslado (311)", "312": "reverso de traslado (312)",
};
const nombreClases = (c: Set<string>) => [...c].map((x) => CLASE[x] ?? x).join(" + ");

/**
 * CORTE DE INVENTARIO. La existencia que se baja a la hora del conteo solo tiene lo DIGITADO hasta esa hora.
 * Lo contabilizado antes pero digitado después son las partidas: se suman o se restan para comparar contra
 * el conteo físico. Lo contabilizado el mismo día y digitado en la hora siguiente no se puede saber: lo marca
 * quien hizo el conteo (por defecto «después», y no cuenta).
 */
export function Corte({ dia, hora, seguras, dudosas, alcanza, ultima }: {
  dia: string; hora: string; seguras: Partida[]; dudosas: Partida[]; alcanza: boolean; ultima: string | null;
}) {
  const router = useRouter();
  const [d, setD] = useState(dia);
  const [h, setH] = useState(hora);
  const [antes, setAntes] = useState<Set<number>>(new Set());
  const todas = useMemo(() => [...seguras, ...dudosas.filter((_, i) => antes.has(i))], [seguras, dudosas, antes]);
  const mats = porMaterial(todas).filter((m) => Math.abs(m.q) > 0.0001);
  const cambia = d !== dia || h !== hora;
  const marcar = (i: number) => setAntes((x) => { const y = new Set(x); if (y.has(i)) y.delete(i); else y.add(i); return y });

  return (
    <>
      <section className="pe-card pe-form" aria-label="Hora del conteo">
        <label className="pe-campo"><span>Día del conteo</span><input type="date" value={d} onChange={(e) => setD(e.target.value)} /></label>
        <label className="pe-campo"><span>Hora</span><input type="time" value={h} step={60} onChange={(e) => setH(e.target.value)} /></label>
        <button type="button" className="pe-bt am" disabled={!cambia || !d || !h} onClick={() => router.push(`/inventario/envase/corte?f=${d}&h=${h}`)}>Ver partidas</button>
        <p className="pe-nota" style={{ padding: 0, flex: "1 1 280px" }}>
          MB51 cargada hasta <b>{ultima ? fh(ultima) : "—"}</b>. Tiene que ser sacada <b>después</b> del corte: trae lo que se digitó en las horas siguientes.
        </p>
      </section>

      {!alcanza ? (
        <p className="pe-aviso">La MB51 cargada no llega después de las {hora} del {dia.slice(8)}/{dia.slice(5, 7)}: todavía no se puede saber qué se digitó tarde. Sube una MB51 sacada después del corte en Cargar.</p>
      ) : (<>
        <div className="pe-card pe-formula" aria-label="Cómo se usan las partidas">
          <span>Existencia SAP {hora}</span><i>+</i><span>Partidas</span><i>=</i><span className="y">Lo que debía haber a las {hora}</span><i>vs</i><span>Conteo físico</span>
        </div>

        <section className="pe-card">
          <h3 className="pe-h3">Partidas por material · {todas.length} movimientos <small>contabilizados antes del {dia.slice(8)}/{dia.slice(5, 7)} y digitados después de las {hora}{antes.size ? ` · incluye ${antes.size} marcados «antes»` : ""}</small></h3>
          {mats.length ? (
            <div className="pe-caja"><table className="pe-t">
              <thead><tr><th className="l">Almacén</th><th className="l">Material</th><th>Partida</th><th className="l">UM</th><th className="l">Qué es</th></tr></thead>
              <tbody>{mats.map((m) => (
                <tr key={`${m.almacen}|${m.material}`}>
                  <td className="l"><b>{m.almacen || "—"}</b></td>
                  <td className="l"><b>{m.material}</b> {m.texto}</td>
                  <td className={m.q < 0 ? "neg" : "pos"}>{m.q > 0 ? "+" : ""}{n0(m.q)}</td>
                  <td className="l">{m.um}</td>
                  <td className="exp">{nombreClases(m.clases)} digitado después del corte. A la existencia SAP de las {hora} {m.q < 0 ? "réstale" : "súmale"} esta cantidad{m.docs > 1 ? ` (${m.docs} movimientos)` : ""}.</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <p className="pe-nota">No hay partidas: todo lo contabilizado antes del corte ya estaba digitado a las {hora}.</p>}
        </section>

        <div className="pe-dos">
          <section className="pe-card">
            <h3 className="pe-h3">El detalle <small>documento por documento</small></h3>
            {seguras.length ? (
              <div className="pe-caja"><table className="pe-t">
                <thead><tr><th className="l">Contab.</th><th className="l">Digitado</th><th className="l">Alm.</th><th className="l">Cl.</th><th className="l">Material</th><th>Cantidad</th><th className="l">Orden</th></tr></thead>
                <tbody>{seguras.map((p, i) => (
                  <tr key={i}>
                    <td className="l">{p.fecha_contab.slice(8)}/{p.fecha_contab.slice(5, 7)}</td><td className="l"><b>{fh(p.entrada)}</b></td>
                    <td className="l">{p.almacen}</td><td className="l">{p.clase}</td><td className="l">{p.material} {p.texto.slice(0, 22)}</td>
                    <td>{n0(p.cantidad)}</td><td className="l">{p.orden ?? ""}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <p className="pe-nota">Ninguno.</p>}
          </section>

          <section className="pe-card">
            <h3 className="pe-h3">Para decidir {dudosas.length > 0 && <span className="pe-tag t-a">{dudosas.length}</span>}<small>contabilizados el mismo día, digitados en la hora siguiente</small></h3>
            <p className="pe-nota">Con la MB51 no se sabe si esto se produjo antes o después de las {hora}: márcalo tú. Por defecto va «después» y no cuenta.</p>
            {dudosas.length ? (
              <div className="pe-caja"><table className="pe-t">
                <thead><tr><th className="l">Digitado</th><th className="l">Cl. · alm.</th><th className="l">Material</th><th>Cantidad</th><th className="l">¿Antes del corte?</th></tr></thead>
                <tbody>{dudosas.map((p, i) => (
                  <tr key={i}>
                    <td className="l"><b>{p.entrada.slice(11, 19)}</b></td><td className="l">{p.clase} {p.almacen}</td>
                    <td className="l">{p.material} {p.texto.slice(0, 18)}</td><td>{n0(p.cantidad)}</td>
                    <td className="l"><div className="pe-seg" role="group" aria-label="¿Antes del corte?">
                      <button type="button" className={antes.has(i) ? "on" : ""} aria-pressed={antes.has(i)} onClick={() => !antes.has(i) && marcar(i)}>Antes</button>
                      <button type="button" className={antes.has(i) ? "" : "on"} aria-pressed={!antes.has(i)} onClick={() => antes.has(i) && marcar(i)}>Después</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <p className="pe-nota">Ninguno.</p>}
          </section>
        </div>
      </>)}
    </>
  );
}
