"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { masDias, porMaterial, type FilaNotif, type Partida, type SinNotificar } from "@/modulos/inventario/envase/calc";
import { Calendario } from "@/components/CalendarioRango";

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
const HORAS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const TURNOS = ["06:00", "14:00", "22:00"];

export function Corte({ dia, hora, hoy, seguras, dudosas, alcanza, ultima, notif, sinNotif = [] }: {
  dia: string; hora: string; hoy: string; seguras: Partida[]; dudosas: Partida[]; alcanza: boolean; ultima: string | null; notif: FilaNotif[];
  /** Producto sin ninguna notificación según el plan, con su envase: POR CONFIRMAR (solo lo marcado se copia). */
  sinNotif?: SinNotificar[];
}) {
  const router = useRouter();
  const ir = (f: string, h: string) => router.push(`/inventario/envase/corte?f=${f}&h=${h}`);
  const ayer = masDias(hoy, -1);
  const [antes, setAntes] = useState<Set<number>>(new Set());
  const todas = useMemo(() => [...seguras, ...dudosas.filter((_, i) => antes.has(i))], [seguras, dudosas, antes]);
  const mats = porMaterial(todas).filter((m) => Math.abs(m.q) > 0.0001);
  const [copiado, setCopiado] = useState<string | null>(null);
  /* Lo de «Producto sin notificar» que se marcó: entra a la copia como PENDIENTE POR NOTIFICAR (suma al conteo), botella y caja. */
  const [conf, setConf] = useState<Set<string>>(new Set());
  const confirmadas = sinNotif.filter((x) => conf.has(x.sku)).flatMap((x) => [x.botella, x.caja].filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => ({ tipo: "PENDIENTE POR NOTIFICAR", documento: `SKU ${x.sku} sin notificar`, codigo: e.codigo, unidades: e.unidades })));
  async function copiar() {
    const filas = [...notif.map((f) => ({ tipo: f.tipo, documento: f.documento, codigo: f.codigo, unidades: f.unidades })), ...confirmadas];
    try { await navigator.clipboard.writeText(filas.map((f) => [f.tipo, f.documento, f.codigo, "", "", f.unidades].join("\t")).join("\n")); setCopiado(`Copiadas ${filas.length}${confirmadas.length ? ` (${confirmadas.length} del producto sin notificar)` : ""}: pégalas en la columna A de NOVEDADES.`) }
    catch { setCopiado("El navegador no dejó copiar.") }
  }
  const confirmar = (sku: string) => setConf((x) => { const y = new Set(x); if (y.has(sku)) y.delete(sku); else y.add(sku); return y });
  const marcar = (i: number) => setAntes((x) => { const y = new Set(x); if (y.has(i)) y.delete(i); else y.add(i); return y });

  return (
    <>
      {/* EL DÍA Y LA HORA DEL CONTEO: el mismo calendario de Validación y Análisis de diferencia; la hora en una lista
          (los cambios de turno primero). Al escoger se ve de una, sin botón. */}
      <div className="ad"><div className="ad-barra pe-barra">
        <div className="ad-dia"><span>Día del conteo</span>
          <div className="ad-cal">
            <Calendario desde={dia} hasta={dia} minF="2026-01-01" maxF={hoy} unDia
                        atajos={[{ t: "Hoy", d: () => [hoy, hoy] }, { t: "Ayer", d: () => [ayer, ayer] }]}
                        aplicar={(x) => { if (x && x !== dia) ir(x, hora) }} />
          </div>
        </div>
        <div className="ad-dia"><span>Hora</span>
          <select className="pe-hora" value={hora} onChange={(e) => ir(dia, e.target.value)} aria-label="Hora del conteo">
            <optgroup label="Cambios de turno">{TURNOS.map((x) => <option key={"t" + x} value={x}>{x}</option>)}</optgroup>
            <optgroup label="Otra hora">{HORAS.filter((x) => !TURNOS.includes(x)).map((x) => <option key={x} value={x}>{x}</option>)}</optgroup>
            {!HORAS.includes(hora) && <option value={hora}>{hora}</option>}
          </select>
        </div>
        <p className="pe-nota" style={{ padding: 0, flex: "1 1 280px", alignSelf: "center" }}>
          MB51 cargada hasta <b>{ultima ? fh(ultima) : "—"}</b>. Tiene que ser sacada <b>después</b> del corte: trae lo que se digitó en las horas siguientes.
        </p>
      </div></div>

      {!alcanza ? (
        <p className="pe-aviso">La MB51 cargada no llega después de las {hora} del {dia.slice(8)}/{dia.slice(5, 7)}: todavía no se puede saber qué se digitó tarde. Sube una MB51 sacada después del corte en Cargar.</p>
      ) : (<>
        <section className="pe-card">
          <h3 className="pe-h3">Para el análisis de diferencia · Bodega 38 (AG22)
            <small>{hora === "06:00" ? "ya suman solas en el análisis de este día" : "el análisis de diferencia usa el corte de las 06:00"} · <Link href={`/inventario/balance/analisis?fecha=${dia}`}>abrir el análisis</Link></small></h3>
          {notif.length ? (<>
            <div className="pe-caja"><table className="pe-t">
              <thead><tr><th className="l">Tipo (plantilla)</th><th className="l">Suma en</th><th className="l">Código</th><th>Unidades</th><th className="l">Orden</th><th className="l">Por qué</th></tr></thead>
              <tbody>{notif.map((f, i) => (
                <tr key={i}>
                  <td className="l"><b>{f.tipo}</b></td><td className="l"><span className={`pe-tag ${f.lado === "SAP" ? "t-a" : "t-g"}`}>{f.lado}</span></td>
                  <td className="l"><b>{f.codigo}</b> {f.texto}</td><td><b>{n0(f.unidades)}</b></td><td className="l">{f.documento}</td><td className="exp">{f.porque}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </>) : <p className="pe-nota">Nada pendiente por notificar ni notificaciones en AG22 al corte de las {hora}.</p>}

          {/* PRODUCTO SIN NINGUNA NOTIFICACIÓN, SEGÚN EL PLAN (opción A: por confirmar). Lo de arriba sale de movimientos de SAP;
              esto es una estimación del plan, así que nada entra solo: se marca SKU por SKU. */}
          {sinNotif.length > 0 && (
            <div className="pe-sin">
              <h4>Producto sin notificar · según plan <span className="pe-tag t-a">Por confirmar</span>
                <small>plan vigente de ayer y de hoy hasta las {hora} − lo notificado de esos días · en unidades · el envase de los retornables sigue en AG22: marca los que se envasaron de verdad</small></h4>
              <div className="pe-caja"><table className="pe-t">
                <thead><tr><th className="l">Entra</th><th className="l">SKU</th><th>Plan</th><th>Notificado</th><th>Sin notificar</th><th className="l">Botella (PENDIENTE POR NOTIFICAR · CONTEO)</th><th className="l">Caja</th></tr></thead>
                <tbody>{sinNotif.map((x, i) => (
                  <Fragment key={x.sku}>
                    {!x.retornable && (i === 0 || sinNotif[i - 1].retornable) && (
                      <tr className="sub"><td className="l mut" colSpan={7}>No retornables · también quedaron sin notificar, pero no llevan envase en AG22 (no entran a la plantilla)</td></tr>
                    )}
                    <tr className={x.retornable && conf.has(x.sku) ? "" : "mut"}>
                      <td className="l">{x.retornable
                        ? <input type="checkbox" checked={conf.has(x.sku)} onChange={() => confirmar(x.sku)} aria-label={`Incluir ${x.sku}`} />
                        : <span title="No retornable: no tiene envase en AG22">—</span>}</td>
                      <td className="l"><b>{x.sku}</b> {x.nombre.slice(0, 30)}</td>
                      <td>{n0(x.plan)}</td><td>{n0(x.notif)}</td><td><b>{n0(x.sin)}</b></td>
                      <td className="l">{x.botella ? <><b>{x.botella.codigo}</b> {x.botella.texto} · <b>{n0(x.botella.unidades)}</b></> : x.retornable ? "—" : "no retornable"}</td>
                      <td className="l">{x.caja ? <><b>{x.caja.codigo}</b> {x.caja.texto} · <b>{n0(x.caja.unidades)}</b></> : "—"}</td>
                    </tr>
                  </Fragment>
                ))}</tbody>
              </table></div>
            </div>
          )}
          {(notif.length > 0 || confirmadas.length > 0) && (
            <p className="pe-nota"><button type="button" className="pe-bt" onClick={() => void copiar()}>Copiar para la plantilla{confirmadas.length ? ` (+${confirmadas.length} sin notificar)` : ""}</button> {copiado}</p>
          )}
        </section>

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
