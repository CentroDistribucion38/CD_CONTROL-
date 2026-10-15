import { createClient } from "@/lib/supabase/server";
import { consolidadoDelDia, diasConConteo, leerCasco } from "@/modulos/inventario/balance";
import { esUbicacionFabrica } from "@/modulos/casco/ubicacion-sitio";
import { diasConPasivos, leerPasivos } from "@/modulos/pasivos/datos";
import { excluye, type PanelExcluidos } from "@/modulos/pasivos/excluidos";
import { leerExcluidos, panelExcluidos } from "@/modulos/pasivos/excluidos-leer";
import { conReclasificaciones } from "@/modulos/inventario/reclasificaciones";

/**
 * CUADRE SAP · AG18 FÁBRICA — el archivo «2026.10.09_FABRICA.xlsx», hecho pantalla.
 *
 * TOTAL CONTEO de cada material (en unidades; las cajas plásticas en cajas y las estibas en estibas):
 *   · ENVASE  = lo contado en la fábrica (ubicaciones FABRICA_, todos los estados) × unidades por caja
 *             (lo de estado OTROS —Andina…— va al envase que se escoja; si no se escoge, al que se contó)
 *             + PEND. BAJA (Pasivos AG18 · BAJA · SORTING)          ← se puede apagar
 *             − LAVADO CON BAJA (Casco AG18: estibas × cajas/estiba × unidades/caja)
 *             + ANDINA / HEINEKEN (Pasivos AG18 · BAJA · las demás causales)
 *   · CAJAS PLÁSTICAS = las sueltas contadas + la caja de cada envase contado (la caja sale del
 *             maestro de Pasivos: la 850 va en la 1000 x13)
 *   · ESTIBAS DE MADERA = las sueltas contadas + 1 por cada estiba contada debajo del envase y las
 *             cajas (y 1 por cada renglón con saldo o cajas sueltas) + las del almacén, que se digitan
 * Verificado contra el 9-oct: envase, cajas y estibas dan lo mismo que el Excel.
 *
 * DIFERENCIA = SAP (ZEXI) − TOTAL CONTEO = el 311. Negativa: se contó más → pasar de AG22 a AG18.
 * Positiva: SAP tiene más → pasar de AG18 a AG22. Con la transacción del 311 ya hecha:
 * SAP DESPUÉS = SAP + lo movido (neto en AG18) y QUEDA = SAP DESPUÉS − TOTAL CONTEO.
 */
export const ALMACEN_CUADRE = "AG18";
/** Los dos cuadres: AG18 (fábrica, contra el conteo) y AG22 (contra la base de Pasivos y el Bloqueado de SAP). */
export type Almacen = "AG18" | "AG22";
export const esAlmacen = (a: unknown): a is Almacen => a === "AG18" || a === "AG22";
/** AG22: las causales de la base de Pasivos que entran al cuadre («el agenciamiento»). */
export const CAUSALES_AG22 = ["PRESORTING", "ROTURA DE LINEA", "LAVADO", "EXTRASUCIO", "BAJA PROYECTADA"] as const;
const normCausal = (c: unknown) => String(c ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const ESTIBA = "3500163";
/** «No sumar»: la línea OTROS no entra a ningún envase. */
export const NO_SUMAR = "NO";
const esOtros = (e: string | null | undefined) => /OTRO/i.test(e ?? "");
/* Envases cuya caja NO se suma a las cajas plásticas del cuadre, como en el Excel FABRICA: la botella
   850 (3501539) va en la caja 1000 x13 (3501211), pero su caja no entra al conteo de esa caja. */
const CAJA_FUERA_DEL_CUADRE = new Set(["3501539"]);

export type ZexiFila = { codigo: string; descripcion: string; cantidad: number;
  /** Cómo está repartido en SAP (si el ZEXI trae las columnas): para saber si algo que hay que sacar está bloqueado. */
  libre?: number; calidad?: number; bloqueado?: number };
export type MovFila = { codigo: string; cantidad: number; documentos: string[];
  /** Con la ZEXI nueva: cómo quedó repartido (para ver si algo quedó en libre y falta el 344). */
  libre?: number; bloqueado?: number; calidad?: number };
/** Cómo se reparte una cantidad en los tres estados de SAP. */
export type Estados = { libre: number; calidad: number; bloqueado: number };
export type CuadreGuardado = {
  fecha: string; almacen: string;
  estibas_almacen: number | null; sumar_pend_baja: boolean;
  zexi: ZexiFila[] | null; zexi_archivo: string | null; zexi_en: string | null;
  movimientos: MovFila[] | null; mov_archivo: string | null; mov_en: string | null;
  /** A qué envase va cada línea OTROS: { id del renglón: código | "NO" }. Sin la línea = al que se contó. */
  otros?: Record<string, string> | null;
  /** El balanceo guardado de ese día (el botón «Guardar balanceo del día»). */
  cierre?: BalanceoGuardado | null; cerrado_en?: string | null; cerrado_nombre?: string | null;
};
/** Lo que se congela al guardar el balanceo de un día. */
/** conMov = false: guardado HASTA EL PASO 2 (se sabe qué mover en SAP, falta la ZEXI nueva para validar). */
export type ResumenBalanceo = { materiales: number; conSap: number; cuadran: number; balanceados: number; pendientes: number; conMov: boolean;
  entran?: number; salen?: number };
export type FilaGuardada = Pick<FilaCuadre, "grupo" | "codigo" | "material" | "total" | "sap" | "dif" | "movido" | "sapDespues" | "queda" | "enLibre" | "estadoOk">;
/** Balanceado = queda en 0, (en AG18, envase) nada quedó en libre utilización y (cajas) cada estado quedó como debe. */
export const estaBalanceada = (f: { queda: number | null; enLibre?: number | null; estadoOk?: boolean | null }) =>
  f.queda != null && Math.abs(f.queda) < 0.005 && !((f.enLibre ?? 0) > 0.005) && f.estadoOk !== false;
export type BalanceoGuardado = {
  resumen: ResumenBalanceo; filas: FilaGuardada[]; aplicados: Aplicado[];
  zexi_archivo: string | null; mov_archivo: string | null; estibas_almacen: number | null; sumar_pend_baja: boolean;
};
export type DiaHistorial = { fecha: string; almacen: Almacen; cerrado_en: string | null; cerrado_nombre: string | null; cierre: BalanceoGuardado };
/** Una línea del conteo de fábrica en estado OTROS (Andina…), con el envase al que se suma. */
export type LineaOtros = {
  id: string; ubicacion: string; codigo: string; material: string; nota: string | null;
  estibas: number; cajas: number;
  /** El envase al que se suma (código) o NO_SUMAR. */
  destino: string;
  unidades: number;
  /** true si alguien la cambió; false = suma al código con que se contó. */
  elegido: boolean;
};
export type Grupo = "ENVASE" | "CAJA" | "ESTIBA";
/** Lo que la app le aplicó a una referencia, con el porqué, para que cada movimiento se entienda. */
export type Aplicado = { codigo: string; material: string; que: string; cantidad: number; unidad: string; porque: string; apagado?: boolean };
export type FilaCuadre = {
  grupo: Grupo; codigo: string; material: string;
  /** Lo contado en la fábrica (envase × unidades/caja; cajas; estibas). */
  conteo: number;
  detalle: string | null;
  pendBaja: number; lavadoBaja: number; andina: number; almacen: number;
  /** Cajas de líneas OTROS que quedaron sumadas en este envase. */
  otrosCajas: number;
  /** Unidades por caja (solo envase): para mostrar la diferencia también en cajas. */
  upc: number;
  /** AG22: lo de la base de Pasivos por causal (PRESORTING, ROTURA DE LINEA…). */
  partes?: Record<string, number>;
  total: number;
  sap: number | null;
  /** Del ZEXI: lo libre y lo bloqueado (null si el ZEXI guardado no lo trae). */
  libre?: number | null; bloqueado?: number | null;
  /** AG18, envase: lo que quedó en LIBRE en la ZEXI nueva. En AG18 el envase va BLOQUEADO: si queda algo
   *  en libre, falta el 344 (Libre → Bloqueado) y no está balanceado. */
  enLibre?: number | null;
  /** Del ZEXI: lo que está en control de calidad. */
  calidad?: number | null;
  /** CAJAS PLÁSTICAS, POR ESTADO: cómo deben quedar en SAP AG18.
   *  Suelta en BAJA → Bloqueado · suelta en RETORNO (o cualquier otro estado) → Libre utilización ·
   *  la caja que lleva el envase → In control-cal. Solo las cajas; null en lo demás. */
  meta?: Estados | null;
  /** CAJAS: cómo quedaron los tres estados en la ZEXI nueva (null si no hay o no trae los estados). */
  estadoFinal?: Estados | null;
  /** CAJAS: la ZEXI nueva quedó igual a `meta` en los tres estados (null = no se puede saber todavía). */
  estadoOk?: boolean | null;
  /** SAP − total (el 311 que hay que hacer). null si no hay ZEXI. */
  dif: number | null;
  /** Lo movido en SAP (neto en AG18: + entra, − sale). */
  movido: number;
  documentos: string[];
  sapDespues: number | null;
  queda: number | null;
};

type Prod = { sku: string; nombre: string | null; unidades_por_caja: number | null; cajas_por_estiba: number | null };
type Maes = { codigo: string; descripcion: string; familia: string | null; unidades_por_caja: number | null; cajas_por_estiba: number | null; caja: string | null };

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const redondo = (v: number) => Math.round(v * 100) / 100;
/** Todos los SKU que se pueden escoger en el toolbox de excluidos: el maestro de Pasivos y los productos. */
const catalogo = (M: Map<string, Maes>, P: Map<string, Prod>) => [
  ...[...M.values()].map((m) => ({ codigo: String(m.codigo), nombre: m.descripcion })),
  ...[...P.values()].map((p) => ({ codigo: String(p.sku), nombre: p.nombre })),
];

/** EL HISTÓRICO de los dos almacenes: los días con el balanceo guardado, del más nuevo al más viejo. */
async function leerHistorial(supabase: Awaited<ReturnType<typeof createClient>>) {
  const r = await supabase.from("cuadre_sap").select("fecha, almacen, cerrado_en, cerrado_nombre, cierre")
    .not("cierre", "is", null).order("fecha", { ascending: false }).order("almacen").limit(180);
  return { historial: (r.error ? [] : (r.data ?? [])) as DiaHistorial[], faltaHist: !!r.error && /cierre|cerrado/i.test(r.error.message) };
}

export async function armarCuadre(pedida?: string | null, almacen: Almacen = "AG18") {
  if (almacen === "AG22") return armarCuadreAG22(pedida);
  const supabase = await createClient();
  const { dias, conteos, error: e0 } = await diasConConteo();
  const fecha = pedida && dias.includes(pedida) ? pedida : (dias[0] ?? null);
  const base = { fecha, dias, filas: [] as FilaCuadre[], guardado: null as CuadreGuardado | null, estibasBodega: 0, avisos: [] as string[], error: e0, faltaSql: false, historial: [] as DiaHistorial[], faltaHist: false,
    otros: [] as LineaOtros[], envases: [] as { codigo: string; material: string }[], aplicados: [] as Aplicado[], excluidos: null as PanelExcluidos | null };
  if (!fecha) return base;

  const [cons, prodR, maesR, pas, casco, sitiosR, guardR, hist, regla] = await Promise.all([
    consolidadoDelDia(fecha, conteos),
    supabase.from("productos").select("sku, nombre, unidades_por_caja, cajas_por_estiba"),
    supabase.from("pasivos_maestro").select("codigo, descripcion, familia, unidades_por_caja, cajas_por_estiba, caja"),
    leerPasivos(fecha, fecha),
    leerCasco(),
    supabase.from("casco_ubicaciones").select("clave, centro"),
    supabase.from("cuadre_sap").select("*").eq("fecha", fecha).eq("almacen", ALMACEN_CUADRE).maybeSingle(),
    leerHistorial(supabase),
    leerExcluidos("AG18"),
  ]);
  if (guardR.error && /cuadre_sap|does not exist|PGRST205/i.test(`${guardR.error.code} ${guardR.error.message}`)) return { ...base, faltaSql: true };
  const avisos: string[] = [];
  if (cons.error) avisos.push(`No pude leer el conteo: ${cons.error}`);
  if (pas.error) avisos.push(`No pude leer Pasivos (pend. baja y Andina): ${pas.error}`);
  if (casco.error) avisos.push(`No pude leer el Casco (lavado con baja): ${casco.error}`);
  if (maesR.error) avisos.push(`No pude leer el maestro de Pasivos (factores y cajas): ${maesR.error.message}`);

  const guardado = (guardR.data ?? null) as CuadreGuardado | null;
  const P = new Map(((prodR.data ?? []) as Prod[]).map((p) => [String(p.sku), p]));
  const M = new Map(((maesR.data ?? []) as Maes[]).map((m) => [String(m.codigo), m]));
  const grupoDe = (c: string): Grupo => {
    const f = (M.get(c)?.familia ?? "").toUpperCase();
    return c === ESTIBA || f === "ESTIBA" ? "ESTIBA" : f === "CAJA" ? "CAJA" : "ENVASE";
  };
  const upc = (c: string) => Number(M.get(c)?.unidades_por_caja ?? P.get(c)?.unidades_por_caja ?? 1) || 1;
  const cpe = (c: string) => Number(M.get(c)?.cajas_por_estiba ?? P.get(c)?.cajas_por_estiba ?? 0) || 0;
  const nombre = (c: string, alt?: string | null) => M.get(c)?.descripcion ?? P.get(c)?.nombre ?? alt ?? c;

  type Acc = { codigo: string; material: string; conteo: number; sueltas: number; sueltasBaja: number; conEnvase: number; pend: number; lav: number; andina: number; otrosCajas: number; fuera: number; fueraDe: string;
    lavEst: number; causales: Set<string>; porEnvase: Map<string, number> };
  const acc = new Map<string, Acc>();
  const de = (c: string, alt?: string | null) => {
    let a = acc.get(c);
    if (!a) { a = { codigo: c, material: nombre(c, alt), conteo: 0, sueltas: 0, sueltasBaja: 0, conEnvase: 0, pend: 0, lav: 0, andina: 0, otrosCajas: 0, fuera: 0, fueraDe: "",
      lavEst: 0, causales: new Set(), porEnvase: new Map() }; acc.set(c, a) }
    return a;
  };

  /* 1. EL CONTEO DE LA FÁBRICA (todos los estados del envase). */
  const asignado = (guardado?.otros ?? {}) as Record<string, string>;
  const otros: LineaOtros[] = [];
  const envasesVistos = new Set<string>();
  let estBajo = 0, estSueltas = 0, estibasBodega = 0;
  /* Con lo reclasificado en el Balance: una línea OTROS que se pasó a BAJA ya no es OTROS. */
  const fueraNuevos = new Set<string>();
  for (const r of await conReclasificaciones(cons.vigentes)) {
    if (r.tipo_material !== "ENVASE") continue;
    const c = String(r.codigo), cajas = Number(r.total_cajas) || 0;
    /* Los SKU fuera del cuadre (los de siempre: barril, 412644, 412671, 412707; y lo escogido en el toolbox). */
    if (excluye(regla, c, r.material)) { fueraNuevos.add(c); continue }
    /* SOLO LO DE FÁBRICA entra al cuadre de AG18: por la calle o por el nombre de la ubicación (FABRICA, FABRICA_…,
       FABRICAL4…), con la MISMA regla del Análisis de diferencia. Antes se miraba solo `ubicacion`. */
    const deFabrica = esUbicacionFabrica(r.calle) || esUbicacionFabrica(r.ubicacion) || esUbicacionFabrica(r.ubicacion_combinada);
    if (!deFabrica) { if (c === ESTIBA) estibasBodega += cajas; continue }
    const g = grupoDe(c);
    if (g === "ESTIBA") { estSueltas += cajas; continue }
    /* La estiba de madera de debajo: una por estiba contada y una por renglón con saldo o sueltas. */
    estBajo += (Number(r.estibas) || 0) + ((Number(r.cajas) || 0) + (Number(r.saldo) || 0) > 0 ? 1 : 0);
    if (g === "CAJA") {
      const k = de(c, r.material); k.sueltas += cajas;
      /* La caja suelta en BAJA va a Bloqueado; en RETORNO (o cualquier otro estado), a Libre. */
      if (/BAJA/i.test(String(r.estado_envase ?? ""))) k.sueltasBaja += cajas;
      continue;
    }
    envasesVistos.add(c);
    /* OTROS (Andina…): al envase que se escogió; si no se ha escogido, al código con que se contó.
       «No sumar» lo saca del envase, pero su caja plástica y su estiba siguen ahí y sí cuentan. */
    let destino = c;
    if (esOtros(r.estado_envase)) {
      const elegido = asignado[String(r.id)];
      destino = elegido === NO_SUMAR ? "" : elegido ? String(elegido) : c;
      otros.push({ id: String(r.id), ubicacion: String(r.ubicacion ?? ""), codigo: c, material: nombre(c, r.material), nota: r.nota ?? null,
        estibas: Number(r.estibas) || 0, cajas, destino: destino || NO_SUMAR, unidades: destino ? cajas * upc(destino) : 0, elegido: !!elegido && elegido !== c });
      if (destino) de(destino).otrosCajas += cajas;
    }
    const env = destino || c, cajaDe = M.get(env)?.caja;
    if (cajaDe && CAJA_FUERA_DEL_CUADRE.has(env)) { const k = de(String(cajaDe)); k.fuera += cajas; k.fueraDe = nombre(env) }
    else if (cajaDe) { const k = de(String(cajaDe)); k.conEnvase += cajas; k.porEnvase.set(env, (k.porEnvase.get(env) ?? 0) + cajas) }
    if (destino) de(destino, destino === c ? r.material : null).conteo += cajas * upc(destino);
  }

  /* 2. PEND. BAJA Y ANDINA / HEINEKEN (Pasivos AG18 · BAJA, del día). */
  for (const f of pas.data) {
    if (f.almacen !== ALMACEN_CUADRE || String(f.estado).toUpperCase() !== "BAJA") continue;
    const a = de(String(f.codigo), f.descripcion);
    if (String(f.causal).toUpperCase() === "SORTING") a.pend += Number(f.unidades) || 0;
    else { a.andina += Number(f.unidades) || 0; a.causales.add(String(f.causal ?? "").toUpperCase() || "SIN CAUSAL") }
  }

  /* 3. LAVADO CON BAJA (Casco AG18, su último registro hasta el día): en negativo. */
  const clavesAG18 = new Set(((sitiosR.data ?? []) as { clave: string; centro: string | null }[])
    .filter((s) => (s.centro ?? "").toUpperCase() === ALMACEN_CUADRE).map((s) => s.clave));
  for (const clave of clavesAG18) {
    const suyos = casco.data.filter((x) => x.ubicacion === clave && x.fecha <= fecha);
    const ult = suyos.reduce((m, x) => (x.fecha > m ? x.fecha : m), "");
    for (const x of suyos) {
      if (x.fecha !== ult || !x.baja) continue;
      const c = String(x.sku);
      const a = de(c); a.lav -= Number(x.baja) * cpe(c) * upc(c); a.lavEst += Number(x.baja);
    }
  }

  /* 4. LO GUARDADO: el ZEXI, las estibas del almacén y los movimientos 311. */
  const sumarPend = guardado?.sumar_pend_baja ?? true;
  const estAlm = Number(guardado?.estibas_almacen ?? 0) || 0;
  const sap = new Map((guardado?.zexi ?? []).map((z) => [String(z.codigo), z]));
  const mov = new Map((guardado?.movimientos ?? []).map((m) => [String(m.codigo), m]));
  for (const z of sap.values()) { if (excluye(regla, z.codigo, z.descripcion ?? nombre(String(z.codigo)))) { fueraNuevos.add(String(z.codigo)); continue } de(String(z.codigo), z.descripcion) }
  for (const m of mov.values()) if (!excluye(regla, m.codigo, nombre(String(m.codigo)))) de(String(m.codigo));
  if (!excluye(regla, ESTIBA, nombre(ESTIBA))) de(ESTIBA);
  else { acc.delete(ESTIBA); fueraNuevos.add(ESTIBA) }
  const excluidos = panelExcluidos(regla, catalogo(M, P), fueraNuevos);

  const filas: FilaCuadre[] = [...acc.values()].map((a) => {
    const grupo = grupoDe(a.codigo);
    let conteo = a.conteo, detalle: string | null = null, almacen = 0;
    if (grupo === "CAJA") {
      conteo = a.sueltas + a.conEnvase;
      const ret = a.sueltas - a.sueltasBaja;
      detalle = [a.sueltas ? `${nf.format(a.sueltas)} sueltas${a.sueltasBaja && ret ? ` (${nf.format(ret)} retorno · ${nf.format(a.sueltasBaja)} baja)` : a.sueltasBaja ? " en baja" : ""}` : "", a.conEnvase ? `${nf.format(a.conEnvase)} con envase` : ""].filter(Boolean).join(" + ")
        + (a.fuera ? ` · sin las ${nf.format(a.fuera)} de ${a.fueraDe}` : "") || null;
    } else if (grupo === "ESTIBA") {
      conteo = estSueltas + estBajo; almacen = estAlm;
      detalle = `${nf.format(estSueltas)} sueltas + ${nf.format(estBajo)} bajo el envase` + (estAlm ? ` + ${nf.format(estAlm)} del almacén` : "");
    }
    const pendBaja = grupo === "ENVASE" ? a.pend : 0;
    const total = redondo(conteo + (sumarPend ? pendBaja : 0) + a.lav + a.andina + almacen);
    const z = sap.get(a.codigo), m = mov.get(a.codigo);
    /* «Lo que no tiene SAP me tiene que decir que del 22 debo pasarlo al 18, ya que allá no tiene»: con ZEXI
       cargado, un material que no viene en él es 0 en SAP (no «sin dato»), y entra a la lista del 311 / 344. */
    const sapV = z ? Number(z.cantidad) : (guardado?.zexi?.length ? 0 : null);
    const movido = m ? Number(m.cantidad) : 0;
    const dif = sapV == null ? null : redondo(sapV - total);
    const sapDespues = sapV == null ? null : redondo(sapV + movido);
    const queda = sapDespues == null ? null : redondo(sapDespues - total);
    return { grupo, codigo: a.codigo, material: a.material, conteo: redondo(conteo), detalle, pendBaja, lavadoBaja: a.lav, andina: a.andina,
      almacen, otrosCajas: grupo === "ENVASE" ? a.otrosCajas : 0, upc: grupo === "ENVASE" ? upc(a.codigo) : 1, total, sap: sapV,
      libre: z?.libre ?? null, bloqueado: z?.bloqueado ?? null, calidad: z?.calidad ?? null,
      enLibre: grupo === "ENVASE" && m?.libre != null ? redondo(m.libre) : null,
      ...(grupo === "CAJA" ? (() => {
        /* Lo que se sume a la caja fuera del conteo (pend. baja, Andina, lavado) va con lo bloqueado. */
        const libre = redondo(a.sueltas - a.sueltasBaja), calidad = redondo(a.conEnvase);
        const meta: Estados = { libre, calidad, bloqueado: redondo(total - libre - calidad) };
        const estadoFinal: Estados | null = m?.libre != null
          ? { libre: redondo(m.libre ?? 0), calidad: redondo(m.calidad ?? 0), bloqueado: redondo(m.bloqueado ?? 0) } : null;
        const igual = (x: number, y: number) => Math.abs(x - y) < 0.005;
        return { meta, estadoFinal, estadoOk: estadoFinal ? igual(estadoFinal.libre, meta.libre) && igual(estadoFinal.calidad, meta.calidad) && igual(estadoFinal.bloqueado, meta.bloqueado) : null };
      })() : { meta: null, estadoFinal: null, estadoOk: null }),
      dif, movido, documentos: m?.documentos ?? [], sapDespues, queda };
  })
    /* Lo que no tiene nada en ningún lado no se lista. */
    .filter((f) => f.total !== 0 || (f.sap ?? 0) !== 0 || f.movido !== 0 || f.codigo === ESTIBA)
    .sort((x, y) => "ENVASE CAJA ESTIBA".indexOf(x.grupo) - "ENVASE CAJA ESTIBA".indexOf(y.grupo) || x.codigo.localeCompare(y.codigo));

  /* Los envases a los que se puede mandar una línea OTROS: los del maestro de Pasivos y los contados. */
  const envases = [...new Set([...[...M.keys()].filter((c) => grupoDe(c) === "ENVASE"), ...envasesVistos])]
    .map((c) => ({ codigo: c, material: nombre(c) })).sort((x, y) => x.codigo.localeCompare(y.codigo));

  /* LO QUE SE APLICÓ, REFERENCIA POR REFERENCIA: el porqué de cada cifra que no es el conteo tal cual. */
  const aplicados: Aplicado[] = [];
  const pon = (a: Acc, que: string, cantidad: number, unidad: string, porque: string, apagado = false) => {
    if (cantidad) aplicados.push({ codigo: a.codigo, material: a.material, que, cantidad: redondo(cantidad), unidad, porque, apagado });
  };
  const listados = new Set(filas.map((f) => f.codigo));
  for (const a of [...acc.values()].filter((x) => listados.has(x.codigo)).sort((x, y) => x.codigo.localeCompare(y.codigo))) {
    const g = grupoDe(a.codigo);
    if (g === "ENVASE") {
      for (const o of otros.filter((x) => x.destino === a.codigo))
        pon(a, "OTROS sumado", o.unidades, "u", `${nf.format(o.cajas)} cajas (${nf.format(o.estibas)} estibas) en ${o.ubicacion}${o.nota ? ` · nota «${o.nota}»` : ""}`
          + (o.codigo === a.codigo ? " · se contaron como este código" : ` · se contaron como ${o.codigo} y se pasaron aquí`));
      for (const o of otros.filter((x) => x.codigo === a.codigo && x.destino !== a.codigo))
        aplicados.push({ codigo: a.codigo, material: a.material, que: "OTROS que no suma aquí", cantidad: o.cajas, unidad: "cajas",
          porque: `${o.ubicacion}${o.nota ? ` · «${o.nota}»` : ""} · ${o.destino === NO_SUMAR ? "se escogió no sumarlas" : `se pasaron a ${o.destino} · ${nombre(o.destino)}`}` });
      pon(a, "Pend. baja", a.pend, "u", "Pasivos AG18 · BAJA · SORTING del día" + (sumarPend ? "" : " · el interruptor está apagado: no se suma"), !sumarPend);
      pon(a, "Lavado con baja", a.lav, "u", `Casco AG18: ${nf.format(a.lavEst)} estibas en baja × ${nf.format(cpe(a.codigo))} cajas × ${nf.format(upc(a.codigo))} u · se restan`);
      pon(a, "Andina / Heineken", a.andina, "u", `Pasivos AG18 · BAJA · ${[...a.causales].join(", ")}`);
    } else if (g === "CAJA") {
      pon(a, "Caja de cada envase", a.conEnvase, "cajas", [...a.porEnvase].sort((x, y) => y[1] - x[1]).map(([c, q]) => `${c}: ${nf.format(q)}`).join(" · "));
      if (a.fuera) aplicados.push({ codigo: a.codigo, material: a.material, que: "No se suma", cantidad: a.fuera, unidad: "cajas", apagado: true,
        porque: `Las cajas de ${a.fueraDe} van en esta caja, pero no entran a su conteo (como en el Excel FABRICA)` });
    } else {
      pon(a, "Estibas bajo el envase", estBajo, "estibas", "1 por cada estiba contada debajo del envase y las cajas, y 1 por renglón con saldo o sueltas");
      pon(a, "Estibas del almacén", estAlm, "estibas", "Digitadas en la tarjeta «Estibas en almacén AG18»");
    }
  }

  /* EL HISTÓRICO: los días con el balanceo guardado, del más nuevo al más viejo. */
  return { ...base, filas, guardado, estibasBodega, avisos, otros, envases, aplicados, excluidos, ...hist };
}

/**
 * CUADRE SAP · AG22 — la base de Pasivos de AG22 del día contra el BLOQUEADO de SAP de AG22.
 *
 * «En el AG22 debe estar alineado al bloqueado de la existencia en SAP; toma como input la base: todo lo
 *  que es causal PRESORTING, ROTURA DE LINEA, LAVADO, EXTRASUCIO y BAJA PROYECTADA.»
 *
 * TOTAL BASE de cada material = Σ unidades de Pasivos AG22 de esas causales ese día. Las demás causales
 * (ANDINA…) no entran y se avisan. DIFERENCIA = SAP bloqueado − total base. Aquí NO se cambia de almacén:
 * negativa → falta bloquear, pasar de LIBRE a BLOQUEADO en AG22; positiva → sobra bloqueado, pasar de
 * BLOQUEADO a LIBRE. El paso 3 es igual al de AG18 (la ZEXI nueva, su columna Bloqueado).
 */
async function armarCuadreAG22(pedida?: string | null) {
  const supabase = await createClient();
  const dias = [...(await diasConPasivos())].sort().reverse();
  const fecha = pedida && dias.includes(pedida) ? pedida : (dias[0] ?? null);
  const base = { fecha, dias, filas: [] as FilaCuadre[], guardado: null as CuadreGuardado | null, estibasBodega: 0, avisos: [] as string[], error: null as string | null,
    faltaSql: false, historial: [] as DiaHistorial[], faltaHist: false,
    otros: [] as LineaOtros[], envases: [] as { codigo: string; material: string }[], aplicados: [] as Aplicado[], excluidos: null as PanelExcluidos | null };
  if (!fecha) return { ...base, ...(await leerHistorial(supabase)) };

  const [pas, prodR, maesR, guardR, hist, regla] = await Promise.all([
    leerPasivos(fecha, fecha),
    supabase.from("productos").select("sku, nombre, unidades_por_caja, cajas_por_estiba"),
    supabase.from("pasivos_maestro").select("codigo, descripcion, familia, unidades_por_caja, cajas_por_estiba, caja"),
    supabase.from("cuadre_sap").select("*").eq("fecha", fecha).eq("almacen", "AG22").maybeSingle(),
    leerHistorial(supabase),
    leerExcluidos("AG22"),
  ]);
  if (guardR.error && /cuadre_sap|does not exist|PGRST205/i.test(`${guardR.error.code} ${guardR.error.message}`)) return { ...base, faltaSql: true };
  const avisos: string[] = [];
  if (pas.error) avisos.push(`No pude leer la base de Pasivos: ${pas.error}`);
  if (maesR.error) avisos.push(`No pude leer el maestro de Pasivos (factores): ${maesR.error.message}`);

  const guardado = (guardR.data ?? null) as CuadreGuardado | null;
  const P = new Map(((prodR.data ?? []) as Prod[]).map((p) => [String(p.sku), p]));
  const M = new Map(((maesR.data ?? []) as Maes[]).map((m) => [String(m.codigo), m]));
  const grupoDe = (c: string): Grupo => {
    const f = (M.get(c)?.familia ?? "").toUpperCase();
    return c === ESTIBA || f === "ESTIBA" ? "ESTIBA" : f === "CAJA" ? "CAJA" : "ENVASE";
  };
  const upc = (c: string) => Number(M.get(c)?.unidades_por_caja ?? P.get(c)?.unidades_por_caja ?? 1) || 1;
  const nombre = (c: string, alt?: string | null) => M.get(c)?.descripcion ?? P.get(c)?.nombre ?? alt ?? c;

  type Acc = { codigo: string; material: string; partes: Record<string, number>; estados: Record<string, Set<string>> };
  const acc = new Map<string, Acc>();
  const de = (c: string, alt?: string | null) => {
    let a = acc.get(c);
    if (!a) { a = { codigo: c, material: nombre(c, alt), partes: {}, estados: {} }; acc.set(c, a) }
    return a;
  };
  const fuera = new Map<string, { filas: number; unidades: number }>();
  for (const f of pas.data) {
    if (String(f.almacen).toUpperCase() !== "AG22") continue;
    const causal = normCausal(f.causal);
    if (!(CAUSALES_AG22 as readonly string[]).includes(causal)) {
      const x = fuera.get(causal) ?? { filas: 0, unidades: 0 }; x.filas++; x.unidades += Number(f.unidades) || 0; fuera.set(causal, x);
      continue;
    }
    const a = de(String(f.codigo), f.descripcion);
    a.partes[causal] = (a.partes[causal] ?? 0) + (Number(f.unidades) || 0);
    (a.estados[causal] ??= new Set()).add(String(f.estado ?? "").toUpperCase());
  }
  for (const [c, x] of fuera) avisos.push(`No entra al cuadre AG22 la causal ${c || "(vacía)"}: ${x.filas} filas · ${new Intl.NumberFormat("es-CO").format(x.unidades)} u. Solo entran ${CAUSALES_AG22.join(", ")}.`);

  const sap = new Map((guardado?.zexi ?? []).map((z) => [String(z.codigo), z]));
  const mov = new Map((guardado?.movimientos ?? []).map((m) => [String(m.codigo), m]));
  const fueraNuevos = new Set<string>();
  for (const z of sap.values()) { if (excluye(regla, z.codigo, z.descripcion ?? nombre(String(z.codigo)))) { fueraNuevos.add(String(z.codigo)); continue } de(String(z.codigo), z.descripcion) }
  for (const m of mov.values()) if (!excluye(regla, m.codigo, nombre(String(m.codigo)))) de(String(m.codigo));
  const excluidos = panelExcluidos(regla, catalogo(M, P), fueraNuevos);

  const filas: FilaCuadre[] = [...acc.values()].map((a) => {
    const grupo = grupoDe(a.codigo);
    const total = redondo(Object.values(a.partes).reduce((t, v) => t + v, 0));
    const z = sap.get(a.codigo), m = mov.get(a.codigo);
    /* «Lo que no tiene SAP me tiene que decir que del 22 debo pasarlo al 18, ya que allá no tiene»: con ZEXI
       cargado, un material que no viene en él es 0 en SAP (no «sin dato»), y entra a la lista del 311 / 344. */
    const sapV = z ? Number(z.cantidad) : (guardado?.zexi?.length ? 0 : null);
    const movido = m ? Number(m.cantidad) : 0;
    const dif = sapV == null ? null : redondo(sapV - total);
    const sapDespues = sapV == null ? null : redondo(sapV + movido);
    const queda = sapDespues == null ? null : redondo(sapDespues - total);
    return { grupo, codigo: a.codigo, material: a.material, conteo: total, detalle: null, pendBaja: 0, lavadoBaja: 0, andina: 0, almacen: 0,
      otrosCajas: 0, upc: grupo === "ENVASE" ? upc(a.codigo) : 1, partes: a.partes,
      total, sap: sapV, dif, movido, documentos: m?.documentos ?? [], sapDespues, queda };
  })
    .filter((f) => f.total !== 0 || (f.sap ?? 0) !== 0 || f.movido !== 0)
    .sort((x, y) => "ENVASE CAJA ESTIBA".indexOf(x.grupo) - "ENVASE CAJA ESTIBA".indexOf(y.grupo) || x.codigo.localeCompare(y.codigo));

  /* De dónde sale cada cifra: lo de cada causal de la base. */
  const listados = new Set(filas.map((f) => f.codigo));
  const aplicados: Aplicado[] = [];
  for (const a of [...acc.values()].filter((x) => listados.has(x.codigo)).sort((x, y) => x.codigo.localeCompare(y.codigo)))
    for (const c of CAUSALES_AG22) if (a.partes[c])
      aplicados.push({ codigo: a.codigo, material: a.material, que: c, cantidad: redondo(a.partes[c]), unidad: "u",
        porque: `Base de Pasivos · AG22 · ${[...(a.estados[c] ?? [])].join("/") || "—"} · causal ${c} del día` });

  return { ...base, filas, guardado, avisos, aplicados, excluidos, ...hist };
}
