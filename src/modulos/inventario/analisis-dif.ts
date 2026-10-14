import { envaseDelRenglon } from "@/modulos/inventario/corte";
import { createClient } from "@/lib/supabase/server";
import { consolidadoDelDia, diasConConteo } from "@/modulos/inventario/balance";
import { armarCuadre } from "@/modulos/inventario/cuadre";
import { conReclasificaciones } from "@/modulos/inventario/reclasificaciones";
import { esUbicacionFabrica } from "@/modulos/casco/ubicacion-sitio";
import { leerPasivos } from "@/modulos/pasivos/datos";
import { excluye } from "@/modulos/pasivos/excluidos";
import { leerExcluidos } from "@/modulos/pasivos/excluidos-leer";

/**
 * EL ANÁLISIS DE DIFERENCIA DE BODEGA 38 — la hoja CONTEOS + la tabla dinámica de 2026.10.14_BODEGA_38.xlsx.
 *
 * Por código, en unidades (cajas plásticas y estibas por unidad), dos lados:
 *   CONTEO = conteo del día (ubicaciones de Bodega, no FABRICA_) + DEPA (corte inicial del día)
 *          + Pasivos AG22 (PRESORTING, ROTURA DE LINEA, EXTRASUCIO) + BALANCE «de AG22 a AG18»
 *          + novedades de la plantilla que suman al conteo.
 *   SAP    = ZEXI 6 AM (plantilla) + BALANCE «de AG18 a AG22» + novedades que suman a SAP.
 *   DIFERENCIA = CONTEO − SAP.
 * Cada lado guarda de qué partida sale cada número, para abrir el detalle.
 */
export type Partida = { nombre: string; cantidad: number };
export type FilaAnalisis = {
  familia: string; orden: number; codigo: string; descripcion: string;
  sap: number; conteo: number; diferencia: number;
  deSap: Partida[]; deConteo: Partida[];
};
export type Novedad = {
  fecha: string; tipo: string; lado: "CONTEO" | "SAP" | "NO SUMA"; documento: string | null; codigo: string;
  unidades: number; caja_codigo: string | null; cajas: number | null; archivo: string | null; subido_en?: string;
};
export type Fuente = { nombre: string; ok: boolean; detalle: string };
export type Analisis = {
  fecha: string; filas: FilaAnalisis[]; fuentes: Fuente[]; avisos: string[];
  novedades: Novedad[]; noEntran: string[]; faltaSql: boolean;
  carga: { archivo: string | null; filas: number; subido_en: string | null } | null;
};

type Maes = { codigo: string; descripcion: string; familia: string | null; unidades_por_caja: number | null; cajas_por_estiba: number | null; caja: string | null };
type Prod = { id: string; sku: string; nombre: string | null; unidades_por_caja: number | null; cajas_por_estiba: number | null; envase_sku: string | null };

const ESTIBA = "3500163";
const norm = (c: unknown) => String(c ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const diaBogota = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date(iso));
/* En la línea (DEPA) algunos envases salen en otra caja que la del maestro: la Flint 250 sale en café 225. */
const CAJA_EN_DEPA: Record<string, string> = { "3501225": "3500231" };
const PASIVOS: Record<string, string> = { "PRESORTING": "PEND BAJA PRESORTING", "ROTURA DE LINEA": "PEND BAJA ROTURA LINEA", "EXTRASUCIO": "CON BAJA EXTRASUCIO" };

export async function armarAnalisis(fecha: string): Promise<Analisis> {
  const supabase = await createClient();
  const avisos: string[] = [];
  const [{ conteos }, maesR, prodR, pas, novR, cortesR, regla] = await Promise.all([
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

  /* Acumulador: código → lado → partida → cantidad. */
  const acc = new Map<string, { sap: Map<string, number>; conteo: Map<string, number> }>();
  const suma = (lado: "sap" | "conteo", codigo: string, partida: string, cant: number) => {
    if (!codigo || !cant) return;
    const a = acc.get(codigo) ?? { sap: new Map(), conteo: new Map() };
    a[lado].set(partida, (a[lado].get(partida) ?? 0) + cant);
    acc.set(codigo, a);
  };
  const fuentes: Fuente[] = [];

  /* 1. EL CONTEO DEL DÍA EN BODEGA (no FABRICA_): envase en unidades; su caja plástica y la estiba de debajo por unidad. */
  const cons = await consolidadoDelDia(fecha, conteos);
  let renglones = 0;
  for (const r of await conReclasificaciones(cons.vigentes)) {
    /* Fuera todo lo de FÁBRICA: por la calle o por el nombre de la ubicación (FABRICA_…, FABRICAL4…). */
    if (esUbicacionFabrica(r.calle) || esUbicacionFabrica(r.ubicacion) || esUbicacionFabrica(r.ubicacion_combinada)) continue;
    /* El PRODUCTO solo aporta las estibas en que está montado (una más si hay cajas sueltas). */
    if (r.tipo_material === "PRODUCTO") {
      const est = (Number(r.estibas) || 0) + ((Number(r.cajas) || 0) + (Number(r.saldo) || 0) > 0 ? 1 : 0);
      suma("conteo", ESTIBA, "CONTEO · bajo producto", est);
      continue;
    }
    if (r.tipo_material !== "ENVASE") continue;
    const c = String(r.codigo), cajas = Number(r.total_cajas) || 0;
    renglones++;
    const g = grupo(c);
    /* Se parte por origen para poder revisarlo: lo contado con su propio código y lo que trae cada envase. */
    if (g === "ESTIBA" || g === "CAJA") { suma("conteo", c, g === "CAJA" ? "CONTEO · cajas vacías" : "CONTEO · estibas contadas", cajas); continue }
    suma("conteo", c, "CONTEO", cajas * upc(c));
    /* Un envase que no entra al análisis (excluido: foráneo, nuevo…) tampoco aporta caja ni estiba. */
    if (excluye(regla, c, nombre(c))) continue;
    const deEnv = `CONTEO · en ${c} ${nombre(c)}`;
    const caja = M.get(c)?.caja; if (caja) suma("conteo", String(caja), deEnv, cajas);
    const estibas = (Number(r.estibas) || 0) + ((Number(r.cajas) || 0) + (Number(r.saldo) || 0) > 0 ? 1 : 0);
    suma("conteo", ESTIBA, `CONTEO · bajo ${c} ${nombre(c)}`, estibas);
  }
  fuentes.push({ nombre: "Conteo", ok: renglones > 0, detalle: renglones ? `${renglones} renglones de Bodega` : "No hay conteo enviado ese día" });
  if (cons.error) avisos.push(`No pude leer el conteo: ${cons.error}`);

  /* 2. DEPA: los cortes iniciales del día. Por cada línea vale el primer corte
     que la trae. El envase es el anotado en el corte o, si no se anotó, el que el
     maestro le asigna al producto (igual que la pantalla de Corte). */
  const cortes = (cortesR.data ?? []) as { id: string; cortado_en: string }[];
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
      const caja = CAJA_EN_DEPA[env] ?? M.get(env)?.caja; if (caja) suma("conteo", String(caja), etq, cj);
      tomadas.add(x.linea);
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

  /* 4. BALANCE: el paso 2 del Cuadre SAP AG18 — «de AG22 a AG18» al conteo, «de AG18 a AG22» a SAP. */
  const cu = await armarCuadre(fecha, "AG18");
  if (cu.fecha === fecha && cu.guardado?.zexi?.length) {
    let n = 0;
    for (const f of cu.filas) {
      if (f.dif == null || Math.abs(f.dif) < 0.005) continue;
      if (f.dif < 0) suma("conteo", f.codigo, "BALANCE", Math.abs(f.dif)); else suma("sap", f.codigo, "BALANCE", f.dif);
      n++;
    }
    fuentes.push({ nombre: "Balance (Cuadre SAP)", ok: true, detalle: `${n} materiales del paso 2` });
  } else fuentes.push({ nombre: "Balance (Cuadre SAP)", ok: false, detalle: "El Cuadre SAP AG18 de ese día no tiene ZEXI" });

  /* 5. LA PLANTILLA: novedades (y la ZEXI de las 6). */
  const novedades = ((novR.data ?? []) as Novedad[]);
  let hayZexi = false;
  /* Si la novedad (tipo + documento) ya trae sus cajas plásticas como filas propias, no se deduce caja
     de los envases: se contaría dos veces (así lo hace el Excel: la caja va escrita). */
  const grupoNv = (nv: Novedad) => `${norm(nv.tipo)}|${nv.documento ?? ""}`;
  const conCajaPropia = new Set(novedades.filter((nv) => grupo(String(nv.codigo)) === "CAJA").map(grupoNv));
  for (const nv of novedades) {
    if (nv.lado === "NO SUMA") continue;
    const lado = nv.lado === "SAP" ? "sap" : "conteo";
    const etq = norm(nv.tipo) + (nv.documento ? ` · ${nv.documento}` : "");
    suma(lado, String(nv.codigo), norm(nv.tipo) === "ZEXI 6 AM" ? "ZEXI 6 AM" : etq, Number(nv.unidades) || 0);
    if (nv.caja_codigo && nv.cajas && !conCajaPropia.has(grupoNv(nv))) suma(lado, String(nv.caja_codigo), etq, Number(nv.cajas) || 0);
    if (norm(nv.tipo) === "ZEXI 6 AM") hayZexi = true;
  }
  const carga = novedades.length ? { archivo: novedades[0].archivo, filas: novedades.length, subido_en: novedades[0].subido_en ?? null } : null;
  fuentes.push({ nombre: "Plantilla", ok: novedades.length > 0, detalle: novedades.length ? `${novedades.length} filas · ${novedades[0].archivo ?? ""}` : "Falta subir la plantilla del día" });
  fuentes.push({ nombre: "ZEXI 6 AM", ok: hayZexi, detalle: hayZexi ? "En la plantilla" : "La plantilla no trae la ZEXI de las 6" });

  /* 6. LAS FILAS: por familia, como la tabla dinámica. No entran: lo excluido (envases nuevos, barril) y lo que no es
        envase, caja plástica ni estiba (cilindro…). */
  const noEntran: string[] = [];
  const filas: FilaAnalisis[] = [];
  for (const [codigo, a] of acc) {
    const g = grupo(codigo);
    const u = upc(codigo);
    if (g !== "ESTIBA" && excluye(regla, codigo, nombre(codigo))) { noEntran.push(codigo); continue }
    if (g === "ENVASE" && u <= 1) { noEntran.push(codigo); continue }
    const [familia, orden] = g === "CAJA" ? ["E01 · Cajas plásticas", 1] : g === "ESTIBA" ? ["E03 · Estibas", 2] : u <= 16 ? ["E09 · Envase 750 y 1000", 4] : ["E07 · Envase 175 a 330", 3];
    const lista = (m: Map<string, number>) => [...m].map(([nombre, cantidad]) => ({ nombre, cantidad: Math.round(cantidad) })).sort((x, y) => y.cantidad - x.cantidad);
    const sap = Math.round([...a.sap.values()].reduce((t, v) => t + v, 0));
    const conteo = Math.round([...a.conteo.values()].reduce((t, v) => t + v, 0));
    filas.push({ familia: familia as string, orden: orden as number, codigo, descripcion: nombre(codigo), sap, conteo, diferencia: conteo - sap, deSap: lista(a.sap), deConteo: lista(a.conteo) });
  }
  filas.sort((x, y) => x.orden - y.orden || x.codigo.localeCompare(y.codigo, "es", { numeric: true }));
  return { fecha, filas, fuentes, avisos, novedades, noEntran: noEntran.sort(), faltaSql, carga };
}
