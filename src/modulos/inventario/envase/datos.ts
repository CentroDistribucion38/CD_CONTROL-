import { createClient } from "@/lib/supabase/server";
import { masDias, type FilaPlanBD, type Mov, type Plan, type Prod } from "./calc";

/* LO QUE LEE PLAN VS NOTIFICADO DE LA BASE. «falta» = no se ha corrido 2026-11-plan-envase.sql. */
const faltaTabla = (m: string) => /pe_planes|pe_plan_filas|pe_mb51|does not exist|PGRST20[25]|42P01/i.test(m);
const MOV = "fecha_contab, fecha_entrada, hora_entrada, almacen, clase, material, texto, documento, cantidad, um, orden";

/** Hoy en Barranquilla (UTC−5), aaaa-mm-dd. */
export const hoyBogota = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/** El lunes de la semana de un día (las semanas del instructivo van de lunes a domingo). */
export const lunesDe = (d: string) => masDias(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));

async function paginar<T>(q: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>) {
  const out: T[] = [];
  for (let i = 0; i < 50; i++) {
    const r = await q(i * 1000, i * 1000 + 999);
    if (r.error) return { filas: out, error: `${r.error.code ?? ""} ${r.error.message}` };
    out.push(...(r.data ?? []));
    if ((r.data ?? []).length < 1000) break;
  }
  return { filas: out, error: null as string | null };
}

/** La última hora digitada que trae la MB51 cargada (aaaa-mm-ddThh:mm:ss). */
export async function ultimaEntrada() {
  const s = await createClient();
  const r = await s.from("pe_mb51").select("fecha_entrada, hora_entrada").order("fecha_entrada", { ascending: false }).order("hora_entrada", { ascending: false }).limit(1);
  if (r.error) return { falta: faltaTabla(r.error.message), error: r.error.message, valor: null as string | null };
  const x = r.data?.[0];
  return { falta: false, error: null, valor: x ? `${x.fecha_entrada}T${String(x.hora_entrada).slice(0, 8)}` : null };
}

/** Los planes de una semana con sus filas. */
/**
 * LOS INSTRUCTIVOS YA GUARDADOS traen el HL de un turno entero en su primera hora (la celda combinada del Excel: T1 =
 * 731 HL a las 00:00). Al leer se reparte parejo hasta la siguiente hora con plan en ese tren o el fin del turno (8 h),
 * solo cuando arranca justo en el inicio de un turno (00, 08, 16). Lo cargado desde ahora ya viene repartido.
 */
function repartirTurnos(filas: FilaPlanBD[]): FilaPlanBD[] {
  const grupos = new Map<string, FilaPlanBD[]>();
  for (const f of filas) { const k = `${f.plan_id}|${f.fecha}|${f.tren}`; const g = grupos.get(k); if (g) g.push(f); else grupos.set(k, [f]) }
  const out: FilaPlanBD[] = [];
  for (const g of grupos.values()) {
    g.sort((a, b) => a.hora - b.hora);
    g.forEach((f, i) => {
      const finTurno = Math.floor(f.hora / 8) * 8 + 8;
      const sig = i + 1 < g.length ? g[i + 1].hora : 24;
      const ancho = f.hora % 8 === 0 ? Math.max(1, Math.min(sig, finTurno) - f.hora) : 1;
      if (ancho === 1) { out.push(f); return }
      for (let k = 0; k < ancho; k++) out.push({ ...f, hora: f.hora + k, hl: f.hl / ancho, unidades: f.unidades == null ? null : f.unidades / ancho });
    });
  }
  return out;
}

export async function planesDeSemana(lunes: string) {
  const s = await createClient();
  const p = await s.from("pe_planes").select("*").eq("lunes", lunes).order("generado");
  if (p.error) return { falta: faltaTabla(p.error.message), error: p.error.message, planes: [] as Plan[], filas: [] as FilaPlanBD[] };
  const planes = (p.data ?? []).map((x) => ({ ...x, total_hl: Number(x.total_hl) })) as Plan[];
  if (!planes.length) return { falta: false, error: null, planes, filas: [] as FilaPlanBD[] };
  const f = await paginar<FilaPlanBD>((a, b) => s.from("pe_plan_filas").select("plan_id, fecha, tren, hora, sku, nombre, formato_ml, referencia, hl, unidades")
    .in("plan_id", planes.map((x) => x.id)).order("id").range(a, b));
  const filas = repartirTurnos(f.filas.map((x) => ({ ...x, hl: Number(x.hl), unidades: x.unidades == null ? null : Number(x.unidades), formato_ml: x.formato_ml == null ? null : Number(x.formato_ml) })));
  return { falta: false, error: f.error, planes, filas };
}

/** Movimientos de producción y envase contabilizados entre dos días. */
export async function movimientosContab(desde: string, hasta: string) {
  const s = await createClient();
  const r = await paginar<Mov>((a, b) => s.from("pe_mb51").select(MOV).gte("fecha_contab", desde).lte("fecha_contab", hasta)
    .in("clase", ["Z01", "Z02", "261", "262", "531", "532"]).order("fecha_contab").order("id").range(a, b));
  return { ...r, filas: r.filas.map((m) => ({ ...m, cantidad: Number(m.cantidad) })) };
}

/** Todo lo digitado desde un día en adelante (para las partidas del corte). */
export async function movimientosDigitadosDesde(dia: string) {
  const s = await createClient();
  const r = await paginar<Mov>((a, b) => s.from("pe_mb51").select(MOV).gte("fecha_entrada", dia).order("id").range(a, b));
  return { ...r, filas: r.filas.map((m) => ({ ...m, cantidad: Number(m.cantidad) })) };
}

export async function productosDe(skus: string[]) {
  if (!skus.length) return [] as Prod[];
  const s = await createClient();
  const r = await s.from("productos").select("sku, nombre, contenido, unidades_por_caja, cajas_por_estiba").in("sku", skus);
  return ((r.data ?? []) as Prod[]).map((p) => ({ ...p, contenido: p.contenido == null ? null : Number(p.contenido) }));
}

/** Lo cargado: los planes más recientes y el resumen de la MB51. */
export async function loCargado() {
  const s = await createClient();
  const [p, n, min, max] = await Promise.all([
    s.from("pe_planes").select("*").order("generado", { ascending: false }).limit(12),
    s.from("pe_mb51").select("id", { count: "exact", head: true }),
    s.from("pe_mb51").select("fecha_contab").order("fecha_contab").limit(1),
    s.from("pe_mb51").select("fecha_contab").order("fecha_contab", { ascending: false }).limit(1),
  ]);
  if (p.error) return { falta: faltaTabla(p.error.message), error: p.error.message, planes: [] as (Plan & { subido_en: string })[], mb51: null };
  return {
    falta: false, error: null,
    planes: (p.data ?? []).map((x) => ({ ...x, total_hl: Number(x.total_hl) })) as (Plan & { subido_en: string })[],
    mb51: { filas: n.count ?? 0, desde: min.data?.[0]?.fecha_contab ?? null, hasta: max.data?.[0]?.fecha_contab ?? null },
  };
}

/**
 * Lo que necesita el ANÁLISIS DE DIFERENCIA para el conteo de un día: todo lo digitado desde ese día (las partidas)
 * y lo contabilizado en los diez días anteriores (las órdenes a las que les puede faltar el 261). Sin repetir.
 * «falta» = no se ha corrido 2026-11-plan-envase.sql.
 */
export async function movimientosParaElConteo(dia: string) {
  const s = await createClient();
  const sel = `id, ${MOV}`;
  const [a, b] = await Promise.all([
    paginar<Mov & { id: number }>((x, y) => s.from("pe_mb51").select(sel).gte("fecha_entrada", dia).order("id").range(x, y)),
    paginar<Mov & { id: number }>((x, y) => s.from("pe_mb51").select(sel).gte("fecha_contab", masDias(dia, -10)).lt("fecha_contab", dia)
      .in("clase", ["Z01", "Z02", "261", "262", "531", "532"]).order("id").range(x, y)),
  ]);
  const error = a.error ?? b.error;
  if (error) return { falta: faltaTabla(error), error, filas: [] as Mov[] };
  const vistos = new Set<number>(), filas: Mov[] = [];
  for (const m of [...a.filas, ...b.filas]) {
    if (vistos.has(m.id)) continue;
    vistos.add(m.id);
    const { id: _id, ...resto } = m; void _id;
    filas.push({ ...resto, cantidad: Number(resto.cantidad) });
  }
  return { falta: false, error: null as string | null, filas };
}

/** Unidades por caja de cada envase (maestro de Pasivos y, si no está, el de productos). */
export async function upcEnvases() {
  const s = await createClient();
  const [a, b] = await Promise.all([
    s.from("pasivos_maestro").select("codigo, unidades_por_caja"),
    s.from("productos").select("sku, unidades_por_caja").limit(5000),
  ]);
  const m = new Map<string, number>();
  for (const x of (b.data ?? []) as { sku: string; unidades_por_caja: number | null }[]) if (x.unidades_por_caja) m.set(String(x.sku), Number(x.unidades_por_caja));
  for (const x of (a.data ?? []) as { codigo: string; unidades_por_caja: number | null }[]) if (x.unidades_por_caja) m.set(String(x.codigo), Number(x.unidades_por_caja));
  return m;
}
