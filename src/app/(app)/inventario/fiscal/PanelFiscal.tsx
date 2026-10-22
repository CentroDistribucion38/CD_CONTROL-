"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import {
  avanceDesdeBD, estadoHoja, cruceModulo, compensarCruce, marcasDeFila, filaDesdeBD, ordenarCruce, puedeCruzar, unaSolaTermino, resumenCruce, textoEquipo, textoVenc, titularCruce, TEXTO_FILA,
  type AvanceBD, type AvanceHoja, type FilaCruce, type FilaCruceBD, type ResumenCruce,
} from "@/modulos/inventario/fiscal-cruce";
import type { HojaForm } from "@/modulos/inventario/fiscal";
import { ValidarHoja, moduloDe, type ConsolidadoBD, type RevisionBD } from "./ValidarHoja";
import { BdFiscal, type HojaBd } from "./BdFiscal";

/* ===================================================================
   EL INVENTARIO FISCAL, TODO EN UN SOLO LUGAR · TORRE DE CONTROL

   Un inventario fiscal se ve completo en una pantalla:
     · arriba, el avance de todo (anillo, contadores y «requiere al fiscal»);
     · pestañas: TORRE DE CONTROL (una tarjeta por pareja, en vivo) · PAREJAS Y HOJAS
       (donde se arman y se editan las parejas) · REVISIÓN (el cruce de cada hoja).

   El conteo sigue a ciegas: la torre solo muestra cuántos renglones lleva cada
   persona y si terminó. Lo contado aparece únicamente cuando las dos terminaron
   (el cruce), y la base no lo entrega antes.

   Estados de una pareja (siempre con su palabra y su icono, nunca solo color):
     sin empezar · contando / esperando a la otra · completada (todo coincide) · con diferencias.
   Se actualiza sola cada 15 segundos mientras la pantalla está a la vista.
   =================================================================== */

/* Iconos de línea (24×24). Siempre acompañan a una palabra. */
const ICONOS = {
  panel: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  parejas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  persona: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  bajar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  refrescar: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  lapiz: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  ojo: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  ojoNo: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/>',
  papelera: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  lista: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  calendario: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  mas: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  vacio: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
} as const;
export type IcoNombre = keyof typeof ICONOS;
export function Ico({ n, tam = 18 }: { n: IcoNombre; tam?: number }) {
  return (
    <svg className="vf-ico" width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: ICONOS[n] }} />
  );
}

type Resultado = { filas: FilaCruce[] } | { error: string };
/** La foto de un renglón contado (la lleva su equipo: el cruce no dice quién anotó cada cosa, la foto sí). */
type FotoCruce = { conteo_id: string; ubicacion: string; equipo: "OL" | "BAVARIA"; sku: string; averia: boolean; pnc: boolean; ruta: string };
/** Quién pidió reabrir su hoja y a quién el fiscal ya le dio el OK. */
type ReaperturaBD = { hoja_id: string; numero: number; equipo: "OL" | "BAVARIA"; pedido_en: string | null; autorizado_en: string | null };
/** Agrupa las filas por CÓDIGO de material (sin importar sitio ni avería) para ver dónde está la diferencia de cada material:
 *  una cabecera por código con lo que contó cada equipo y el neto, y debajo sus sitios. Orden: código, y dentro, sitio. */
function agruparPorCodigo(filas: FilaCruce[]): { sku: string; material: string; ol: number; bav: number; neto: number; filas: FilaCruce[] }[] {
  const m = new Map<string, { sku: string; material: string; ol: number; bav: number; neto: number; filas: FilaCruce[] }>();
  for (const f of filas) {
    let g = m.get(f.sku);
    if (!g) { g = { sku: f.sku, material: f.material, ol: 0, bav: 0, neto: 0, filas: [] }; m.set(f.sku, g); }
    g.ol += f.cajasOl ?? 0; g.bav += f.cajasBavaria ?? 0; g.neto += f.diferencia; g.filas.push(f);
  }
  const arr = [...m.values()].sort((a, b) => a.sku.localeCompare(b.sku, "es", { numeric: true }));
  for (const g of arr) g.filas.sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
  return arr;
}
const moduloClave = (u: string) => u.replace(/_(IZQ|DER)$/i, "");
async function abrirFoto(ruta: string) {
  const w = window.open("", "_blank");
  const { data, error } = await createClient().storage.from("inventario").createSignedUrl(ruta, 600);
  if (error || !data?.signedUrl) { w?.close(); return }
  if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}
type Tipo = "sin" | "proceso" | "ok" | "dif";
type Pestana = "torre" | "parejas" | "revision" | "bd";
type Filtro = "todas" | "proceso" | "ok" | "dif";

/** Las ubicaciones con diferencia, con cuántos renglones no coinciden en cada una. */
export function ubicacionesConDiferencia(filas: FilaCruce[]): { ubicacion: string; renglones: number }[] {
  const m = new Map<string, number>();
  for (const f of filas) if (f.estado !== "COINCIDE" && !f.compensada) m.set(f.ubicacion, (m.get(f.ubicacion) ?? 0) + 1);
  return [...m].map(([ubicacion, renglones]) => ({ ubicacion, renglones }))
    .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
}
const MAX_UBICACIONES = 8;

/** Las ubicaciones con diferencia que el fiscal todavía NO aprobó. Una ubicación aprobada ya no pesa: el fiscal la dio por buena. */
export function difPendientes(filas: FilaCruce[], revs: RevisionBD[], numero: number): { ubicacion: string; renglones: number }[] {
  const aprobadas = new Set(revs.filter((r) => r.numero === numero && r.estado === "APROBADA").map((r) => r.ubicacion));
  return ubicacionesConDiferencia(filas).filter((u) => !aprobadas.has(u.ubicacion));
}

/** El avance y el cruce de las hojas, renovados cada 15 s. Solo se cruzan las hojas donde las dos personas terminaron. */
function useTorre(fiscalId: string, avanceInicial: Record<number, AvanceHoja>, activo: boolean) {
  const [avance, setAvance] = useState<Record<number, AvanceHoja>>(avanceInicial);
  const [cruces, setCruces] = useState<Record<number, Resultado>>({});
  const [hora, setHora] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revs, setRevs] = useState<RevisionBD[]>([]);
  const [consolidados, setConsolidados] = useState<Record<number, ConsolidadoBD>>({});
  const [hojaIds, setHojaIds] = useState<Record<number, string>>({});
  /** Fotos de los renglones por hoja (para abrirlas desde el cruce). Sin el SQL o sin permiso: vacío. */
  const [fotos, setFotos] = useState<Record<number, FotoCruce[]>>({});
  const [reaps, setReaps] = useState<ReaperturaBD[]>([]);
  /** Hojas que el fiscal ya cerró (número → cuándo). Sin el SQL: vacío. */
  const [cerradas, setCerradas] = useState<Record<number, string>>({});
  /** false = falta correr 2026-10-fiscal-validar.sql: la torre funciona igual, sin validar ni aprobar. */
  const [conValidar, setConValidar] = useState(true);

  const cargar = useCallback(async () => {
    const sb = createClient();
    const { data, error: e } = await sb.rpc("inv_fiscal_avance");
    if (e) return setError(traducirError(e.message));
    setError(null);
    const mias = ((data ?? []) as AvanceBD[]).filter((a) => a.fiscal_id === fiscalId);
    const av: Record<number, AvanceHoja> = {};
    for (const a of mias) av[a.numero] = avanceDesdeBD(a);
    setAvance(av);
    setHojaIds(Object.fromEntries(mias.map((a) => [a.numero, a.hoja_id])));
    const rv = await sb.rpc("inv_fiscal_revisiones", { p_fiscal: fiscalId });
    if (rv.error) { setConValidar(false); setRevs([]) }
    else { setConValidar(true); setRevs((rv.data ?? []) as RevisionBD[]) }
    const cs = await sb.rpc("inv_fiscal_consolidados", { p_fiscal: fiscalId });
    setConsolidados(cs.error ? {} : Object.fromEntries(((cs.data ?? []) as ConsolidadoBD[]).map((c) => [c.numero, c])));
    const listas = mias.filter((a) => puedeCruzar(av[a.numero]) || unaSolaTermino(av[a.numero]));
    const res = await Promise.all(listas.map(async (a): Promise<[number, Resultado]> => {
      const r = await sb.rpc("inv_fiscal_cruce", { p_hoja: a.hoja_id });
      if (r.error) return [a.numero, { error: traducirError(r.error.message) }];
      return [a.numero, { filas: ordenarCruce(cruceModulo(((r.data ?? []) as FilaCruceBD[]).map(filaDesdeBD))) }];
    }));
    setCruces(Object.fromEntries(res));
    const fs = await Promise.all(listas.map(async (a): Promise<[number, FotoCruce[]]> => {
      const r = await sb.rpc("inv_fiscal_fotos_hoja", { p_hoja: a.hoja_id });
      return [a.numero, r.error ? [] : ((r.data ?? []) as FotoCruce[])];
    }));
    setFotos(Object.fromEntries(fs));
    const rp = await sb.rpc("inv_fiscal_reaperturas", { p_fiscal: fiscalId });
    setReaps(rp.error ? [] : ((rp.data ?? []) as ReaperturaBD[]));
    const ce = await sb.rpc("inv_fiscal_hojas_cerradas", { p_fiscal: fiscalId });
    setCerradas(ce.error ? {} : Object.fromEntries(((ce.data ?? []) as { numero: number; cerrada_en: string }[]).map((c) => [c.numero, c.cerrada_en])));
    setHora(new Date());
  }, [fiscalId]);

  useEffect(() => {
    if (!activo) return;
    cargar();
    const t = setInterval(() => { if (!document.hidden) cargar() }, 15_000);
    return () => clearInterval(t);
  }, [activo, cargar]);

  return { avance, cruces, hora, error, cargar, revs, hojaIds, conValidar, consolidados, fotos, reaps, cerradas };
}

/** El anillo del avance: verde = completadas, rojo = con diferencias, ámbar = en conteo, el resto es el fondo. */
function Anillo({ ok, dif, proceso, total }: { ok: number; dif: number; proceso: number; total: number }) {
  const r = 54, c = 2 * Math.PI * r;
  const tramo = (n: number, desde: number, clase: string) => total > 0 && n > 0 ? (
    <circle key={clase} className={"vf-seg " + clase} cx="70" cy="70" r={r} fill="none" strokeWidth="14"
            strokeDasharray={`${(n / total) * c} ${c}`} strokeDashoffset={-(desde / total) * c} transform="rotate(-90 70 70)" />
  ) : null;
  const pct = total > 0 ? Math.round((ok / total) * 100) : 0;
  return (
    <svg className="vf-anillo" width="150" height="150" viewBox="0 0 140 140" role="img" aria-label={`${pct}% de las hojas completadas`}>
      <circle className="vf-seg fondo" cx="70" cy="70" r={r} fill="none" strokeWidth="14" />
      {tramo(ok, 0, "ok")}{tramo(dif, ok, "dif")}{tramo(proceso, ok + dif, "proceso")}
      <text x="70" y="68" textAnchor="middle" className="vf-pct">{pct}%</text>
      <text x="70" y="88" textAnchor="middle" className="vf-pct-et">completado</text>
    </svg>
  );
}

function Kpi({ icono, valor, et, tono = "" }: { icono: IcoNombre; valor: number; et: string; tono?: string }) {
  return (
    <div className={"vf-kpi " + tono}>
      <span className="vf-kpi-ico"><Ico n={icono} tam={18} /></span>
      <b className="vf-kpi-v">{valor.toLocaleString("es-CO")}</b>
      <small className="vf-kpi-et">{et}</small>
    </div>
  );
}

const ICO_TIPO: Record<Tipo, IcoNombre> = { sin: "vacio", proceso: "reloj", ok: "ok", dif: "alerta" };

export function VistaFiscal({ fiscalId, nombre, fechaTexto, cuando, abierto, visible, hojas, avanceInicial, conAvance, quien, acciones, parejas, puedeEditar = true }: {
  fiscalId: string; nombre: string; fechaTexto: string; cuando: string; abierto: boolean; visible: boolean;
  hojas: HojaForm[]; avanceInicial: Record<number, AvanceHoja>;
  /** false = el inventario no está visible en Contar (o falta el SQL del cruce): sin avance en vivo. */
  conAvance: boolean;
  quien: (id: string) => string;
  /** Los botones de la cabecera (Excel, mostrar en Contar, editar, eliminar). */
  acciones: ReactNode;
  /** La pestaña «Parejas y hojas»: la tabla de parejas y su edición. Sin ella (el Control fiscal) la pestaña no existe: eso es del Plan fiscal. */
  parejas?: ReactNode;
  /** ¿Puede validar y aprobar? (permiso «Inventario fiscal» con edición). Sin él, ve el estado pero no los botones. */
  puedeEditar?: boolean;
}) {
  const [pestana, setPestana] = useState<Pestana>("torre");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [foco, setFoco] = useState<number | null>(null);
  /** La hoja que se mira en «Revisión»: una a la vez, no todas apiladas. */
  const [hojaRev, setHojaRev] = useState<number | null>(null);
  const [verTodo, setVerTodo] = useState<Record<number, boolean>>({});
  /** La compensación es automática al abrir cada hoja; aquí solo se guardan las hojas donde el fiscal la quitó (false). */
  const [compensar, setCompensar] = useState<Record<number, boolean>>({});
  const { avance, cruces, hora, error, cargar, revs, hojaIds, conValidar, consolidados, fotos, reaps, cerradas } = useTorre(fiscalId, avanceInicial, conAvance);
  const nf = useMemo(() => new Intl.NumberFormat("es-CO"), []);

  const tarjetas = hojas.map((h) => {
    const av = avance[h.numero];
    const estado = av ? estadoHoja(av) : "sin-empezar";
    const cr = cruces[h.numero];
    const resumen: ResumenCruce | null = cr && "filas" in cr ? resumenCruce(cr.filas) : null;
    const filasEf = cr && "filas" in cr ? (compensar[h.numero] !== false ? compensarCruce(cr.filas).filas : cr.filas) : null;
    const pend = filasEf ? difPendientes(filasEf, revs, h.numero) : [];
    const aprobadoTodo = !!resumen && resumen.conDiferencia > 0 && pend.length === 0 && revs.some((r) => r.numero === h.numero && r.estado === "APROBADA");
    const enValidacion = revs.filter((r) => r.numero === h.numero && r.estado === "A_VALIDAR").length;
    let tipo: Tipo = "sin";
    if (estado === "lista" || (estado === "una-termino" && resumen)) tipo = resumen ? (pend.length === 0 ? "ok" : "dif") : "proceso";
    else if (estado !== "sin-empezar") tipo = "proceso";
    return { h, av, estado, cr, resumen, tipo, pend, aprobadoTodo, enValidacion };
  });
  type Tarjeta = (typeof tarjetas)[number];
  const total = tarjetas.length;
  const cuenta = {
    ok: tarjetas.filter((t) => t.tipo === "ok").length,
    dif: tarjetas.filter((t) => t.tipo === "dif").length,
    proceso: tarjetas.filter((t) => t.tipo === "proceso").length,
    sin: tarjetas.filter((t) => t.tipo === "sin").length,
  };
  let ubOk = 0, ubDif = 0;
  for (const t of tarjetas) {
    if (!t.cr || !("filas" in t.cr)) continue;
    const m = new Map<string, boolean>();
    const pendSet = new Set(t.pend.map((u) => u.ubicacion));
    for (const f of t.cr.filas) m.set(f.ubicacion, (m.get(f.ubicacion) ?? false) || (f.estado !== "COINCIDE" && pendSet.has(f.ubicacion)));
    for (const v of m.values()) { if (v) ubDif++; else ubOk++ }
  }
  const renglones = tarjetas.reduce((s, t) => s + (t.av ? t.av.olRenglones + t.av.bavariaRenglones : 0), 0);

  const titulo = total === 0 ? "Arma las parejas en el Plan fiscal para empezar"
    : !conAvance ? "Muéstralo en Contar (en el Plan fiscal) para ver el avance en vivo"
    : cuenta.ok === total ? "Todas las hojas completadas"
    : `${cuenta.ok} de ${total} ${total === 1 ? "hoja completada" : "hojas completadas"}`;
  const subtitulo = !conAvance ? "Cuando lo muestres en Contar, cada pareja empieza a contar y aquí ves cómo va."
    : ubOk + ubDif > 0 ? `${nf.format(ubOk)} ${ubOk === 1 ? "ubicación coincide" : "ubicaciones coinciden"} · ${nf.format(ubDif)} con diferencia`
    : "Las ubicaciones aparecen cuando las dos personas de una hoja terminan.";

  const texto = (t: Tarjeta): string => {
    if (t.estado === "una-termino" && t.resumen) return t.av?.olTermino ? "Solo terminó el operador · sin cruce" : "Solo terminó Bavaria · sin cruce";
    if (t.tipo === "ok") return t.aprobadoTodo ? "Completada · aprobada" : "Completada · todo coincide";
    if (t.tipo === "dif") return "Con diferencias";
    if (t.estado === "lista") return "Cruzando…";
    if (t.estado === "una-termino") return t.av?.olTermino ? "Esperando a Bavaria" : "Esperando al operador";
    if (t.estado === "contando") return "Contando";
    return "Sin empezar";
  };
  const vistas = tarjetas.filter((t) => filtro === "todas" || (filtro === "proceso" ? (t.tipo === "proceso" || t.tipo === "sin") : t.tipo === filtro));

  /* Al venir de una tarjeta roja, la revisión se abre en esa hoja. */
  useEffect(() => {
    if (pestana !== "revision" || foco === null) return;
    document.getElementById("vf-h" + foco)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pestana, foco]);
  /** Hoja cuya caja de pasos está abierta (la abre «Aprobada · Siguiente paso» o la campanita). */
  const [caja, setCaja] = useState<number | null>(null);
  /** Ubicaciones marcadas (tocando las fichas) para recontar o aprobar, por hoja. */
  const [marcadasHoja, setMarcadasHoja] = useState<Record<number, Set<string>>>({});
  async function darOkReabrir(hojaId: string | undefined, equipo: "OL" | "BAVARIA", si: boolean): Promise<string | null> {
    if (!hojaId) return "No se pudo identificar la hoja.";
    const { error } = await createClient().rpc("inv_fiscal_reabrir_autorizar", { p_hoja: hojaId, p_equipo: equipo, p_si: si });
    if (error) return /inv_fiscal_reabrir_autorizar|schema cache|does not exist/i.test(error.message) ? "Falta correr 2026-10-fiscal-TODO.sql en Supabase." : traducirError(error.message);
    await cargar();
    return null;
  }
  const pidieronHoja = (n: number) => reaps.filter((x) => x.numero === n && x.pedido_en && !x.autorizado_en).length;
  /** Terminar el corte fiscal: cierra de una vez todas las hojas que ya tienen todo aprobado. */
  const [cierre, setCierre] = useState<"" | "conf" | "ocupado">("");
  const [cierreMsg, setCierreMsg] = useState<string | null>(null);
  async function cerrarTodas() {
    setCierreMsg(null); setCierre("ocupado");
    const { data, error } = await createClient().rpc("inv_fiscal_cerrar_hojas", { p_fiscal: fiscalId });
    setCierre("");
    if (error) { setCierreMsg(/inv_fiscal_cerrar|schema cache|does not exist|no existe la funci/i.test(error.message) ? "Falta correr 2026-10-fiscal-TODO.sql en Supabase." : traducirError(error.message)); return }
    const r = (Array.isArray(data) ? data[0] : data) as { cerradas: number; pendientes: number } | null;
    const c = r?.cerradas ?? 0, pe = r?.pendientes ?? 0;
    setCierreMsg(`${c === 1 ? "Se cerró 1 hoja" : `Se cerraron ${c} hojas`}${pe > 0 ? `; ${pe === 1 ? "1 sigue" : `${pe} siguen`} con pendientes (abre su Revisión para terminarlas).` : ". Corte fiscal finalizado."}`);
    await cargar();
  }
  const abrirRevision = (n: number) => { setFoco(n); setHojaRev(n); setPestana("revision") };
  const abrirCaja = (n: number) => { abrirRevision(n); setCaja(n) };

  const persona = (id: string, et: string, rengl: number | undefined, termino: string | null | undefined, hay: boolean) => {
    const fin = !!termino;
    return (
      <li className="vf-persona">
        <span className="vf-rol"><Ico n="persona" tam={13} /> {et}</span>
        <b>{id ? quien(id) : <em>sin asignar</em>}</b>
        {hay && id && rengl !== undefined && (
          <small className={fin ? "fin" : ""}><Ico n={fin ? "ok" : "reloj"} tam={13} /> {textoEquipo(rengl, termino ?? null)}</small>
        )}
      </li>
    );
  };

  const chip = (k: Filtro, et: string, n: number, clase = "") => (
    <button type="button" key={k} className={"vf-chip " + clase} aria-pressed={filtro === k} onClick={() => setFiltro(filtro === k && k !== "todas" ? "todas" : k)}>
      <b>{n}</b> {et}
    </button>
  );

  const cruzadas = tarjetas.filter((t) => t.resumen && t.cr && "filas" in t.cr)
    .sort((a, b) => (a.tipo === "dif" ? 0 : 1) - (b.tipo === "dif" ? 0 : 1) || a.h.numero - b.h.numero);

  return (
    <section className="vf" aria-label={`Inventario fiscal ${nombre}`}>
      <header className="vf-cab">
        <div className="vf-tit">
          <p className="vf-ojo">{parejas ? "Inventario fiscal · por parejas" : "Control fiscal · en vivo"}</p>
          <h2>{nombre}</h2>
          <p className="vf-meta">
            <Ico n="calendario" tam={15} /> {fechaTexto} · {cuando}
            <span className={"vf-tag " + (abierto ? "abierto" : "cerrado")}>{abierto ? "Abierto" : "Cerrado"}</span>
            {visible && <span className="vf-tag visible"><Ico n="ojo" tam={12} /> Visible en Contar</span>}
          </p>
        </div>
        <div className="vf-acc">{acciones}</div>
      </header>

      <div className="vf-hero">
        <Anillo ok={cuenta.ok} dif={cuenta.dif} proceso={cuenta.proceso} total={total} />
        <div className="vf-hero-txt">
          <p className="vf-hero-ojo"><Ico n="escudo" tam={15} /> Torre de control</p>
          <h3>{titulo}</h3>
          <p className="vf-hero-sub">{subtitulo}</p>
          <div className="vf-kpis">
            <Kpi icono="parejas" valor={total} et={total === 1 ? "pareja" : "parejas"} />
            <Kpi icono="reloj" valor={cuenta.proceso + cuenta.sin} et="en conteo" tono="proceso" />
            <Kpi icono="ok" valor={cuenta.ok} et={cuenta.ok === 1 ? "completada" : "completadas"} tono="ok" />
            <Kpi icono="alerta" valor={cuenta.dif} et={cuenta.dif > 0 ? "con diferencias · te esperan" : "con diferencias"} tono={cuenta.dif > 0 ? "dif" : ""} />
            <Kpi icono="lista" valor={renglones} et="renglones contados" />
          </div>
        </div>
        {conAvance && (
          <div className="vf-vivo">
            <span className="vf-pulso" aria-hidden="true" /> En vivo
            <small>{hora ? `Actualizado ${hora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Cargando…"}</small>
            <button type="button" className="vf-btn-claro" onClick={cargar}><Ico n="refrescar" tam={15} /> Actualizar</button>
          </div>
        )}
      </div>
      {error && <p className="cl-mal" role="alert">{error}</p>}

      <div className="vf-tabs" role="tablist" aria-label="Secciones del inventario fiscal">
        <button type="button" role="tab" aria-selected={pestana === "torre"} className="vf-tab" onClick={() => setPestana("torre")}><Ico n="panel" tam={17} /> Torre de control</button>
        {parejas && <button type="button" role="tab" aria-selected={pestana === "parejas"} className="vf-tab" onClick={() => setPestana("parejas")}><Ico n="parejas" tam={17} /> Parejas y hojas <span className="vf-cont">{total}</span></button>}
        <button type="button" role="tab" aria-selected={pestana === "revision"} className="vf-tab" onClick={() => setPestana("revision")}>
          <Ico n="alerta" tam={17} /> Revisión de diferencias {cuenta.dif > 0 && <span className="vf-cont rojo">{cuenta.dif}</span>}
        </button>
        <button type="button" role="tab" aria-selected={pestana === "bd"} className="vf-tab" onClick={() => setPestana("bd")}><Ico n="lista" tam={17} /> BD</button>
      </div>

      {pestana === "torre" && (
        <div role="tabpanel">
          {total === 0 ? (
            <p className="fe-vacio">Todavía no hay hojas. Se arman en el Plan fiscal.</p>
          ) : (
            <>
              <div className="vf-filtros" role="group" aria-label="Filtrar las tarjetas">
                {chip("todas", total === 1 ? "pareja" : "parejas", total)}
                {chip("proceso", "en conteo", cuenta.proceso + cuenta.sin)}
                {chip("ok", cuenta.ok === 1 ? "completada" : "completadas", cuenta.ok, "ok")}
                {chip("dif", "con diferencias", cuenta.dif, "dif")}
                {puedeEditar && conValidar && (
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {total > 0 && Object.keys(cerradas).length >= total ? (
                      <b style={{ color: "#0b7a3e" }}>Corte fiscal finalizado ✓ · todas las hojas cerradas</b>
                    ) : cierre === "conf" ? (
                      <>
                        <span style={{ fontSize: ".8rem" }}>¿Cerrar todas las hojas que ya están aprobadas? Nadie más contará en ellas.</span>
                        <button type="button" className="btn" style={{ background: "#0b7a3e", color: "#fff", borderRadius: 0 }} onClick={cerrarTodas}>Sí, cerrar todas</button>
                        <button type="button" className="btn plano" style={{ borderRadius: 0 }} onClick={() => setCierre("")}>No</button>
                      </>
                    ) : (
                      <button type="button" className="btn" disabled={cierre === "ocupado"} onClick={() => setCierre("conf")} style={{ background: "#0b7a3e", color: "#fff", borderRadius: 0 }}
                              title="Cierra de un solo clic todas las hojas que ya tienen todo aprobado y termina el corte fiscal">
                        {cierre === "ocupado" ? "Cerrando…" : "Cerrar todas las hojas"}
                      </button>
                    )}
                  </span>
                )}
              </div>
              {cierreMsg && <p className="cl-nota" role="status">{cierreMsg}</p>}
              <div className="vf-grid">
                {vistas.map((t) => {
                  const ubic = t.tipo === "dif" ? t.pend : [];
                  return (
                    <article key={t.h.numero} className={"vf-card " + t.tipo}>
                      <header className="vf-card-cab">
                        <span className={"vf-card-ico " + t.tipo}><Ico n={ICO_TIPO[t.tipo]} tam={18} /></span>
                        <h3>Hoja {t.h.numero}</h3>
                        {puedeEditar && (t.av?.olTermino || t.av?.bavariaTermino) && (
                          <button type="button" className="btn plano" onClick={() => abrirCaja(t.h.numero)} aria-label={`Hoja ${t.h.numero}: reabrir`}
                                  title={pidieronHoja(t.h.numero) > 0 ? "Pidieron reabrir su hoja: toca para darles el OK" : "Reabrir la hoja a las personas"}
                                  style={{ padding: "2px 7px", minHeight: 0, ...(pidieronHoja(t.h.numero) > 0 ? { background: "#b71c1c", color: "#fff", borderColor: "#b71c1c" } : { opacity: 0.6 }) }}>
                            <Ico n="campana" tam={15} />{pidieronHoja(t.h.numero) > 0 ? ` ${pidieronHoja(t.h.numero)}` : ""}
                          </button>
                        )}
                        <span className={"vf-estado " + t.tipo}>{texto(t)}</span>
                      </header>
                      <ul className="vf-pareja">
                        {persona(t.h.ol, "Operador logístico", t.av?.olRenglones, t.av?.olTermino, !!t.av)}
                        {persona(t.h.bavaria, "Bavaria", t.av?.bavariaRenglones, t.av?.bavariaTermino, !!t.av)}
                      </ul>
                      {t.tipo === "ok" && t.resumen && (
                        <p className="vf-ok"><Ico n="ok" tam={15} /> {t.aprobadoTodo ? "Las diferencias fueron aprobadas por el fiscal" : `${nf.format(t.resumen.total)} ${t.resumen.total === 1 ? "renglón igual" : "renglones iguales"}`}</p>
                      )}
                      {t.tipo === "dif" && t.resumen && (
                        <div className="vf-dif">
                          <p className="vf-dif-tit"><Ico n="alerta" tam={15} /> {titularCruce(t.resumen)}</p>
                          <p className="vf-dif-et">Ubicaciones con diferencia ({ubic.length}){t.enValidacion > 0 ? ` · ${t.enValidacion} en validación` : ""}</p>
                          <ul className="vf-ubic">
                            {ubic.slice(0, MAX_UBICACIONES).map((u) => (
                              <li key={u.ubicacion}><Ico n="pin" tam={13} /><b>{u.ubicacion}</b>{u.renglones > 1 && <small>· {u.renglones}</small>}</li>
                            ))}
                            {ubic.length > MAX_UBICACIONES && <li className="mas">+{ubic.length - MAX_UBICACIONES} más</li>}
                          </ul>
                        </div>
                      )}
                      {t.cr && "error" in t.cr && <p className="cl-mal" role="alert">{t.cr.error}</p>}
                      {(t.tipo === "ok" || t.tipo === "dif") && (
                        <button type="button" className={"btn vf-ver " + (t.tipo === "dif" ? "rojo" : "plano")} onClick={() => abrirRevision(t.h.numero)}>
                          <Ico n={t.tipo === "dif" ? "alerta" : "lista"} tam={16} /> {t.tipo === "dif" ? "Ver diferencias" : "Ver el cruce"}
                        </button>
                      )}
                    </article>
                  );
                })}
                {vistas.length === 0 && <p className="fe-vacio">No hay tarjetas con ese filtro.</p>}
              </div>
            </>
          )}
        </div>
      )}

      {pestana === "parejas" && parejas && <div role="tabpanel" className="vf-parejas">{parejas}</div>}

      {pestana === "bd" && (
        <BdFiscal fiscalId={fiscalId} cerradas={cerradas} nombre={nombre} fecha={new Date().toLocaleDateString("en-CA")} quien="" puedeEditar={puedeEditar && conValidar} revs={revs}
                  actualizado={hora ? hora.getTime() : 0} onCambio={cargar}
                  compensar={compensar} onCompensar={(n, v) => setCompensar({ ...compensar, [n]: v })}
                  hojas={tarjetas.map((t): HojaBd => ({ numero: t.h.numero, id: hojaIds[t.h.numero] ?? null, calle: t.h.calle, ol: t.h.ol ? quien(t.h.ol) : "", bavaria: t.h.bavaria ? quien(t.h.bavaria) : "",
                    filas: t.cr && "filas" in t.cr ? t.cr.filas : null }))} />
      )}

      {pestana === "revision" && (
        <div role="tabpanel" className="vf-revision">
          {cruzadas.length === 0 ? (
            <div className="vf-vacio">
              <Ico n="escudo" tam={34} />
              <b>Todavía no hay nada que revisar</b>
              <p>Cuando las dos personas de una hoja pulsan «terminé», el cruce aparece aquí. Si todo coincide, la hoja se pinta de verde; si no, ves en qué ubicaciones.</p>
            </div>
          ) : (
            <div className="vf-hojas" role="tablist" aria-label="Hojas con cruce" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 12px" }}>
              {cruzadas.map((t) => {
                const on = (hojaRev ?? cruzadas[0].h.numero) === t.h.numero;
                return (
                  <span key={t.h.numero} style={{ display: "inline-flex" }}>
                    <button type="button" role="tab" aria-selected={on} className={"btn " + (on ? "" : "plano")}
                            onClick={() => setHojaRev(t.h.numero)} title={`${t.h.ol ? quien(t.h.ol) : "—"} · ${t.h.bavaria ? quien(t.h.bavaria) : "—"}`}>
                      Hoja {t.h.numero} · {t.tipo === "dif" ? `${t.pend.length} por revisar` : t.tipo === "ok" ? "lista" : "en proceso"}
                    </button>
                    {puedeEditar && pidieronHoja(t.h.numero) > 0 && (
                      <button type="button" className="btn" onClick={() => abrirCaja(t.h.numero)} style={{ background: "#b71c1c", color: "#fff", padding: "0 10px" }}
                              title="Pidieron reabrir su hoja: toca para darles el OK" aria-label={`Hoja ${t.h.numero}: pidieron reabrir`}>
                        <Ico n="campana" tam={16} /> {pidieronHoja(t.h.numero)}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
          {cruzadas.length > 0 && cruzadas.filter((t) => t.h.numero === (hojaRev ?? cruzadas[0].h.numero)).map((t) => {
            const filasBase = t.cr && "filas" in t.cr ? t.cr.filas : [];
            const compBase = compensarCruce(filasBase);
            const compensando = compensar[t.h.numero] !== false && compBase.pares > 0;
            const filas = compensando ? compBase.filas : filasBase;
            const r = t.resumen as ResumenCruce;
            const todo = !!verTodo[t.h.numero];
            const pendSet = new Set(t.pend.map((u) => u.ubicacion));
            const vis = t.tipo === "ok" ? (todo ? filas : []) : (todo ? filas : filas.filter((f) => f.estado !== "COINCIDE" && !f.compensada && pendSet.has(f.ubicacion)));
            const ubic = t.pend;
            /* Con la compensación puesta: lo que queda por revisar y lo que ya cuadra (verde). */
            const quedan = filas.filter((f) => f.estado !== "COINCIDE" && !f.compensada);
            const nComp = filas.filter((f) => f.compensada).length;
            const quedanUbi = new Set(quedan.map((f) => f.ubicacion));
            const todoCompensado = compensando && quedan.length === 0 && nComp > 0;
            const verde = { borderColor: "#0b7a3e", color: "#0b7a3e", background: "rgba(11,122,62,.08)" } as const;
            return (
              <section key={t.h.numero} id={"vf-h" + t.h.numero} className={"vf-rev " + t.tipo}>
                <header className="vf-rev-cab">
                  <span className={"vf-card-ico " + t.tipo}><Ico n={ICO_TIPO[t.tipo]} tam={18} /></span>
                  <h3>Hoja {t.h.numero}</h3>
                  <span className={"vf-estado " + (todoCompensado ? "ok" : t.tipo)}>{todoCompensado ? "Todo compensado" : texto(t)}</span>
                  <span id={"vf-acc-h" + t.h.numero} className="vf-rev-acc" style={{ marginLeft: "auto" }} />
                  <small className="vf-rev-quien">{t.h.ol ? quien(t.h.ol) : "—"} · {t.h.bavaria ? quien(t.h.bavaria) : "—"}</small>
                </header>
                <p className={"vf-rev-titular " + (todoCompensado ? "ok" : t.tipo)} style={compensando ? { color: quedan.length === 0 ? "#0b7a3e" : undefined } : undefined}>
                  {t.aprobadoTodo ? "El fiscal aprobó todas las diferencias de esta hoja."
                    : compensando ? (quedan.length === 0 ? `Todo cuadra: las ${nComp} diferencias quedaron compensadas.` : `${quedan.length} de ${filas.length} renglones no coinciden · ${nComp} ya compensados (en verde).`)
                    : titularCruce(r)}
                </p>
                <ul className="vf-cifras" aria-label="Resumen del cruce">
                  <li><b>{r.coinciden}</b> coinciden</li>
                  <li><b>{r.difieren}</b> {r.difieren === 1 ? "difiere" : "difieren"}</li>
                  <li><b>{r.soloOl}</b> solo el operador</li>
                  <li><b>{r.soloBavaria}</b> solo Bavaria</li>
                </ul>
                {t.tipo === "dif" && (
                  <ul className="vf-ubic" aria-label="Ubicaciones con diferencia: toca para marcar y recontar o aprobar">
                    {ubic.map((u) => {
                      const k = moduloDe(u.ubicacion); const on = !!marcadasHoja[t.h.numero]?.has(k);
                      const alt = () => { const n = new Set(marcadasHoja[t.h.numero] ?? []); if (n.has(k)) n.delete(k); else n.add(k); setMarcadasHoja({ ...marcadasHoja, [t.h.numero]: n }) };
                      return (
                        <li key={u.ubicacion} role={puedeEditar ? "button" : undefined} tabIndex={puedeEditar ? 0 : undefined} aria-pressed={puedeEditar ? on : undefined}
                            onClick={puedeEditar ? alt : undefined} onKeyDown={puedeEditar ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alt() } } : undefined}
                            style={{ borderRadius: 0, cursor: puedeEditar ? "pointer" : undefined, ...(on ? { background: "#b71c1c", color: "#fff", borderColor: "#b71c1c" } : {}) }}>
                          <Ico n="pin" tam={13} /><b>{u.ubicacion}</b>{u.renglones > 1 && <small>· {u.renglones}</small>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div id={"vf-sel-h" + t.h.numero} />
                <div className="vf-fila-botones" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
                  {(t.tipo === "ok" || r.coinciden > 0) && (
                    <button type="button" className="btn plano" style={{ padding: "4px 10px", fontSize: ".78rem", minHeight: 0 }} aria-pressed={todo} onClick={() => setVerTodo({ ...verTodo, [t.h.numero]: !todo })}>
                      <Ico n="lista" tam={14} /> {todo ? (t.tipo === "ok" ? "Ocultar el detalle" : "Ocultar los que coinciden") : (t.tipo === "ok" ? "Ver el detalle" : `Ver también los ${r.coinciden} que coinciden`)}
                    </button>
                  )}
                  {compBase.pares > 0 && puedeEditar && (
                    <button type="button" className="btn plano" style={{ padding: "4px 10px", fontSize: ".78rem", minHeight: 0 }} aria-pressed={compensando}
                            onClick={() => setCompensar({ ...compensar, [t.h.numero]: !compensando })}
                            title="Da por compensadas las diferencias del mismo código (mismo SKU) que son iguales y de signo contrario o cuadran en total">
                      <Ico n="lista" tam={14} /> {compensando ? `Quitar la compensación (${compBase.pares} ${compBase.pares === 1 ? "par" : "pares"})` : `Compensar (${compBase.pares} ${compBase.pares === 1 ? "par" : "pares"})`}
                    </button>
                  )}
                  {puedeEditar && t.tipo === "dif" && ubic.length > 0 && (
                    <button type="button" className="btn plano" style={{ padding: "4px 10px", fontSize: ".78rem", minHeight: 0 }}
                            onClick={() => setMarcadasHoja({ ...marcadasHoja, [t.h.numero]: (marcadasHoja[t.h.numero]?.size ?? 0) >= ubic.length ? new Set() : new Set(ubic.map((u) => moduloDe(u.ubicacion))) })}>
                      <Ico n="pin" tam={14} /> {(marcadasHoja[t.h.numero]?.size ?? 0) >= ubic.length ? "Quitar marcas" : `Marcar las ${ubic.length}`}
                    </button>
                  )}
                </div>
                {conValidar ? (
                  <ValidarHoja selExt={marcadasHoja[t.h.numero] ?? new Set<string>()} onSelExt={(n) => setMarcadasHoja({ ...marcadasHoja, [t.h.numero]: n })} cajaAbierta={caja === t.h.numero} onCaja={(v) => setCaja(v ? t.h.numero : null)}
                               reabrir={([["OL", t.av?.olTermino, t.h.ol], ["BAVARIA", t.av?.bavariaTermino, t.h.bavaria]] as const).filter(([, term]) => !!term).map(([eq, , uid]) => {
                                 const rr = reaps.find((x) => x.numero === t.h.numero && x.equipo === eq);
                                 return { equipo: eq, nombre: uid ? quien(uid) : eq === "OL" ? "Operador" : "Bavaria", pidio: !!rr?.pedido_en, ok: !!rr?.autorizado_en };
                               })}
                               onOkReabrir={(eq, si) => darOkReabrir(hojaIds[t.h.numero], eq, si)}
                               cerrada={!!cerradas[t.h.numero]} compensando={compensando} hojaId={hojaIds[t.h.numero] ?? null} numero={t.h.numero} calle={t.h.calle} filas={filas} revs={revs} unaSola={t.estado === "una-termino" ? (t.av?.olTermino ? (t.h.ol ? quien(t.h.ol) : "el operador") : (t.h.bavaria ? quien(t.h.bavaria) : "Bavaria")) : null} consol={consolidados[t.h.numero] ?? null}
                               puedeEditar={puedeEditar} ol={t.h.ol ? quien(t.h.ol) : ""} bavaria={t.h.bavaria ? quien(t.h.bavaria) : ""} onCambio={cargar} />
                ) : (
                  <p className="cl-nota" role="note">Para validar y aprobar falta correr <code>supabase/migraciones/2026-10-fiscal-validar.sql</code> en Supabase.</p>
                )}
                {vis.length > 0 && (
                  <div className="vf-tabla-caja">
                    <table className="vf-tabla">
                      <thead><tr><th>Estado</th><th>Sitio</th><th>Material</th><th>Vence</th><th>Operador</th><th>Bavaria</th><th>Diferencia</th></tr></thead>
                      <tbody>
                        {agruparPorCodigo(vis).map((g) => (
                          <Fragment key={g.sku}>
                          <tr className="vf-grupo">
                            <td colSpan={7} style={{ background: "rgba(127,127,127,.12)", borderTop: "2px solid currentColor", padding: "8px 10px" }}>
                              <b>{g.sku}</b> {g.material}
                              <span className="vf-grupo-sum"> · Operador {nf.format(g.ol)} · Bavaria {nf.format(g.bav)} · {g.neto === 0 ? "cuadra en total (0)" : "neto " + (g.neto > 0 ? "+" : "") + nf.format(g.neto)}{g.filas.length > 1 ? ` · ${g.filas.length} renglones` : ""}</span>
                            </td>
                          </tr>
                          {g.filas.map((f, i) => (
                          <tr key={i} className={"vf-f " + f.estado.toLowerCase()}>
                            <td data-et="Estado"><i className={"vf-ef " + f.estado.toLowerCase()}>{f.compensada ? "Compensada" : TEXTO_FILA[f.estado]}</i></td>
                            <td data-et="Sitio"><b>{f.ubicacion}</b></td>
                            <td data-et="Material"><b>{f.sku}</b> {f.material}{marcasDeFila(f) ? <> · <i>{marcasDeFila(f)}</i></> : null}
                              {(fotos[t.h.numero] ?? []).filter((x) => moduloClave(x.ubicacion) === moduloClave(f.ubicacion) && x.sku === f.sku).map((x) => (
                                <span key={x.conteo_id}> · <button type="button" className="fe-mini" onClick={() => abrirFoto(x.ruta)} title="Foto del renglón">Foto {x.equipo === "OL" ? (t.h.ol ? quien(t.h.ol) : "operador") : (t.h.bavaria ? quien(t.h.bavaria) : "Bavaria")}{x.averia ? " (avería)" : ""}</button></span>
                              ))}</td>
                            <td data-et="Vence">{textoVenc(f.vencDia, f.vencMes, f.vencAnio)}</td>
                            <td data-et="Operador" className="num">{f.cajasOl === null ? "—" : nf.format(f.cajasOl)}</td>
                            <td data-et="Bavaria" className="num">{f.cajasBavaria === null ? "—" : nf.format(f.cajasBavaria)}</td>
                            <td data-et="Diferencia" className="num">{f.diferencia === 0 ? "0" : (f.diferencia > 0 ? "+" : "") + nf.format(f.diferencia)}</td>
                          </tr>
                          ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
          {cruzadas.length > 0 && (
            <p className="vf-pie">Cajas contadas (estibas × cajas por estiba + saldo + cajas sueltas). Lo que contó solo uno de los dos cuenta como diferencia.</p>
          )}
        </div>
      )}
    </section>
  );
}
