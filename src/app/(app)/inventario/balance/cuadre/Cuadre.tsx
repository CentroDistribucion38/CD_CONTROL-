"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
/* LA DIFERENCIA EN CAJAS, al lado de la de unidades: el envase se divide por sus unidades por caja;
   las cajas plásticas ya vienen en cajas; las estibas no tienen cajas. */
const enCajas = (f: Pick<FilaCuadre, "grupo" | "upc">, v: number | null) =>
  v == null || f.grupo === "ESTIBA" ? null : f.grupo === "CAJA" ? v : v / (f.upc || 1);
const nc = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const cajasTxt = (v: number | null, signo = true) => v == null ? "—" : Math.abs(v) < 0.05 ? "0" : (signo && v > 0 ? "+" : v < 0 ? "−" : "") + nc.format(Math.abs(v));
const GRUPO: Record<string, string> = { ENVASE: "Envase", CAJA: "Cajas plásticas", ESTIBA: "Estibas de madera" };

/** La etiqueta de OTROS (Andina…). */
const IconoOtros = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);

export function Cuadre({ fecha, dias, filas, guardado, estibasBodega, avisos, error, otros, envases, aplicados, historial, faltaHist, vista: vistaInicial = "cuadre" }: {
  fecha: string | null; dias: string[]; filas: FilaCuadre[]; guardado: CuadreGuardado | null;
  estibasBodega: number; avisos: string[]; error: string | null;
  otros: LineaOtros[]; envases: { codigo: string; material: string }[]; aplicados: Aplicado[];
  historial: DiaHistorial[]; faltaHist: boolean; vista?: "cuadre" | "historico";
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ mal: boolean; t: string } | null>(null);
  const [estibas, setEstibas] = useState(guardado?.estibas_almacen != null ? String(guardado.estibas_almacen) : "");
  const zexiRef = useRef<HTMLInputElement>(null);
  const movRef = useRef<HTMLInputElement>(null);
  const [verOtros, setVerOtros] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  /* Los documentos del 311 que ya se hicieron en SAP (de a 9 posiciones). Se recuerdan en este equipo, por día. */
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const claveHechos = `cuadre-311-hechos-${fecha ?? ""}`;
  useEffect(() => {
    try { setHechos(new Set(JSON.parse(localStorage.getItem(claveHechos) ?? "[]") as string[])) } catch { setHechos(new Set()) }
  }, [claveHechos]);
  const marcarHecho = (k: string) => setHechos((prev) => {
    const nx = new Set(prev); if (nx.has(k)) nx.delete(k); else nx.add(k);
    try { localStorage.setItem(claveHechos, JSON.stringify([...nx])) } catch { /* sin memoria en este equipo */ }
    return nx;
  });
  const [reemplazar, setReemplazar] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  /* Dos hojas: el cuadre del día y el histórico. La escogida queda en la dirección (?vista=historico). */
  const [vista, setVista] = useState<"cuadre" | "historico">(vistaInicial);
  /* Los días guardados hasta el paso 2: les falta subir la ZEXI nueva para validar (paso 3). */
  const porValidar = historial.filter((h) => !h.cierre.resumen.conMov);
  const irA = (v: "cuadre" | "historico") => {
    setVista(v);
    try { const u = new URL(window.location.href); if (v === "historico") u.searchParams.set("vista", v); else u.searchParams.delete("vista"); window.history.replaceState(null, "", u) } catch { /* nada */ }
  };

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

  /* COPIAR PARA SAP, POR COLUMNA: primero los códigos (se pegan en la columna Material) y luego las
     cantidades (en la columna Cantidad), uno por renglón y sin puntos de miles. SAP deja 9 posiciones
     por documento: la lista se parte en documentos de a 9 y cada uno se copia y se marca aparte. */
  async function copiarParaSap(xs: FilaCuadre[], que: "codigos" | "cantidades", cual: string) {
    const texto = xs.map((f) => que === "codigos" ? f.codigo : String(Math.round(Math.abs(f.dif ?? 0)))).join("\r\n");
    try { await navigator.clipboard.writeText(texto) }
    catch {
      const t = document.createElement("textarea"); t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); try { document.execCommand("copy") } finally { t.remove() }
    }
    setCopiado(cual); window.setTimeout(() => setCopiado((c) => (c === cual ? null : c)), 2200);
  }
  const botonCopiar = (xs: FilaCuadre[], que: "codigos" | "cantidades", cual: string) => (
    <button type="button" className={"cs-copiar" + (copiado === cual ? " ok" : "")} onClick={() => void copiarParaSap(xs, que, cual)}
            title={que === "codigos" ? "Copia la columna de códigos (Material)" : "Copia la columna de cantidades"}>
      {copiado === cual ? "✓ Copiado" : (
        <><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg> {que === "codigos" ? "Códigos" : "Cantidades"}</>
      )}
    </button>
  );
  const POSICIONES_SAP = 9;
  const enDocumentos = (xs: FilaCuadre[]) => Array.from({ length: Math.ceil(xs.length / POSICIONES_SAP) }, (_, i) => xs.slice(i * POSICIONES_SAP, (i + 1) * POSICIONES_SAP));
  const faltan = (xs: FilaCuadre[], cual: string) => enDocumentos(xs).filter((_, i) => !hechos.has(`${cual}-${i}`)).length;
  /* Una lista del 311 partida en documentos de a 9: cada uno con sus dos botones de copiar y «Hecho en SAP». */
  const documentos = (xs: FilaCuadre[], cual: string) => enDocumentos(xs).map((doc, i) => {
    const k = `${cual}-${i}`, hecho = hechos.has(k);
    return (
      <div key={k} className={"cs-doc" + (hecho ? " hecho" : "")}>
        <div className="cs-doc-bar">
          <b>Documento {i + 1}</b>
          <small>posiciones {i * POSICIONES_SAP + 1}–{i * POSICIONES_SAP + doc.length} · {doc.length} de {POSICIONES_SAP}</small>
          <span className="cs-doc-acc">
            {botonCopiar(doc, "codigos", `${k}-c`)}
            {botonCopiar(doc, "cantidades", `${k}-q`)}
            <label className="cs-doc-hecho"><input type="checkbox" checked={hecho} onChange={() => marcarHecho(k)} /> Hecho en SAP</label>
          </span>
        </div>
        {lista(doc)}
      </div>
    );
  });
  const cabezaLista = (xs: FilaCuadre[], cual: string) => {
    const docs = enDocumentos(xs).length, f = faltan(xs, cual);
    return (
      <span className="cs-h3d">
        {docs > 0 && <span className={"cs-falta" + (f ? "" : " ok")}>{f ? `${f} de ${docs} ${docs === 1 ? "documento" : "documentos"} por hacer` : "✓ Todo hecho en SAP"}</span>}
        <em>{xs.length} materiales</em>
      </span>
    );
  };
  const lista = (xs: FilaCuadre[]) => (
    <table className="cs-t chica"><thead><tr><th>Código</th><th>Material</th><th className="n">Cantidad</th><th className="n">Cajas</th></tr></thead>
      <tbody>{xs.map((f) => <tr key={f.codigo}><td className="mono">{f.codigo}</td><td>{f.material}</td><td className="n"><b>{n(Math.abs(f.dif!))}</b></td>
        <td className="n">{cajasTxt(enCajas(f, Math.abs(f.dif!)), false)}</td></tr>)}</tbody>
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
            ? (guardado.cierre.resumen.conMov
              ? <span className="cs-guardado">✓ Guardado y validado {hora(guardado.cerrado_en ?? null)}{guardado.cerrado_nombre ? ` · ${guardado.cerrado_nombre}` : ""}</span>
              : <span className="cs-guardado paso2">✓ Guardado hasta el paso 2 {hora(guardado.cerrado_en ?? null)} · falta subir la ZEXI nueva (paso 3)</span>)
            : <span className="cs-guardado no">Este día no está guardado</span>}
          {reemplazar ? (
            <span className="cs-acc">
              <button type="button" className="cs-bt" disabled={pend} onClick={() => { setReemplazar(false); hacer(guardarBalanceo(fecha), "Balanceo del día guardado otra vez (reemplazó el anterior).") }}>Sí, reemplazar</button>
              <button type="button" className="cs-bt alt" onClick={() => setReemplazar(false)}>No</button>
            </span>
          ) : (
            <button type="button" className="cs-bt" disabled={pend || !conZexi} title={conZexi ? undefined : "Sube primero la ZEXI de SAP de ese día"}
                    onClick={() => guardado?.cierre ? setReemplazar(true) : hacer(guardarBalanceo(fecha), "Balanceo del día guardado en el histórico.")}>
              {guardado?.cierre ? "Volver a guardar" : conMov ? "Guardar balanceo del día" : "Guardar hasta el paso 2"}
            </button>
          )}
        </div>
      </section>

      <nav className="bal-tabs cs-hojas" role="tablist" aria-label="Hojas del Cuadre SAP">
        <button type="button" role="tab" aria-selected={vista === "cuadre"} className={`bal-tab ${vista === "cuadre" ? "activa" : ""}`} onClick={() => irA("cuadre")}>
          <span className="bal-tab-label">Cuadre del día</span>
        </button>
        <button type="button" role="tab" aria-selected={vista === "historico"} className={`bal-tab ${vista === "historico" ? "activa" : ""}`} onClick={() => irA("historico")}>
          <span className="bal-tab-label">Histórico</span>
          {historial.length > 0 && <span className="bal-tab-n" title="días guardados">{historial.length}</span>}
          {porValidar.length > 0 && <span className="bal-tab-al" title="días esperando la ZEXI nueva">{porValidar.length}</span>}
        </button>
      </nav>

      {vista === "cuadre" && (<>
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
            <th className="n">311 (SAP − conteo)</th><th className="n">311 en cajas</th><th>Movimiento</th>
          </tr></thead>
          <tbody>
            {filas.map((f, i) => [
              (i === 0 || filas[i - 1].grupo !== f.grupo) && <tr key={`g-${f.grupo}`} className="g"><td colSpan={12}>{GRUPO[f.grupo]}</td></tr>,
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
                <td className={"n" + (f.dif == null || cero(f.dif) ? "" : f.dif < 0 ? " neg" : " amb")} title={f.grupo === "ENVASE" ? `${n(f.upc)} unidades por caja` : undefined}>{cajasTxt(enCajas(f, f.dif))}</td>
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
              <div className="cs-caja r"><h3>Pasar de AG22 a AG18 {cabezaLista(entran, "entran")}</h3>{entran.length ? documentos(entran, "entran") : <p className="cs-vacio">Nada.</p>}</div>
              <div className="cs-caja a"><h3>Pasar de AG18 a AG22 {cabezaLista(salen, "salen")}</h3>{salen.length ? documentos(salen, "salen") : <p className="cs-vacio">Nada.</p>}</div>
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

      </>)}

      {/* ---------- LA HOJA DEL HISTÓRICO ---------- */}
      {vista === "historico" && (<>
      {msg && <p className={"cs-msg" + (msg.mal ? " mal" : "")} role="status">{msg.t}</p>}
      {porValidar.length > 0 && (
        <p className="cs-msg cs-porvalidar">
          <b>{porValidar.length} {porValidar.length === 1 ? "día espera" : "días esperan"} la ZEXI nueva</b> para validar el balanceo (paso 3): {porValidar.map((h) => largo(h.fecha)).join(" · ")}.
          Ábrelo, sube la ZEXI nueva y lo guardado se pone al día solo.
        </p>
      )}
      <p className="cs-nota cs-hintro">Un renglón por cada día guardado con «Guardar balanceo del día» o «Guardar hasta el paso 2». <b>Ver</b> muestra lo que se guardó; <b>Abrir y editar</b> lleva al cuadre de ese día para cambiarlo y volverlo a guardar.</p>
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
                    <td className="n"><b>{r.conMov ? r.balanceados : "—"}</b></td>
                    <td className={"n" + (r.conMov && r.pendientes ? " neg" : "")}><b>{r.conMov ? r.pendientes : "—"}</b></td>
                    <td>{!r.conMov
                      ? <span className="cs-chip out">Paso 2 · falta la ZEXI nueva{r.entran != null ? ` · 311: ${r.entran} entran, ${r.salen ?? 0} salen` : ""}</span>
                      : r.pendientes === 0 ? <span className="cs-chip ok">Todo balanceado</span>
                      : <span className="cs-chip in">{r.pendientes} pendientes</span>}</td>
                    <td className="cs-hacc">
                      <button type="button" className="cs-bt alt" aria-expanded={ver} onClick={() => setAbierto(ver ? null : h.fecha)}>{ver ? "Ocultar" : "Ver"}</button>
                      <button type="button" className="cs-bt alt" disabled={pend} onClick={() => h.fecha === fecha ? irA("cuadre") : start(() => router.push(`/inventario/balance/cuadre?fecha=${h.fecha}`))}>{r.conMov ? "Abrir y editar" : "Abrir y validar"}</button>
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
      </>)}
    </>
  );
}
