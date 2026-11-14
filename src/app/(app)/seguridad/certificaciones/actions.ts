"use server";

/**
 * SEGURIDAD · CERTIFICACIONES — LO QUE SE ESCRIBE. Quien manda de verdad es la base (RLS y las funciones
 * seg_registrar, seg_importar y seg_estado revisan el permiso); aquí solo se arma lo que se manda y se refresca.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EventoPersona, ValidacionPersona } from "@/modulos/seguridad/datos";

const RUTA = "/seguridad/certificaciones";
const refrescar = () => revalidatePath(RUTA, "layout");
type R = { error?: string; ok?: string };

/* ---------------------------- PERSONAS ---------------------------- */
export type Registro = {
  cedula: string; nombre: string; empresa_id: string; departamento: string; estado: string;
  expedicion: string; permisos: string[]; nivel: string; validador: string; sop: string; grupo_id: string | null;
};
export async function registrarValidacion(p: Registro): Promise<R> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("seg_registrar", { p });
  if (error) return { error: error.message };
  refrescar();
  return { ok: data === "nueva" ? "Persona nueva registrada con su licencia." : data === "renovacion" ? "Renovación guardada: la licencia anterior quedó en el historial." : "Validación corregida." };
}

export async function cambiarEstado(cedula: string, estado: string, motivo: string): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.rpc("seg_estado", { p_cedula: cedula, p_estado: estado, p_motivo: motivo });
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Estado cambiado." };
}

export async function fichaPersona(cedula: string): Promise<{ validaciones: ValidacionPersona[]; eventos: EventoPersona[]; error?: string }> {
  const sb = await createClient();
  const [v, e] = await Promise.all([
    sb.from("seg_validaciones").select("expedicion, vencimiento, permisos, nivel, validador, sop, origen").eq("cedula", cedula).order("expedicion", { ascending: false }),
    sb.from("seg_eventos").select("tipo, detalle, por_nombre, en").eq("cedula", cedula).order("en", { ascending: false }).limit(40),
  ]);
  if (v.error) return { validaciones: [], eventos: [], error: v.error.message };
  return { validaciones: (v.data ?? []) as ValidacionPersona[], eventos: (e.data ?? []) as EventoPersona[] };
}

/** Meter (o sacar) varias personas a un grupo de su empresa. */
export async function asignarGrupo(cedulas: string[], grupoId: string | null): Promise<R> {
  if (!cedulas.length) return { error: "Escoge al menos una persona." };
  const sb = await createClient();
  const { error } = await sb.from("seg_personas").update({ grupo_id: grupoId, actualizado: new Date().toISOString() }).in("cedula", cedulas);
  if (error) return { error: error.message };
  await sb.from("seg_eventos").insert(cedulas.map((cedula) => ({ cedula, tipo: "grupo", detalle: grupoId ? "Pasó a un grupo con otros responsables" : "Volvió a los responsables de su empresa" })));
  refrescar();
  return { ok: `${cedulas.length} ${cedulas.length === 1 ? "persona" : "personas"} ${grupoId ? "en el grupo" : "con los responsables de su empresa"}.` };
}

/** Desde la matriz: a varias personas a la vez se les pone su Interventor ABI y su Coordinador (o se les quita,
 *  y vuelven a responder a los de su grupo o su empresa). */
export async function asignarResponsables(cedulas: string[], interventorId: string | null, coordinadorId: string | null): Promise<R> {
  if (!cedulas.length) return { error: "Escoge al menos una persona." };
  const sb = await createClient();
  const nombre = async (id: string | null) => id ? ((await sb.from("seg_responsables").select("nombre").eq("id", id).maybeSingle()).data?.nombre as string | undefined) ?? "—" : null;
  const { error } = await sb.from("seg_personas").update({ interventor_id: interventorId, coordinador_id: coordinadorId, actualizado: new Date().toISOString() }).in("cedula", cedulas);
  if (error) return { error: error.message };
  const [iv, co] = await Promise.all([nombre(interventorId), nombre(coordinadorId)]);
  const detalle = interventorId || coordinadorId ? `Responde a ${iv ?? "—"} → ${co ?? "—"}` : "Vuelve a los responsables de su grupo o empresa";
  await sb.from("seg_eventos").insert(cedulas.map((cedula) => ({ cedula, tipo: "responsable", detalle })));
  refrescar();
  const n = cedulas.length;
  return { ok: interventorId || coordinadorId ? `${n} ${n === 1 ? "persona asignada" : "personas asignadas"} a ${iv ?? "—"} → ${co ?? "—"}.` : `${n} ${n === 1 ? "persona vuelve" : "personas vuelven"} a los responsables de su empresa.` };
}

/* ---------------------------- BASE (IMPORTAR) ---------------------------- */
export type FilaImporte = {
  cedula: string; nombre: string; empresa: string; departamento: string; estado: string; motivo: string | null;
  expedicion: string; vencimiento: string | null; permisos: string[]; nivel: string | null; validador: string | null; sop: string | null;
};
export async function importarTanda(filas: FilaImporte[], ultima: boolean): Promise<{ error?: string; nuevas?: number; renovaciones?: number; actualizadas?: number; fuera?: number }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("seg_importar", { p_filas: filas });
  if (error) return { error: error.message };
  if (ultima) refrescar();
  const r = (Array.isArray(data) ? data[0] : data) as { nuevas: number; renovaciones: number; actualizadas: number; fuera: number } | null;
  return { nuevas: r?.nuevas ?? 0, renovaciones: r?.renovaciones ?? 0, actualizadas: r?.actualizadas ?? 0, fuera: r?.fuera ?? 0 };
}

/* ---------------------------- MAESTRO ---------------------------- */
const limpio = (s: string) => s.replace(/\s+/g, " ").trim();

export async function guardarReglas(r: { vigencia: number; aviso: number; criticos: number; departamentos: string[] }): Promise<R> {
  if (!(r.vigencia > 0) || !(r.aviso > 0) || r.criticos < 0) return { error: "Revisa los días: tienen que ser números positivos." };
  if (r.criticos >= r.aviso) return { error: "Los días urgentes tienen que ser menos que los días de aviso." };
  if (!r.departamentos.length) return { error: "Deja al menos un departamento." };
  const sb = await createClient();
  const { error } = await sb.from("seg_reglas").update({
    vigencia: Math.round(r.vigencia), aviso: Math.round(r.aviso), criticos: Math.round(r.criticos),
    departamentos: [...new Set(r.departamentos.map((d) => limpio(d).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")))],
    actualizado: new Date().toISOString(),
  }).eq("id", 1);
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Reglas guardadas." };
}

export async function guardarResponsable(r: { id?: string; nombre: string; tipo: "interventor" | "coordinador"; telefono?: string; correo?: string; activo?: boolean; interventor_id?: string | null; cedula?: string | null }): Promise<R> {
  if (!limpio(r.nombre)) return { error: "Escribe el nombre." };
  if (r.tipo === "coordinador" && !r.interventor_id) return { error: "Escoge a qué Interventor ABI responde este coordinador." };
  const sb = await createClient();
  const cedula = (r.cedula ?? "").replace(/[^0-9A-Za-z]/g, "") || null;
  const fila = {
    nombre: limpio(r.nombre), tipo: r.tipo, cedula, activo: r.activo ?? true,
    /* La cadena del aviso: solo el coordinador responde a un interventor. */
    interventor_id: r.tipo === "coordinador" ? r.interventor_id ?? null : null,
  };
  const { error } = r.id ? await sb.from("seg_responsables").update(fila).eq("id", r.id) : await sb.from("seg_responsables").insert(fila);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ya hay un responsable con ese nombre." : error.message };
  refrescar();
  return { ok: "Responsable guardado." };
}
export async function borrarResponsable(id: string): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.from("seg_responsables").delete().eq("id", id);
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Responsable quitado." };
}

export async function guardarValidador(v: { id?: string; nombre: string; activo?: boolean }): Promise<R> {
  if (!limpio(v.nombre)) return { error: "Escribe el nombre." };
  const sb = await createClient();
  const fila = { nombre: limpio(v.nombre), activo: v.activo ?? true };
  const { error } = v.id ? await sb.from("seg_validadores").update(fila).eq("id", v.id) : await sb.from("seg_validadores").insert(fila);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ese validador ya está." : error.message };
  refrescar();
  return { ok: "Validador guardado." };
}

export async function guardarEmpresa(e: { id: string; nombre?: string; activa?: boolean; interventor_id?: string | null; coordinador_id?: string | null }): Promise<R> {
  const sb = await createClient();
  const cambios: Record<string, unknown> = {};
  if (e.nombre !== undefined) { if (!limpio(e.nombre)) return { error: "El nombre no puede quedar vacío." }; cambios.nombre = limpio(e.nombre).toUpperCase() }
  if (e.activa !== undefined) cambios.activa = e.activa;
  if (e.interventor_id !== undefined) cambios.interventor_id = e.interventor_id;
  if (e.coordinador_id !== undefined) cambios.coordinador_id = e.coordinador_id;
  const { error } = await sb.from("seg_empresas").update(cambios).eq("id", e.id);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Ya hay una empresa con ese nombre." : error.message };
  refrescar();
  return { ok: "Empresa guardada." };
}
export async function crearEmpresa(nombre: string, departamento: string): Promise<R> {
  if (!limpio(nombre)) return { error: "Escribe el nombre de la empresa." };
  const sb = await createClient();
  const { error } = await sb.from("seg_empresas").insert({ nombre: limpio(nombre).toUpperCase(), departamento: limpio(departamento).toUpperCase() || "LOGISTICA" });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Esa empresa ya está." : error.message };
  refrescar();
  return { ok: "Empresa creada." };
}

export async function guardarGrupo(g: { id?: string; empresa_id: string; nombre: string; interventor_id: string | null; coordinador_id: string | null }): Promise<R> {
  if (!limpio(g.nombre)) return { error: "Ponle nombre al grupo." };
  const sb = await createClient();
  const fila = { empresa_id: g.empresa_id, nombre: limpio(g.nombre), interventor_id: g.interventor_id, coordinador_id: g.coordinador_id };
  const { error } = g.id ? await sb.from("seg_grupos").update(fila).eq("id", g.id) : await sb.from("seg_grupos").insert(fila);
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Esa empresa ya tiene un grupo con ese nombre." : error.message };
  refrescar();
  return { ok: "Grupo guardado." };
}
export async function borrarGrupo(id: string): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.from("seg_grupos").delete().eq("id", id);
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Grupo quitado: su gente vuelve a los responsables de la empresa." };
}
