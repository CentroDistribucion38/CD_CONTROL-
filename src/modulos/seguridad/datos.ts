/**
 * SEGURIDAD · CERTIFICACIONES — LO QUE SE LEE DE LA BASE (servidor).
 * Una sola lectura arma todas las pantallas: personas (con su licencia vigente y a quién se le exige), las reglas, el
 * maestro (empresas, grupos, responsables, validadores) y el historial de validaciones para los indicadores.
 */
import { createClient } from "@/lib/supabase/server";
import { CONFIG_CERT, type ConfigCert, type PersonaCert, type ValidacionHist } from "./certificaciones";

/** Interventor ABI o Coordinador de la contratista. El coordinador responde a un interventor (interventor_id):
 *  la app le avisa al interventor y el interventor a su coordinador. */
export type Responsable = { id: string; nombre: string; tipo: "interventor" | "coordinador"; telefono: string | null; correo: string | null; activo: boolean; interventor_id?: string | null };
export type Validador = { id: string; nombre: string; activo: boolean };
export type Empresa = { id: string; nombre: string; alias: string[]; departamento: string; activa: boolean; interventor_id: string | null; coordinador_id: string | null };
export type Grupo = { id: string; empresa_id: string; nombre: string; interventor_id: string | null; coordinador_id: string | null };
export type Reglas = ConfigCert & { departamentos: string[] };

export type DatosCert = {
  falta: boolean; error: string | null;
  personas: PersonaCert[];
  reglas: Reglas;
  empresas: Empresa[]; grupos: Grupo[]; responsables: Responsable[]; validadores: Validador[];
};

const VACIO: DatosCert = {
  falta: false, error: null, personas: [], reglas: { ...CONFIG_CERT, departamentos: ["LOGISTICA"] },
  empresas: [], grupos: [], responsables: [], validadores: [],
};

/** Todas las filas de una tabla o vista, de mil en mil (Supabase corta en mil). */
async function todo<T>(q: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const out: T[] = [];
  for (let i = 0; i < 50; i++) {
    const { data, error } = await q(i * 1000, i * 1000 + 999);
    if (error) return { data: out, error };
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}

export async function leerCertificaciones(): Promise<DatosCert> {
  const sb = await createClient();
  const [p, r, e, g, s, v] = await Promise.all([
    todo<PersonaCert & { expedicion: string | null; vencimiento: string | null }>((a, b) => sb.from("v_seg_personas").select("*").order("cedula").range(a, b)),
    sb.from("seg_reglas").select("*").eq("id", 1).maybeSingle(),
    sb.from("seg_empresas").select("*").order("nombre"),
    sb.from("seg_grupos").select("*").order("nombre"),
    sb.from("seg_responsables").select("*").order("nombre"),
    sb.from("seg_validadores").select("*").order("nombre"),
  ]);
  if (p.error) {
    const falta = p.error.code === "42P01" || /does not exist|no existe|schema cache/i.test(p.error.message);
    return { ...VACIO, falta, error: falta ? null : p.error.message };
  }
  const rg = r.data as { vigencia: number; aviso: number; criticos: number; departamentos: string[] } | null;
  return {
    falta: false, error: null,
    /* Una persona sin ninguna validación no tiene licencia: no entra a los cálculos (no se puede saber cuándo vence). */
    personas: p.data.filter((x) => x.vencimiento && x.expedicion).map((x) => ({
      ...x, empresa: x.empresa ?? "SIN EMPRESA", permisos: x.permisos ?? [], expedicion: String(x.expedicion), vencimiento: String(x.vencimiento),
    })),
    reglas: rg ? { vigencia: rg.vigencia, diasAviso: rg.aviso, diasCriticos: rg.criticos, departamentos: rg.departamentos ?? ["LOGISTICA"] } : VACIO.reglas,
    empresas: (e.data ?? []) as Empresa[],
    grupos: (g.data ?? []) as Grupo[],
    responsables: (s.data ?? []) as Responsable[],
    validadores: (v.data ?? []) as Validador[],
  };
}

/** El historial de validaciones (para los indicadores): de quién, cuándo se expidió, cuándo vencía y quién validó. */
export async function leerHistorialValidaciones(): Promise<ValidacionHist[]> {
  const sb = await createClient();
  const { data } = await todo<ValidacionHist>((a, b) => sb.from("seg_validaciones").select("cedula, expedicion, vencimiento, validador").order("expedicion").range(a, b));
  return data;
}

export type EventoPersona = { tipo: string; detalle: string | null; por_nombre: string | null; en: string };
export type ValidacionPersona = { expedicion: string; vencimiento: string; permisos: string[]; nivel: string | null; validador: string | null; sop: string | null; origen: string };
