"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rango } from "../../../sider/seguimiento/Rango";
import type { Aplicado, CuadreGuardado, DiaHistorial, FilaCuadre, LineaOtros } from "@/modulos/inventario/cuadre";
import { asignarOtros, guardarBalanceo, guardarMovimientos, guardarOpciones, guardarZexi, quitarMovimientos } from "./actions";
import { leerMovimientos, leerZexi } from "./leer";

/**
 * EL CUADRE SAP EN PANTALLA — un flujo de tres pasos:
 *   1. CUADRE DEL DÍA: se sube el ZEXI, se digitan las estibas del almacén y sale la diferencia.
 *   2. QUÉ HACER EN SAP: las dos listas del 311 (AG22 → AG18 y AG18 → AG22), listas para digitar.
 *   3. CÓMO QUEDÓ: se sube la transacción del 311 que se bajó de SAP y el cuadre se rehace con lo
 *      movido: cada material queda «Balanceado» o dice cuánto falta y hacia dónde.
 */
const ALM = "AG18";
/* El mismo valor que NO_SUMAR de modulos/inventario/cuadre.ts: ese archivo es del servidor y aquí solo se importan sus tipos. */
const NO_SUMAR = "NO";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const largo = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` };
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const n = (v: number) => (v < 0 ? "−" : "") + nf.format(Math.abs(v));
const conSigno = (v: number) => (v > 0 ? "+" : "") + n(v);
const cero = (v: number | null) => v != null && Math.abs(v) < 0.5;
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const GRUPO: Record<string, string> = { ENVASE: "Envase", CAJA: "Cajas plásticas", ESTIBA: "Estibas de madera" };

/** La etiqueta de OTROS (Andina…). */
const IconoOtros = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);

export function Cuadre({ fecha, dias, filas, guardado, estibasBodega, avisos, error, otros, envases, aplicados, historial, faltaHist }: {
  fecha: string | null; dias: string[]; filas: FilaCuadre[]; guardado: CuadreGuardado | null;
  estibasBodega: number; avisos: string[]; error: string | null;
  otros: LineaOtros[]; envases: { codigo: string; material: string }[]; aplicados: Aplicado[];
  historial: DiaHistorial[]; faltaHist: boolean;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ mal: boolean; t: string } | null>(null);
  const [estibas, setEstibas] = useState(guardado?.estibas_almacen != null ? String(guardado.estibas_almacen) : "");
  const zexiRef = useRef<HTMLInputElement>(null);
  const movRef = useRef<HTMLInputElement>(null);
  const [verOtros, setVerOtros] = useState(false);
  const [reemplazar, setReemplazar] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  if (!fecha) {
    return <section className="cabeza"><div><p className="ojo">INVENTARIO · BALANCE · CUADRE SAP</p><h1>Cuadre SAP</h1>
      <p className="sub">{error ?? "Todavía no hay conteos enviados para cuadrar."}</p></div></section>;
  }

  const conZexi = !!guardado?.zexi?.length;
  const conMov = !!guardado?.movimientos?.length;
  const sumarPend = guardado?.sumar_pend_baja ?? true;
  const conDif = filas.filter((f) => f.dif != null);
  const entran = conDif.filter((f) => !cero(f.dif) && f.dif! < 0);
  const salen = conDif.filter((f) => !cero(f.dif) && f.dif! > 0);
  const cuadran = conDif.filter((f) => cero(f.dif));
  const balanceados = filas.filter((f) => cero(f.queda));
  const pendientes = filas.filter((f) => f.queda != null && !cero(f.queda));
  const cajasOtros = otros.reduce((t, o) => t + o.cajas, 0);
  const otrosSinCambiar = otros.filter((o) => !o.elegido).length;
  const nombreDe = (c: string) => envases.find((e) => e.codigo === c)?.material ?? c;

  const hacer = (p: Promise<{ ok?: boolean; error?: string }>, bien: string) => start(async () => {
    const r = await p;
    setMsg(r.error ? { mal: true, t: r.error } : { mal: false, t: bien });
    if (!r.error) router.refresh();
  });
  async function subirZexi(a: File) {
    setMsg(null);
    const r = await leerZexi(a, ALM);
    if (r.error) { setMsg({ mal: true, t: r.error }); return }
    hacer(guardarZexi(fecha!, JSON.stringify(r.filas), a.name), `ZEXI cargado: ${r.filas.length} materiales de ${ALM}.`);
  }
  async function subirMov(a: File) {
    setMsg(null);
    /* LA ZEXI NUEVA (la de después del 311): lo movido es lo que cambió el stock de SAP de una ZEXI a
       la otra, material por material. Así SAP después = la ZEXI nueva y «Queda» = ZEXI nueva − conteo. */
    const z = await leerZexi(a, ALM);
    if (!z.error && z.filas.length) {
      const antes = new Map((guardado?.zexi ?? []).map((x) => [String(x.codigo), Number(x.cantidad) || 0]));
      const ahora = new Map(z.filas.map((x) => [String(x.codigo), Number(x.cantidad) || 0]));
      const movs = [...new Set([...antes.keys(), ...ahora.keys()])]
        .map((c) => ({ codigo: c, cantidad: (ahora.get(c) ?? 0) - (antes.get(c) ?? 0), documentos: [`ZEXI nueva · ${a.name}`] }));
      hacer(guardarMovimientos(fecha!, JSON.stringify(movs), a.name), `ZEXI nueva cargada: ${z.filas.length} materiales. Abajo está cómo quedó.`);
      return;
    }
    const r = await leerMovimientos(a, ALM);
    if (r.error) { setMsg({ mal: true, t: r.error }); return }
    hacer(guardarMovimientos(fecha!, JSON.stringify(r.filas), a.name), `Transacción cargada: ${r.filas.length} materiales movidos.`);
  }
  const guardarEst = () => {
    const v = estibas.trim() === "" ? null : Number(estibas.replace(",", "."));
    if (v != null && !Number.isFinite(v)) { setMsg({ mal: true, t: "Las estibas del almacén deben ser un número." }); return }
    if (v === (guardado?.estibas_almacen ?? null)) return;
    hacer(guardarOpciones(fecha!, v, sumarPend), "Estibas del almacén guardadas.");
  };

  const lista = (xs: FilaCuadre[]) => (
    <table className="cs-t chica"><thead><tr><th>Código</th><th>Material</th><th className="n">Cantidad</th></tr></thead>
      <tbody>{xs.map((f) => <tr key={f.codigo}><td className="mono">{f.codigo}</td><td>{f.material}</td><td className="n"><b>{n(Math.abs(f.dif!))}</b></td></tr>)}</tbody>
    </table>
  );

  return (
    <>
      <section className="cabeza cs-cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · CUADRE SAP</p>
          <h1>Cuadre SAP · AG18 Fábrica</h1>
          <p className="sub">El conteo del <b>{largo(fecha)}</b> contra el stock de SAP (ZEXI). La diferencia es el movimiento 311 entre AG18 y AG22.{pend && " · guardando…"}</p>
        </div>
        {/* GUARDAR EL BALANCEO DEL DÍA: queda en el histórico de abajo. Volver a guardar lo reemplaza. */}
        <div className="cs-guardar">
          {guardado?.cierre
            ? <span className="cs-guardado">✓ Guardado {hora(guardado.cerrado_en ?? null)}{guardado.cerrado_nombre ? ` · ${guardado.cerrado_nombre}` : ""}</span>
            : <span className="cs-guardado no">Este día no está guardado</span>}
          {reemplazar ? (
            <span className="cs-acc">
              <button type="button" className="cs-bt" disabled={pend} onClick={() => { setReemplazar(false); hacer(guardarBalanceo(fecha), "Balanceo del día guardado otra vez (reemplazó el anterior).") }}>Sí, reemplazar</button>
              <button type="button" className="cs-bt alt" onClick={() => setReemplazar(false)}>No</button>
            </span>
          ) : (
            <button type="button" className="cs-bt" disabled={pend || !conZexi} title={conZexi ? undefined : "Sube primero la ZEXI de SAP de ese día"}
                    onClick={() => guardado?.cierre ? setReemplazar(true) : hacer(guardarBalanceo(fecha), "Balanceo del día guardado en el histórico.")}>
              {guardado?.cierre ? "Volver a guardar" : "Guardar balanceo del día"}
            </button>
          )}
        </div>
      </section>

      <ol className="cs-pasos">
        <li className={conZexi ? "hecho" : "on"}><span>PASO 1</span><b>Cuadre del día</b><small>Conteo + ZEXI → diferencias</small></li>
        <li className={conMov ? "hecho" : conZexi ? "on" : ""}><span>PASO 2</span><b>Hacer el 311 en SAP</b><small>La app dice qué mover · subes la ZEXI nueva</small></li>
        <li className={conMov ? (pendientes.length ? "on" : "hecho") : ""}><span>PASO 3</span><b>¿Quedó balanceado?</b><small>El cuadre otra vez, con lo movido</small></li>
      </ol>

      {/* LOS DATOS DEL CUADRE: cuatro tarjetas iguales, encabezado oscuro (como las tablas) con el estado
          en amarillo, y el cuerpo en una sola línea. */}
      <div className="cs-barra">
        <div className="cs-c">
          <span className="cs-ch">Día del conteo</span>
          <span className="cs-cb cs-dia sd bal-cal">
            <Rango rotulo="Día del conteo" desde={fecha} hasta={fecha} dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                   alElegir={(d) => start(() => router.push(`/inventario/balance/cuadre?fecha=${d}`))} />
          </span>
        </div>
        <div className="cs-c">
          <span className="cs-ch">ZEXI de SAP {conZexi ? <i>✓ Cargado</i> : <i className="no">Falta subir</i>}</span>
          <span className="cs-cb">
            <span className="cs-txt">
              <b className="cs-v" title={conZexi ? guardado!.zexi_archivo ?? "" : undefined}>{conZexi ? guardado!.zexi_archivo : "Sin subir"}</b>
              <small>{conZexi ? `${guardado!.zexi!.length} materiales · ${hora(guardado!.zexi_en)}` : `El stock de ${ALM} de ese día`}</small>
            </span>
            <input ref={zexiRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void subirZexi(a) }} />
            <button type="button" className={"cs-bt" + (conZexi ? " alt" : "")} disabled={pend} onClick={() => zexiRef.current?.click()}>{conZexi ? "Cambiar" : "Subir ZEXI"}</button>
          </span>
        </div>
        <div className="cs-c">
          <label className="cs-ch" htmlFor="cs-est">Estibas en almacén {ALM}</label>
          <span className="cs-cb">
            <input id="cs-est" className="cs-num" inputMode="decimal" value={estibas} onChange={(e) => setEstibas(e.target.value)} onBlur={guardarEst}
                   onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} placeholder="0" />
            <small>En la bodega se contaron <b>{n(estibasBodega)}</b></small>
          </span>
        </div>
        <label className="cs-c cs-sw">
          <span className="cs-ch">Pend. baja <i className={sumarPend ? "" : "no"}>{sumarPend ? "Se suma" : "No se suma"}</i></span>
          <span className="cs-cb">
            <input type="checkbox" role="switch" checked={sumarPend} disabled={pend}
              onChange={(e) => hacer(guardarOpciones(fecha, guardado?.estibas_almacen ?? null, e.target.checked), e.target.checked ? "El pend. baja se suma." : "El pend. baja ya no se suma.")} />
            <span className="cs-txt">
              <b className="cs-v">{sumarPend ? "Se suma al conteo" : "No se suma"}</b>
              <small>Pasivos {ALM} · BAJA · SORTING</small>
            </span>
          </span>
        </label>
      </div>

      {msg && <p className={"cs-msg" + (msg.mal ? " mal" : "")} role="status">{msg.t}</p>}
      {avisos.map((a) => <p key={a} className="cs-msg mal">{a}</p>)}

      {/* ---------- PASO 1 ---------- */}
      <div className="cs-k">
        <div className="os"><span>Materiales</span><b>{filas.length}</b></div>
        <div><span>Cuadran</span><b className="bien">{conZexi ? cuadran.length : "—"}</b></div>
        <div><span>Entran a AG18 (AG22 → AG18)</span><b className="mal">{conZexi ? entran.length : "—"}</b></div>
        <div><span>Salen de AG18 (AG18 → AG22)</span><b className="ambar">{conZexi ? salen.length : "—"}</b></div>
      </div>
      {!conZexi && <p className="cs-msg">Sube el ZEXI de SAP de ese día para ver la diferencia. Mientras tanto, abajo está lo que la app ya armó del conteo.</p>}

      {(otros.length > 0 || aplicados.length > 0) && (
        <div className={"cs-otros" + (verOtros ? " abierto" : "")}>
          <button type="button" className="cs-otros-bt" aria-expanded={verOtros} onClick={() => setVerOtros((v) => !v)}>
            <IconoOtros />
            <b>OTROS Y AJUSTES</b>
            <span>{otros.length ? `${otros.length} ${otros.length === 1 ? "línea" : "líneas"} OTROS · ${n(cajasOtros)} cajas · ` : ""}{aplicados.length} ajustes aplicados</span>
            {otros.length > 0 && <em>{otrosSinCambiar ? `${otrosSinCambiar} sumando a su código` : "Todas asignadas"}</em>}
            <i aria-hidden="true">{verOtros ? "▴" : "▾"}</i>
          </button>
          {verOtros && otros.length > 0 && <h4 className="cs-otros-h">Líneas en estado OTROS · escoge a qué envase suman</h4>}
          {verOtros && otros.length > 0 && (
            <div className="cs-scroll">
              <table className="cs-t chica">
                <thead><tr><th>Ubicación</th><th>Contado como</th><th>Nota</th><th className="n">Estibas</th><th className="n">Cajas</th><th>Sumar a</th><th className="n">Unidades</th></tr></thead>
                <tbody>{otros.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">{o.ubicacion}</td>
                    <td><span className="mono">{o.codigo}</span><small>{o.material}</small></td>
                    <td>{o.nota || "—"}</td>
                    <td className="n">{n(o.estibas)}</td>
                    <td className="n"><b>{n(o.cajas)}</b></td>
                    <td>
                      <select className={"cs-sel" + (o.elegido ? " cambiado" : "")} value={o.destino} disabled={pend} aria-label={`Sumar ${o.cajas} cajas de ${o.ubicacion} a`}
                              onChange={(e) => { const d = e.target.value;
                                hacer(asignarOtros(fecha, o.id, d, o.codigo), d === NO_SUMAR ? `${n(o.cajas)} cajas de ${o.ubicacion}: no se suman.` : `${n(o.cajas)} cajas de ${o.ubicacion} suman a ${d} · ${nombreDe(d)}.`) }}>
                        {envases.map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo} · {e.material}{e.codigo === o.codigo ? " (como se contó)" : ""}</option>)}
                        <option value={NO_SUMAR}>No sumar</option>
                      </select>
                    </td>
                    <td className="n">{o.destino === NO_SUMAR ? "—" : n(o.unidades)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {verOtros && aplicados.length > 0 && (
            <>
              <h4 className="cs-otros-h">Lo que la app aplicó a cada referencia · el porqué de cada cifra</h4>
              <div className="cs-scroll">
                <table className="cs-t chica">
                  <thead><tr><th>Código</th><th>Material</th><th>Qué se aplicó</th><th className="n">Cantidad</th><th>Por qué</th></tr></thead>
                  <tbody>{aplicados.map((x, i) => (
                    <tr key={`${x.codigo}-${i}`} className={x.apagado ? "apagado" : ""}>
                      <td className="mono">{(i === 0 || aplicados[i - 1].codigo !== x.codigo) ? x.codigo : ""}</td>
                      <td>{(i === 0 || aplicados[i - 1].codigo !== x.codigo) ? x.material : ""}</td>
                      <td><b>{x.que}</b></td>
                      <td className={"n" + (x.cantidad < 0 ? " neg" : "")}>{conSigno(x.cantidad)} <em>{x.unidad}</em></td>
                      <td className="cs-porque">{x.porque}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <div className="cs-scroll">
        <table className="cs-t">
          <thead><tr>
            <th>Código</th><th>Material</th><th className="n">Conteo fábrica</th><th className="n">Pend. baja</th><th className="n">Lavado con baja</th>
            <th className="n">Andina / Heineken</th><th className="n">Almacén</th><th className="n">Total conteo</th><th className="n">SAP (ZEXI)</th>
            <th className="n">311 (SAP − conteo)</th><th>Movimiento</th>
          </tr></thead>
          <tbody>
            {filas.map((f, i) => [
              (i === 0 || filas[i - 1].grupo !== f.grupo) && <tr key={`g-${f.grupo}`} className="g"><td colSpan={11}>{GRUPO[f.grupo]}</td></tr>,
              <tr key={f.codigo}>
                <td className="mono">{f.codigo}</td>
                <td>{f.material}{f.detalle && <small>{f.detalle}</small>}
                  {f.otrosCajas > 0 && <button type="button" className="cs-chip otr" title="Ver las líneas OTROS" onClick={() => setVerOtros(true)}><IconoOtros /> incluye OTROS · {n(f.otrosCajas)} cajas</button>}</td>
                <td className="n">{n(f.conteo)}</td>
                <td className={"n" + (sumarPend ? "" : " tachado")}>{f.pendBaja ? n(f.pendBaja) : "—"}</td>
                <td className="n neg">{f.lavadoBaja ? n(f.lavadoBaja) : "—"}</td>
                <td className="n">{f.andina ? n(f.andina) : "—"}</td>
                <td className="n">{f.almacen ? n(f.almacen) : "—"}</td>
                <td className="n"><b>{n(f.total)}</b></td>
                <td className="n">{f.sap == null ? "—" : n(f.sap)}</td>
                <td className={"n" + (f.dif == null || cero(f.dif) ? "" : f.dif < 0 ? " neg" : " amb")}><b>{f.dif == null ? "—" : cero(f.dif) ? "0" : conSigno(f.dif)}</b></td>
                <td>{f.dif == null ? <span className="cs-chip">Sin SAP</span> : cero(f.dif) ? <span className="cs-chip ok">Cuadra</span>
                  : f.dif < 0 ? <span className="cs-chip in">AG22 → AG18</span> : <span className="cs-chip out">AG18 → AG22</span>}</td>
              </tr>,
            ])}
          </tbody>
        </table>
      </div>
      <p className="cs-nota">Unidades (las cajas plásticas en cajas y las estibas en estibas). Conteo fábrica = lo contado en ubicaciones FABRICA_, todos los estados; lo de OTROS suma al envase escogido arriba (si no se escoge, al código con que se contó).
        Cajas plásticas = las sueltas + la caja de cada envase. Estibas = las sueltas + 1 por estiba contada (y por renglón con saldo) + las del almacén.
        Negativo = se contó más de lo que dice SAP.</p>

      {/* ---------- PASO 2 ---------- */}
      {conZexi && (
        <>
          <h2 className="cs-h"><i>2</i> Qué hacer en SAP (movimiento 311)</h2>
          {entran.length + salen.length === 0 ? <p className="cs-msg">Todo cuadra: no hay nada que mover en SAP.</p> : (
            <div className="cs-dos">
              <div className="cs-caja r"><h3>Pasar de AG22 a AG18 <em>{entran.length} materiales</em></h3>{entran.length ? lista(entran) : <p className="cs-vacio">Nada.</p>}</div>
              <div className="cs-caja a"><h3>Pasar de AG18 a AG22 <em>{salen.length} materiales</em></h3>{salen.length ? lista(salen) : <p className="cs-vacio">Nada.</p>}</div>
            </div>
          )}
          <div className="cs-subir">
            <div>
              <b>{conMov ? "Lo de después del 311 está cargado" : "Ya hiciste el 311 en SAP: baja la ZEXI nueva y súbela aquí"}</b>
              <small>{conMov
                ? `${guardado!.mov_archivo} · ${guardado!.movimientos!.length} materiales · ${hora(guardado!.mov_en)} · documentos ${[...new Set(guardado!.movimientos!.flatMap((m) => m.documentos))].join(", ") || "—"}`
                : "La ZEXI de AG18 bajada después del 311 (o el archivo de movimientos 311 de SAP). La app la compara con el conteo y dice si quedó balanceado."}</small>
            </div>
            <div className="cs-acc">
              <input ref={movRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void subirMov(a) }} />
              {conMov && <button type="button" className="cs-bt alt" disabled={pend} onClick={() => hacer(quitarMovimientos(fecha), "Se quitó la transacción.")}>Quitar</button>}
              <button type="button" className="cs-bt" disabled={pend} onClick={() => movRef.current?.click()}>{conMov ? "Cambiar" : "Subir ZEXI nueva"}</button>
            </div>
          </div>
        </>
      )}

      {/* ---------- PASO 3 ---------- */}
      {conZexi && conMov && (
        <>
          <h2 className="cs-h"><i>3</i> Cómo quedó</h2>
          <div className="cs-k dos">
            <div><span>Balanceados</span><b className="bien">{balanceados.length} de {filas.filter((f) => f.queda != null).length}</b></div>
            <div><span>Pendientes</span><b className={pendientes.length ? "mal" : "bien"}>{pendientes.length}</b></div>
          </div>
          {pendientes.length === 0 && <p className="cs-msg bien">Todo quedó balanceado: el SAP de AG18 es igual al conteo.</p>}
          <div className="cs-scroll">
            <table className="cs-t">
              <thead><tr><th>Código</th><th>Material</th><th className="n">Conteo</th><th className="n">SAP antes</th><th className="n">Diferencia</th>
                <th className="n">Cambio en SAP</th><th className="n">SAP después</th><th className="n">Queda</th><th>Estado</th></tr></thead>
              <tbody>
                {filas.filter((f) => f.sap != null).map((f) => (
                  <tr key={f.codigo} className={cero(f.queda) ? "" : "pend"}>
                    <td className="mono">{f.codigo}</td><td>{f.material}</td>
                    <td className="n">{n(f.total)}</td><td className="n">{n(f.sap!)}</td>
                    <td className="n">{cero(f.dif) ? "0" : conSigno(f.dif!)}</td>
                    <td className="n">{f.movido ? <>{n(Math.abs(f.movido))} <em>{f.movido > 0 ? "AG22 → AG18" : "AG18 → AG22"}</em></> : "—"}</td>
                    <td className="n">{n(f.sapDespues!)}</td>
                    <td className="n"><b>{cero(f.queda) ? "0" : conSigno(f.queda!)}</b></td>
                    <td>{cero(f.queda) ? <span className="cs-chip ok">Balanceado</span>
                      : <span className="cs-chip in">Falta {n(Math.abs(f.queda!))} {f.queda! < 0 ? "AG22 → AG18" : "AG18 → AG22"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---------- HISTÓRICO ---------- */}
      <h2 className="cs-h"><i>H</i> Histórico de balanceos</h2>
      {faltaHist ? <p className="cs-msg mal">Falta correr supabase/migraciones/2026-10-cuadre-sap-historial.sql en Supabase para guardar el histórico.</p>
        : historial.length === 0 ? <p className="cs-msg">Todavía no hay balanceos guardados. Con el botón «Guardar balanceo del día» (arriba) cada día queda aquí.</p> : (
        <div className="cs-scroll">
          <table className="cs-t cs-hist">
            <thead><tr><th>Día</th><th>Guardado</th><th className="n">Materiales</th><th className="n">Cuadraban (paso 1)</th><th className="n">Balanceados</th><th className="n">Pendientes</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {historial.map((h) => {
                const r = h.cierre.resumen, ver = abierto === h.fecha;
                return [
                  <tr key={h.fecha} className={h.fecha === fecha ? "hoy" : ""}>
                    <td><b>{largo(h.fecha)}</b><small>{h.fecha.slice(0, 4)}</small></td>
                    <td>{hora(h.cerrado_en)}<small>{h.cerrado_nombre ?? ""}</small></td>
                    <td className="n">{r.conSap}</td>
                    <td className="n">{r.cuadran}</td>
                    <td className="n"><b>{r.balanceados}</b></td>
                    <td className={"n" + (r.pendientes ? " neg" : "")}><b>{r.pendientes}</b></td>
                    <td>{r.pendientes === 0 ? <span className="cs-chip ok">Todo balanceado</span>
                      : <span className="cs-chip in">{r.pendientes} pendientes{r.conMov ? "" : " · sin ZEXI nueva"}</span>}</td>
                    <td className="cs-hacc">
                      <button type="button" className="cs-bt alt" aria-expanded={ver} onClick={() => setAbierto(ver ? null : h.fecha)}>{ver ? "Ocultar" : "Ver"}</button>
                      {h.fecha !== fecha && <button type="button" className="cs-bt alt" disabled={pend} onClick={() => start(() => router.push(`/inventario/balance/cuadre?fecha=${h.fecha}`))}>Abrir y editar</button>}
                    </td>
                  </tr>,
                  ver && (
                    <tr key={`${h.fecha}-v`} className="cs-hver"><td colSpan={8}>
                      <p className="cs-hnota">Lo guardado: ZEXI {h.cierre.zexi_archivo ?? "—"}{h.cierre.mov_archivo ? ` · ZEXI nueva / 311 ${h.cierre.mov_archivo}` : ""} · estibas del almacén {h.cierre.estibas_almacen ?? 0} · pend. baja {h.cierre.sumar_pend_baja ? "se sumaba" : "no se sumaba"}</p>
                      <table className="cs-t chica">
                        <thead><tr><th>Código</th><th>Material</th><th className="n">Conteo</th><th className="n">SAP antes</th><th className="n">311</th><th className="n">SAP después</th><th className="n">Queda</th><th>Estado</th></tr></thead>
                        <tbody>{h.cierre.filas.filter((f) => f.sap != null).map((f) => (
                          <tr key={f.codigo} className={cero(f.queda) ? "" : "pend"}>
                            <td className="mono">{f.codigo}</td><td>{f.material}</td>
                            <td className="n">{n(f.total)}</td><td className="n">{n(f.sap!)}</td>
                            <td className="n">{cero(f.dif) ? "0" : conSigno(f.dif!)}</td>
                            <td className="n">{f.sapDespues == null ? "—" : n(f.sapDespues)}</td>
                            <td className="n"><b>{cero(f.queda) ? "0" : conSigno(f.queda!)}</b></td>
                            <td>{cero(f.queda) ? <span className="cs-chip ok">Balanceado</span> : <span className="cs-chip in">Falta {n(Math.abs(f.queda!))}</span>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </td></tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
