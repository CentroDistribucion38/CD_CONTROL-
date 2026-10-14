import { createClient } from "@/lib/supabase/server";
import { porTandas, todas } from "@/modulos/inventario/paginas";
import { cruzar } from "@/modulos/inventario/base-cruce";
import type { ConteoFefo, Renglon } from "@/modulos/inventario/fefo";
import { esUbicacionFabrica } from "@/modulos/casco/ubicacion-sitio";

/**
 * INVENTARIO · BALANCE — el consolidado de UN DÍA contra el casco de vidrio.
 *
 * «Yo puedo seleccionar y tomar el consolidado del viernes o de cualquier día que quiera.»
 *
 * FÍSICO: el mismo consolidado de La base para ese día (los recorridos ENVIADOS con ese día de
 * análisis, cruzados con `cruzar`: de cada persona su último conteo de cada ubicación, y se suman
 * entre personas). Se lee de v_conteos_fefo / v_conteo_fefo, que es donde vive el conteo real.
 * Zona: ubicaciones FABRICA_* = SORTING (Fábrica); el resto = PRESORTING (Bodega 38).
 *
 * CASCO: la misma regla de las columnas del casco que ya cuadramos:
 *   AG22 Bodega 38  · «Inventario casco de vidrio» → BAJA        · «Extrasucio con baja» → EXTRASUCIO
 *   AG18 Fábrica    · «Inventario casco de vidrio» → BAJA        · «Lavado con baja»     → LAVADO
 *   (Así lo cuadra el Excel del balance: Calle FABRICA · Estado BAJA contra «Cuadro casco de vidrio».)
 * De cada ubicación del casco, su último registro HASTA ese día (si ese día no se guardó, sigue el
 * último inventario). Estibas × cajas por estiba del maestro = cajas.
 *
 * RECLASIFICAR: mueve los renglones del conteo de un material de un estado a otro (por id de
 * renglón, en balance_reclasificaciones). AJUSTES: balance_ajustes del día.
 */

export type FilaBalance = {
  fecha: string | null; estado: string; alcance: string; codigo: string;
  material: string | null; ubicacion: string | null;
  cajas_estiba: number | null; un_caja: number | null;
  fisico_cajas: number; estibas_casco: number; cajas_casco: number;
  ajuste_cajas: number; ajuste_nota: string | null; calidad: string | null;
  dif_cajas: number; unidades: number | null; alerta: string | null;
  reclasificacion_id: number | null;
  /** EL CUADRE DE FÁBRICA (solo Baja · Fábrica de los materiales de la regla de fábrica): de dónde salen
   *  las estibas casco. Casco no se toca: la cuenta se hace aquí. */
  cuadre_fabrica?: CuadreFabrica | null;
};
/** «Conteo BAJA en fábrica 209; casco 36,67 (Inventario) + 132 (Lavado con baja) = 168,67; la diferencia,
 *  40,33, se suma al Inventario: las estibas casco de Baja · Fábrica quedan en 77, no en 36,67.» */
export type CuadreFabrica = {
  inventario: number; lavado: number; casco: number;
  conteo_cajas: number; factor: number; conteo_estibas: number;
  diferencia: number; estibas: number;
};
export type BloqueBalance = {
  estado: string; alcance: string; renglones: number; con_alerta: number;
  fisico_cajas: number; estibas_casco: number; cajas_casco: number; dif_cajas: number; unidades: number | null;
};

/** Una línea de la hoja «Consolidado»: un material, en un estado, en una ubicación, con su cantidad.
 *  `ids` son los renglones del conteo que la forman (lo que se reasigna). */
export type LineaConsolidado = {
  clave: string; codigo: string; material: string | null; estado: string; contado: string;
  zona: "Fábrica" | "Bodega 38"; ubicacion: string; cajas: number; unidades: number | null;
  ids: string[]; reasignado: boolean;
  /** Cada renglón del conteo va aparte (no se suman los iguales): sus estibas, sueltas, saldo, recorrido y nota. */
  estibas?: number; sueltas?: number; saldo?: number; recorrido?: string | null; nota?: string | null;
};

/** Una línea de la hoja «Reasignaciones»: un cambio de estado de lo contado ese día, con su porqué.
 *  Balance = la reasignó alguien en la hoja Consolidado; Regla de fábrica = la puso la regla automática. */
export type Reasignacion = {
  origen: "Balance" | "Regla de fábrica"; codigo: string; material: string | null;
  zona: "Fábrica" | "Bodega 38"; ubicacion: string; de: string; a: string;
  cajas: number; unidades: number | null; renglones: number;
  motivo: string | null; quien: string | null; cuando: string | null;
};

const TOPE = 500;
/** Las cajas plásticas no son casco de vidrio: no entran al balance (en el libro van como «Libre»). */
const esCajaPlastica = (nombre: string | null | undefined) => /CAJA\s+PL/i.test(nombre ?? "");
export const normEstado = (e: string | null | undefined) => {
  const t = (e ?? "").trim().toUpperCase();
  if (t.includes("EXTRASUCIO")) return "EXTRASUCIO";
  if (t.includes("LAVADO")) return "LAVADO";
  if (t.includes("BAJA")) return "BAJA";
  return t || "SIN ESTADO";
};
/** Las combinaciones que el casco registra (las demás solo tienen lado físico y no llevan alerta). */
export const cruzaConCasco = (estado: string, alcance: string) =>
  (alcance === "PRESORTING" && (estado === "BAJA" || estado === "EXTRASUCIO")) || (alcance === "SORTING" && (estado === "BAJA" || estado === "LAVADO"));
const zona = (r: { ubicacion: string | null; ubicacion_combinada?: string | null }) =>
  esUbicacionFabrica(r.ubicacion ?? r.ubicacion_combinada ?? null) ? "SORTING" : "PRESORTING";

/** Los días con recorridos enviados, del más nuevo al más viejo. */
export async function diasConConteo(): Promise<{ dias: string[]; conteos: ConteoFefo[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_conteos_fefo").select("*")
    .eq("estado", "cerrado").not("fecha_analisis", "is", null)
    .order("fecha_analisis", { ascending: false }).limit(TOPE);
  if (error) return { dias: [], conteos: [], error: error.message };
  const conteos = (data ?? []) as ConteoFefo[];
  const dias = [...new Set(conteos.map((c) => String(c.fecha_analisis).slice(0, 10)))];
  return { dias, conteos, error: null };
}

/** Los renglones que valen del consolidado de un día (lo mismo que muestra La base para ese día). */
export async function consolidadoDelDia(fecha: string, conteos: ConteoFefo[]): Promise<{ vigentes: Renglon[]; error: string | null }> {
  const delDia = conteos.filter((c) => String(c.fecha_analisis).slice(0, 10) === fecha);
  if (!delDia.length) return { vigentes: [], error: null };
  const supabase = await createClient();
  const { data, error } = await porTandas<Renglon>(delDia.map((c) => c.id), (t, d, h) =>
    supabase.from("v_conteo_fefo").select("*").in("conteo_id", t).order("id").range(d, h));
  if (error) return { vigentes: [], error };
  return { vigentes: cruzar(data, delDia).vigentes, error: null };
}

type RegCasco = { fecha: string; ubicacion: string; sku: string; inventario: number | null; baja: number | null };

/** El casco hasta un día. Igual que el Tablero del casco: `casco_tablero_datos()` lo trae en una sola
 *  lectura; leer la tabla por páginas, con el permiso revisado en cada renglón, se pasa del tiempo. */
export async function leerCasco(): Promise<{ data: RegCasco[]; error: string | null }> {
  const supabase = await createClient();
  const rpc = await supabase.rpc("casco_tablero_datos");
  if (!rpc.error) {
    type Crudo = [string, string, string, unknown, number | string | null, number | string | null];
    const n = (v: number | string | null) => (v == null ? null : Number(v));
    const data = ((rpc.data ?? []) as Crudo[])
      .map((x) => ({ fecha: String(x[0]).slice(0, 10), ubicacion: x[1], sku: String(x[2]), inventario: n(x[4]), baja: n(x[5]) }));
    return { data, error: null };
  }
  if (!/casco_tablero_datos|PGRST202|could not find the function/i.test(`${rpc.error.code} ${rpc.error.message}`)) {
    return { data: [], error: `no pude leer el casco (${rpc.error.message})` };
  }
  return todas<RegCasco>((d, h) =>
    supabase.from("casco_registros").select("fecha, ubicacion, sku, inventario, baja")
      .order("fecha").order("ubicacion").order("sku").range(d, h));
}

/**
 * «Yo elijo cuál conteo y cuál casco tomar, de fechas.»
 * `pedida` = día del consolidado del conteo; `pedidaCasco` = día del casco. Si no se escoge el del
 * casco, va el último día del casco hasta el día del conteo (o el más nuevo, si no hay antes).
 */
export async function balanceDelDia(pedida?: string | null, pedidaCasco?: string | null) {
  const supabase = await createClient();
  const { dias, conteos, error: e0 } = await diasConConteo();
  const fecha = pedida && dias.includes(pedida) ? pedida : (dias[0] ?? null);
  const vacio = { fecha, dias, consolidado: [] as LineaConsolidado[], reasignaciones: [] as Reasignacion[], fechaCasco: null as string | null, diasCasco: [] as string[], detalle: [] as FilaBalance[], bloques: [] as BloqueBalance[], error: e0 };
  if (!fecha) return vacio;

  const [{ vigentes, error: e1 }, maestro, sitiosR, cascoR, ajustesR] = await Promise.all([
    consolidadoDelDia(fecha, conteos),
    supabase.from("productos").select("sku, nombre, cajas_por_estiba, unidades_por_caja"),
    supabase.from("casco_ubicaciones").select("clave, centro"),
    leerCasco(),
    supabase.from("balance_ajustes").select("estado, alcance, codigo, cajas, nota, calidad").eq("fecha", fecha),
  ]);

  /* Reclasificaciones de los renglones del día: la más nueva de cada renglón manda. */
  const ids = vigentes.map((r) => r.id);
  type Reclas = { estado: string; id: number; motivo: string | null; usuario_id: string | null; creado_en: string };
  const reclas = new Map<string, Reclas>();
  if (ids.length) {
    const r = await porTandas<{ id: number; conteo_envase_id: string; estado_nuevo: string; motivo: string | null; usuario_id: string | null; creado_en: string }>(ids, (t, d, h) =>
      supabase.from("balance_reclasificaciones").select("id, conteo_envase_id, estado_nuevo, motivo, usuario_id, creado_en")
        .in("conteo_envase_id", t).order("creado_en").range(d, h), 100);
    for (const x of r.data) reclas.set(x.conteo_envase_id, { estado: x.estado_nuevo, id: x.id, motivo: x.motivo, usuario_id: x.usuario_id, creado_en: x.creado_en });
  }
  /* Quién reasignó (el nombre de su perfil). */
  const usuarios = [...new Set([...reclas.values()].map((x) => x.usuario_id).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  if (usuarios.length) {
    const { data: ps } = await supabase.from("perfiles").select("id, nombre, usuario").in("id", usuarios);
    for (const p of (ps ?? []) as { id: string; nombre: string | null; usuario: string | null }[]) nombres.set(p.id, p.nombre || p.usuario || "");
  }

  const prod = new Map(((maestro.data ?? []) as { sku: string; nombre: string; cajas_por_estiba: number | null; unidades_por_caja: number | null }[])
    .map((p) => [String(p.sku), p]));
  const centroDe = new Map(((sitiosR.data ?? []) as { clave: string; centro: string | null }[])
    .map((s) => [s.clave, (s.centro ?? "").toUpperCase()]));

  type Acc = Omit<FilaBalance, "dif_cajas" | "unidades" | "alerta" | "ajuste_cajas" | "ajuste_nota" | "calidad"> & { ubis: Set<string>; tieneFisico: boolean; tieneCasco: boolean };
  const filas = new Map<string, Acc>();
  const fila = (estado: string, alcance: string, codigo: string): Acc => {
    const k = `${estado}|${alcance}|${codigo}`;
    let f = filas.get(k);
    if (!f) {
      const p = prod.get(codigo);
      f = { fecha, estado, alcance, codigo, material: p?.nombre ?? null, ubicacion: null,
        cajas_estiba: p?.cajas_por_estiba ?? null, un_caja: p?.unidades_por_caja ?? null,
        fisico_cajas: 0, estibas_casco: 0, cajas_casco: 0, reclasificacion_id: null,
        ubis: new Set(), tieneFisico: false, tieneCasco: false };
      filas.set(k, f);
    }
    return f;
  };

  /* LA HOJA «CONSOLIDADO»: todo lo contado ese día (también cajas plásticas), con el estado que
     manda hoy (el reasignado si lo hay). UN RENGLÓN POR CADA REGISTRO DEL CONTEO: «no quiero que si son
     iguales se sumen; quiero ver cada registro, cada renglón, que no me mezcles nada». */
  const lineas = new Map<string, LineaConsolidado>();
  for (const r of vigentes) {
    const rc = reclas.get(r.id);
    const contado = normEstado(r.estado_envase);
    const estado = rc?.estado ?? contado;
    const zonaR = zona(r) === "SORTING" ? "Fábrica" as const : "Bodega 38" as const;
    const ubic = (r.ubicacion ?? r.ubicacion_combinada ?? "").trim() || "—";
    const codigo = String(r.codigo);
    lineas.set(r.id, { clave: r.id, codigo, material: prod.get(codigo)?.nombre ?? r.material ?? null, estado, contado,
      zona: zonaR, ubicacion: ubic, cajas: Number(r.total_cajas) || 0, unidades: null, ids: [r.id], reasignado: !!rc,
      estibas: Number(r.estibas) || 0, sueltas: Number(r.cajas) || 0, saldo: Number(r.saldo) || 0,
      recorrido: r.conteo ?? null, nota: r.nota ?? null });
  }
  /* LA HOJA «REASIGNACIONES»: el registro de cada cambio de estado de ese día, agrupado por material ·
     ubicación · de → a · motivo (las del Balance y las de la regla de fábrica). */
  const reas = new Map<string, Reasignacion>();
  for (const r of vigentes) {
    const codigo = String(r.codigo), ubic = (r.ubicacion ?? r.ubicacion_combinada ?? "").trim() || "—";
    const zonaR = zona(r) === "SORTING" ? "Fábrica" as const : "Bodega 38" as const;
    const cajas = Number(r.total_cajas) || 0;
    const anota = (origen: Reasignacion["origen"], de: string, a: string, motivo: string | null, quien: string | null, cuando: string | null) => {
      const k = `${origen}|${codigo}|${ubic}|${de}|${a}|${motivo ?? ""}`;
      const x = reas.get(k) ?? { origen, codigo, material: prod.get(codigo)?.nombre ?? r.material ?? null, zona: zonaR, ubicacion: ubic, de, a,
        cajas: 0, unidades: null, renglones: 0, motivo, quien, cuando };
      x.cajas += cajas; x.renglones++;
      if (quien && !(x.quien ?? "").split(", ").includes(quien)) x.quien = x.quien ? `${x.quien}, ${quien}` : quien;
      if (cuando && (!x.cuando || cuando > x.cuando)) x.cuando = cuando;
      reas.set(k, x);
    };
    const regla = /^Regla fábrica:\s*(.+?)\s*→\s*(\S+)/.exec(r.nota ?? "");
    if (regla) anota("Regla de fábrica", regla[1], regla[2], "Automática: ese material en fábrica es baja", null, null);
    const rc = reclas.get(r.id);
    if (rc) anota("Balance", normEstado(r.estado_envase), rc.estado, rc.motivo, rc.usuario_id ? nombres.get(rc.usuario_id) ?? null : null, rc.creado_en);
  }
  const reasignaciones = [...reas.values()].map((x) => {
    const u = prod.get(x.codigo)?.unidades_por_caja;
    return { ...x, unidades: u ? x.cajas * u : null };
  }).sort((a, b) => a.origen.localeCompare(b.origen) || a.codigo.localeCompare(b.codigo, "es", { numeric: true })
    || a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));

  const consolidado = [...lineas.values()].map((l) => {
    const u = prod.get(l.codigo)?.unidades_por_caja;
    return { ...l, unidades: u ? l.cajas * u : null };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true })
    || a.estado.localeCompare(b.estado) || a.zona.localeCompare(b.zona)
    || a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));

  /* FÍSICO */
  /* Los materiales que la regla de fábrica pasó a BAJA en la Fábrica (nota «Regla fábrica: LAVADO → BAJA»). */
  const deLaRegla = new Set<string>();
  for (const r of vigentes) {
    if (zona(r) === "SORTING" && /^Regla f[aá]brica:/i.test(r.nota ?? "")) deLaRegla.add(String(r.codigo));
  }
  for (const r of vigentes) {
    if (esCajaPlastica(r.material) || esCajaPlastica(prod.get(String(r.codigo))?.nombre)) continue;
    const rc = reclas.get(r.id);
    const f = fila(rc?.estado ?? normEstado(r.estado_envase), zona(r), String(r.codigo));
    f.fisico_cajas += Number(r.total_cajas) || 0;
    f.tieneFisico = true;
    if (!f.material) f.material = r.material;
    if (f.cajas_estiba == null) f.cajas_estiba = r.factor_estibado ?? null;
    const u = (r.ubicacion ?? r.ubicacion_combinada ?? "").trim(); if (u) f.ubis.add(u);
    if (rc) f.reclasificacion_id = Math.max(f.reclasificacion_id ?? 0, rc.id);
  }

  /* CASCO: el día escogido; de cada ubicación, su último día hasta ese día (si ese día no se guardó, sigue el último). */
  const diasCasco = [...new Set((cascoR.data ?? []).map((k) => k.fecha))].sort().reverse();
  const fechaCasco = pedidaCasco && diasCasco.includes(pedidaCasco) ? pedidaCasco
    : (diasCasco.find((d) => d <= fecha) ?? diasCasco[0] ?? null);
  const casco = fechaCasco ? (cascoR.data ?? []).filter((k) => k.fecha <= fechaCasco) : [];
  /** Lo del casco de AG18 por material (Inventario y Lavado con baja), para el cuadre de fábrica. */
  const ag18 = new Map<string, { inv: number; lav: number }>();
  const ultimoDe = new Map<string, string>();
  for (const k of casco) if (!ultimoDe.has(k.ubicacion) || k.fecha > ultimoDe.get(k.ubicacion)!) ultimoDe.set(k.ubicacion, k.fecha);
  for (const k of casco) {
    if (k.fecha !== ultimoDe.get(k.ubicacion)) continue;
    const centro = centroDe.get(k.ubicacion) ?? "";
    const sku = String(k.sku);
    if (esCajaPlastica(prod.get(sku)?.nombre)) continue;
    const cpe = prod.get(sku)?.cajas_por_estiba ?? 0;
    const pon = (estado: string, alcance: string, est: number) => {
      if (!est) return;
      const f = fila(estado, alcance, sku);
      f.estibas_casco += est; f.cajas_casco += Math.round(est * (cpe || 0)); f.tieneCasco = true;
    };
    const inv = Number(k.inventario) || 0, baja = Number(k.baja) || 0;
    if (centro === "AG22") { pon("BAJA", "PRESORTING", inv); pon("EXTRASUCIO", "PRESORTING", baja) }
    else if (centro === "AG18") {
      pon("BAJA", "SORTING", inv); pon("LAVADO", "SORTING", baja);
      const a = ag18.get(sku) ?? { inv: 0, lav: 0 }; a.inv += inv; a.lav += baja; ag18.set(sku, a);
    }
  }

  /* EL CUADRE DE FÁBRICA: en los materiales de la regla de fábrica, lo contado en BAJA en la Fábrica ya
     trae lo que el casco tiene en «Lavado con baja». Se cuadra así (sin tocar el Casco):
       diferencia = conteo BAJA Fábrica (estibas) − (Inventario + Lavado con baja)
       estibas casco de Baja · Fábrica = Inventario + diferencia. */
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const cuadres = new Map<string, CuadreFabrica>();
  for (const sku of deLaRegla) {
    const a = ag18.get(sku);
    const f = filas.get(`BAJA|SORTING|${sku}`);
    if (!a || !f || !f.tieneFisico) continue;
    const cpe = Number(f.cajas_estiba ?? prod.get(sku)?.cajas_por_estiba) || 0;
    if (!cpe) continue;
    const conteoEst = r2(f.fisico_cajas / cpe);
    const casco = r2(a.inv + a.lav);
    const diferencia = r2(conteoEst - casco);
    const estibas = r2(a.inv + diferencia);
    f.estibas_casco = estibas;
    f.cajas_casco = Math.round(estibas * cpe);
    f.tieneCasco = true;
    cuadres.set(sku, { inventario: r2(a.inv), lavado: r2(a.lav), casco, conteo_cajas: f.fisico_cajas, factor: cpe, conteo_estibas: conteoEst, diferencia, estibas });
  }

  /* AJUSTES y cierre de cada fila */
  const aj = new Map(((ajustesR.data ?? []) as { estado: string; alcance: string; codigo: string; cajas: number; nota: string | null; calidad: string | null }[])
    .map((a) => [`${a.estado}|${a.alcance}|${a.codigo}`, a]));
  const detalle: FilaBalance[] = [...filas.values()].map((f) => {
    const a = aj.get(`${f.estado}|${f.alcance}|${f.codigo}`);
    const ajuste = a?.cajas ?? 0;
    const dif = f.fisico_cajas - f.cajas_casco - ajuste;
    const { ubis, tieneFisico, tieneCasco, ...resto } = f;
    return {
      ...resto,
      ubicacion: [...ubis].sort((x, y) => x.localeCompare(y, "es", { numeric: true })).join(", ") || null,
      ajuste_cajas: ajuste, ajuste_nota: a?.nota ?? null, calidad: a?.calidad ?? null,
      cuadre_fabrica: f.estado === "BAJA" && f.alcance === "SORTING" ? cuadres.get(f.codigo) ?? null : null,
      dif_cajas: dif,
      unidades: f.un_caja ? dif * f.un_caja : null,
      alerta: !tieneFisico ? "En casco y no contado"
        : !tieneCasco && cruzaConCasco(f.estado, f.alcance) ? "Contado y sin casco registrado"
        : tieneCasco && dif !== 0 ? "Diferencia" : null,
    };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));

  const bloquesM = new Map<string, BloqueBalance>();
  for (const f of detalle) {
    const k = `${f.estado}|${f.alcance}`;
    const b = bloquesM.get(k) ?? { estado: f.estado, alcance: f.alcance, renglones: 0, con_alerta: 0, fisico_cajas: 0, estibas_casco: 0, cajas_casco: 0, dif_cajas: 0, unidades: 0 };
    b.renglones++; if (f.alerta) b.con_alerta++;
    b.fisico_cajas += f.fisico_cajas; b.estibas_casco += f.estibas_casco; b.cajas_casco += f.cajas_casco;
    b.dif_cajas += f.dif_cajas; b.unidades = (b.unidades ?? 0) + (f.unidades ?? 0);
    bloquesM.set(k, b);
  }
  return {
    fecha, dias, consolidado, reasignaciones, fechaCasco, diasCasco, detalle, bloques: [...bloquesM.values()],
    error: e0 ?? e1 ?? maestro.error?.message ?? cascoR.error ?? null,
  };
}
