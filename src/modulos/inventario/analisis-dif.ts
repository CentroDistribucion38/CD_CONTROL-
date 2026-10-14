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
type Prod = { id: string; sku: string; nombre: string | null; unidades_por_caja: number | null; cajas_por_estiba: number | null };

const ESTIBA = "3500163";
const norm = (c: unknown) => String(c ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const diaBogota = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date(iso));
const PASIVOS: Record<string, string> = { "PRESORTING": "PEND BAJA PRESORTING", "ROTURA DE LINEA": "PEND BAJA ROTURA LINEA", "EXTRASUCIO": "CON BAJA EXTRASUCIO" };

export async function armarAnalisis(fecha: string): Promise<Analisis> {
  const supabase = await createClient();
  const avisos: string[] = [];
  const [{ conteos }, maesR, prodR, pas, novR, cortesR, regla] = await Promise.all([
    diasConConteo(),
    supabase.from("pasivos_maestro").select("codigo, descripcion, familia, unidades_por_caja, cajas_por_estiba, caja"),
    supabase.from("productos").select("id, sku, nombre, unidades_por_caja, cajas_por_estiba").limit(5000),
    leerPasivos(fecha, fecha),
    supabase.from("analisis_dif_novedades").select("fecha, tipo, lado, documento, codigo, unidades, caja_codigo, cajas, archivo, subido_en").eq("fecha", fecha).order("id"),
    supabase.from("inv_cortes").select("id, tipo, cortado_en").eq("tipo", "inicial").order("cortado_en").limit(400),
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
    if (r.tipo_material !== "ENVASE") continue;
    if (esUbicacionFabrica(r.ubicacion ?? r.ubicacion_combinada ?? null)) continue;
    const c = String(r.codigo), cajas = Number(r.total_cajas) || 0;
    renglones++;
    const g = grupo(c);
    if (g === "ESTIBA" || g === "CAJA") { suma("conteo", c, "CONTEO", cajas); continue }
    suma("conteo", c, "CONTEO", cajas * upc(c));
    const caja = M.get(c)?.caja; if (caja) suma("conteo", String(caja), "CONTEO", cajas);
    const estibas = (Number(r.estibas) || 0) + ((Number(r.cajas) || 0) + (Number(r.saldo) || 0) > 0 ? 1 : 0);
    suma("conteo", ESTIBA, "CONTEO", estibas);
  }
  fuentes.push({ nombre: "Conteo", ok: renglones > 0, detalle: renglones ? `${renglones} renglones de Bodega` : "No hay conteo enviado ese día" });
  if (cons.error) avisos.push(`No pude leer el conteo: ${cons.error}`);

  /* 2. DEPA: el corte inicial del día (el primero), lo que marca la depaletizadora de cada línea. */
  const corte = ((cortesR.data ?? []) as { id: string; cortado_en: string }[]).find((c) => diaBogota(c.cortado_en) === fecha);
  if (corte) {
    const { data: rs } = await supabase.from("inv_corte_renglones").select("linea, cajas_depa, envase_id").eq("corte_id", corte.id);
    let n = 0;
    for (const x of (rs ?? []) as { linea: string; cajas_depa: number | null; envase_id: string | null }[]) {
      const env = x.envase_id ? porId.get(String(x.envase_id))?.sku : null;
      const cj = Number(x.cajas_depa) || 0;
      if (!env || !cj) continue;
      const etq = `DEPA ${x.linea}`;
      suma("conteo", String(env), etq, cj * upc(String(env)));
      const caja = M.get(String(env))?.caja; if (caja) suma("conteo", String(caja), etq, cj);
      n++;
    }
    const hora = new Date(corte.cortado_en).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });
    fuentes.push({ nombre: "DEPA", ok: n > 0, detalle: n ? `corte inicial de las ${hora} · ${n} líneas` : "El corte inicial no dice el envase de las líneas" });
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
  for (const nv of novedades) {
    if (nv.lado === "NO SUMA") continue;
    const lado = nv.lado === "SAP" ? "sap" : "conteo";
    const etq = norm(nv.tipo) + (nv.documento ? ` · ${nv.documento}` : "");
    suma(lado, String(nv.codigo), norm(nv.tipo) === "ZEXI 6 AM" ? "ZEXI 6 AM" : etq, Number(nv.unidades) || 0);
    if (nv.caja_codigo && nv.cajas) suma(lado, String(nv.caja_codigo), etq, Number(nv.cajas) || 0);
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
