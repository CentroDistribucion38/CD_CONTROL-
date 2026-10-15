"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import {
  OPERADORES, dispara, estadoDe, inicioPeriodo, textoDisparo, textoMeta,
  type Disparador, type Estado, type Indicador, type Op, type Resultado, type Turno,
} from "@/modulos/gestion/semaforo";

const RUTAS = ["/gestion", "/gestion/resultados", "/gestion/disparadores", "/gestion/maestro"];
const refrescar = () => RUTAS.forEach((r) => revalidatePath(r));
const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const SQL = "Falta correr supabase/modulos/gestion.sql en Supabase.";
const msj = (m: string) => (/does not exist|schema cache|Could not find/i.test(m) ? SQL : /row-level security/i.test(m) ? "No tienes permiso para guardar aquí." : m);

/* ====================================================================================================
   RESULTADO POR TURNO
   ==================================================================================================== */
export type FilaResultado = { indicador_id: string; valor: number | null; comentario: string | null };

/**
 * Guarda los resultados de un turno (o los de valor único). Un renglón sin número que ya tenía resultado lo borra.
 * Después de guardar se revisa, indicador por indicador, si SALTA EL DISPARADOR según su propia regla.
 */
export async function guardarResultados(fecha: string, turnoId: string | null, filas: FilaResultado[]) {
  if (!esDia(fecha)) return { error: "Día inválido." };
  const permisos = await misPermisos();
  if (!permisos.puedeEditar("/gestion/resultados")) return { error: "No tienes permiso para capturar resultados." };
  const lista = filas.filter((f) => f.indicador_id);
  if (!lista.length) return { error: "No hay nada que guardar." };

  const supabase = await createClient();
  const ids = [...new Set(lista.map((f) => f.indicador_id))];
  const [ind, tur] = await Promise.all([
    supabase.from("gestion_indicadores").select("*").in("id", ids),
    supabase.from("gestion_turnos").select("*"),
  ]);
  if (ind.error) return { error: msj(ind.error.message) };
  const indicadores = new Map((ind.data ?? []).map((x) => [x.id as string, x as unknown as Indicador]));
  const turnos = new Map(((tur.data ?? []) as Turno[]).map((t) => [t.id, t]));
  const num = (v: unknown) => (v == null ? null : Number(v));

  let guardados = 0;
  const tocados: string[] = [];
  for (const f of lista) {
    const raw = indicadores.get(f.indicador_id);
    if (!raw) continue;
    const i: Indicador = {
      ...raw, meta_valor: Number(raw.meta_valor), amarillo_valor: num(raw.amarillo_valor), rojo_valor: num(raw.rojo_valor),
      decimales: Number(raw.decimales), disparo_consecutivos: Number(raw.disparo_consecutivos),
    };
    /* El día del resultado: el mismo día, o el primer día de su semana / mes. */
    const dia = inicioPeriodo(fecha, i.frecuencia);
    /* El turno solo cuenta si el indicador se captura por turno. */
    const turno = i.captura === "turnos" && i.frecuencia === "dia" ? turnoId : null;
    if (i.captura === "turnos" && i.frecuencia === "dia" && !turno) continue;

    let q = supabase.from("gestion_resultados").select("id").eq("indicador_id", i.id).eq("fecha", dia);
    q = turno ? q.eq("turno_id", turno) : q.is("turno_id", null);
    const ya = await q.maybeSingle();
    if (ya.error) return { error: msj(ya.error.message) };

    if (f.valor == null || !Number.isFinite(f.valor)) {
      if (ya.data) {
        const b = await supabase.from("gestion_resultados").delete().eq("id", ya.data.id);
        if (b.error) return { error: msj(b.error.message) };
        guardados++; tocados.push(i.id);
      }
      continue;
    }
    const fila = {
      valor: f.valor, estado: estadoDe(i, f.valor), comentario: (f.comentario ?? "").trim() || null,
      capturado_en: new Date().toISOString(),
    };
    const r = ya.data
      ? await supabase.from("gestion_resultados").update(fila).eq("id", ya.data.id).select("id").single()
      : await supabase.from("gestion_resultados").insert({ indicador_id: i.id, fecha: dia, turno_id: turno, ...fila }).select("id").single();
    if (r.error) return { error: msj(r.error.message) };
    guardados++; tocados.push(i.id);
  }

  /* ¿SALTÓ ALGÚN DISPARADOR? Se miran los resultados más recientes de cada indicador tocado. */
  let disparados = 0;
  for (const id of new Set(tocados)) {
    const raw = indicadores.get(id)!;
    const i: Indicador = { ...raw, meta_valor: Number(raw.meta_valor), amarillo_valor: num(raw.amarillo_valor), rojo_valor: num(raw.rojo_valor),
      decimales: Number(raw.decimales), disparo_consecutivos: Number(raw.disparo_consecutivos) };
    if (!i.disparo_activo) continue;
    const rec = await supabase.from("gestion_resultados").select("*").eq("indicador_id", id)
      .order("fecha", { ascending: false }).limit(60);
    if (rec.error) return { error: msj(rec.error.message) };
    /* Más nuevo primero: por día y, dentro del día, por el orden del turno. */
    const orden = (r: Resultado) => (r.turno_id ? turnos.get(r.turno_id)?.orden ?? 0 : 0);
    const rs = ((rec.data ?? []) as Resultado[]).sort((a, b) => (a.fecha === b.fecha ? orden(b) - orden(a) : a.fecha < b.fecha ? 1 : -1));
    if (!dispara(i, rs.map((r) => r.estado as Estado))) continue;
    const ultimo = rs[0];
    const dis = await supabase.from("gestion_disparadores").insert({
      indicador_id: id, resultado_id: ultimo.id, fecha: ultimo.fecha, turno_id: ultimo.turno_id, valor: ultimo.valor,
      meta: textoMeta(i), regla: textoDisparo(i),
    });
    /* 23505 = ya hay uno activo para este indicador: no se abre otro encima. */
    if (dis.error && !/duplicate|23505|unique/i.test(dis.error.message)) return { error: msj(dis.error.message) };
    if (!dis.error) disparados++;
  }

  refrescar();
  return { ok: true, guardados, disparados };
}

/* ====================================================================================================
   DISPARADORES
   ==================================================================================================== */
/** Un disparador que no procede (se cargó mal, ya se resolvió, no aplica) se descarta con su motivo. */
export async function descartarDisparador(id: string, motivo: string) {
  const permisos = await misPermisos();
  if (!permisos.puedeEditar("/gestion/disparadores")) return { error: "No tienes permiso para gestionar disparadores." };
  const nota = (motivo ?? "").trim();
  if (nota.length < 5) return { error: "Cuenta por qué se descarta (mínimo unas palabras)." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("gestion_disparadores")
    .update({ estado: "descartado", nota, cerrado_en: new Date().toISOString(), cerrado_por: user?.id ?? null })
    .eq("id", id).eq("estado", "activo");
  if (error) return { error: msj(error.message) };
  refrescar();
  return { ok: true };
}

/* ====================================================================================================
   MAESTRO · turnos, procesos e indicadores
   ==================================================================================================== */
async function puedeMaestro() {
  const permisos = await misPermisos();
  return permisos.puedeEditar("/gestion/maestro");
}

export async function guardarTurno(t: { id?: string; nombre: string; hora_ini: string; hora_fin: string; orden: number; activo: boolean }) {
  if (!(await puedeMaestro())) return { error: "No tienes permiso para editar el Maestro." };
  const nombre = t.nombre.trim();
  if (!nombre) return { error: "Ponle nombre al turno." };
  if (!/^\d{2}:\d{2}/.test(t.hora_ini) || !/^\d{2}:\d{2}/.test(t.hora_fin)) return { error: "Las horas deben ser HH:MM." };
  const supabase = await createClient();
  const fila = { nombre, hora_ini: t.hora_ini, hora_fin: t.hora_fin, orden: Number(t.orden) || 0, activo: !!t.activo };
  const { error } = t.id ? await supabase.from("gestion_turnos").update(fila).eq("id", t.id) : await supabase.from("gestion_turnos").insert(fila);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ya hay un turno con ese nombre." : msj(error.message) };
  refrescar();
  return { ok: true };
}

export async function guardarProceso(p: { id?: string; nombre: string; orden: number; activo: boolean }) {
  if (!(await puedeMaestro())) return { error: "No tienes permiso para editar el Maestro." };
  const nombre = p.nombre.trim();
  if (!nombre) return { error: "Ponle nombre al proceso." };
  const supabase = await createClient();
  const fila = { nombre, orden: Number(p.orden) || 0, activo: !!p.activo };
  const { error } = p.id ? await supabase.from("gestion_procesos").update(fila).eq("id", p.id) : await supabase.from("gestion_procesos").insert(fila);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ya hay un proceso con ese nombre." : msj(error.message) };
  refrescar();
  return { ok: true };
}

export type FormIndicador = Omit<Indicador, "id" | "orden" | "activo"> & { id?: string; orden?: number; activo?: boolean };

const opOk = (o: unknown): o is Op => OPERADORES.some((x) => x.k === o);

export async function guardarIndicador(f: FormIndicador) {
  if (!(await puedeMaestro())) return { error: "No tienes permiso para editar el Maestro." };
  const nombre = f.nombre.trim();
  if (!nombre) return { error: "Ponle nombre al indicador." };
  if (f.tipo !== "kpi" && f.tipo !== "pi") return { error: "El tipo es KPI o PI." };
  if (!opOk(f.meta_op) || !Number.isFinite(Number(f.meta_valor))) return { error: "La meta necesita operador y número." };
  /* Los umbrales son opcionales, pero operador y número van juntos. */
  const par = (op: Op | null, v: number | null, nombreUmbral: string) => {
    if ((op == null) !== (v == null || !Number.isFinite(Number(v)))) return `El umbral ${nombreUmbral} necesita operador y número (o déjalos los dos vacíos).`;
    if (op != null && !opOk(op)) return `El operador del umbral ${nombreUmbral} no es válido.`;
    return null;
  };
  const eU = par(f.amarillo_op, f.amarillo_valor, "amarillo") ?? par(f.rojo_op, f.rojo_valor, "rojo");
  if (eU) return { error: eU };
  if (f.tipo === "pi" && !f.padre_id) return { error: "Un PI cuelga de un KPI: escoge cuál." };
  if (f.tipo === "kpi" && f.padre_id) f = { ...f, padre_id: null };
  /* Lo que no es diario no se captura por turno. */
  const captura = f.frecuencia === "dia" ? f.captura : "unico";

  const supabase = await createClient();
  if (f.tipo === "pi") {
    const { data: padre } = await supabase.from("gestion_indicadores").select("tipo").eq("id", f.padre_id!).maybeSingle();
    if (!padre || padre.tipo !== "kpi") return { error: "El padre de un PI tiene que ser un KPI." };
  }
  /* El código: el que escribió, o el siguiente de su tipo (KPI-001, PI-001…). */
  let codigo = (f.codigo ?? "").trim().toUpperCase();
  if (!codigo) {
    const pref = f.tipo === "kpi" ? "KPI" : "PI";
    const { data } = await supabase.from("gestion_indicadores").select("codigo").ilike("codigo", `${pref}-%`).limit(2000);
    const mayor = (data ?? []).reduce((m, r) => { const k = Number(String(r.codigo).slice(pref.length + 1)); return Number.isFinite(k) && k > m ? k : m }, 0);
    codigo = `${pref}-${String(mayor + 1).padStart(3, "0")}`;
  }
  const fila = {
    codigo, nombre, tipo: f.tipo, padre_id: f.padre_id || null, proceso_id: f.proceso_id || null,
    nivel_reunion: f.nivel_reunion === 2 ? 2 : 1, unidad: (f.unidad ?? "").trim(), decimales: Math.min(4, Math.max(0, Number(f.decimales) || 0)),
    meta_op: f.meta_op, meta_valor: Number(f.meta_valor),
    amarillo_op: f.amarillo_op, amarillo_valor: f.amarillo_op ? Number(f.amarillo_valor) : null,
    rojo_op: f.rojo_op, rojo_valor: f.rojo_op ? Number(f.rojo_valor) : null,
    frecuencia: f.frecuencia, captura, turnos: captura === "turnos" ? f.turnos : [],
    responsable: (f.responsable ?? "").trim() || null,
    disparo_activo: !!f.disparo_activo, disparo_en: f.disparo_en === "amarillo" ? "amarillo" : "rojo",
    disparo_consecutivos: Math.min(30, Math.max(1, Number(f.disparo_consecutivos) || 1)),
    ...(f.orden != null ? { orden: Number(f.orden) || 0 } : {}),
    ...(f.activo != null ? { activo: !!f.activo } : {}),
  };
  const { error } = f.id ? await supabase.from("gestion_indicadores").update(fila).eq("id", f.id) : await supabase.from("gestion_indicadores").insert(fila);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? `Ya existe un indicador con el código ${codigo}.` : msj(error.message) };
  refrescar();
  return { ok: true };
}

/** Desactivar no borra: sus resultados y disparadores se conservan, solo deja de pedirse. */
export async function activarIndicador(id: string, activo: boolean) {
  if (!(await puedeMaestro())) return { error: "No tienes permiso para editar el Maestro." };
  const supabase = await createClient();
  const { error } = await supabase.from("gestion_indicadores").update({ activo }).eq("id", id);
  if (error) return { error: msj(error.message) };
  refrescar();
  return { ok: true };
}

export type DisparadorFila = Disparador;
