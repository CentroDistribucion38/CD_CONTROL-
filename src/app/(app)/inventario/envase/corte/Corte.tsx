"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { masDias, porMaterial, type FilaNotif, type Partida, type SinNotificar } from "@/modulos/inventario/envase/calc";
import { Calendario } from "@/components/CalendarioRango";

const n0 = (x: number) => Math.round(x).toLocaleString("es-CO");
const n1 = (x: number | null) => x == null ? "—" : x.toLocaleString("es-CO", { maximumFractionDigits: 0 });
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
  /* La tabla del pendiente, para pegar en Excel: encabezado + una fila por SKU, cada dato en su columna (tabuladores),
     números sin puntos de miles y con coma decimal (Excel en español). */
  const tot = sinNotif.reduce((t, x) => ({ plan: t.plan + (x.planHL ?? 0), notif: t.notif + (x.notifHL ?? 0), hl: t.hl + (x.sinHL ?? 0), un: t.un + x.sin }),
    { plan: 0, notif: 0, hl: 0, un: 0 });
  const [copiadoT, setCopiadoT] = useState<string | null>(null);
  /* «Que uno pueda seleccionar solo la columna y copiar los SKU y así mismo las cantidades»: cada encabezado se toca para
     escoger esa columna (una o varias); «Copiar» lleva solo esas, en el orden de la tabla, sin encabezado, listas para pegar
     en la plantilla. Sin columnas escogidas se copia la tabla entera con encabezado. */
  const xl = (v: number | null | undefined, d = 0) => v == null ? "" : (d ? v.toFixed(d) : String(Math.round(v))).replace(".", ",");
  const COLS: { k: string; t: string; l?: boolean; g?: boolean; b?: boolean; ver: (x: SinNotificar) => ReactNode; xl: (x: SinNotificar) => string; tot?: React.ReactNode }[] = [
    { k: "sku", t: "SKU", l: true, b: true, ver: (x) => x.sku, xl: (x) => x.sku },
    { k: "nom", t: "Descripción", l: true, ver: (x) => x.nombre, xl: (x) => x.nombre },
    { k: "env", t: "Envase", l: true, ver: (x) => x.retornable ? "Retornable" : "No retornable", xl: (x) => x.retornable ? "Retornable" : "No retornable" },
    { k: "plan", t: `Plan a las ${hora} (HL)`, ver: (x) => n1(x.planHL), xl: (x) => xl(x.planHL, 1), tot: n1(tot.plan) },
    { k: "notif", t: "Notificado (HL)", ver: (x) => n1(x.notifHL), xl: (x) => xl(x.notifHL, 1), tot: n1(tot.notif) },
    { k: "pend", t: "Pendiente (HL)", b: true, ver: (x) => n1(x.sinHL), xl: (x) => xl(x.sinHL, 1), tot: n1(tot.hl) },
    { k: "un", t: "Pendiente (un.)", ver: (x) => n0(x.sin), xl: (x) => xl(x.sin), tot: n0(tot.un) },
    { k: "cj", t: "Pendiente (cajas)", ver: (x) => x.sinCajas == null ? "—" : n0(x.sinCajas), xl: (x) => xl(x.sinCajas) },
    { k: "cb", t: "Código botella", l: true, g: true, b: true, ver: (x) => x.botella?.codigo ?? "—", xl: (x) => x.botella?.codigo ?? "" },
    { k: "bt", t: "Botella", l: true, ver: (x) => x.botella?.texto ?? "—", xl: (x) => x.botella?.texto ?? "" },
    { k: "bts", t: "Botellas", ver: (x) => x.botella ? n0(x.botella.unidades) : "—", xl: (x) => xl(x.botella?.unidades) },
    { k: "cc", t: "Código caja", l: true, g: true, b: true, ver: (x) => x.caja?.codigo ?? "—", xl: (x) => x.caja?.codigo ?? "" },
    { k: "ca", t: "Caja", l: true, ver: (x) => x.caja?.texto ?? "—", xl: (x) => x.caja?.texto ?? "" },
    { k: "cas", t: "Cajas", ver: (x) => x.caja ? n0(x.caja.unidades) : "—", xl: (x) => xl(x.caja?.unidades) },
  ];
  const [sel, setSel] = useState<string[]>([]);
  const escoger = (k: string) => { setSel((x) => x.includes(k) ? x.filter((y) => y !== k) : [...x, k]); setCopiadoT(null) };
  const elegidas = COLS.filter((c) => sel.includes(c.k));
  async function copiarTabla() {
    const cols = elegidas.length ? elegidas : COLS;
    const filas = sinNotif.map((x) => cols.map((c) => c.xl(x)));
    const texto = (elegidas.length ? filas : [cols.map((c) => c.t), ...filas]).map((f) => f.join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoT(elegidas.length ? `Copiadas ${elegidas.map((c) => c.t).join(" + ")} · ${filas.length} filas: pégalas en Excel.` : `Copiada la tabla con encabezado · ${filas.length} SKU: pégala en Excel.`);
    } catch { setCopiadoT("El navegador no dejó copiar.") }
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

          {/* LO PENDIENTE POR NOTIFICAR A LA HORA DEL CONTEO, POR SKU: la misma cuenta de Validación › Evaluar «Corte».
              «Esas son las partidas que necesito … para poder copiar por columnas»: cada dato en su columna y «Copiar tabla»
              las lleva a Excel tal cual. Es plan, no producción: el envase entra a la plantilla solo si se marca. */}
          {sinNotif.length > 0 && (
            <div className="pe-sin">
              <h4>Pendiente por notificar a las {hora} · según plan <span className="pe-tag t-a">Por confirmar</span>
                <small>plan vigente del día sumado hora por hora hasta las {hora} − lo notificado que entró a SAP hasta las {hora} · igual que
                  {" "}<Link href={`/inventario/envase?d=${dia}&h=${dia}&hc=${Number(hora.slice(0, 2))}`}>Validación › Corte</Link></small></h4>
              <p className="pe-nota" style={{ padding: "0 0 8px" }}>
                <button type="button" className="pe-bt am" onClick={() => void copiarTabla()}>
                  {elegidas.length ? `Copiar ${elegidas.length === 1 ? "columna" : `${elegidas.length} columnas`}` : "Copiar tabla"}</button>{" "}
                {elegidas.length > 0 && <><button type="button" className="pe-bt" onClick={() => { setSel([]); setCopiadoT(null) }}>Quitar selección</button>{" "}</>}
                {copiadoT ?? (elegidas.length ? <>Escogidas: <b>{elegidas.map((c) => c.t).join(" + ")}</b></>
                  : <>{sinNotif.length} SKU · {n1(tot.hl)} HL pendientes · toca el encabezado de una columna para copiar solo esa (o varias)</>)}
              </p>
              <div className="pe-caja"><table className="pe-t pe-cols">
                <thead><tr>
                  <th className="l">Entra</th>
                  {COLS.map((c) => (
                    <th key={c.k} className={[c.l ? "l" : "", c.g ? "g" : "", sel.includes(c.k) ? "sel" : ""].join(" ")}>
                      <button type="button" className="pe-col" aria-pressed={sel.includes(c.k)} onClick={() => escoger(c.k)} title="Escoger esta columna para copiar">{c.t}</button>
                    </th>
                  ))}
                </tr></thead>
                <tbody>{sinNotif.map((x) => (
                  <tr key={x.sku} className={x.retornable && !conf.has(x.sku) ? "mut" : ""}>
                    <td className="l">{x.retornable
                      ? <input type="checkbox" checked={conf.has(x.sku)} onChange={() => confirmar(x.sku)} aria-label={`Incluir ${x.sku} en la plantilla`} />
                      : <span title="No retornable: no tiene envase en AG22">—</span>}</td>
                    {COLS.map((c) => (
                      <td key={c.k} className={[c.l ? "l" : "", c.g ? "g" : "", sel.includes(c.k) ? "sel" : ""].join(" ")}>{c.b ? <b>{c.ver(x)}</b> : c.ver(x)}</td>
                    ))}
                  </tr>
                ))}
                  <tr className="tot">
                    <td className="l"><b>Total</b></td>
                    {COLS.map((c) => <td key={c.k} className={[c.l ? "l" : "", c.g ? "g" : ""].join(" ")}>{c.tot != null ? <b>{c.tot}</b> : null}</td>)}
                  </tr>
                </tbody>
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
