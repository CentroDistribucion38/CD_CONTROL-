"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import {
  OPERADORES, dispara, estadoDe, inicioPeriodo, textoDisparo, textoMeta,
  type Estado, type Indicador, type Resultado, type Turno,
} from "@/modulos/gestion/semaforo";
import type { IndicadorImp, ProcesoImp, ResultadoImp, TurnoImp } from "@/modulos/gestion/importar";

/**
 * IMPORTACIÓN MASIVA DE GESTIÓN, en tres pasos que la pantalla llama en orden:
 *   1. importarEstructura  → turnos, procesos e indicadores (se crean o se actualizan por NOMBRE / CÓDIGO);
 *   2. importarResultados  → los resultados, en tandas (misma fecha + turno + indicador = se reemplaza);
 *   3. generarDisparadores → al final, abre UN disparador activo por indicador al que su regla se lo pida.
 * El archivo ya vino validado del navegador; aquí se vuelve a revisar lo esencial y la base (RLS) es la que manda.
 */
const RUTAS = ["/gestion", "/gestion/resultados", "/gestion/disparadores", "/gestion/maestro", "/gestion/importar"];
const refrescar = () => RUTAS.forEach((r) => revalidatePath(r));
const SQL = "Falta correr supabase/modulos/gestion.sql (y supabase/migraciones/2026-10-gestion-importar.sql) en Supabase.";
const msj = (m: string) => (/does not exist|schema cache|Could not find/i.test(m) ? SQL : /row-level security/i.test(m) ? "No tienes permiso para guardar aquí." : m);
const opOk = (o: unknown) => o == null || OPERADORES.some((x) => x.k === o);
const num = (v: unknown) => (v == null ? null : Number(v));
const lotes = <T,>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o };

async function permiso(...rutas: string[]) {
  const p = await misPermisos();
  for (const r of rutas) if (!p.puedeEditar(r)) return `No tienes permiso de edición en ${r}.`;
  return null;
}

/* ====================================================================================================
   1 · ESTRUCTURA
   ==================================================================================================== */
export async function importarEstructura(p: { turnos: TurnoImp[]; procesos: ProcesoImp[]; indicadores: IndicadorImp[] }) {
  const sin = await permiso("/gestion/importar", "/gestion/maestro");
  if (sin) return { error: sin };
  const supabase = await createClient();

  /* Lo que ya existía, para decir cuántos se crearon y cuántos se actualizaron. */
  const [t0, p0, i0] = await Promise.all([
    supabase.from("gestion_turnos").select("nombre"), supabase.from("gestion_procesos").select("nombre"),
    supabase.from("gestion_indicadores").select("codigo"),
  ]);
  const e0 = t0.error ?? p0.error ?? i0.error;
  if (e0) return { error: msj(e0.message) };
  const hayT = new Set((t0.data ?? []).map((x) => String(x.nombre).toLowerCase()));
  const hayP = new Set((p0.data ?? []).map((x) => String(x.nombre).toLowerCase()));
  const hayI = new Set((i0.data ?? []).map((x) => String(x.codigo)));

  if (p.turnos.length) {
    const filas = p.turnos.filter((t) => t.nombre.trim()).map((t) => ({ nombre: t.nombre.trim(), hora_ini: t.hora_ini, hora_fin: t.hora_fin, orden: Number(t.orden) || 0, activo: true }));
    const r = await supabase.from("gestion_turnos").upsert(filas, { onConflict: "nombre" });
    if (r.error) return { error: msj(r.error.message) };
  }
  if (p.procesos.length) {
    const filas = p.procesos.filter((x) => x.nombre.trim()).map((x) => ({ nombre: x.nombre.trim(), orden: Number(x.orden) || 0, activo: true }));
    const r = await supabase.from("gestion_procesos").upsert(filas, { onConflict: "nombre" });
    if (r.error) return { error: msj(r.error.message) };
  }

  let creados = 0, actualizados = 0;
  if (p.indicadores.length) {
    const [pr, tu] = await Promise.all([supabase.from("gestion_procesos").select("id,nombre"), supabase.from("gestion_turnos").select("id,nombre")]);
    if (pr.error || tu.error) return { error: msj((pr.error ?? tu.error)!.message) };
    const idProceso = new Map((pr.data ?? []).map((x) => [String(x.nombre).toLowerCase(), x.id as string]));
    const idTurno = new Map((tu.data ?? []).map((x) => [String(x.nombre).toLowerCase(), x.id as string]));

    const fila = (i: IndicadorImp, padre_id: string | null) => ({
      codigo: i.codigo.trim().toUpperCase(), nombre: i.nombre.trim(), tipo: i.tipo, padre_id,
      proceso_id: i.proceso ? idProceso.get(i.proceso.toLowerCase()) ?? null : null,
      nivel_reunion: i.nivel_reunion === 2 ? 2 : 1, unidad: i.unidad ?? "", decimales: Math.min(4, Math.max(0, Number(i.decimales) || 0)),
      meta_op: i.meta_op, meta_valor: Number(i.meta_valor),
      amarillo_op: i.amarillo_op, amarillo_valor: i.amarillo_op ? Number(i.amarillo_valor) : null,
      rojo_op: i.rojo_op, rojo_valor: i.rojo_op ? Number(i.rojo_valor) : null,
      frecuencia: i.frecuencia, captura: i.frecuencia === "dia" ? i.captura : "unico",
      turnos: i.captura === "turnos" && i.frecuencia === "dia" ? i.turnos.map((n) => idTurno.get(n.toLowerCase())).filter(Boolean) as string[] : [],
      responsable: i.responsable?.trim() || null,
      disparo_activo: !!i.disparo_activo, disparo_en: i.disparo_en === "amarillo" ? "amarillo" : "rojo",
      disparo_consecutivos: Math.min(30, Math.max(1, Number(i.disparo_consecutivos) || 1)),
      orden: Number(i.orden) || 0, activo: true,
    });
    for (const i of p.indicadores) {
      if (!i.codigo?.trim() || !i.nombre?.trim()) return { error: "Hay un indicador sin código o sin nombre." };
      if (!opOk(i.meta_op) || !opOk(i.amarillo_op) || !opOk(i.rojo_op)) return { error: `${i.codigo}: operador no válido.` };
    }
    /* Primero los KPI (sin padre) y después los PI, que necesitan el id de su KPI. */
    const kpis = p.indicadores.filter((i) => i.tipo === "kpi");
    const pis = p.indicadores.filter((i) => i.tipo === "pi");
    const idKpi = new Map<string, string>();
    for (const tanda of lotes(kpis, 200)) {
      const r = await supabase.from("gestion_indicadores").upsert(tanda.map((i) => fila(i, null)), { onConflict: "codigo" }).select("id,codigo");
      if (r.error) return { error: msj(r.error.message) };
      (r.data ?? []).forEach((x) => idKpi.set(String(x.codigo), x.id as string));
    }
    /* KPI padres que no vienen en el archivo pero ya existen. */
    const faltan = [...new Set(pis.map((i) => (i.padre ?? "").trim().toUpperCase()).filter((c) => c && !idKpi.has(c)))];
    if (faltan.length) {
      const r = await supabase.from("gestion_indicadores").select("id,codigo,tipo").in("codigo", faltan);
      if (r.error) return { error: msj(r.error.message) };
      (r.data ?? []).forEach((x) => { if (x.tipo === "kpi") idKpi.set(String(x.codigo), x.id as string); });
    }
    for (const i of pis) {
      if (!idKpi.has((i.padre ?? "").trim().toUpperCase())) return { error: `${i.codigo}: el KPI padre «${i.padre}» no existe o no es KPI.` };
    }
    for (const tanda of lotes(pis, 200)) {
      const r = await supabase.from("gestion_indicadores").upsert(tanda.map((i) => fila(i, idKpi.get((i.padre ?? "").trim().toUpperCase())!)), { onConflict: "codigo" });
      if (r.error) return { error: msj(r.error.message) };
    }
    for (const i of p.indicadores) { if (hayI.has(i.codigo.trim().toUpperCase())) actualizados++; else creados++; }
  }

  refrescar();
  return {
    ok: true,
    turnos: { nuevos: p.turnos.filter((t) => !hayT.has(t.nombre.trim().toLowerCase())).length, cambian: p.turnos.filter((t) => hayT.has(t.nombre.trim().toLowerCase())).length },
    procesos: { nuevos: p.procesos.filter((x) => !hayP.has(x.nombre.trim().toLowerCase())).length, cambian: p.procesos.filter((x) => hayP.has(x.nombre.trim().toLowerCase())).length },
    indicadores: { nuevos: creados, cambian: actualizados },
  };
}

/* ====================================================================================================
   2 · RESULTADOS (una tanda; la pantalla manda varias)
   ==================================================================================================== */
export async function importarResultados(filas: ResultadoImp[]) {
  const sin = await permiso("/gestion/importar", "/gestion/resultados");
  if (sin) return { error: sin };
  if (!filas.length) return { ok: true, insertados: 0, reemplazados: 0, omitidos: 0 };
  if (filas.length > 3000) return { error: "Tanda demasiado grande." };
  const supabase = await createClient();

  const codigos = [...new Set(filas.map((f) => f.codigo.trim().toUpperCase()))];
  const [ind, tur] = await Promise.all([
    supabase.from("gestion_indicadores").select("*").in("codigo", codigos),
    supabase.from("gestion_turnos").select("id,nombre"),
  ]);
  if (ind.error || tur.error) return { error: msj((ind.error ?? tur.error)!.message) };
  const indPorCodigo = new Map((ind.data ?? []).map((x) => [String(x.codigo), x as unknown as Indicador]));
  const turPorNombre = new Map((tur.data ?? []).map((x) => [String(x.nombre).toLowerCase(), x.id as string]));

  type Nueva = { indicador_id: string; fecha: string; turno_id: string | null; valor: number; estado: Estado; comentario: string | null };
  const nuevas = new Map<string, Nueva>();
  let omitidos = 0;
  for (const f of filas) {
    const raw = indPorCodigo.get(f.codigo.trim().toUpperCase());
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha) || !Number.isFinite(Number(f.valor))) { omitidos++; continue; }
    const i: Indicador = { ...raw, meta_valor: Number(raw.meta_valor), amarillo_valor: num(raw.amarillo_valor), rojo_valor: num(raw.rojo_valor), decimales: Number(raw.decimales), disparo_consecutivos: Number(raw.disparo_consecutivos) };
    const dia = inicioPeriodo(f.fecha, i.frecuencia);
    const porTurno = i.captura === "turnos" && i.frecuencia === "dia";
    const turno_id = porTurno ? turPorNombre.get((f.turno ?? "").toLowerCase()) ?? null : null;
    if (porTurno && !turno_id) { omitidos++; continue; }
    nuevas.set(`${i.id}|${dia}|${turno_id ?? ""}`, {
      indicador_id: i.id, fecha: dia, turno_id, valor: Number(f.valor), estado: estadoDe(i, Number(f.valor)), comentario: f.comentario?.trim() || null,
    });
  }
  const lista = [...nuevas.values()];
  if (!lista.length) return { ok: true, insertados: 0, reemplazados: 0, omitidos };

  /* Lo que ya existe con la misma llave (indicador + día + turno) se reemplaza: se borra y se vuelve a insertar. */
  const ids = [...new Set(lista.map((x) => x.indicador_id))];
  const fechas = lista.map((x) => x.fecha).sort();
  const choque: string[] = [];
  for (let d = 0; d < 20000; d += 1000) {
    const r = await supabase.from("gestion_resultados").select("id,indicador_id,fecha,turno_id")
      .in("indicador_id", ids).gte("fecha", fechas[0]).lte("fecha", fechas[fechas.length - 1]).order("id").range(d, d + 999);
    if (r.error) return { error: msj(r.error.message) };
    for (const x of r.data ?? []) if (nuevas.has(`${x.indicador_id}|${String(x.fecha).slice(0, 10)}|${x.turno_id ?? ""}`)) choque.push(x.id as string);
    if ((r.data?.length ?? 0) < 1000) break;
  }
  for (const t of lotes(choque, 150)) {
    const b = await supabase.from("gestion_resultados").delete().in("id", t);
    if (b.error) return { error: msj(b.error.message) };
  }
  for (const t of lotes(lista, 500)) {
    const r = await supabase.from("gestion_resultados").insert(t);
    if (r.error) return { error: msj(r.error.message) };
  }
  return { ok: true, insertados: lista.length - choque.length, reemplazados: choque.length, omitidos };
}

/* ====================================================================================================
   3 · DISPARADORES (al final: con TODO lo importado ya guardado)
   ==================================================================================================== */
export async function generarDisparadores(codigos: string[]) {
  const sin = await permiso("/gestion/importar");
  if (sin) return { error: sin };
  const supabase = await createClient();
  const [ind, tur] = await Promise.all([
    supabase.from("gestion_indicadores").select("*").in("codigo", codigos.slice(0, 500)).eq("disparo_activo", true),
    supabase.from("gestion_turnos").select("*"),
  ]);
  if (ind.error || tur.error) return { error: msj((ind.error ?? tur.error)!.message) };
  const turnos = new Map(((tur.data ?? []) as Turno[]).map((t) => [t.id, t]));
  let abiertos = 0;
  for (const raw of ind.data ?? []) {
    const i: Indicador = { ...(raw as unknown as Indicador), meta_valor: Number(raw.meta_valor), amarillo_valor: num(raw.amarillo_valor), rojo_valor: num(raw.rojo_valor), decimales: Number(raw.decimales), disparo_consecutivos: Number(raw.disparo_consecutivos) };
    const rec = await supabase.from("gestion_resultados").select("*").eq("indicador_id", i.id).order("fecha", { ascending: false }).limit(60);
    if (rec.error) return { error: msj(rec.error.message) };
    const orden = (r: Resultado) => (r.turno_id ? turnos.get(r.turno_id)?.orden ?? 0 : 0);
    const rs = ((rec.data ?? []) as Resultado[]).sort((a, b) => (a.fecha === b.fecha ? orden(b) - orden(a) : a.fecha < b.fecha ? 1 : -1));
    if (!rs.length || !dispara(i, rs.map((r) => r.estado as Estado))) continue;
    const u = rs[0];
    const d = await supabase.from("gestion_disparadores").insert({
      indicador_id: i.id, resultado_id: u.id, fecha: u.fecha, turno_id: u.turno_id, valor: Number(u.valor), meta: textoMeta(i), regla: textoDisparo(i),
    });
    if (d.error && !/duplicate|23505|unique/i.test(d.error.message)) return { error: msj(d.error.message) };
    if (!d.error) abiertos++;
  }
  refrescar();
  return { ok: true, abiertos };
}
