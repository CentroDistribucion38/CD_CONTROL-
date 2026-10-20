import { envaseDelRenglon } from "@/modulos/inventario/corte";
import { createClient } from "@/lib/supabase/server";
import { consolidadoDelDia, diasConConteo } from "@/modulos/inventario/balance";
import { armarCuadre } from "@/modulos/inventario/cuadre";
import { conReclasificaciones } from "@/modulos/inventario/reclasificaciones";
import { esUbicacionFabrica } from "@/modulos/casco/ubicacion-sitio";
import { leerPasivos } from "@/modulos/pasivos/datos";
import { excluye } from "@/modulos/pasivos/excluidos";
import { leerExcluidos } from "@/modulos/pasivos/excluidos-leer";
import { NUEVO_PARTIDA } from "./compensa";
import { CAJA_EN_DEPA, lineaDeDepa } from "./depa";

/**
 * EL ANÁLISIS DE DIFERENCIA DE BODEGA 38 — la hoja CONTEOS + la tabla dinámica de 2026.10.14_BODEGA_38.xlsx.
 *
 * Por código, en unidades (cajas plásticas y estibas por unidad), dos lados:
 *   CONTEO = conteo del día en Bodega 38 (AG22; la caja plástica en la que va el producto
 *            también cuenta como caja) + DEPA (corte inicial del día)
 *          + Pasivos AG22 (PRESORTING, ROTURA DE LINEA, EXTRASUCIO)
 *          + novedades de la plantilla que suman al conteo.
 *          + BALANCE (lo que se movió por 311 contra AG22 en los Cuadres SAP de AG18, AG17 y AG16, hacia AG22) y DESCUADRE (lo que
 *            quedó sin cuadrar en cada uno: se refleja aparte para que nada quede por fuera).
 *   SAP    = ZEXI 6 AM (plantilla, AG22) + el BALANCE y el DESCUADRE que van del lado SAP + novedades que suman a SAP.
 *   DIFERENCIA = CONTEO − SAP.
 * Cada lado guarda de qué partida sale cada número, para abrir el detalle.
 */
export type Partida = { nombre: string; cantidad: number };
export type FilaAnalisis = {
  familia: string; orden: number; codigo: string; descripcion: string;
  sap: number; conteo: number; diferencia: number;
  deSap: Partida[]; deConteo: Partida[];
  /** Lo que QUEDÓ sin cuadrar en AG18, AG17 o AG16 después de los 311 (SAP después − conteo; + SAP de más, − SAP de menos). Se ve aunque la diferencia total salga en cero. */
  descuadres?: { alm: string; queda: number }[];
  /** El BALANCE y el DESCUADRE del lado SAP que todavía NO están sumados porque la plantilla no trae la ZEXI de las 6: se ven, pero no suman. */
  pendSap?: Partida[];
  /** Solo la estiba 3500163: las estibas de Fábrica, AG17 y AG16, por partida. Ya están cuadradas en el Cuadre SAP de su almacén: NO suman aquí, se muestran para que el total dé el del tablero. */
  fuera?: Partida[];
  /** Códigos excluidos o sin factor: se muestran para que el conteo salga COMPLETO, pero no generan ajustes. */
  soloConteo?: boolean;
};
export type Novedad = {
  fecha: string; tipo: string; lado: "CONTEO" | "SAP" | "NO SUMA"; documento: string | null; codigo: string;
  unidades: number; caja_codigo: string | null; cajas: number | null; archivo: string | null; subido_en?: string;
};
/** Lo contado ese día, sin segregar (producto, envase, cajas vacías…), para compararlo con el tablero del libro de inventario. */
export type TotConteo = { renglones: number; cajas: number; estibas: number; plasticas: number };
export type Fuente = { nombre: string; ok: boolean; detalle: string };
export type Analisis = {
  fecha: string; filas: FilaAnalisis[]; fuentes: Fuente[]; avisos: string[];
  novedades: Novedad[]; noEntran: string[]; faltaSql: boolean;
  carga: { archivo: string | null; filas: number; subido_en: string | null } | null;
  /** SKUs distintos contados en Bodega ese día (sin FÁBRICA), para tener la visual del conteo. */
  contados?: { skus: number; producto: number; envase: number; otros: number; renglones: number; totales?: { donde: Record<string, TotConteo>; estibasAnalisis: number; plasticasAnalisis: number } };
  /** La ZEXI de AG18 del Cuadre SAP de ese día, con lo que hay en cada estado (para tenerlo a la vista). */
  existencias?: Existencias | null;
  /** EN LÍNEA: por código de envase o de caja plástica, los SKU que el plan de envase pone a correr ese día.
      Esos códigos son difíciles de cuadrar porque la línea está tomando envase mientras se cuenta. */
  enLinea?: Record<string, EnLinea[]>;
};
/** Un SKU del plan de envase que corre ese día y usa el envase (o la caja) de la fila. */
export type EnLinea = { tren: string; sap: string; sku: string; turnos: number[]; por: "envase" | "caja" };
export type FilaExistencia = { codigo: string; descripcion: string; libre: number | null; calidad: number | null; bloqueado: number | null; total: number };
export type Existencias = { archivo: string | null; en: string | null; conEstados: boolean; filas: FilaExistencia[] };

type Maes = { codigo: string; descripcion: string; familia: string | null; unidades_por_caja: number | null; cajas_por_estiba: number | null; caja: string | null };
type Prod = { id: string; sku: string; nombre: string | null; unidades_por_caja: number | null; cajas_por_estiba: number | null; envase_sku: string | null };

const ESTIBA = "3500163";
/** Envases cuya caja NO se suma a la caja plástica (como en el Excel de Fábrica y en el Cuadre SAP): la botella 850 (3501539) va en la caja 1000 x13 (3501211) pero esa caja no se cuenta. */
const CAJA_FUERA_DEL_CUADRE = new Set(["3501539"]);
/* PRODUCTOS QUE VAN EN NUESTRA CAJA PLÁSTICA AUNQUE EL MAESTRO NO LES TENGA ENVASE: producto → caja. El Aguila NRB 750 x16 (21187, Tw)
   no tiene envase asignado (se lee como no retornable) pero viaja en la caja plástica marrón de 750 (3500374): sus 36 cajas por estiba cuentan.
   Lo correcto a largo plazo es asignarle su envase en el maestro de productos; hasta entonces, aquí. */
const CAJA_DE_PRODUCTO_SIN_ENVASE: Record<string, string> = { "21187": "3500374" };
const norm = (c: unknown) => String(c ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const diaBogota = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date(iso));
const PASIVOS: Record<string, string> = { "PRESORTING": "PEND BAJA PRESORTING", "ROTURA DE LINEA": "PEND BAJA ROTURA LINEA", "EXTRASUCIO": "CON BAJA EXTRASUCIO" };

export async function armarAnalisis(fecha: string): Promise<Analisis> {
  const supabase = await createClient();
  const avisos: string[] = [];
  const [{ conteos }, maesR, prodR, pas, novR, cortesR, regla, planR] = await Promise.all([
    diasConConteo(),
    supabase.from("pasivos_maestro").select("codigo, descripcion, familia, unidades_por_caja, cajas_por_estiba, caja"),
    supabase.from("productos").select("id, sku, nombre, unidades_por_caja, cajas_por_estiba, envase_sku").limit(5000),
    leerPasivos(fecha, fecha),
    supabase.from("analisis_dif_novedades").select("fecha, tipo, lado, documento, codigo, unidades, caja_codigo, cajas, archivo, subido_en").eq("fecha", fecha).order("id"),
    supabase.from("inv_cortes").select("id, tipo, cortado_en").eq("tipo", "inicial")
      .gte("cortado_en", new Date(`${fecha}T00:00:00-05:00`).toISOString())
      .lt("cortado_en", new Date(new Date(`${fecha}T00:00:00-05:00`).getTime() + 86400000).toISOString())
      .order("cortado_en").limit(50),
    leerExcluidos("AG22"),
    /* EL PLAN DE ENVASE DEL DÍA: qué SKU corre en cada tren (Recepción · Plan de envase). Si no hay plan o no se
       puede ver, el análisis sale igual, solo que sin la marca de «en línea». */
    supabase.from("plan_envase_bloques").select("tren, sap, turno").eq("fecha", fecha).limit(2000),
  ]);
  const faltaSql = !!novR.error && /analisis_dif|does not exist|PGRST205/i.test(`${novR.error.code} ${novR.error.message}`);
  const M = new Map(((maesR.data ?? []) as Maes[]).map((m) => [String(m.codigo), m]));
  const P = new Map(((prodR.data ?? []) as Prod[]).map((p) => [String(p.sku), p]));
  const porId = new Map(((prodR.data ?? []) as Prod[]).map((p) => [String(p.id), p]));
  const upc = (c: string) => Number(M.get(c)?.unidades_por_caja ?? P.get(c)?.unidades_por_caja ?? 1) || 1;
  const nombre = (c: string) => M.get(c)?.descripcion ?? P.get(c)?.nombre ?? c;
  const grupo = (c: string) => {
    const f = norm(M.get(c)?.familia);
    if (c === ESTIBA || f === "ESTIBA") return "ESTIBA";
    if (f === "CAJA") return "CAJA";
    return "ENVASE";
  };

  /* La estiba se agrupa por lo que lleva encima: envase, cilindro, barril, cajas, producto. */
  const bajoQue = (c: string) => { const n = norm(nombre(c)); return n.includes("CILINDRO") ? "CONTEO · bajo cilindro" : n.includes("BARRIL") ? "CONTEO · bajo barril" : "CONTEO · bajo envase"; };

  /* Acumulador: código → lado → partida → cantidad. */
  const acc = new Map<string, { sap: Map<string, number>; conteo: Map<string, number> }>();
  const suma = (lado: "sap" | "conteo", codigo: string, partida: string, cant: number) => {
    if (!codigo || !cant) return;
    const a = acc.get(codigo) ?? { sap: new Map(), conteo: new Map() };
    a[lado].set(partida, (a[lado].get(partida) ?? 0) + cant);
    acc.set(codigo, a);
  };
  const fuentes: Fuente[] = [];

  /* 1. EL CONTEO DEL DÍA EN BODEGA 38 (AG22): envase en unidades; su caja plástica y la estiba de debajo por unidad.
        Se leen también Fábrica, AG17 y AG16, pero solo para el total sin segregar (el del tablero): no suman al análisis. */
  type Donde = "BODEGA" | "FÁBRICA" | "AG17" | "AG16";
  type Reng = Awaited<ReturnType<typeof consolidadoDelDia>>["vigentes"][number];
  const [cons, c17, c16] = await Promise.all([
    consolidadoDelDia(fecha, conteos),
    consolidadoDelDia(fecha, conteos, "AG17"),
    consolidadoDelDia(fecha, conteos, "AG16"),
  ]);
  let renglones = 0;
  const skuP = new Set<string>(), skuE = new Set<string>(), skuO = new Set<string>();
  let renglonesTodos = 0;
  /* La caja plástica que lleva el producto: cuántas cajas y de cuántos productos salieron. */
  let cajasProducto = 0; const prodConCaja = new Set<string>(), prodSinEnvase = new Set<string>();
  /* Las estibas de lo que NO entra a este análisis (Fábrica, AG17, AG16): ya están cuadradas en su propio Cuadre SAP; se anotan aparte para el total. */
  const estFuera = new Map<string, number>();
  const vacio = (): TotConteo => ({ renglones: 0, cajas: 0, estibas: 0, plasticas: 0 });
  const totD: Record<Donde, TotConteo> = { BODEGA: vacio(), "FÁBRICA": vacio(), AG17: vacio(), AG16: vacio() };
  const lotes: { rs: Reng[]; fijo: Donde | null }[] = [{ rs: cons.vigentes, fijo: null }, { rs: c17.vigentes, fijo: "AG17" }, { rs: c16.vigentes, fijo: "AG16" }];
  for (const lote of lotes) for (const r of await conReclasificaciones(lote.rs)) {
    const esFab = esUbicacionFabrica(r.calle) || esUbicacionFabrica(r.ubicacion) || esUbicacionFabrica(r.ubicacion_combinada);
    const donde: Donde = lote.fijo ?? (esFab ? "FÁBRICA" : "BODEGA");
    /* El nombre de la partida lleva el origen cuando no es Bodega 38. */
    const pre = (base: string) => donde === "BODEGA" ? base : base === "CONTEO" ? `${donde} · conteo` : base.replace("CONTEO", donde);
    /* LOS TOTALES SIN SEGREGAR (como el tablero del libro): cajas, estibas físicas (completas + 1 si hay saldo) y cajas plásticas
       (todo lo que viaja en caja: producto, envase y caja vacía; sin barril ni madera). */
    {
      const t = totD[donde], cj = Number(r.total_cajas) || 0, m = String(r.material ?? "");
      t.renglones++; t.cajas += cj; t.estibas += (Number(r.estibas) || 0) + ((Number(r.cajas) || 0) + (Number(r.saldo) || 0) > 0 ? 1 : 0);
      if (!(r.tipo_material === "ENVASE" && !/CAJA\s*PL/i.test(m) && /BARRIL|ESTIBA/i.test(m))) t.plasticas += cj;
    }
    /* EL ANÁLISIS ES DE AG22 (Bodega 38): Fábrica, AG17 y AG16 se balancean en sus propios Cuadres SAP y llegan aquí por el BALANCE
       y por lo que quedó sin cuadrar en cada uno (DESCUADRE). Su conteo solo sirve para el total de referencia del tablero. */
    if (donde !== "BODEGA") {
      const cF = String(r.codigo), cjF = Number(r.total_cajas) || 0;
      const estF = (Number(r.estibas) || 0) + ((Number(r.cajas) || 0) + (Number(r.saldo) || 0) > 0 ? 1 : 0);
      const esEst = grupo(cF) === "ESTIBA";
      const que = esEst ? "estibas contadas" : r.tipo_material === "PRODUCTO" ? "bajo producto"
        : r.tipo_material === "ENVASE" && grupo(cF) === "CAJA" ? "bajo cajas" : bajoQue(cF).replace("CONTEO · ", "");
      const k = `${donde} · ${que}`;
      estFuera.set(k, (estFuera.get(k) ?? 0) + (esEst ? cjF : estF));
      continue;
    }
    /* La visual: cuántos SKUs distintos se contaron (producto, envase y lo demás). */
    renglonesTodos++;
    (r.tipo_material === "PRODUCTO" ? skuP : r.tipo_material === "ENVASE" ? skuE : skuO).add(String(r.codigo));
    /* LA ESTIBA 3500163 SUMA TODO LO QUE ESTÁ MONTADO EN ESTIBA: producto, envase, caja vacía, barril,
       cilindro… Cada renglón aporta sus estibas completas y una más si tiene cajas sueltas o saldo.
       Las estibas vacías contadas con su propio código entran tal cual. */
    const c = String(r.codigo), cajas = Number(r.total_cajas) || 0;
    const est = (Number(r.estibas) || 0) + ((Number(r.cajas) || 0) + (Number(r.saldo) || 0) > 0 ? 1 : 0);
    const g = grupo(c);
    if (g === "ESTIBA") { suma("conteo", c, pre("CONTEO · estibas contadas"), cajas); renglones++; continue }
    if (r.tipo_material === "PRODUCTO") {
      suma("conteo", ESTIBA, pre("CONTEO · bajo producto"), est);
      /* LA CAJA DEL PRODUCTO: cada caja de producto retornable va en una caja plástica, y esa caja se cuenta.
         El producto → su envase (maestro de productos) → la caja de ese envase (maestro de Pasivos). Si el envase
         está excluido (NR, foráneo…) o no tiene caja (lata, PET, NR), no aporta caja. EL PRODUCTO EN SÍ NO SE TOMA. */
      const env = P.get(c)?.envase_sku ? String(P.get(c)!.envase_sku) : null;
      const cajaFija = !env ? CAJA_DE_PRODUCTO_SIN_ENVASE[c] ?? null : null;
      if (!env && !cajaFija) prodSinEnvase.add(c);
      const cajaP = env ? (!CAJA_FUERA_DEL_CUADRE.has(env) && !excluye(regla, env, nombre(env)) ? M.get(env)?.caja : null) : cajaFija;
      if (cajaP && cajas) { suma("conteo", String(cajaP), pre(`CONTEO · en producto ${c} ${nombre(c)}`), cajas); cajasProducto += cajas; prodConCaja.add(c) }
      continue;
    }
    if (r.tipo_material !== "ENVASE") { suma("conteo", ESTIBA, pre(bajoQue(c)), est); continue }
    renglones++;
    if (g === "CAJA") {
      suma("conteo", c, pre("CONTEO · cajas vacías"), cajas);
      suma("conteo", ESTIBA, pre("CONTEO · bajo cajas"), est);
      continue;
    }
    /* Envase (también barril y cilindro): sus unidades y la estiba de debajo, siempre. */
    /* El envase contado en estado NUEVO va en su propia partida: es lo que se puede compensar con su NR nuevo. */
    suma("conteo", c, /NUEVO/.test(norm(r.estado_envase)) ? NUEVO_PARTIDA
      : donde === "BODEGA" ? "CONTEO" : `${donde} · ${String(r.ubicacion || r.calle || "conteo")}`, cajas * upc(c));
    suma("conteo", ESTIBA, pre(bajoQue(c)), est);
    /* Un envase excluido (foráneo, nuevo…) no aporta caja plástica: no viene en las nuestras. */
    if (excluye(regla, c, nombre(c))) continue;
    const caja = CAJA_FUERA_DEL_CUADRE.has(c) ? null : M.get(c)?.caja; if (caja) suma("conteo", String(caja), pre(`CONTEO · en ${c} ${nombre(c)}`), cajas);
  }
  fuentes.push({ nombre: "Conteo", ok: renglones > 0, detalle: renglones ? `${renglones} renglones de Bodega 38 (el tablero cuenta además Fábrica ${totD["FÁBRICA"].renglones} · AG17 ${totD.AG17.renglones} · AG16 ${totD.AG16.renglones})` : "No hay conteo enviado ese día" });
  /* Un producto sin envase en el maestro no aporta caja: se nombra para que se complete el maestro si es retornable. */
  if (prodConCaja.size || prodSinEnvase.size) fuentes.push({ nombre: "Caja del producto", ok: prodConCaja.size > 0,
    detalle: `${Math.round(cajasProducto).toLocaleString("es-CO")} cajas plásticas en ${prodConCaja.size} productos contados`
      + (prodSinEnvase.size ? ` · ${prodSinEnvase.size} productos sin envase en el maestro (lata, PET o falta completarlo; no aportan caja): ${[...prodSinEnvase].sort().slice(0, 12).join(", ")}${prodSinEnvase.size > 12 ? "…" : ""}` : "") });
  for (const e of [cons.error, c17.error, c16.error]) if (e) avisos.push(`No pude leer el conteo: ${e}`);

  /* 2. DEPA: los cortes iniciales del día. Por cada línea vale el primer corte
     que la trae. El envase es el anotado en el corte o, si no se anotó, el que el
     maestro le asigna al producto (igual que la pantalla de Corte). */
  const cortes = (cortesR.data ?? []) as { id: string; cortado_en: string }[];
  /* Las líneas de la DEPA que SÍ salieron del corte inicial: lo que la plantilla traiga de esas mismas líneas no se cuenta (saldría doble). */
  const depaDelCorte = new Set<string>();
  if (cortes.length) {
    const { data: rs } = await supabase.from("inv_corte_renglones").select("corte_id, linea, cajas_depa, envase_id, material_id").in("corte_id", cortes.map((c) => c.id));
    const orden = new Map(cortes.map((c, k) => [String(c.id), k]));
    const mats = ((prodR.data ?? []) as Prod[]).map((p) => ({ id: String(p.id), sku: String(p.sku), nombre: String(p.nombre ?? ""), envase_sku: p.envase_sku }));
    type R = { corte_id: string; linea: string; cajas_depa: number | null; envase_id: string | null; material_id: string | null };
    const filas = ((rs ?? []) as R[]).slice().sort((a, b) => (orden.get(String(a.corte_id)) ?? 0) - (orden.get(String(b.corte_id)) ?? 0));
    const corteDeLinea = new Map<string, string>();
    for (const x of filas) if (!corteDeLinea.has(x.linea)) corteDeLinea.set(x.linea, String(x.corte_id));
    const tomadas = new Set<string>(); const fuera: string[] = []; let primera = "";
    for (const x of filas) {
      if (corteDeLinea.get(x.linea) !== String(x.corte_id)) continue;
      const cj = Number(x.cajas_depa) || 0;
      if (!cj) continue;
      const e = envaseDelRenglon(x.envase_id ? String(x.envase_id) : null, x.material_id ? String(x.material_id) : null, mats);
      if (!e.m) { fuera.push(`${x.linea}: sin envase ni producto con envase en el maestro`); continue; }
      const env = e.m.sku, etq = `DEPA ${x.linea}`;
      suma("conteo", env, etq, cj * upc(env));
      const caja = CAJA_FUERA_DEL_CUADRE.has(env) ? null : CAJA_EN_DEPA[env] ?? M.get(env)?.caja; if (caja) suma("conteo", String(caja), etq, cj);
      tomadas.add(x.linea); depaDelCorte.add(norm(x.linea).replace(/\s+/g, ""));
      if (!primera) primera = String(x.corte_id);
    }
    for (const l of corteDeLinea.keys()) if (!tomadas.has(l) && !fuera.some((f) => f.startsWith(`${l}:`))) fuera.push(`${l}: depa en 0`);
    const c0 = cortes.find((c) => String(c.id) === primera) ?? cortes[0];
    const hora = new Date(c0.cortado_en).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });
    const ls = [...tomadas].sort().join(", ");
    fuentes.push({ nombre: "DEPA", ok: tomadas.size > 0, detalle: tomadas.size ? `corte inicial de las ${hora} · ${tomadas.size} líneas (${ls})${fuera.length ? ` · fuera: ${fuera.join("; ")}` : ""}` : `El corte inicial no trae depa: ${fuera.join("; ") || "sin renglones"}` });
  } else fuentes.push({ nombre: "DEPA", ok: false, detalle: "No hay corte inicial ese día" });

  /* 3. PASIVOS AG22: PRESORTING, ROTURA DE LINEA, EXTRASUCIO. */
  let nPas = 0;
  for (const f of pas.data) {
    if (String(f.almacen).toUpperCase() !== "AG22") continue;
    const etq = PASIVOS[norm(f.causal)]; if (!etq) continue;
    suma("conteo", String(f.codigo), etq, Number(f.unidades) || 0); nPas++;
  }
  fuentes.push({ nombre: "Pasivos AG22", ok: nPas > 0, detalle: nPas ? `${nPas} filas (presorting, rotura de línea, extrasucio)` : "Sin base de Pasivos ese día" });

  /* 4. LOS OTROS ALMACENES: el Cuadre SAP de AG18 (Fábrica), AG17 (EXPORTACION) y AG16 (BTS), cada uno balanceado contra su conteo.
        Lo que se movió por 311 contra AG22 entra como BALANCE («de AG22 a …» suma al CONTEO, «de … a AG22» a SAP). Lo que QUEDÓ sin
        cuadrar en ese almacén (no se puede pasar a AG22: el material está físicamente allá) entra como DESCUADRE, aparte y con el
        nombre del almacén, para que nada quede por fuera. Planeado = ejecutado + descuadre, así que el total es el mismo del Cuadre. */
  const cu = await armarCuadre(fecha, "AG18");
  const zx = cu.fecha === fecha ? cu.guardado?.zexi ?? null : null;
  /* Las estibas que están en el almacén AG18 (la tarjeta «Estibas en almacén AG18» del Cuadre SAP): se cuentan aparte, no estaban en el conteo.
     Entran al total del tablero (Bodega 38 + otros almacenes), pero NO suman al conteo de esta estiba. */
  const estAlmAG18 = cu.fecha === fecha ? Number(cu.guardado?.estibas_almacen ?? 0) || 0 : 0;
  if (estAlmAG18 > 0) estFuera.set("AG18 · estibas en el almacén (digitadas en el Cuadre SAP)", estAlmAG18);
  const existencias: Existencias | null = zx?.length ? {
    archivo: cu.guardado?.zexi_archivo ?? null, en: cu.guardado?.zexi_en ?? null,
    conEstados: zx.some((z) => z.libre != null || z.calidad != null || z.bloqueado != null),
    filas: zx.map((z) => ({ codigo: String(z.codigo), descripcion: z.descripcion ?? nombre(String(z.codigo)),
      libre: z.libre ?? null, calidad: z.calidad ?? null, bloqueado: z.bloqueado ?? null, total: Number(z.cantidad) || 0 }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
  } : null;
  const detBal: string[] = []; const sinZexiAlm: string[] = [];
  /* El lado SAP del BALANCE y del DESCUADRE se suma a la ZEXI de las 6: si la plantilla no la trae, SAP queda en 0 y esto se ve aparte. */
  const zexiOtros: { codigo: string; partida: string; cant: number }[] = [];
  /* Lo que cada Cuadre SAP dejó sin cuadrar (después de los 311): si un almacén queda con diferencia, el código lo muestra. */
  const descuadresAlm = new Map<string, { alm: string; queda: number }[]>();
  /* Una cantidad con la regla de siempre: positiva = «de AG22 a ese almacén» (suma al CONTEO); negativa = «de ese almacén a AG22» (suma a SAP). */
  const aplicar = (codigo: string, partida: string, t: number) => {
    if (Math.abs(t) < 0.005) return;
    if (t > 0) suma("conteo", codigo, partida, t); else zexiOtros.push({ codigo, partida, cant: -t });
  };
  for (const alm of ["AG18", "AG17", "AG16"] as const) {
    const c = alm === "AG18" ? cu : await armarCuadre(fecha, alm);
    if (c.fecha !== fecha || !c.guardado?.zexi?.length) { sinZexiAlm.push(alm); continue }
    let nb = 0, nd = 0;
    for (const f of c.filas) {
      /* El producto no se toma (AG17 y AG16 lo traen en cajas): solo envase, cajas plásticas y estibas. */
      if (f.grupo === "PRODUCTO" || f.dif == null) continue;
      const cod = String(f.codigo);
      /* La caja plástica ya quedó cuadrada en el Cuadre SAP de ese almacén: su BALANCE no entra al conteo de AG22 (solo lo de Bodega 38).
         Lo que quedara sin cuadrar sí se muestra, como DESCUADRE. */
      /* Un material que la ZEXI de antes no traía (SAP en 0), que nadie pidió mover (diferencia ≥ 0) y que la ZEXI nueva sí trae, NO es un movimiento:
         ya estaba en SAP. Ese sobrante va UNA sola vez, en el lado CONTEO (como BALANCE de ese almacén): no se repite como DESCUADRE en SAP. */
      const yaEstabaEnSap = f.sap === 0 && f.movido > 0.005 && (f.dif ?? 0) >= -0.5;
      if (yaEstabaEnSap) avisos.push(`${cod} ${nombre(cod)}: la ZEXI de antes de ${alm} no lo traía (SAP 0) y la nueva trae ${Math.round(f.movido).toLocaleString("es-CO")} u sin que el cuadre pidiera moverlas: ya estaba en SAP. Va una sola vez, en el CONTEO (BALANCE · ${alm}); no se repite como DESCUADRE.`);
      if (f.grupo !== "CAJA" && Math.abs(f.movido) >= 0.005) { aplicar(cod, `BALANCE · ${alm}`, f.movido); nb++ }
      /* CASCO DE MÁS: el casco registrado superó lo contado y el Cuadre dejó la meta en 0. Ese sobrante es del Balance de casco: se avisa, no es DESCUADRE. */
      if (f.cascoDeMas) avisos.push(`${cod} ${nombre(cod)}: en el Cuadre ${alm} el casco registrado supera lo contado en ${Math.round(f.cascoDeMas).toLocaleString("es-CO")} u. Esa diferencia va en el Balance de casco; no se pone como DESCUADRE en SAP.`);
      if (yaEstabaEnSap) continue;
      if (f.queda != null && Math.abs(f.queda) >= 0.5) {
        aplicar(cod, `DESCUADRE · ${alm}`, -f.queda); nd++;
        const l = descuadresAlm.get(cod) ?? []; l.push({ alm, queda: Math.round(f.queda) }); descuadresAlm.set(cod, l);
        if (!acc.has(cod)) acc.set(cod, { sap: new Map(), conteo: new Map() });
      }
    }
    detBal.push(`${alm}: ${nb} movidos · ${nd} sin cuadrar`);
  }
  fuentes.push({ nombre: "Balance y descuadre (Cuadre SAP)", ok: detBal.length > 0,
    detalle: detBal.length ? `${detBal.join(" · ")}${sinZexiAlm.length ? ` · sin ZEXI ese día: ${sinZexiAlm.join(", ")}` : ""}` : "Ningún Cuadre SAP (AG18, AG17, AG16) de ese día tiene ZEXI" });

  /* 5. LA PLANTILLA: novedades (y la ZEXI de las 6). */
  const novedades = ((novR.data ?? []) as Novedad[]);
  let hayZexi = false;
  /* Si la novedad (tipo + documento) ya trae sus cajas plásticas como filas propias, no se deduce caja
     de los envases: se contaría dos veces (así lo hace el Excel: la caja va escrita). */
  const grupoNv = (nv: Novedad) => `${norm(nv.tipo)}|${nv.documento ?? ""}`;
  const conCajaPropia = new Set(novedades.filter((nv) => grupo(String(nv.codigo)) === "CAJA").map(grupoNv));
  const depaPlantilla = new Set<string>(), depaIgnorada = new Set<string>();
  for (const nv of novedades) {
    if (nv.lado === "NO SUMA") continue;
    /* DEPA subida en la plantilla (no hay el dato directo): vale solo si esa línea no salió ya del corte inicial. */
    const lineaDepa = lineaDeDepa(nv.tipo);
    if (lineaDepa) {
      if (depaDelCorte.has(lineaDepa)) { depaIgnorada.add(lineaDepa); continue }
      depaPlantilla.add(lineaDepa);
    }
    const lado = nv.lado === "SAP" ? "sap" : "conteo";
    const etq = norm(nv.tipo) + (nv.documento ? ` · ${nv.documento}` : "");
    suma(lado, String(nv.codigo), norm(nv.tipo) === "ZEXI 6 AM" ? "ZEXI 6 AM" : etq, Number(nv.unidades) || 0);
    if (nv.caja_codigo && nv.cajas && !conCajaPropia.has(grupoNv(nv))) suma(lado, String(nv.caja_codigo), etq, Number(nv.cajas) || 0);
    if (norm(nv.tipo) === "ZEXI 6 AM") hayZexi = true;
  }
  if (depaIgnorada.size) avisos.push(`La plantilla trae DEPA de ${[...depaIgnorada].sort().join(", ")}, pero esas líneas ya salen del corte inicial: se usó el corte, no la plantilla.`);
  if (depaPlantilla.size) {
    const f = fuentes.find((x) => x.nombre === "DEPA");
    const ls = [...depaPlantilla].sort().join(", ");
    if (f) {
      if (f.ok) f.detalle += ` · y en la plantilla: ${ls}`;
      else { f.ok = true; f.detalle = `En la plantilla (no hay corte inicial): ${ls}` }
    }
  }
  /* Con la ZEXI de las 6 en la plantilla, el BALANCE y el DESCUADRE del lado SAP se suman a SAP. Sin ella SAP queda en 0 y se ven
     en el detalle de cada código (no se pierde ninguno). */
  const pendSap = new Map<string, Partida[]>();
  for (const b of zexiOtros) {
    if (hayZexi) { suma("sap", b.codigo, b.partida, b.cant); continue }
    if (!acc.has(b.codigo)) acc.set(b.codigo, { sap: new Map(), conteo: new Map() });
    const l = pendSap.get(b.codigo) ?? []; const e = l.find((x) => x.nombre === b.partida);
    if (e) e.cantidad += Math.round(b.cant); else l.push({ nombre: b.partida, cantidad: Math.round(b.cant) });
    pendSap.set(b.codigo, l);
  }
  if (pendSap.size) avisos.push(`SAP está en 0 porque la plantilla no trae la ZEXI de las 6 a. m. El BALANCE y el DESCUADRE de los Cuadres SAP de AG18, AG17 y AG16 que van del lado SAP (${pendSap.size} materiales) se ven en el detalle de cada código y se suman cuando subas la de las 6.`);
  const carga = novedades.length ? { archivo: novedades[0].archivo, filas: novedades.length, subido_en: novedades[0].subido_en ?? null } : null;
  fuentes.push({ nombre: "Plantilla", ok: novedades.length > 0, detalle: novedades.length ? `${novedades.length} filas · ${novedades[0].archivo ?? ""}` : "Falta subir la plantilla del día" });
  fuentes.push({ nombre: "ZEXI 6 AM", ok: hayZexi, detalle: hayZexi ? "En la plantilla" : "La plantilla no trae la ZEXI de las 6" });

  /* 6. LAS FILAS: por familia, como la tabla dinámica del Excel (hoja FAMILIAS):
        0   sin familia en el maestro     E01 cajas plásticas    E02 cilindros       E03 estibas
        E05 barriles                      E07 envase 175 a 330   E08 no retornable   E09 envase 750 y 1000
     Cilindro, barril y no retornable SÍ entran aunque estén en la lista de excluidos: esa lista es para que
     no aporten caja plástica, no para sacarlos del análisis. Fuera queda lo demás excluido (p. ej. Coronita). */
  const noEntran: string[] = [];
  const filas: FilaAnalisis[] = [];
  for (const [codigo, a] of acc) {
    const g = grupo(codigo);
    const u = upc(codigo);
    const n = norm(nombre(codigo));
    const fam = norm(M.get(codigo)?.familia);
    const especial: [string, number] | null =
      g === "CAJA" ? ["E01 · Cajas plásticas", 1]
      : g === "ESTIBA" ? ["E03 · Estibas", 3]
      : n.includes("CILINDRO") ? ["E02 · Cilindros", 2]
      : n.includes("BARRIL") ? ["E05 · Barriles", 4]
      : fam === "NO RETORNABLE" ? ["E08 · Envase no retornable", 6]
      : !M.has(codigo) ? ["0 · Sin familia en el maestro", 0]
      : null;
    /* EL CONTEO SALE COMPLETO: lo excluido o sin factor (lata, PET, foráneo…) también se lista, en su propia familia y
       marcado «solo conteo» (no genera ajustes). El PRODUCTO no se toma: de él solo cuentan su caja plástica y su estiba. */
    const soloConteo = !especial && (excluye(regla, codigo, nombre(codigo)) || u <= 1);
    const [familia, orden] = soloConteo ? ["X · Excluidos o sin factor (solo conteo)", 9]
      : especial ?? (u <= 16 ? ["E09 · Envase 750 y 1000", 7] : ["E07 · Envase 175 a 330", 5]);
    /* La estiba sale en el orden del proceso, no por tamaño. */
    const ORDEN_ESTIBA = ["CONTEO · bajo envase", "CONTEO · bajo cilindro", "CONTEO · bajo barril", "CONTEO · bajo cajas", "CONTEO · bajo producto", "CONTEO · estibas contadas"];
    const ORIGEN = ["FÁBRICA", "AG17", "AG16"];
    const pos = (n: string) => {
      if (codigo !== ESTIBA) return 99;
      const o = ORIGEN.findIndex((x) => n.startsWith(`${x} · `));
      const k = ORDEN_ESTIBA.indexOf(o < 0 ? n : n.replace(`${ORIGEN[o]} · `, "CONTEO · "));
      return k < 0 ? 99 : k + (o < 0 ? 0 : 10 * (o + 1));
    };
    const lista = (m: Map<string, number>) => [...m].map(([nombre, cantidad]) => ({ nombre, cantidad: Math.round(cantidad) })).sort((x, y) => pos(x.nombre) - pos(y.nombre) || y.cantidad - x.cantidad);
    const sap = Math.round([...a.sap.values()].reduce((t, v) => t + v, 0));
    const conteo = Math.round([...a.conteo.values()].reduce((t, v) => t + v, 0));
    filas.push({ familia: familia as string, orden: orden as number, codigo, descripcion: nombre(codigo), sap, conteo, diferencia: conteo - sap, deSap: lista(a.sap), deConteo: lista(a.conteo), ...(soloConteo ? { soloConteo: true } : {}),
      ...(codigo === ESTIBA && estFuera.size ? { fuera: [...estFuera].map(([nombre, cantidad]) => ({ nombre, cantidad: Math.round(cantidad) })).sort((x, y) => y.cantidad - x.cantidad) } : {}), ...(pendSap.get(codigo) ? { pendSap: pendSap.get(codigo) } : {}), ...(descuadresAlm.get(codigo) ? { descuadres: descuadresAlm.get(codigo) } : {}) });
  }
  filas.sort((x, y) => x.orden - y.orden || x.codigo.localeCompare(y.codigo, "es", { numeric: true }));
  const estibasAnalisis = Math.round([...(acc.get(ESTIBA)?.conteo.values() ?? [])].reduce((t, v) => t + v, 0));
  const plasticasAnalisis = Math.round([...acc].reduce((t, [c, a]) => t + (grupo(c) === "CAJA" ? [...a.conteo.values()].reduce((x, v) => x + v, 0) : 0), 0));
  const contados = { skus: new Set([...skuP, ...skuE, ...skuO]).size, producto: skuP.size, envase: skuE.size, otros: skuO.size, renglones: renglonesTodos, totales: { donde: totD, estibasAnalisis, plasticasAnalisis } };


  /* 7. EN LÍNEA: el SKU del plan → su envase (maestro de productos) → la caja plástica de ese envase. */
  const enLinea: Record<string, EnLinea[]> = {};
  const sku: Map<string, { tren: string; sap: string; turnos: Set<number> }> = new Map();
  for (const b of (planR.data ?? []) as { tren: string; sap: string; turno: number }[]) {
    const k = `${b.tren}|${b.sap}`;
    const x = sku.get(k) ?? { tren: String(b.tren).toUpperCase(), sap: String(b.sap), turnos: new Set<number>() };
    x.turnos.add(Number(b.turno)); sku.set(k, x);
  }
  const sinEnvase: string[] = [];
  for (const x of sku.values()) {
    const prod = P.get(x.sap);
    const env = prod?.envase_sku ? String(prod.envase_sku) : null;
    if (!env) { sinEnvase.push(`${x.sap} (${x.tren})`); continue }
    const base = { tren: x.tren, sap: x.sap, sku: prod?.nombre ?? x.sap, turnos: [...x.turnos].sort() };
    (enLinea[env] ??= []).push({ ...base, por: "envase" });
    const caja = CAJA_EN_DEPA[env] ?? M.get(env)?.caja;
    if (caja) (enLinea[String(caja)] ??= []).push({ ...base, por: "caja" });
  }
  for (const xs of Object.values(enLinea)) xs.sort((a, b) => a.tren.localeCompare(b.tren, "es", { numeric: true }) || a.sku.localeCompare(b.sku, "es"));
  /* Solo informa: el plan no mueve ningún número del análisis, así que si no hay plan ese día no se muestra nada. */
  if (sku.size) fuentes.push({ nombre: "Plan de envase", ok: true, detalle: `${sku.size} SKU en línea ese día · ${new Set([...sku.values()].map((x) => x.tren)).size} trenes${sinEnvase.length ? ` · sin envase en el maestro: ${sinEnvase.join(", ")}` : ""}` });

  return { fecha, filas, fuentes, avisos, novedades, noEntran: noEntran.sort(), faltaSql, carga, contados, existencias, enLinea };
}
