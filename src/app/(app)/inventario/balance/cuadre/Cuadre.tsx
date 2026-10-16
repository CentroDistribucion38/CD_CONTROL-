"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rango } from "../../../sider/seguimiento/Rango";
import type { Aplicado, Almacen, CuadreGuardado, DiaHistorial, Estados, FilaCuadre, LineaOtros } from "@/modulos/inventario/cuadre";
import { asignarOtros, guardarBalanceo, guardarMovimientos, guardarOpciones, guardarZexi, quitarMovimientos } from "./actions";
import { leerMovimientos, leerZexi } from "./leer";
import { Excluidos } from "./Excluidos";
import type { PanelExcluidos } from "@/modulos/pasivos/excluidos";

/**
 * EL CUADRE SAP EN PANTALLA — un flujo de tres pasos (cuatro en AG18 con cajas plásticas: el 3 es el balance de cajas por estado):
 *   1. CUADRE DEL DÍA: se sube el ZEXI, se digitan las estibas del almacén y sale la diferencia.
 *   2. QUÉ HACER EN SAP: las dos listas del 311 (AG22 → AG18 y AG18 → AG22), listas para digitar.
 *   3. CÓMO QUEDÓ: se sube la transacción del 311 que se bajó de SAP y el cuadre se rehace con lo
 *      movido: cada material queda «Balanceado» o dice cuánto falta y hacia dónde.
 */
/* Las causales de la base de Pasivos que entran al cuadre de AG22 (las mismas de modulos/inventario/cuadre.ts). */
const CAUSALES_AG22 = ["PRESORTING", "ROTURA DE LINEA", "LAVADO", "EXTRASUCIO", "BAJA PROYECTADA"];
const CAUSAL_CORTA: Record<string, string> = { "PRESORTING": "Presorting", "ROTURA DE LINEA": "Rotura de línea", "LAVADO": "Lavado", "EXTRASUCIO": "Extrasucio", "BAJA PROYECTADA": "Baja proyectada" };
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

export function Cuadre({ fecha, dias, filas, guardado, estibasBodega, avisos, error, otros, envases, aplicados, excluidos, historial, faltaHist, vista: vistaInicial = "cuadre", almacen = "AG18" }: {
  fecha: string | null; dias: string[]; filas: FilaCuadre[]; guardado: CuadreGuardado | null;
  estibasBodega: number; avisos: string[]; error: string | null;
  otros: LineaOtros[]; envases: { codigo: string; material: string }[]; aplicados: Aplicado[]; excluidos?: PanelExcluidos | null;
  historial: DiaHistorial[]; faltaHist: boolean; vista?: "cuadre" | "historico"; almacen?: Almacen;
}) {
  const router = useRouter();
  /* EL ALMACÉN DEL CUADRE: AG18 (fábrica, contra el conteo) o AG22 (la base de Pasivos contra el Bloqueado). */
  const ALM: Almacen = almacen, OTRO: Almacen = almacen === "AG18" ? "AG22" : "AG18", esAG22 = almacen === "AG22";
  /* HACIA DÓNDE SE MUEVE. AG18: de almacén a almacén (311 con AG22). AG22: NO cambia de almacén — se pasa
     de LIBRE a BLOQUEADO (o al revés) dentro del mismo AG22, porque la base tiene que estar bloqueada ahí. */
  const ENTRA = esAG22 ? "Libre → Bloqueado" : `${OTRO} → ${ALM}`;
  const SALE = esAG22 ? "Bloqueado → Libre" : `${ALM} → ${OTRO}`;
  const MOV = esAG22 ? "el traslado libre ↔ bloqueado" : "el 311";
  const campoZexi = esAG22 ? "bloqueado" as const : "total" as const;
  const urlDe = (alm: Almacen, dia?: string | null) => `/inventario/balance/cuadre?${dia ? `fecha=${dia}&` : ""}alm=${alm}`;
  const [histAlm, setHistAlm] = useState<"" | Almacen>("");
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ mal: boolean; t: string } | null>(null);
  const [estibas, setEstibas] = useState(guardado?.estibas_almacen != null ? String(guardado.estibas_almacen) : "");
  const zexiRef = useRef<HTMLInputElement>(null);
  const movRef = useRef<HTMLInputElement>(null);
  const [verOtros, setVerOtros] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  /* Los documentos del 311 que ya se hicieron en SAP (de a 9 posiciones). Se recuerdan en este equipo, por día. */
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const claveHechos = `cuadre-311-hechos-${almacen}-${fecha ?? ""}`;
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
  /* UN CÓDIGO ESCOGIDO se resalta en TODAS las listas (311, 343, 344, estados) y arriba sale dónde aparece. */
  const [foco, setFoco] = useState<string | null>(null);
  const enfocar = (c: string) => setFoco((x) => (x === c ? null : c));
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
  const sumarPend = false; /* el pend. baja ya no entra al cuadre de AG18 */
  const conDif = filas.filter((f) => f.dif != null);
  const entran = conDif.filter((f) => !cero(f.dif) && f.dif! < 0);
  const salen = conDif.filter((f) => !cero(f.dif) && f.dif! > 0);
  /* «Me dice que del 18 al 22 debo pasar 312 del 3500888, pero lo tengo en BLOQUEADO: que me diga que
     primero haga el 343 por esa cantidad y luego lo mueva al 22.» Lo que sale de AG18 y no alcanza con
     lo libre: primero 343 (Bloqueado → Libre) por lo que falta (hasta lo bloqueado). `dif` = esa cantidad. */
  const del343 = esAG22 ? [] : salen.flatMap((f) => {
    /* Las cajas plásticas van aparte, por estado (ver «Cajas plásticas por estado»). */
    if (f.grupo === "CAJA" || f.libre == null || !f.bloqueado) return [];
    const falta = Math.min(Math.abs(f.dif!) - f.libre, f.bloqueado);
    return falta > 0 ? [{ ...f, dif: falta }] : [];
  });
  const sinReparto = !esAG22 && salen.some((f) => f.libre == null);
  /* DOS BALANCEOS APARTE: primero el ENVASE (y la estiba) —311 y todo a bloqueado— y después las CAJAS
     PLÁSTICAS, que van por estado (libre · control-cal · bloqueado). En AG22 no se parte. */
  const esCaja = (f: FilaCuadre) => !esAG22 && f.grupo === "CAJA";
  const entranEnv = entran.filter((f) => !esCaja(f)), salenEnv = salen.filter((f) => !esCaja(f));
  const entranCaja = entran.filter(esCaja), salenCaja = salen.filter(esCaja);

  /* CAJAS PLÁSTICAS POR ESTADO (AG18): «en caja debe quedar el balance de los 3 estados».
     Suelta en BAJA → Bloqueado · suelta en RETORNO → Libre · la caja que lleva el envase → Control-cal.
     Se parte de la ZEXI, se le aplica el 311 (llega o sale por libre) y lo que falta para llegar a la
     meta sale en movimientos de estado. */
  const MOV_ESTADO: Record<string, { mov: string; t: string; antes311: boolean }> = {
    "calidad>libre": { mov: "321", t: "Control-cal → Libre", antes311: true },
    "bloqueado>libre": { mov: "343", t: "Bloqueado → Libre", antes311: true },
    "libre>calidad": { mov: "322", t: "Libre → Control-cal", antes311: false },
    "libre>bloqueado": { mov: "344", t: "Libre → Bloqueado", antes311: false },
    "bloqueado>calidad": { mov: "349", t: "Bloqueado → Control-cal", antes311: false },
    "calidad>bloqueado": { mov: "350", t: "Control-cal → Bloqueado", antes311: false },
  };
  const ESTADOS_K = ["libre", "calidad", "bloqueado"] as const;
  const cajasEstado = esAG22 ? [] : filas.filter((f) => f.grupo === "CAJA" && f.meta && f.sap != null).map((f) => {
    const conEstados = f.libre != null;
    const hoy: Estados = { libre: f.libre ?? 0, calidad: f.calidad ?? 0, bloqueado: f.bloqueado ?? 0 };
    const tras: Estados = { ...hoy, libre: hoy.libre - (f.dif ?? 0) };
    const d = ESTADOS_K.map((k) => ({ k, v: f.meta![k] - tras[k] }));
    const fuentes = d.filter((x) => x.v < -0.5).map((x) => ({ k: x.k, v: -x.v }));
    const destinos = d.filter((x) => x.v > 0.5).map((x) => ({ ...x }));
    /* Lo que pasa A LIBRE va ANTES del 311 solo si la caja sale de AG18 y lo libre de hoy no alcanza. */
    const saleSinLibre = (f.dif ?? 0) > 0.5 && hoy.libre < (f.dif ?? 0);
    const movs: { clave: string; cant: number; antes: boolean }[] = [];
    for (const de of destinos) for (const fu of fuentes) {
      const q = Math.min(de.v, fu.v); if (q < 0.5) continue;
      movs.push({ clave: `${fu.k}>${de.k}`, cant: q, antes: saleSinLibre && de.k === "libre" }); de.v -= q; fu.v -= q;
    }
    /* Cómo quedaría en SAP con el balanceo: lo de tras el 311 con los movimientos de estado aplicados. */
    const queda: Estados = { ...tras };
    if (conEstados) for (const m of movs) { const [a, b] = m.clave.split(">") as (keyof Estados)[]; queda[a] -= m.cant; queda[b] += m.cant }
    const cuadra = conEstados && ESTADOS_K.every((k) => cero(queda[k] - f.meta![k]));
    return { f, conEstados, hoy, tras, queda, cuadra, movs: conEstados ? movs : [] };
  });
  /* Con cajas plásticas en AG18 el flujo es de 4 pasos: 1 cuadre · 2 311 del envase · 3 balance de cajas · 4 cómo quedó. */
  const conCajas = !esAG22 && cajasEstado.length > 0;
  const porMov = Object.entries(MOV_ESTADO).flatMap(([clave, m]) => [true, false].map((antes) => ({ clave, ...m, antes311: antes,
    cual: `caja-${m.mov}-${antes ? "a" : "d"}`,
    filas: cajasEstado.flatMap((c) => c.movs.filter((x) => x.clave === clave && x.antes === antes).map((x) => ({ ...c.f, dif: x.cant }))) })))
    .filter((x) => x.filas.length);

  /* Dónde aparece cada código (para la barra del código escogido). */
  const listasSap: { t: string; filas: FilaCuadre[]; ancla: string }[] = [
    { t: `Envase · Mov 343 en ${ALM}`, filas: del343, ancla: "p-env" },
    { t: `Envase · 311 ${ALM} → ${OTRO}`, filas: salenEnv, ancla: "p-env" },
    { t: `Envase · 311 ${OTRO} → ${ALM}`, filas: entranEnv, ancla: "p-env" },
    ...porMov.filter((m) => m.antes311).map((m) => ({ t: `Cajas · Mov ${m.mov} antes del 311`, filas: m.filas, ancla: "p-cajas" })),
    { t: `Cajas · 311 ${ALM} → ${OTRO}`, filas: salenCaja, ancla: "p-cajas" },
    { t: `Cajas · 311 ${OTRO} → ${ALM}`, filas: entranCaja, ancla: "p-cajas" },
    ...porMov.filter((m) => !m.antes311).map((m) => ({ t: `Cajas · Mov ${m.mov} (${m.t})`, filas: m.filas, ancla: "p-cajas" })),
  ];
  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  /* Y AL REVÉS: lo que ENTRA a AG18 por el 311 llega en libre utilización y aquí va bloqueado: después
     del 311, el 344 con los mismos documentos (solo se avisa en el paso 2). */

  const cuadran = conDif.filter((f) => cero(f.dif));
  /* «Lo que quedó en el 18, cuando suba la ZEXI, me debe cuadrar con el BLOQUEADO: no puede quedar como
     libre utilización.» Un envase de AG18 con algo en libre no está balanceado: falta el 344. */
  const ok = (f: { queda: number | null; enLibre?: number | null; estadoOk?: boolean | null }) => cero(f.queda) && !((f.enLibre ?? 0) > 0.005) && f.estadoOk !== false;
  const balanceados = filas.filter((f) => f.queda != null && ok(f));
  const pendientes = filas.filter((f) => f.queda != null && !ok(f));
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
    const r = await leerZexi(a, ALM, campoZexi);
    if (r.error) { setMsg({ mal: true, t: r.error }); return }
    hacer(guardarZexi(fecha!, JSON.stringify(r.filas), a.name, ALM), `ZEXI cargado: ${r.filas.length} materiales de ${ALM}${esAG22 ? " (bloqueado)" : ""}.`);
  }
  async function subirMov(a: File) {
    setMsg(null);
    /* LA ZEXI NUEVA (la de después del 311): lo movido es lo que cambió el stock de SAP de una ZEXI a
       la otra, material por material. Así SAP después = la ZEXI nueva y «Queda» = ZEXI nueva − conteo. */
    const z = await leerZexi(a, ALM, campoZexi);
    if (!z.error && z.filas.length) {
      const antes = new Map((guardado?.zexi ?? []).map((x) => [String(x.codigo), Number(x.cantidad) || 0]));
      const ahora = new Map(z.filas.map((x) => [String(x.codigo), Number(x.cantidad) || 0]));
      const reparto = new Map(z.filas.map((x) => [String(x.codigo), x]));
      const movs = [...new Set([...antes.keys(), ...ahora.keys()])]
        .map((c) => ({ codigo: c, cantidad: (ahora.get(c) ?? 0) - (antes.get(c) ?? 0), documentos: [`ZEXI nueva · ${a.name}`],
          /* Cómo quedó repartido (si la ZEXI lo trae): para saber si algo quedó en libre. */
          ...(reparto.get(c)?.libre != null ? { libre: reparto.get(c)!.libre ?? 0, bloqueado: reparto.get(c)!.bloqueado ?? 0, calidad: reparto.get(c)!.calidad ?? 0 }
            : ahora.has(c) || esAG22 ? {} : { libre: 0, bloqueado: 0, calidad: 0 }) }));
      hacer(guardarMovimientos(fecha!, JSON.stringify(movs), a.name, ALM), `ZEXI nueva cargada: ${z.filas.length} materiales. Abajo está cómo quedó.`);
      return;
    }
    const r = await leerMovimientos(a, ALM);
    if (r.error) { setMsg({ mal: true, t: r.error }); return }
    hacer(guardarMovimientos(fecha!, JSON.stringify(r.filas), a.name, ALM), `Transacción cargada: ${r.filas.length} materiales movidos.`);
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
      <tbody>{xs.map((f) => <tr key={f.codigo} className={"cs-sel" + (foco === f.codigo ? " foco" : "")} onClick={() => enfocar(f.codigo)} title="Toca para ver este código en todos los movimientos">
        <td className="mono">{f.codigo}</td><td>{f.material}</td><td className="n"><b>{n(Math.abs(f.dif!))}</b></td>
        <td className="n">{cajasTxt(enCajas(f, Math.abs(f.dif!)), false)}</td></tr>)}</tbody>
    </table>
  );

  return (
    <>
      <section className="cabeza cs-cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · CUADRE SAP</p>
          <h1>Cuadre SAP · {esAG22 ? "AG22 Bloqueado" : "AG18 Fábrica"}</h1>
          <p className="sub">{esAG22
            ? <>La base de Pasivos <b>AG22</b> del <b>{largo(fecha)}</b> (PRESORTING, ROTURA DE LINEA, LAVADO, EXTRASUCIO y BAJA PROYECTADA) contra el <b>Bloqueado</b> de SAP (ZEXI). La diferencia es lo que hay que pasar de <b>libre a bloqueado</b> (o al revés) dentro del mismo AG22.</>
            : <>El conteo del <b>{largo(fecha)}</b> contra el stock de SAP (ZEXI). La diferencia es el movimiento 311 entre AG18 y AG22.</>}{pend && " · guardando…"}</p>
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
              <button type="button" className="cs-bt" disabled={pend} onClick={() => { setReemplazar(false); hacer(guardarBalanceo(fecha, ALM), "Balanceo del día guardado otra vez (reemplazó el anterior).") }}>Sí, reemplazar</button>
              <button type="button" className="cs-bt alt" onClick={() => setReemplazar(false)}>No</button>
            </span>
          ) : (
            <button type="button" className="cs-bt" disabled={pend || !conZexi} title={conZexi ? undefined : "Sube primero la ZEXI de SAP de ese día"}
                    onClick={() => guardado?.cierre ? setReemplazar(true) : hacer(guardarBalanceo(fecha, ALM), "Balanceo del día guardado en el histórico.")}>
              {guardado?.cierre ? "Volver a guardar" : conMov ? "Guardar balanceo del día" : "Guardar hasta el paso 2"}
            </button>
          )}
        </div>
      </section>

      <nav className="bal-tabs cs-hojas" role="tablist" aria-label="Hojas del Cuadre SAP">
        {(["AG18", "AG22"] as const).map((a) => {
          const activa = vista === "cuadre" && ALM === a;
          return (
            <button key={a} type="button" role="tab" aria-selected={activa} className={`bal-tab ${activa ? "activa" : ""}`}
                    onClick={() => (ALM === a ? irA("cuadre") : start(() => router.push(urlDe(a, fecha))))}>
              <span className="bal-tab-label">{a === "AG18" ? "AG18 · Fábrica" : "AG22 · Bloqueado"}</span>
            </button>
          );
        })}
        <button type="button" role="tab" aria-selected={vista === "historico"} className={`bal-tab ${vista === "historico" ? "activa" : ""}`} onClick={() => irA("historico")}>
          <span className="bal-tab-label">Histórico</span>
          {historial.length > 0 && <span className="bal-tab-n" title="días guardados">{historial.length}</span>}
          {porValidar.length > 0 && <span className="bal-tab-al" title="días esperando la ZEXI nueva">{porValidar.length}</span>}
        </button>
      </nav>

      {vista === "cuadre" && (<>
      <ol className="cs-pasos" style={{ gridTemplateColumns: `repeat(${conCajas ? 4 : 3}, minmax(0, 1fr))` }}>
        <li className={conZexi ? "hecho" : "on"}><span>PASO 1</span><b>Cuadre del día</b><small>{esAG22 ? "Base de Pasivos + ZEXI (bloqueado) → diferencias" : "Conteo + ZEXI → diferencias"}</small></li>
        <li className={conMov ? "hecho" : conZexi ? "on" : ""}><span>PASO 2</span><b>{esAG22 ? "Bloquear / liberar en SAP" : "Hacer el 311 en SAP"}</b><small>{conCajas ? "Envase y estiba · lo que dice la app" : "La app dice qué mover · subes la ZEXI nueva"}</small></li>
        {conCajas && <li className={conMov ? "hecho" : conZexi ? "on" : ""}><span>PASO 3</span><b>Balancear las cajas</b><small>Libre · control-cal · bloqueado · subes la ZEXI nueva</small></li>}
        <li className={conMov ? (pendientes.length ? "on" : "hecho") : ""}><span>PASO {conCajas ? 4 : 3}</span><b>¿Quedó balanceado?</b><small>El cuadre otra vez, con lo movido</small></li>
      </ol>

      {/* LOS DATOS DEL CUADRE: cuatro tarjetas iguales, encabezado oscuro (como las tablas) con el estado
          en amarillo, y el cuerpo en una sola línea. */}
      <div className="cs-barra">
        <div className="cs-c">
          <span className="cs-ch">{esAG22 ? "Día de la base" : "Día del conteo"}</span>
          <span className="cs-cb cs-dia sd bal-cal">
            <Rango rotulo={esAG22 ? "Día de la base" : "Día del conteo"} desde={fecha} hasta={fecha} dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                   alElegir={(d) => start(() => router.push(urlDe(ALM, d)))} />
          </span>
        </div>
        <div className="cs-c">
          <span className="cs-ch">ZEXI de SAP{esAG22 ? " · Bloqueado" : ""} {conZexi ? <i>✓ Cargado</i> : <i className="no">Falta subir</i>}</span>
          <span className="cs-cb">
            <span className="cs-txt">
              <b className="cs-v" title={conZexi ? guardado!.zexi_archivo ?? "" : undefined}>{conZexi ? guardado!.zexi_archivo : "Sin subir"}</b>
              <small>{conZexi ? `${guardado!.zexi!.length} materiales · ${hora(guardado!.zexi_en)}` : `El ${esAG22 ? "bloqueado" : "stock"} de ${ALM} de ese día`}</small>
            </span>
            <input ref={zexiRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void subirZexi(a) }} />
            <button type="button" className={"cs-bt" + (conZexi ? " alt" : "")} disabled={pend} onClick={() => zexiRef.current?.click()}>{conZexi ? "Cambiar" : "Subir ZEXI"}</button>
          </span>
        </div>
        {esAG22 ? (
          <div className="cs-c">
            <span className="cs-ch">Base de Pasivos · AG22</span>
            <span className="cs-cb">
              <span className="cs-txt">
                <b className="cs-v">{n(filas.reduce((t, f) => t + f.total, 0))} u</b>
                <small>{filas.filter((f) => f.total).length} materiales · {CAUSALES_AG22.length} causales</small>
              </span>
              <button type="button" className="cs-bt alt" onClick={() => start(() => router.push(`/inventario/balance/pasivos?desde=${fecha}&hasta=${fecha}`))}>Ver la base</button>
            </span>
          </div>
        ) : (<>
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
            <input type="checkbox" role="switch" checked={sumarPend} disabled title="El pend. baja no se toma en cuenta en el cuadre"
              onChange={(e) => hacer(guardarOpciones(fecha, guardado?.estibas_almacen ?? null, e.target.checked), e.target.checked ? "El pend. baja se suma." : "El pend. baja ya no se suma.")} />
            <span className="cs-txt">
              <b className="cs-v">{sumarPend ? "Se suma al conteo" : "No se suma"}</b>
              <small>Pasivos {ALM} · BAJA · SORTING</small>
            </span>
          </span>
        </label>
        </>)}
      </div>

      {msg && <p className={"cs-msg" + (msg.mal ? " mal" : "")} role="status">{msg.t}</p>}
      {avisos.map((a) => <p key={a} className="cs-msg mal">{a}</p>)}
      {excluidos && <Excluidos panel={excluidos} />}

      {/* ---------- PASO 1 ---------- */}
      <div className="cs-k">
        <div className="os"><span>Materiales</span><b>{filas.length}</b></div>
        <div><span>Cuadran</span><b className="bien">{conZexi ? cuadran.length : "—"}</b></div>
        <div><span>{esAG22 ? "Pasan a bloqueado" : `Entran a ${ALM}`} ({ENTRA})</span><b className="mal">{conZexi ? entran.length : "—"}</b></div>
        <div><span>{esAG22 ? "Se liberan" : `Salen de ${ALM}`} ({SALE})</span><b className="ambar">{conZexi ? salen.length : "—"}</b></div>
      </div>
      {!conZexi && <p className="cs-msg">Sube el ZEXI de SAP de ese día para ver la diferencia. Mientras tanto, abajo está lo que la app ya armó {esAG22 ? "de la base" : "del conteo"}.</p>}

      {(otros.length > 0 || aplicados.length > 0) && (
        <div className={"cs-otros" + (verOtros ? " abierto" : "")}>
          <button type="button" className="cs-otros-bt" aria-expanded={verOtros} onClick={() => setVerOtros((v) => !v)}>
            <IconoOtros />
            <b>{esAG22 ? "DE DÓNDE SALE CADA CIFRA" : "OTROS Y AJUSTES"}</b>
            <span>{otros.length ? `${otros.length} ${otros.length === 1 ? "línea" : "líneas"} OTROS · ${n(cajasOtros)} cajas · ` : ""}{aplicados.length} {esAG22 ? "partes de la base" : "ajustes aplicados"}</span>
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
          <thead>{esAG22 ? (
            <tr>
              <th>Código</th><th>Material</th>{CAUSALES_AG22.map((c) => <th key={c} className="n">{CAUSAL_CORTA[c]}</th>)}
              <th className="n">Total base</th><th className="n">SAP bloqueado</th>
              <th className="n">Diferencia (SAP − base)</th><th className="n">En cajas</th><th>Movimiento</th>
            </tr>
          ) : (
            <tr>
              <th>Código</th><th>Material</th><th className="n">Conteo fábrica</th><th className="n">Pend. baja</th><th className="n" title="Contado − casco − ajuste de Baja y Lavado · Fábrica: lo que sobra frente al Balance de materiales">Dif. balance</th>
              <th className="n">Andina / Heineken</th><th className="n">Almacén</th><th className="n">Total conteo</th><th className="n">SAP (ZEXI)</th>
              <th className="n">311 (SAP − conteo)</th><th className="n">311 en cajas</th><th>Movimiento</th>
            </tr>
          )}</thead>
          <tbody>
            {filas.map((f, i) => [
              (i === 0 || filas[i - 1].grupo !== f.grupo) && <tr key={`g-${f.grupo}`} className="g"><td colSpan={esAG22 ? 12 : 12}>{GRUPO[f.grupo]}</td></tr>,
              <tr key={f.codigo}>
                <td className="mono">{f.codigo}</td>
                <td>{f.material}{f.detalle && <small>{f.detalle}</small>}
                  {f.sinCasco && <span className="cs-chip" title="Baja · Fábrica sin casco registrado: todo lo contado en baja cuenta como diferencia">baja sin casco</span>}
                  {f.otrosCajas > 0 && <button type="button" className="cs-chip otr" title="Ver las líneas OTROS" onClick={() => setVerOtros(true)}><IconoOtros /> incluye OTROS · {n(f.otrosCajas)} cajas</button>}</td>
                {esAG22 ? CAUSALES_AG22.map((c) => <td key={c} className="n">{f.partes?.[c] ? n(f.partes[c]) : "—"}</td>) : (<>
                <td className="n">{n(f.conteo)}</td>
                <td className={"n" + (sumarPend ? "" : " tachado")}>{f.pendBaja ? n(f.pendBaja) : "—"}</td>
                <td className="n neg">{f.lavadoBaja ? n(f.lavadoBaja) : "—"}</td>
                <td className="n">{f.andina ? n(f.andina) : "—"}</td>
                <td className="n">{f.almacen ? n(f.almacen) : "—"}</td>
                </>)}
                <td className="n"><b>{n(f.total)}</b></td>
                <td className="n">{f.sap == null ? "—" : n(f.sap)}</td>
                <td className={"n" + (f.dif == null || cero(f.dif) ? "" : f.dif < 0 ? " neg" : " amb")}><b>{f.dif == null ? "—" : cero(f.dif) ? "0" : conSigno(f.dif)}</b></td>
                <td className={"n" + (f.dif == null || cero(f.dif) ? "" : f.dif < 0 ? " neg" : " amb")} title={f.grupo === "ENVASE" ? `${n(f.upc)} unidades por caja` : undefined}>{cajasTxt(enCajas(f, f.dif))}</td>
                <td>{f.dif == null ? <span className="cs-chip">Sin SAP</span> : cero(f.dif) ? <span className="cs-chip ok">Cuadra</span>
                  : f.dif < 0 ? <span className="cs-chip in">{ENTRA}</span> : <span className="cs-chip out">{SALE}</span>}</td>
              </tr>,
            ])}
          </tbody>
        </table>
      </div>
      {esAG22 ? <p className="cs-nota">Unidades. Total base = lo de la base de Pasivos AG22 del día en las causales PRESORTING, ROTURA DE LINEA, LAVADO, EXTRASUCIO y BAJA PROYECTADA (las demás no entran y se avisan arriba).
        SAP bloqueado = la columna Bloqueado de la ZEXI de AG22. Negativo = la base tiene más de lo que SAP tiene bloqueado: pasar de libre a bloqueado en AG22. Positivo = SAP tiene bloqueado de más: pasar de bloqueado a libre.</p> :
      <p className="cs-nota">Unidades (las cajas plásticas en cajas y las estibas en estibas). Conteo fábrica = lo contado en ubicaciones FABRICA_, todos los estados; lo de OTROS suma al envase escogido arriba (si no se escoge, al código con que se contó).
        Dif. balance = contado − casco − ajuste de Baja y Lavado · Fábrica (la diferencia del Balance de materiales): el total conteo es el Balance de materiales (lo contado menos esa diferencia), así que lo de más sale de AG18 con el 343 y el 311. Si Baja · Fábrica no tiene casco registrado, todo lo contado en baja cuenta como diferencia; el Lavado sin casco se toma tal cual. Los materiales con Lavado con baja en el Casco siguen como antes (conteo − lavado con baja).
        Cajas plásticas = las sueltas + la caja de cada envase. Estibas = las sueltas + 1 por estiba contada (y por renglón con saldo) + las del almacén.
        Negativo = se contó más de lo que dice SAP.</p>}

      {/* ---------- PASO 2 ---------- */}
      {conZexi && (
        <>
          <h2 className="cs-h"><i>2</i> Qué hacer en SAP {esAG22 ? "(de libre a bloqueado, o al revés, en AG22)" : conCajas ? "(311 del envase y la estiba · todo a bloqueado)" : "(movimiento 311)"}</h2>
          {foco && (() => {
            const donde = listasSap.map((p) => ({ p, f: p.filas.find((x) => x.codigo === foco) })).filter((x) => x.f);
            const fila = filas.find((x) => x.codigo === foco);
            return (
              <div className="cs-foco">
                <b>{foco}</b><span>{fila?.material ?? ""}</span>
                <span className="cs-foco-l">{donde.length ? donde.map((x, k) => (
                  <button key={k} type="button" onClick={() => ir(x.p.ancla)}>{x.p.t} · <b>{n(Math.abs(x.f!.dif ?? 0))}</b></button>
                )) : <em>No tiene movimientos</em>}</span>
                <button type="button" className="cs-foco-x" onClick={() => setFoco(null)}>Quitar ×</button>
              </div>
            );
          })()}

          {/* ================= A · ENVASE (y estiba): 311 y todo a bloqueado ================= */}
          {!esAG22 && <span id="p-env" />}
          {entranEnv.length + salenEnv.length === 0 ? <p className="cs-msg">{esAG22 ? "Todo cuadra: no hay nada que mover en SAP." : "El envase cuadra: no hay nada que mover."}</p> : (
            <div className="cs-dos">
              <div className="cs-caja r"><h3>{esAG22 ? "Pasar de Libre a Bloqueado (Mov 344)" : `Pasar de ${OTRO} a ${ALM}`} {cabezaLista(entranEnv, "entran")}</h3>
                {entranEnv.length ? documentos(entranEnv, "entran") : <p className="cs-vacio">Nada.</p>}
                {/* «Solo era poner el mensaje: puedo copiar y pegar lo mismo.» Sin lista aparte: los mismos documentos del 311. */}
                {!esAG22 && entranEnv.length > 0 && (
                  <div className="cs-antes azul">
                    <p className="cs-antes-t"><b>Después, en {ALM}: Mov 344 (Libre → Bloqueado)</b>
                      <span>El 311 deja todo en <b>libre utilización</b>. Con los <b>mismos documentos</b> de arriba (copia y pega igual) haz el 344 en {ALM}, antes de bajar la ZEXI nueva.</span></p>
                  </div>
                )}
              </div>
              <div className="cs-caja a"><h3>{esAG22 ? "Pasar de Bloqueado a Libre (Mov 343)" : `Pasar de ${ALM} a ${OTRO}`} {cabezaLista(salenEnv, "salen")}</h3>
                {del343.length > 0 && (
                  <div className="cs-antes">
                    <p className="cs-antes-t"><b>Primero, en {ALM}: Mov 343 (Bloqueado → Libre)</b>
                      <span>{del343.length === 1 ? "Este material está" : "Estos materiales están"} en <b>bloqueado</b> en SAP y lo libre no alcanza para el 311. Haz el 343 por estas cantidades y después el 311 de abajo.</span></p>
                    {documentos(del343, "salen343")}
                  </div>
                )}
                {sinReparto && salenEnv.length > 0 && <p className="cs-nota">La ZEXI guardada no dice cuánto está libre o bloqueado: vuelve a subirla para saber si algo necesita 343 antes.</p>}
                {salenEnv.length ? <>{del343.length > 0 && <p className="cs-antes-311">Luego, el 311 de {ALM} a {OTRO}:</p>}{documentos(salenEnv, "salen")}</> : <p className="cs-vacio">Nada.</p>}
              </div>
            </div>
          )}

          {/* ================= B · CAJAS PLÁSTICAS: 311 y balance por estado ================= */}
          {conCajas && (<>
            <h2 className="cs-h" id="p-cajas"><i>3</i> Balancear las cajas <small className="cs-h-s">el 311 y el balance por estado: libre · control-cal · bloqueado</small></h2>
            <div className="cs-caja cs-cajest">
              <p className="cs-cajest-dice">
                Suelta en <b>BAJA → Bloqueado</b> · suelta en <b>RETORNO → Libre utilización</b> · la caja que lleva el envase → <b>In control-cal</b>.
                Toca un código para verlo resaltado en todos sus movimientos.
              </p>
              <div className="cs-scroll">
                <table className="cs-t chica cs-cajest-t">
                  <thead>
                    <tr><th rowSpan={2}>Código</th><th rowSpan={2}>Material</th>
                      <th colSpan={3} className="g meta">Físico (conteo)</th><th colSpan={3} className="g">SAP hoy (ZEXI)</th><th colSpan={3} className="g fin">Quedaría en SAP con el balanceo</th><th rowSpan={2} /></tr>
                    <tr><th className="n meta">Libre</th><th className="n meta">Control-cal</th><th className="n meta">Bloqueado</th>
                      <th className="n">Libre</th><th className="n">Control-cal</th><th className="n">Bloqueado</th>
                      <th className="n fin">Libre</th><th className="n fin">Control-cal</th><th className="n fin">Bloqueado</th></tr>
                  </thead>
                  <tbody>
                    {cajasEstado.map(({ f, conEstados, hoy, queda, cuadra }) => (
                      <tr key={f.codigo} className={"cs-sel" + (foco === f.codigo ? " foco" : "")} onClick={() => enfocar(f.codigo)} title="Toca para ver este código en todos los movimientos">
                        <td className="mono">{f.codigo}</td><td>{f.material}</td>
                        <td className="n meta"><b>{n(f.meta!.libre)}</b></td><td className="n meta"><b>{n(f.meta!.calidad)}</b></td><td className="n meta"><b>{n(f.meta!.bloqueado)}</b></td>
                        {conEstados ? <>
                          <td className={"n" + (cero(hoy.libre - f.meta!.libre) ? "" : " dif")}>{n(hoy.libre)}</td>
                          <td className={"n" + (cero(hoy.calidad - f.meta!.calidad) ? "" : " dif")}>{n(hoy.calidad)}</td>
                          <td className={"n" + (cero(hoy.bloqueado - f.meta!.bloqueado) ? "" : " dif")}>{n(hoy.bloqueado)}</td>
                          <td className="n fin"><b>{n(queda.libre)}</b></td><td className="n fin"><b>{n(queda.calidad)}</b></td><td className="n fin"><b>{n(queda.bloqueado)}</b></td>
                          <td>{cuadra ? <span className="cs-chip ok">= físico</span> : <span className="cs-chip in">No cuadra</span>}</td>
                        </> : <td colSpan={7} className="cs-gris">La ZEXI no trae los estados (Libre · Control-cal · Bloqueado)</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Los pasos de las cajas, en orden: (lo que pasa a libre si la caja sale) → 311 → estados. */}
              <ol className="cs-cajest-pasos">
                {porMov.some((m) => m.antes311) && (
                  <li><b>Antes del 311</b> — la caja sale de {ALM} y lo libre no alcanza: pásala a libre primero.
                    {porMov.filter((m) => m.antes311).map((m) => (
                      <div key={m.cual} className="cs-antes"><p className="cs-antes-t"><b>Mov {m.mov} en {ALM} ({m.t})</b></p>{documentos(m.filas, m.cual)}</div>
                    ))}
                  </li>
                )}
                <li><b>El 311 de las cajas</b>
                  {entranCaja.length + salenCaja.length === 0 ? <p className="cs-vacio">Las cajas cuadran en cantidad: no hay 311.</p> : (
                    <div className="cs-dos">
                      <div className="cs-caja r"><h3>{`Pasar de ${OTRO} a ${ALM}`} {cabezaLista(entranCaja, "caja-entran")}</h3>
                        {entranCaja.length ? documentos(entranCaja, "caja-entran") : <p className="cs-vacio">Nada.</p>}</div>
                      <div className="cs-caja a"><h3>{`Pasar de ${ALM} a ${OTRO}`} {cabezaLista(salenCaja, "caja-salen")}</h3>
                        {salenCaja.length ? documentos(salenCaja, "caja-salen") : <p className="cs-vacio">Nada.</p>}</div>
                    </div>
                  )}
                </li>
                <li><b>Después del 311: los estados</b> — el 311 deja todo en libre; con esto cada caja queda como en el físico.
                  {porMov.filter((m) => !m.antes311).length === 0 ? <p className="cs-vacio">Los estados ya quedan como el físico.</p>
                    : porMov.filter((m) => !m.antes311).map((m) => (
                      <div key={m.cual} className="cs-antes azul"><p className="cs-antes-t"><b>Mov {m.mov} en {ALM} ({m.t})</b></p>{documentos(m.filas, m.cual)}</div>
                    ))}
                </li>
              </ol>
            </div>
          </>)}

          <div className="cs-subir" id="p-zexi">
            <div>
              <b>{conMov ? `Lo de después de ${MOV} está cargado` : conCajas ? `Ya hiciste el ${MOV} y los estados de las cajas en SAP: baja la ZEXI nueva y súbela aquí` : `Ya hiciste ${MOV} en SAP: baja la ZEXI nueva y súbela aquí`}</b>
              <small>{conMov
                ? `${guardado!.mov_archivo} · ${guardado!.movimientos!.length} materiales · ${hora(guardado!.mov_en)} · documentos ${[...new Set(guardado!.movimientos!.flatMap((m) => m.documentos))].join(", ") || "—"}`
                : `La ZEXI de ${ALM} bajada después de ${MOV}${esAG22 ? "" : " (o el archivo de movimientos 311 de SAP)"}. La app la compara con ${esAG22 ? "la base" : "el conteo"} y dice si quedó balanceado.`}</small>
            </div>
            <div className="cs-acc">
              <input ref={movRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void subirMov(a) }} />
              {conMov && <button type="button" className="cs-bt alt" disabled={pend} onClick={() => hacer(quitarMovimientos(fecha, ALM), "Se quitó la transacción.")}>Quitar</button>}
              <button type="button" className="cs-bt" disabled={pend} onClick={() => movRef.current?.click()}>{conMov ? "Cambiar" : "Subir ZEXI nueva"}</button>
            </div>
          </div>
        </>
      )}

      {/* ---------- PASO 3 ---------- */}
      {conZexi && conMov && (
        <>
          <h2 className="cs-h"><i>{conCajas ? 4 : 3}</i> Cómo quedó</h2>
          <div className="cs-k dos">
            <div><span>Balanceados</span><b className="bien">{balanceados.length} de {filas.filter((f) => f.queda != null).length}</b></div>
            <div><span>Pendientes</span><b className={pendientes.length ? "mal" : "bien"}>{pendientes.length}</b></div>
          </div>
          {pendientes.length === 0 && <p className="cs-msg bien">Todo quedó balanceado: el SAP de {ALM}{esAG22 ? " (bloqueado)" : ""} es igual {esAG22 ? "a la base" : "al conteo"}{esAG22 ? "" : " y el envase quedó todo en bloqueado"}.</p>}
          {!esAG22 && filas.some((f) => (f.enLibre ?? 0) > 0.005) && <p className="cs-msg mal">Hay envase que quedó en <b>libre utilización</b> en {ALM}: haz el 344 (Libre → Bloqueado) por esa cantidad y vuelve a subir la ZEXI.</p>}
          <div className="cs-scroll">
            <table className="cs-t">
              <thead><tr><th>Código</th><th>Material</th><th className="n">{esAG22 ? "Base" : "Conteo"}</th><th className="n">SAP antes</th><th className="n">Diferencia</th>
                <th className="n">Cambio en SAP</th><th className="n">SAP después</th><th className="n">Queda</th><th>Estado</th></tr></thead>
              <tbody>
                {filas.filter((f) => f.sap != null).map((f) => (
                  <tr key={f.codigo} className={ok(f) ? "" : "pend"}>
                    <td className="mono">{f.codigo}</td><td>{f.material}</td>
                    <td className="n">{n(f.conteo)}{f.total - f.conteo > 0.5 && <small className="cs-ext" title="Lo que se suma al conteo para comparar con SAP (pend. baja, lavado, Andina, almacén)">+ {n(f.total - f.conteo)} = {n(f.total)}</small>}</td><td className="n">{n(f.sap!)}</td>
                    <td className="n">{cero(f.dif) ? "0" : conSigno(f.dif!)}</td>
                    <td className="n">{f.movido ? <>{n(Math.abs(f.movido))} <em>{f.movido > 0 ? ENTRA : SALE}</em></> : "—"}</td>
                    <td className="n">{n(f.sapDespues!)}</td>
                    <td className="n"><b>{cero(f.queda) ? "0" : conSigno(f.queda!)}</b></td>
                    <td>{!cero(f.queda) ? <span className="cs-chip in">Falta {n(Math.abs(f.queda!))} {f.queda! < 0 ? ENTRA : SALE}</span>
                      : (f.enLibre ?? 0) > 0.005 ? <span className="cs-chip in" title="En AG18 el envase va bloqueado">Quedó {n(f.enLibre!)} en libre · falta 344</span>
                      : f.estadoOk === false && f.estadoFinal && f.meta ? <span className="cs-chip in" title={`Debe: libre ${n(f.meta.libre)} · control-cal ${n(f.meta.calidad)} · bloqueado ${n(f.meta.bloqueado)}`}>Estados: L {n(f.estadoFinal.libre)} · C {n(f.estadoFinal.calidad)} · B {n(f.estadoFinal.bloqueado)} — no cuadran</span>
                      : <span className="cs-chip ok">Balanceado</span>}</td>
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
          <b>{porValidar.length} {porValidar.length === 1 ? "día espera" : "días esperan"} la ZEXI nueva</b> para validar el balanceo (paso 3): {porValidar.map((h) => `${largo(h.fecha)} (${h.almacen})`).join(" · ")}.
          Ábrelo, sube la ZEXI nueva y lo guardado se pone al día solo.
        </p>
      )}
      <div className="bal-chips cs-histalm" role="group" aria-label="Almacén">
        {(["", "AG18", "AG22"] as const).map((a) => (
          <button key={a || "todos"} type="button" className={histAlm === a ? "on" : ""} aria-pressed={histAlm === a} onClick={() => setHistAlm(a)}>
            {a || "Todos"}{a ? ` · ${historial.filter((h) => h.almacen === a).length}` : ` · ${historial.length}`}
          </button>
        ))}
      </div>
      <p className="cs-nota cs-hintro">Un renglón por cada día y almacén guardado con «Guardar balanceo del día» o «Guardar hasta el paso 2». <b>Ver</b> muestra lo que se guardó; <b>Abrir y editar</b> lleva al cuadre de ese día para cambiarlo y volverlo a guardar.</p>
      {faltaHist ? <p className="cs-msg mal">Falta correr supabase/migraciones/2026-10-cuadre-sap-historial.sql en Supabase para guardar el histórico.</p>
        : historial.length === 0 ? <p className="cs-msg">Todavía no hay balanceos guardados. Con el botón «Guardar balanceo del día» (arriba) cada día queda aquí.</p> : (
        <div className="cs-scroll">
          <table className="cs-t cs-hist">
            <thead><tr><th>Día</th><th>Almacén</th><th>Guardado</th><th className="n">Materiales</th><th className="n">Cuadraban (paso 1)</th><th className="n">Balanceados</th><th className="n">Pendientes</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {historial.filter((h) => !histAlm || h.almacen === histAlm).map((h) => {
                const r = h.cierre.resumen, k = `${h.fecha}-${h.almacen}`, ver = abierto === k;
                return [
                  <tr key={k} className={h.fecha === fecha && h.almacen === ALM ? "hoy" : ""}>
                    <td><b>{largo(h.fecha)}</b><small>{h.fecha.slice(0, 4)}</small></td>
                    <td><span className={"cs-alm " + (h.almacen === "AG22" ? "b" : "a")}>{h.almacen}</span></td>
                    <td>{hora(h.cerrado_en)}<small>{h.cerrado_nombre ?? ""}</small></td>
                    <td className="n">{r.conSap}</td>
                    <td className="n">{r.cuadran}</td>
                    <td className="n"><b>{r.conMov ? r.balanceados : "—"}</b></td>
                    <td className={"n" + (r.conMov && r.pendientes ? " neg" : "")}><b>{r.conMov ? r.pendientes : "—"}</b></td>
                    <td>{!r.conMov
                      ? <span className="cs-chip out">Paso 2 · falta la ZEXI nueva{r.entran != null ? (h.almacen === "AG22" ? ` · ${r.entran} a bloqueado, ${r.salen ?? 0} a libre` : ` · 311: ${r.entran} entran, ${r.salen ?? 0} salen`) : ""}</span>
                      : r.pendientes === 0 ? <span className="cs-chip ok">Todo balanceado</span>
                      : <span className="cs-chip in">{r.pendientes} pendientes</span>}</td>
                    <td className="cs-hacc">
                      <button type="button" className="cs-bt alt" aria-expanded={ver} onClick={() => setAbierto(ver ? null : k)}>{ver ? "Ocultar" : "Ver"}</button>
                      <button type="button" className="cs-bt alt" disabled={pend} onClick={() => h.fecha === fecha && h.almacen === ALM ? irA("cuadre") : start(() => router.push(urlDe(h.almacen, h.fecha)))}>{r.conMov ? "Abrir y editar" : "Abrir y validar"}</button>
                    </td>
                  </tr>,
                  ver && (
                    <tr key={`${k}-v`} className="cs-hver"><td colSpan={9}>
                      <p className="cs-hnota">Lo guardado: ZEXI {h.cierre.zexi_archivo ?? "—"}{h.cierre.mov_archivo ? ` · ZEXI nueva / 311 ${h.cierre.mov_archivo}` : ""} {h.almacen === "AG18" ? ` · estibas del almacén ${h.cierre.estibas_almacen ?? 0} · pend. baja ${h.cierre.sumar_pend_baja ? "se sumaba" : "no se sumaba"}` : " · contra la base de Pasivos AG22 (bloqueado)"}</p>
                      <table className="cs-t chica">
                        <thead><tr><th>Código</th><th>Material</th><th className="n">{h.almacen === "AG22" ? "Base" : "Conteo"}</th><th className="n">SAP antes</th><th className="n">{h.almacen === "AG22" ? "Diferencia" : "311"}</th><th className="n">SAP después</th><th className="n">Queda</th><th>Estado</th></tr></thead>
                        <tbody>{h.cierre.filas.filter((f) => f.sap != null).map((f) => (
                          <tr key={f.codigo} className={ok(f) ? "" : "pend"}>
                            <td className="mono">{f.codigo}</td><td>{f.material}</td>
                            <td className="n">{n(f.total)}</td><td className="n">{n(f.sap!)}</td>
                            <td className="n">{cero(f.dif) ? "0" : conSigno(f.dif!)}</td>
                            <td className="n">{f.sapDespues == null ? "—" : n(f.sapDespues)}</td>
                            <td className="n"><b>{cero(f.queda) ? "0" : conSigno(f.queda!)}</b></td>
                            <td>{!cero(f.queda) ? <span className="cs-chip in">Falta {n(Math.abs(f.queda!))}</span>
                              : (f.enLibre ?? 0) > 0.005 ? <span className="cs-chip in">{n(f.enLibre!)} en libre · falta 344</span>
                              : <span className="cs-chip ok">Balanceado</span>}</td>
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
