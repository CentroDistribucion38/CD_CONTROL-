import { createClient } from "@/lib/supabase/server";
import { esDueno } from "@/modulos/inventario/duenos";
import { balanceDelDia, consolidadoDelDia, diasConConteo, leerCasco } from "@/modulos/inventario/balance";
import { esUbicacionFabrica } from "@/modulos/casco/ubicacion-sitio";
import { diasConPasivos, leerPasivos } from "@/modulos/pasivos/datos";
import { esPendienteEnviado } from "@/modulos/pasivos/pendiente-baja";
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
 *             − DIF. BALANCE: la diferencia de Baja · Fábrica y Lavado · Fábrica del Balance de materiales (contado − casco − ajuste).
 *               El TOTAL CONTEO es el BALANCE DE MATERIALES (= casco + ajustes): lo contado de más sale de AG18 (343 y 311);
 *               lo que no tiene casco registrado cuenta todo como diferencia. Esto REEMPLAZA al «lavado con baja» suelto:
 *               el Lavado con baja del Casco ya va dentro del casco del Balance.
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
/** true = todos los envases pasan por el Balance de materiales (contado − casco). false = los que tienen «Lavado con baja» en el Casco
 *  se quedan con el cálculo de antes (restar solo ese lavado al conteo). */
const BM_CON_LAVADO_CON_BAJA = true;
/** Los dos cuadres: AG18 (fábrica, contra el conteo) y AG22 (contra la base de Pasivos y el Bloqueado de SAP). */
export type Almacen = "AG18" | "AG17" | "AG16" | "AG22";
export const esAlmacen = (a: unknown): a is Almacen => a === "AG18" || a === "AG17" || a === "AG16" || a === "AG22";
/** AG17 (calle EXPORTACION) y AG16 (calle BTS): su cuadre es simple, el conteo de su calle contra la ZEXI de SAP. */
export type AlmacenSimple = "AG17" | "AG16";
export const esAlmacenSimple = (a: unknown): a is AlmacenSimple => a === "AG17" || a === "AG16";
/** AG22: las causales de la base de Pasivos que entran al cuadre («el agenciamiento»). */
export const CAUSALES_AG22 = ["PRESORTING", "ROTURA DE LINEA", "LAVADO", "EXTRASUCIO", "BAJA PROYECTADA", "DIF INV", "SINIESTRO"] as const;
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
/** UNA PARTIDA DEL 311 hecha en AG18 / AG17 / AG16 (lo que se subió en el paso 3 de ese almacén). `cantidad` es lo que ENTRÓ (+) o SALIÓ (−) de ese almacén;
 *  `efecto` es lo que le hace a AG22, automático: lo que entró allá salió de AG22 (resta) y lo que salió de allá entró a AG22 (suma). */
export type Partida311 = { clave: string; almacen: "AG18" | "AG17" | "AG16"; codigo: string; material: string; cantidad: number; efecto: number;
  documentos: string[]; archivo: string | null; hora: string | null };
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
  /** AG22: las partidas del 311 (clave «AG18|código») que se aplican a la ZEXI de las 6 AM. */
  ajustes311?: string[] | null;
  /** AG22: el archivo de movimientos de SAP (311) que se subió: lo que ENTRÓ (+) o SALIÓ (−) de AG22, por material. Manda sobre las partidas escogidas de los otros almacenes. */
  movs_sap?: { archivo: string; en: string; filas: MovFila[] } | null;
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
  /** Solo AG07: la pantalla completa congelada al guardar. */
  ag07?: import("@/modulos/carnaval/logica").InstantaneaAg07 | null;
};
export type DiaHistorial = { fecha: string; almacen: Almacen | "AG07"; cerrado_en: string | null; cerrado_nombre: string | null; cierre: BalanceoGuardado };
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
export type Grupo = "ENVASE" | "CAJA" | "ESTIBA" | "PRODUCTO";
/** Lo contado en Bodega 38 (AG22) de un envase, en unidades, por estado del conteo. */
export type ConteoBodega = { codigo: string; material: string; baja: number; lavado: number; extrasucio: number; otros: number };
/** Lo que la app le aplicó a una referencia, con el porqué, para que cada movimiento se entienda. */
export type Aplicado = { codigo: string; material: string; que: string; cantidad: number; unidad: string; porque: string; apagado?: boolean };
export type FilaCuadre = {
  grupo: Grupo; codigo: string; material: string;
  /** Lo contado en la fábrica (envase × unidades/caja; cajas; estibas). */
  conteo: number;
  detalle: string | null;
  pendBaja: number; andina: number; almacen: number;
  /** Lo que resta a lo contado para llegar al Balance de materiales, en negativo (= −(dif. de Baja + dif. de Lavado)). */
  lavadoBaja: number;
  /** Dif. del Balance (contado − casco − ajuste), en unidades: total, y la parte de Baja y la de Lavado. + = se contó de más. */
  difBalance?: number; difBaja?: number; difLavado?: number;
  /** Baja o Lavado · Fábrica sin casco registrado: todo lo contado cuenta como diferencia. */
  sinCasco?: boolean;
  /** Cajas por estiba del envase (0 si no se conoce). */
  cpe?: number;
  /** Cajas de líneas OTROS que quedaron sumadas en este envase. */
  otrosCajas: number;
  /** Envase: lo contado (en unidades) por estado del conteo: BAJA, LAVADO y OTROS (Andina… y cualquier otro estado). */
  conteoEstado?: { baja: number; lavado: number; otros: number };
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
  /** AG22: lo que los 311 escogidos le suman (+) o restan (−) a la ZEXI de las 6 AM, y la ZEXI tal cual. `sap` ya trae el ajuste. */
  ajuste311?: number; sapZexi?: number | null;
  /** SAP − total (el 311 que hay que hacer). null si no hay ZEXI. */
  dif: number | null;
  /** Lo movido en SAP (neto en AG18: + entra, − sale). */
  movido: number;
  /** AG18, envase: el casco registrado supera lo contado en estas unidades; la meta se deja en 0 y esto va al Balance de casco. */
  cascoDeMas?: number;
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
  if (esAlmacenSimple(almacen)) return armarCuadreSimple(pedida, almacen);
  const supabase = await createClient();
  const { dias, conteos, error: e0 } = await diasConConteo();
  const fecha = pedida && dias.includes(pedida) ? pedida : (dias[0] ?? null);
  const base = { fecha, dias, filas: [] as FilaCuadre[], guardado: null as CuadreGuardado | null, estibasBodega: 0, avisos: [] as string[], error: e0, faltaSql: false, historial: [] as DiaHistorial[], faltaHist: false,
    otros: [] as LineaOtros[], envases: [] as { codigo: string; material: string }[], aplicados: [] as Aplicado[], excluidos: null as PanelExcluidos | null, conteoBodega: [] as ConteoBodega[], partidas311: [] as Partida311[] };
  if (!fecha) return base;

  const [cons, prodR, maesR, pas, casco, sitiosR, guardR, hist, regla, bal] = await Promise.all([
    consolidadoDelDia(fecha, conteos),
    supabase.from("productos").select("sku, nombre, unidades_por_caja, cajas_por_estiba"),
    supabase.from("pasivos_maestro").select("codigo, descripcion, familia, unidades_por_caja, cajas_por_estiba, caja"),
    leerPasivos(fecha, fecha),
    leerCasco(),
    supabase.from("casco_ubicaciones").select("clave, centro"),
    supabase.from("cuadre_sap").select("*").eq("fecha", fecha).eq("almacen", ALMACEN_CUADRE).maybeSingle(),
    leerHistorial(supabase),
    leerExcluidos("AG18"),
    balanceDelDia(fecha),
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
    est: { baja: number; lavado: number; otros: number }; lavEst: number; causales: Set<string>; porEnvase: Map<string, number>;
    dBaja: number; dLav: number; sinCasco: boolean; bal: string[] };
  const acc = new Map<string, Acc>();
  const de = (c: string, alt?: string | null) => {
    let a = acc.get(c);
    if (!a) { a = { codigo: c, material: nombre(c, alt), conteo: 0, sueltas: 0, sueltasBaja: 0, conEnvase: 0, pend: 0, lav: 0, andina: 0, otrosCajas: 0, fuera: 0, fueraDe: "",
      est: { baja: 0, lavado: 0, otros: 0 }, lavEst: 0, causales: new Set(), porEnvase: new Map(), dBaja: 0, dLav: 0, sinCasco: false, bal: [] }; acc.set(c, a) }
    return a;
  };

  /* 1. EL CONTEO DE LA FÁBRICA (todos los estados del envase). */
  const asignado = (guardado?.otros ?? {}) as Record<string, string>;
  const otros: LineaOtros[] = [];
  const envasesVistos = new Set<string>();
  let estBajo = 0, estSueltas = 0, estibasBodega = 0;
  const bodega = new Map<string, ConteoBodega>();
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
    if (!deFabrica) {
      if (c === ESTIBA) estibasBodega += cajas;
      else if (grupoDe(c) === "ENVASE") {
        /* LO CONTADO EN BODEGA 38 (AG22), por estado: para la validación de pasivo de AG22. */
        const k = bodega.get(c) ?? { codigo: c, material: nombre(c, r.material), baja: 0, lavado: 0, extrasucio: 0, otros: 0 };
        const u = cajas * upc(c), e = String(r.estado_envase ?? "").toUpperCase();
        /* En Bodega 38 lo normal es RETORNO / NUEVO / VACÍO (envase sano): NO es pasivo y NO se bloquea. Solo OTROS y MAL ESTADO van a «bloquear». */
        if (/BAJA/.test(e)) k.baja += u; else if (/EXTRASUCIO/.test(e)) k.extrasucio += u; else if (/LAVAD/.test(e)) k.lavado += u; else if (/OTROS|MAL ESTADO/.test(e)) k.otros += u;
        bodega.set(c, k);
      }
      continue;
    }
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
    } else if (esDueno(r.estado_envase)) {
      /* Reasignado a ANDINA / HEINEKEN en el Balance: ya va a la base de Pasivos AG18 (causal ANDINA / HEINEKEN) y entra por ahí a «Andina / Heineken»;
         no se cuenta aquí también (saldría doble). Su caja plástica y su estiba siguen ahí y sí cuentan. */
      destino = "";
    }
    const env = destino || c, cajaDe = M.get(env)?.caja;
    if (cajaDe && CAJA_FUERA_DEL_CUADRE.has(env)) { const k = de(String(cajaDe)); k.fuera += cajas; k.fueraDe = nombre(env) }
    else if (cajaDe) { const k = de(String(cajaDe)); k.conEnvase += cajas; k.porEnvase.set(env, (k.porEnvase.get(env) ?? 0) + cajas) }
    if (destino) {
      const k = de(destino, destino === c ? r.material : null), u = cajas * upc(destino), e = String(r.estado_envase ?? "");
      k.conteo += u;
      /* El estado del conteo: BAJA, LAVADO; todo lo demás (OTROS, Andina…) es lo que hay que bloquear. */
      if (/BAJA/i.test(e)) k.est.baja += u; else if (/LAVAD/i.test(e)) k.est.lavado += u; else k.est.otros += u;
    }
  }

  /* 2. PEND. BAJA Y ANDINA / HEINEKEN (Pasivos AG18 · BAJA, del día). */
  for (const f of pas.data) {
    if (f.almacen !== ALMACEN_CUADRE || String(f.estado).toUpperCase() !== "BAJA") continue;
    if (esPendienteEnviado(f.causal)) continue; /* lo enviado desde la Validación de pasivo ya sale de conteo − pasivo: no se cuenta doble */
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

  /* 3b. LA DIFERENCIA DEL BALANCE (Baja · Fábrica y Lavado · Fábrica): el TOTAL CONTEO es el BALANCE DE MATERIALES, o sea
     lo contado menos la DIFERENCIA de su Excel, que es el casco registrado (+ ajustes del Balance): lo que SAP no debe tener en AG18. Si no se pudo leer el Balance, se queda el cálculo de antes. */
  const usarBM = !bal.error;
  if (bal.error) avisos.push(`No pude leer el Balance (la diferencia de Baja y Lavado): ${bal.error}. Se usó el Lavado con baja del Casco, como antes.`);
  if (usarBM) for (const r of bal.detalle) {
    if (r.alcance !== "SORTING" || (r.estado !== "BAJA" && r.estado !== "LAVADO")) continue;
    const c = String(r.codigo);
    if (esDueno(c) || grupoDe(c) !== "ENVASE" || excluye(regla, c, nombre(c, r.material))) continue;
    const sin = r.alerta === "Contado y sin casco registrado";
    /* LAVADO · Fábrica sin casco registrado = no hay «Lavado con baja»: lo contado en lavado se toma tal cual (sin diferencia), como en el Excel. */
    if (r.estado === "LAVADO" && sin) continue;
    /* Lo que se resta a lo contado = casco + ajuste (= contado − dif. de la pantalla Balance). OJO: la «Diferencia» de la pantalla Balance
       es contado − casco, o sea el balance mismo; la «diferencia» del Excel es el casco. */
    const u = upc(c), d = redondo((r.fisico_cajas - r.dif_cajas) * u), a = de(c, r.material);
    if (r.estado === "BAJA") a.dBaja += d; else a.dLav += d;
    if (sin) a.sinCasco = true;
    if (d) a.bal.push(`${r.estado === "BAJA" ? "Baja" : "Lavado"} · Fábrica: contado ${nf.format(r.fisico_cajas)} cajas · casco ${nf.format(r.cajas_casco)}`
      + `${r.ajuste_cajas ? ` + ajuste ${nf.format(r.ajuste_cajas)}` : ""} = ${nf.format(r.fisico_cajas - r.dif_cajas)} cajas × ${nf.format(u)} u se restan${sin ? " · sin casco registrado" : ""}`);
  }

  /* 4. LO GUARDADO: el ZEXI, las estibas del almacén y los movimientos 311. */
  /* El pend. baja NO se toma en cuenta en el cuadre de AG18 (sigue saliendo en su columna, solo informativa). */
  const sumarPend = false;
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
    /* El envase: contado − casco (= Balance de materiales). Sin el Balance, el lavado con baja suelto de antes. */
    const usaBM = usarBM && grupo === "ENVASE" && (BM_CON_LAVADO_CON_BAJA || !a.lav);
    const difBal = usaBM ? redondo(a.dBaja + a.dLav) : 0;
    const quita = usaBM ? -difBal : a.lav;
    const totalBruto = redondo(conteo + (sumarPend ? pendBaja : 0) + quita + a.andina + almacen);
    /* META NEGATIVA: el casco registrado es mayor que lo contado. SAP no puede tener negativo: la meta es 0 y lo que sobra de casco
       es una diferencia del Balance de casco, no algo que se mueva en SAP (ni un «falta» por mover). */
    const cascoDeMas = grupo === "ENVASE" && totalBruto < -0.005 ? -totalBruto : 0;
    const total = cascoDeMas ? 0 : totalBruto;
    const z = sap.get(a.codigo), m = mov.get(a.codigo);
    /* «Lo que no tiene SAP me tiene que decir que del 22 debo pasarlo al 18, ya que allá no tiene»: con ZEXI
       cargado, un material que no viene en él es 0 en SAP (no «sin dato»), y entra a la lista del 311 / 344. */
    const sapV = z ? Number(z.cantidad) : (guardado?.zexi?.length ? 0 : null);
    const movido = m ? Number(m.cantidad) : 0;
    const dif = sapV == null ? null : redondo(sapV - total);
    const sapDespues = sapV == null ? null : redondo(sapV + movido);
    const queda = sapDespues == null ? null : redondo(sapDespues - total);
    return { grupo, codigo: a.codigo, material: a.material, conteo: redondo(conteo), detalle, pendBaja, lavadoBaja: quita, difBalance: difBal, difBaja: usaBM ? a.dBaja : 0, difLavado: usaBM ? a.dLav : 0, sinCasco: usaBM && a.sinCasco, cpe: grupo === "ENVASE" ? cpe(a.codigo) : 0, andina: a.andina,
      almacen, otrosCajas: grupo === "ENVASE" ? a.otrosCajas : 0,
      conteoEstado: grupo === "ENVASE" ? { baja: redondo(a.est.baja), lavado: redondo(a.est.lavado), otros: redondo(a.est.otros) } : undefined, upc: grupo === "ENVASE" ? upc(a.codigo) : 1, total, sap: sapV,
      libre: z?.libre ?? null, bloqueado: z?.bloqueado ?? null, calidad: z?.calidad ?? null,
      enLibre: (grupo === "ENVASE" || grupo === "ESTIBA") && m?.libre != null ? redondo(m.libre) : null,
      ...(grupo === "CAJA" ? (() => {
        /* Lo que se sume a la caja fuera del conteo (pend. baja, Andina, lavado) va con lo bloqueado. */
        const libre = redondo(a.sueltas - a.sueltasBaja), calidad = redondo(a.conEnvase);
        const meta: Estados = { libre, calidad, bloqueado: redondo(total - libre - calidad) };
        const estadoFinal: Estados | null = m?.libre != null
          ? { libre: redondo(m.libre ?? 0), calidad: redondo(m.calidad ?? 0), bloqueado: redondo(m.bloqueado ?? 0) } : null;
        const igual = (x: number, y: number) => Math.abs(x - y) < 0.005;
        return { meta, estadoFinal, estadoOk: estadoFinal ? igual(estadoFinal.libre, meta.libre) && igual(estadoFinal.calidad, meta.calidad) && igual(estadoFinal.bloqueado, meta.bloqueado) : null };
      })() : { meta: null, estadoFinal: null, estadoOk: null }),
      ...(cascoDeMas ? { cascoDeMas: redondo(cascoDeMas) } : {}),
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
      if (usarBM && (BM_CON_LAVADO_CON_BAJA || !a.lav)) pon(a, "Dif. Balance", -(a.dBaja + a.dLav), "u", (a.bal.join(" · ") || "Sin diferencia") + (a.lav ? ` · el Lavado con baja del Casco (${nf.format(a.lavEst)} estibas) ya va dentro del casco del Balance` : ""));
      else pon(a, "Lavado con baja", a.lav, "u", `Casco AG18: ${nf.format(a.lavEst)} estibas en baja × ${nf.format(cpe(a.codigo))} cajas × ${nf.format(upc(a.codigo))} u · se restan`);
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
  const conteoBodega = [...bodega.values()].map((k) => ({ ...k, baja: redondo(k.baja), lavado: redondo(k.lavado), extrasucio: redondo(k.extrasucio), otros: redondo(k.otros) }));
  return { ...base, filas, guardado, estibasBodega, avisos, otros, envases, aplicados, excluidos, conteoBodega, ...hist };
}

/**
 * CUADRE SAP · AG22 — la base de Pasivos de AG22 del día contra el BLOQUEADO de SAP de AG22.
 *
 * «En el AG22 debe estar alineado al bloqueado de la existencia en SAP; toma como input la base: todo lo
 *  que es causal PRESORTING, ROTURA DE LINEA, LAVADO, EXTRASUCIO y BAJA PROYECTADA.» (y también DIF INV y SINIESTRO: son partidas del bloqueado.)
 *
 * TOTAL BASE de cada material = Σ unidades de Pasivos AG22 de esas causales ese día. Las demás causales
 * (ANDINA…) no entran y se avisan. DIFERENCIA = SAP bloqueado − total base. Aquí NO se cambia de almacén:
 * negativa → falta bloquear, pasar de LIBRE a BLOQUEADO en AG22; positiva → sobra bloqueado, pasar de
 * BLOQUEADO a LIBRE. El paso 3 es igual al de AG18 (la ZEXI nueva, su columna Bloqueado).
 *
 * CAJAS PLÁSTICAS (igual que AG18, pero SIN 311: aquí no se cambia de almacén): la meta de cada caja sale del CONTEO de Bodega 38
 * (todo lo que no es FABRICA_), por estado: suelta en BAJA → Bloqueado · suelta en RETORNO (u otro) → Libre · la caja que lleva el
 * envase → In control-cal. Se compara con la ZEXI de AG22 en sus tres estados y lo que falta sale en movimientos de estado (paso 3).
 * La base de Pasivos NO manda en las cajas.
 */
async function armarCuadreAG22(pedida?: string | null) {
  const supabase = await createClient();
  const dias = [...(await diasConPasivos())].sort().reverse();
  const fecha = pedida && dias.includes(pedida) ? pedida : (dias[0] ?? null);
  const base = { fecha, dias, filas: [] as FilaCuadre[], guardado: null as CuadreGuardado | null, estibasBodega: 0, avisos: [] as string[], error: null as string | null,
    faltaSql: false, historial: [] as DiaHistorial[], faltaHist: false,
    otros: [] as LineaOtros[], envases: [] as { codigo: string; material: string }[], aplicados: [] as Aplicado[], excluidos: null as PanelExcluidos | null, conteoBodega: [] as ConteoBodega[], partidas311: [] as Partida311[] };
  if (!fecha) return { ...base, ...(await leerHistorial(supabase)) };

  const [pas, prodR, maesR, guardR, hist, regla, movsR] = await Promise.all([
    leerPasivos(fecha, fecha),
    supabase.from("productos").select("sku, nombre, unidades_por_caja, cajas_por_estiba"),
    supabase.from("pasivos_maestro").select("codigo, descripcion, familia, unidades_por_caja, cajas_por_estiba, caja"),
    supabase.from("cuadre_sap").select("*").eq("fecha", fecha).eq("almacen", "AG22").maybeSingle(),
    leerHistorial(supabase),
    leerExcluidos("AG22"),
    supabase.from("cuadre_sap").select("almacen, movimientos, mov_archivo, mov_en").eq("fecha", fecha).in("almacen", ["AG18", "AG17", "AG16"]),
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
    /* Lo enviado desde la Validación de pasivo AG22 ya sale de conteo − base: no se cuenta doble ni se avisa. */
    if (esPendienteEnviado(f.causal)) continue;
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
  /* Las cajas plásticas no se cuadran con la base (su meta sale del conteo): si la base trae alguna, se avisa y no se usa. */
  const cajasDeLaBase = [...acc.values()].filter((a) => grupoDe(a.codigo) === "CAJA" && Object.values(a.partes).some((v) => v));
  if (cajasDeLaBase.length) avisos.push(`La base de Pasivos AG22 trae ${cajasDeLaBase.length} caja(s) plástica(s) (${cajasDeLaBase.map((a) => a.codigo).join(", ")}): no se usan; la meta de las cajas sale del conteo de Bodega 38.`);

  /* CAJAS PLÁSTICAS · lo contado en Bodega 38 (todo lo que no es de fábrica), para la meta por estado. */
  const cajasConteo = new Map<string, { material: string; sueltas: number; sueltasBaja: number; conEnvase: number }>();
  const cajaDe = (c: string, alt?: string | null) => {
    let k = cajasConteo.get(c);
    if (!k) { k = { material: nombre(c, alt), sueltas: 0, sueltasBaja: 0, conEnvase: 0 }; cajasConteo.set(c, k) }
    return k;
  };
  let hayConteo = false;
  {
    const { conteos, error: eC } = await diasConConteo();
    if (eC) avisos.push(`No pude leer el conteo (las cajas plásticas): ${eC}`);
    const cons = await consolidadoDelDia(fecha, conteos);
    if (cons.error) avisos.push(`No pude leer el conteo de ${fecha} (las cajas plásticas): ${cons.error}`);
    for (const r of await conReclasificaciones(cons.vigentes)) {
      if (r.tipo_material !== "ENVASE") continue;
      const c = String(r.codigo), cj = Number(r.total_cajas) || 0;
      if (excluye(regla, c, r.material)) continue;
      if (esUbicacionFabrica(r.calle) || esUbicacionFabrica(r.ubicacion) || esUbicacionFabrica(r.ubicacion_combinada)) continue;
      hayConteo = true;
      const g = grupoDe(c);
      if (g === "ESTIBA") continue;
      if (g === "CAJA") {
        const k = cajaDe(c, r.material); k.sueltas += cj;
        /* Suelta en BAJA → Bloqueado; en RETORNO (o cualquier otro estado) → Libre. */
        if (/BAJA/i.test(String(r.estado_envase ?? ""))) k.sueltasBaja += cj;
        continue;
      }
      /* La caja que lleva el envase → In control-cal, SOLO si el envase está en BAJA, LAVADO o EXTRASUCIO
         (salvo los envases cuya caja no entra al cuadre). El envase sano (RETORNO, NUEVO…) no mete su caja aquí. */
      if (!/BAJA|LAVAD|EXTRASUCIO/i.test(String(r.estado_envase ?? ""))) continue;
      const cj2 = M.get(c)?.caja;
      if (cj2 && !CAJA_FUERA_DEL_CUADRE.has(c)) cajaDe(String(cj2)).conEnvase += cj;
    }
    if (!hayConteo) avisos.push(`No hay conteo de Bodega 38 para ${fecha}: las cajas plásticas no se pueden armar por estado.`);
  }

  /* LOS 311 DEL DÍA en AG18 / AG17 / AG16 (lo que se subió en el paso 3 de cada uno). AUTOMÁTICO: lo que ENTRÓ a ese almacén SALIÓ de AG22 (resta) y lo que SALIÓ de ese almacén ENTRÓ a AG22 (suma). */
  const partidas311: Partida311[] = [];
  for (const r of ((movsR.data ?? []) as { almacen: string; movimientos: MovFila[] | null; mov_archivo: string | null; mov_en: string | null }[])) {
    if (r.almacen !== "AG18" && r.almacen !== "AG17" && r.almacen !== "AG16") continue;
    for (const m of r.movimientos ?? []) {
      const cantidad = Number(m.cantidad);
      if (!Number.isFinite(cantidad) || Math.abs(cantidad) < 1e-9) continue;
      const codigo = String(m.codigo);
      partidas311.push({ clave: `${r.almacen}|${codigo}`, almacen: r.almacen, codigo, material: nombre(codigo), cantidad: redondo(cantidad), efecto: redondo(-cantidad),
        documentos: m.documentos ?? [], archivo: r.mov_archivo, hora: r.mov_en });
    }
  }
  partidas311.sort((x, y) => x.almacen.localeCompare(y.almacen) || x.codigo.localeCompare(y.codigo));
  /* Lo que se hizo en AG18, AG17 y AG16 entra solo a AG22, PERO solo en un día que todavía no se ha trabajado:
     si ya se guardó el balanceo, ya hay ZEXI nueva (paso 3), ya hay archivo de movimientos de SAP o ya se guardó una selección,
     se queda EXACTAMENTE como estaba (nada de lo ya cuadrado se mueve). */
  const diaSinTrabajar = !!guardado && guardado.ajustes311 == null && !guardado.cierre && !guardado.movimientos?.length && !guardado.movs_sap;
  const elegidas311 = new Set(diaSinTrabajar ? partidas311.map((x) => x.clave) : (guardado?.ajustes311 ?? []).map(String));
  const ajuste311 = new Map<string, number>();
  for (const x of partidas311) if (elegidas311.has(x.clave)) ajuste311.set(x.codigo, redondo((ajuste311.get(x.codigo) ?? 0) + x.efecto));
  /* EL ARCHIVO DE MOVIMIENTOS DE SAP: ya viene neto en AG22 (+ entró, − salió) y se aplica solo. Si un material está en el archivo, ese valor manda
     (las partidas escogidas de ese material no se cuentan otra vez). */
  const movsSap = guardado?.movs_sap ?? null;
  const delArchivo = new Map<string, MovFila>();
  for (const f of movsSap?.filas ?? []) { const c = String(f.codigo); const v = Number(f.cantidad); if (c && Number.isFinite(v) && Math.abs(v) > 1e-9) delArchivo.set(c, f) }
  for (const [c, f] of delArchivo) ajuste311.set(c, redondo(Number(f.cantidad)));

  const sap = new Map((guardado?.zexi ?? []).map((z) => [String(z.codigo), z]));
  const mov = new Map((guardado?.movimientos ?? []).map((m) => [String(m.codigo), m]));
  const fueraNuevos = new Set<string>();
  for (const z of sap.values()) { if (excluye(regla, z.codigo, z.descripcion ?? nombre(String(z.codigo)))) { fueraNuevos.add(String(z.codigo)); continue } de(String(z.codigo), z.descripcion) }
  for (const m of mov.values()) if (!excluye(regla, m.codigo, nombre(String(m.codigo)))) de(String(m.codigo));
  for (const c of ajuste311.keys()) de(c);
  for (const [c, k] of cajasConteo) if (k.sueltas || k.conEnvase) de(c, k.material);
  const excluidos = panelExcluidos(regla, catalogo(M, P), fueraNuevos);

  const filas: FilaCuadre[] = [...acc.values()].map((a) => {
    const grupo = grupoDe(a.codigo);
    const z = sap.get(a.codigo), m = mov.get(a.codigo);
    /* CAJA PLÁSTICA: la meta sale del conteo de Bodega 38, por estado; «total» = lo que debe estar BLOQUEADO (la suelta en BAJA). */
    const kc = grupo === "CAJA" ? (cajasConteo.get(a.codigo) ?? { material: a.material, sueltas: 0, sueltasBaja: 0, conEnvase: 0 }) : null;
    const meta: Estados | null = kc ? { libre: redondo(kc.sueltas - kc.sueltasBaja), calidad: redondo(kc.conEnvase), bloqueado: redondo(kc.sueltasBaja) } : null;
    /* CAJA PLÁSTICA en AG22: no hay 311 (no se cambia de almacén): solo se balancean los ESTADOS dentro de AG22. «total» es todo lo contado en Bodega 38
       (libre + control-cal + bloqueado) y SAP = los tres estados de la ZEXI: lo que no cuadre en cantidad es una DIFERENCIA DE INVENTARIO (solo informativa). */
    const total = meta ? redondo(meta.libre + meta.calidad + meta.bloqueado) : redondo(Object.values(a.partes).reduce((t, v) => t + v, 0));
    /* «Lo que no tiene SAP me tiene que decir que del 22 debo pasarlo al 18, ya que allá no tiene»: con ZEXI
       cargado, un material que no viene en él es 0 en SAP (no «sin dato»), y entra a la lista del 311 / 344. */
    const sapZexi = z ? (meta && z.libre != null ? redondo((z.libre ?? 0) + (z.calidad ?? 0) + (z.bloqueado ?? 0)) : Number(z.cantidad)) : (guardado?.zexi?.length ? 0 : null);
    /* Los 311 escogidos se suman o restan a la ZEXI de las 6 AM. Con la ZEXI nueva ya cargada (paso 3) «lo movido» trae esos 311: se parte de la ZEXI tal cual, sin contarlos dos veces. */
    const aj = ajuste311.get(a.codigo) ?? 0;
    const sapV = sapZexi == null ? null : redondo(sapZexi + aj);
    const movido = m ? Number(m.cantidad) : 0;
    const dif = sapV == null ? null : redondo(sapV - total);
    const sapDespues = sapZexi == null ? null : redondo((m ? sapZexi : sapZexi + aj) + movido);
    const queda = sapDespues == null ? null : redondo(sapDespues - total);
    const estadoFinal: Estados | null = meta && m?.libre != null ? { libre: redondo(m.libre ?? 0), calidad: redondo(m.calidad ?? 0), bloqueado: redondo(m.bloqueado ?? 0) } : null;
    /* Balanceado en estados = ningún estado falta mientras otro sobra (si la cantidad total no cuadra es diferencia de inventario, no hay nada más que mover). */
    /* AG22: LIBRE NO SE EVALÚA. Control-cal = conteo y bloqueado >= lo contado en BAJA (si SAP tiene de más ahí, está bien). */
    const mismoLado = (e: Estados, m: Estados) => Math.abs(e.calidad - m.calidad) <= 0.5 && e.bloqueado - m.bloqueado >= -0.5;
    return { grupo, codigo: a.codigo, material: a.material, conteo: total, detalle: meta ? `Bodega 38 · libre ${redondo(meta.libre)} · control-cal ${redondo(meta.calidad)} · bloqueado ${redondo(meta.bloqueado)}` : null,
      pendBaja: 0, lavadoBaja: 0, andina: 0, almacen: 0,
      otrosCajas: 0, upc: grupo === "ENVASE" ? upc(a.codigo) : 1, partes: meta ? {} : a.partes,
      total, sap: sapV, dif, movido, documentos: m?.documentos ?? [], sapDespues, queda,
      ...(aj ? { ajuste311: aj, sapZexi } : {}),
      ...(meta ? { libre: z?.libre ?? null, bloqueado: z?.bloqueado ?? null, calidad: z?.calidad ?? null, meta, estadoFinal,
        estadoOk: estadoFinal ? mismoLado(estadoFinal, meta) : null } : {}) };
  })
    /* Una caja plástica solo se lista si algo la cuenta (conteo, bloqueado de SAP o lo movido): su libre de SAP, solo, no es ruido que mostrar. */
    .filter((f) => f.grupo === "CAJA" ? (f.meta != null && (f.meta.libre !== 0 || f.meta.calidad !== 0 || f.meta.bloqueado !== 0)) || (f.sap ?? 0) !== 0 || f.movido !== 0
      : f.total !== 0 || (f.sap ?? 0) !== 0 || f.movido !== 0)
    .sort((x, y) => "ENVASE CAJA ESTIBA".indexOf(x.grupo) - "ENVASE CAJA ESTIBA".indexOf(y.grupo) || x.codigo.localeCompare(y.codigo));

  /* De dónde sale cada cifra: lo de cada causal de la base. */
  const listados = new Set(filas.map((f) => f.codigo));
  const aplicados: Aplicado[] = [];
  for (const a of [...acc.values()].filter((x) => listados.has(x.codigo)).sort((x, y) => x.codigo.localeCompare(y.codigo)))
    for (const c of CAUSALES_AG22) if (a.partes[c])
      aplicados.push({ codigo: a.codigo, material: a.material, que: c, cantidad: redondo(a.partes[c]), unidad: "u",
        porque: `Base de Pasivos · AG22 · ${[...(a.estados[c] ?? [])].join("/") || "—"} · causal ${c} del día` });

  for (const [c, v] of ajuste311) {
    const a = acc.get(c); if (!a || !listados.has(c)) continue;
    const fa = delArchivo.get(c);
    aplicados.push({ codigo: c, material: a.material, que: "311 aplicado a la ZEXI", cantidad: v, unidad: "u",
      porque: fa ? `Archivo de SAP ${movsSap?.archivo ?? ""}: ${v > 0 ? "entró a" : "salió de"} AG22 → ${v > 0 ? "suma" : "resta"}${fa.documentos?.length ? ` · doc ${fa.documentos.slice(0, 3).join(", ")}${fa.documentos.length > 3 ? "…" : ""}` : ""}` : partidas311.filter((x) => x.codigo === c && elegidas311.has(x.clave)).map((x) => `${x.almacen}: ${x.cantidad > 0 ? "entró" : "salió"} ${new Intl.NumberFormat("es-CO").format(Math.abs(x.cantidad))} → ${x.efecto > 0 ? "suma" : "resta"} en AG22`).join(" · ") });
  }

  return { ...base, filas, guardado: guardado && diaSinTrabajar ? { ...guardado, ajustes311: [...elegidas311] } : guardado, avisos, aplicados, excluidos, partidas311, ...hist };
}


/**
 * CUADRE SAP · AG17 (calle EXPORTACION) y AG16 (calle BTS) — el CONTEO de esa calle contra la ZEXI de SAP de su almacén.
 *
 * Simple, como se pidió: por material, lo contado en la calle (todo lo que se cuente allí) contra lo que SAP tiene en AG17 / AG16.
 *   · PRODUCTO       = cajas contadas.
 *   · ENVASE         = cajas contadas × unidades por caja (unidades).
 *   · CAJA PLÁSTICA  = cajas contadas.
 *   · ESTIBA 3500163 = las sueltas + 1 por cada estiba contada debajo del material (y 1 por renglón con saldo o sueltas), como AG18.
 * DIFERENCIA = SAP − CONTEO = el 311 con AG22 (el mismo flujo de AG18): negativa → pasar de AG22 a este almacén; positiva → de este almacén a AG22.
 * Como AG18, el envase, las cajas plásticas y las estibas van BLOQUEADOS (el 311 los deja en libre: falta el 344 o el balance por estado de las cajas). No hay pasivos, casco, OTROS ni estibas de almacén. Con la ZEXI nueva: «SAP después» = SAP + lo movido y «queda» = SAP después − conteo.
 * La ZEXI y el balanceo guardado salen de la misma tabla (cuadre_sap, una fila por día y almacén).
 */
async function armarCuadreSimple(pedida: string | null | undefined, almacen: AlmacenSimple) {
  const supabase = await createClient();
  const { dias, conteos, error: e0 } = await diasConConteo();
  const fecha = pedida && dias.includes(pedida) ? pedida : (dias[0] ?? null);
  const base = { fecha, dias, filas: [] as FilaCuadre[], guardado: null as CuadreGuardado | null, estibasBodega: 0, avisos: [] as string[], error: e0, faltaSql: false, historial: [] as DiaHistorial[], faltaHist: false,
    otros: [] as LineaOtros[], envases: [] as { codigo: string; material: string }[], aplicados: [] as Aplicado[], excluidos: null as PanelExcluidos | null, conteoBodega: [] as ConteoBodega[], partidas311: [] as Partida311[] };
  if (!fecha) return { ...base, ...(await leerHistorial(supabase)) };

  const [cons, prodR, maesR, guardR, hist] = await Promise.all([
    consolidadoDelDia(fecha, conteos, almacen),
    supabase.from("productos").select("sku, nombre, unidades_por_caja, cajas_por_estiba"),
    supabase.from("pasivos_maestro").select("codigo, descripcion, familia, unidades_por_caja, cajas_por_estiba, caja"),
    supabase.from("cuadre_sap").select("*").eq("fecha", fecha).eq("almacen", almacen).maybeSingle(),
    leerHistorial(supabase),
  ]);
  if (guardR.error && /cuadre_sap|does not exist|PGRST205/i.test(`${guardR.error.code} ${guardR.error.message}`)) return { ...base, faltaSql: true };
  const avisos: string[] = [];
  if (cons.error) avisos.push(`No pude leer el conteo: ${cons.error}`);
  if (maesR.error) avisos.push(`No pude leer el maestro de Pasivos (factores): ${maesR.error.message}`);

  const guardado = (guardR.data ?? null) as CuadreGuardado | null;
  const P = new Map(((prodR.data ?? []) as Prod[]).map((p) => [String(p.sku), p]));
  const M = new Map(((maesR.data ?? []) as Maes[]).map((m) => [String(m.codigo), m]));
  const upc = (c: string) => Number(M.get(c)?.unidades_por_caja ?? P.get(c)?.unidades_por_caja ?? 1) || 1;
  const nombre = (c: string, alt?: string | null) => M.get(c)?.descripcion ?? P.get(c)?.nombre ?? alt ?? c;
  const esCaja = (c: string, mat?: string | null) => (M.get(c)?.familia ?? "").toUpperCase() === "CAJA" || /CAJA\s+PL/i.test(mat ?? "");

  type Ac = { codigo: string; material: string; grupo: Grupo; total: number; cajas: number; estibas: number };
  const acc = new Map<string, Ac>();
  const de = (c: string, grupo: Grupo, alt?: string | null) => {
    let a = acc.get(c);
    if (!a) { a = { codigo: c, material: nombre(c, alt), grupo, total: 0, cajas: 0, estibas: 0 }; acc.set(c, a) }
    return a;
  };
  let estSueltas = 0, estBajo = 0;
  for (const r of await conReclasificaciones(cons.vigentes)) {
    const c = String(r.codigo), cajas = Number(r.total_cajas) || 0;
    if (c === ESTIBA) { estSueltas += cajas; continue }
    /* La estiba de madera de debajo: una por estiba contada y una por renglón con saldo o sueltas. */
    estBajo += (Number(r.estibas) || 0) + ((Number(r.cajas) || 0) + (Number(r.saldo) || 0) > 0 ? 1 : 0);
    const grupo: Grupo = r.tipo_material === "PRODUCTO" ? "PRODUCTO" : esCaja(c, r.material) ? "CAJA" : "ENVASE";
    const a = de(c, grupo, r.material);
    a.cajas += cajas;
    a.total += grupo === "ENVASE" ? cajas * upc(c) : cajas;
  }
  const sap = new Map((guardado?.zexi ?? []).map((z) => [String(z.codigo), z]));
  const mov = new Map((guardado?.movimientos ?? []).map((m) => [String(m.codigo), m]));
  for (const z of sap.values()) { const c = String(z.codigo); if (c !== ESTIBA && !acc.has(c)) de(c, esCaja(c, z.descripcion) ? "CAJA" : M.has(c) ? "ENVASE" : "PRODUCTO", z.descripcion) }
  for (const m of mov.values()) { const c = String(m.codigo); if (c !== ESTIBA && !acc.has(c)) de(c, esCaja(c) ? "CAJA" : M.has(c) ? "ENVASE" : "PRODUCTO") }

  const filas: FilaCuadre[] = [...acc.values()].map((a) => {
    const z = sap.get(a.codigo);
    const sapV = z ? Number(z.cantidad) : (guardado?.zexi?.length ? 0 : null);
    const total = redondo(a.total);
    const dif = sapV == null ? null : redondo(sapV - total);
    const movido = mov.get(a.codigo) ? Number(mov.get(a.codigo)!.cantidad) : 0;
    const sapDespues = sapV == null ? null : redondo(sapV + movido);
    const queda = sapDespues == null ? null : redondo(sapDespues - total);
    /* CAJA PLÁSTICA: como el envase, TODO debe quedar BLOQUEADO (meta = libre 0 · control-cal 0 · bloqueado = lo contado). Se balancea por estado como en AG18. */
    const meta: Estados | null = a.grupo === "CAJA" ? { libre: 0, calidad: 0, bloqueado: total } : null;
    const m0 = mov.get(a.codigo);
    const estadoFinal: Estados | null = meta && m0?.libre != null ? { libre: redondo(m0.libre ?? 0), calidad: redondo(m0.calidad ?? 0), bloqueado: redondo(m0.bloqueado ?? 0) } : null;
    const igual = (x: number, y: number) => Math.abs(x - y) < 0.005;
    return { grupo: a.grupo, codigo: a.codigo, material: a.material, conteo: total,
      detalle: a.grupo === "ENVASE" ? `${nf.format(a.cajas)} cajas × ${nf.format(upc(a.codigo))} u` : `${nf.format(a.cajas)} cajas`,
      pendBaja: 0, andina: 0, almacen: 0, lavadoBaja: 0, otrosCajas: 0, upc: a.grupo === "ENVASE" ? upc(a.codigo) : 1, total, sap: sapV,
      libre: z?.libre ?? null, bloqueado: z?.bloqueado ?? null, calidad: z?.calidad ?? null,
      /* Como AG18: el envase va BLOQUEADO; si con la ZEXI nueva queda algo en libre, falta el 344. */
      enLibre: a.grupo === "ENVASE" && mov.get(a.codigo)?.libre != null ? redondo(mov.get(a.codigo)!.libre ?? 0) : null, meta, estadoFinal,
      estadoOk: estadoFinal && meta ? igual(estadoFinal.libre, meta.libre) && igual(estadoFinal.calidad, meta.calidad) && igual(estadoFinal.bloqueado, meta.bloqueado) : null,
      dif, movido, documentos: mov.get(a.codigo)?.documentos ?? [], sapDespues, queda };
  });
  /* La estiba de madera (3500163), siempre en la lista. */
  {
    const z = sap.get(ESTIBA);
    const total = redondo(estSueltas + estBajo);
    const sapV = z ? Number(z.cantidad) : (guardado?.zexi?.length ? 0 : null);
    const dif = sapV == null ? null : redondo(sapV - total);
    const movido = mov.get(ESTIBA) ? Number(mov.get(ESTIBA)!.cantidad) : 0;
    const sapDespues = sapV == null ? null : redondo(sapV + movido);
    const queda = sapDespues == null ? null : redondo(sapDespues - total);
    filas.push({ grupo: "ESTIBA", codigo: ESTIBA, material: nombre(ESTIBA), conteo: total,
      detalle: `${nf.format(estSueltas)} sueltas + ${nf.format(estBajo)} bajo el material`,
      pendBaja: 0, andina: 0, almacen: 0, lavadoBaja: 0, otrosCajas: 0, upc: 1, total, sap: sapV,
      libre: z?.libre ?? null, bloqueado: z?.bloqueado ?? null, calidad: z?.calidad ?? null,
      /* La estiba también va BLOQUEADA: si con la ZEXI nueva queda algo en libre, falta el 344. */
      enLibre: mov.get(ESTIBA)?.libre != null ? redondo(mov.get(ESTIBA)!.libre ?? 0) : null, meta: null, estadoFinal: null, estadoOk: null,
      dif, movido, documentos: mov.get(ESTIBA)?.documentos ?? [], sapDespues, queda });
  }
  const orden = ["PRODUCTO", "ENVASE", "CAJA", "ESTIBA"];
  const lista = filas.filter((f) => f.total !== 0 || (f.sap ?? 0) !== 0 || f.movido !== 0 || f.codigo === ESTIBA)
    .sort((x, y) => orden.indexOf(x.grupo) - orden.indexOf(y.grupo) || x.codigo.localeCompare(y.codigo));
  if (!cons.vigentes.length) avisos.push(`Ese día no se contó nada en la calle ${almacen === "AG17" ? "EXPORTACION" : "BTS"} (${almacen}).`);
  return { ...base, filas: lista, guardado, avisos, ...hist };
}
