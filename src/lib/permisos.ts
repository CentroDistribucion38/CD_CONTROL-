/**
 * QUÉ PUEDE HACER QUIEN ENTRÓ.
 *
 * Los permisos son DATOS: viven en las tablas roles y rol_permisos, y se
 * editan desde /admin/roles. Aquí solo se leen, una vez por pantalla, y
 * se contestan tres preguntas:
 *
 *   nivel(ruta)       → 'ninguno' | 'ver' | 'editar'
 *   puedeVer(ruta)    → ¿aparece en el menú y deja entrar?
 *   puedeEditar(ruta) → ¿salen los botones de guardar?
 *
 * LA CLAVE ES LA RUTA de la sección (/sider/transito), la misma de
 * src/modulos/registro.ts. Un segundo identificador en paralelo sería un
 * segundo sitio donde equivocarse.
 *
 * OJO: esto decide qué se DIBUJA. Quien de verdad manda es la base —RLS
 * y las funciones con security definer—, porque a una pantalla escondida
 * se llega igual escribiendo la URL. Las dos capas dicen lo mismo, pero
 * la que protege es la de abajo.
 */

import { createClient } from "@/lib/supabase/server";
import { MODULOS, type Modulo } from "@/modulos/registro";

export type Nivel = "ninguno" | "ver" | "editar";

export type Permisos = {
  /** La clave del rol: 'admin', 'porteria'… */
  rol: string;
  /** El nombre para mostrar. */
  nombreRol: string;
  /** Puede todo y administra roles y usuarios. */
  manda: boolean;
  nivel: (ruta: string) => Nivel;
  puedeVer: (ruta: string) => boolean;
  puedeEditar: (ruta: string) => boolean;
  /** Los módulos que esta persona puede ver, ya filtrados. */
  modulos: Modulo[];
  /**
   * Si las tablas de roles todavía no existen. Sin esto, un proyecto al
   * que le falta correr 02-roles.sql dejaría a todo el mundo sin nada y
   * nadie sabría por qué.
   */
  falta: boolean;
};

/** Todo cerrado: lo que se devuelve cuando no hay sesión. */
const NADA: Permisos = {
  rol: "", nombreRol: "", manda: false,
  nivel: () => "ninguno", puedeVer: () => false, puedeEditar: () => false,
  modulos: [], falta: false,
};

export async function misPermisos(): Promise<Permisos> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NADA;

  const [perfilR, rolesR, permisosR] = await Promise.all([
    supabase.from("perfiles").select("rol, activo").eq("id", user.id).single(),
    supabase.from("roles").select("clave, nombre, manda"),
    supabase.from("rol_permisos").select("rol, seccion, nivel"),
  ]);

  const rol = (perfilR.data?.rol as string) ?? "operador";

  /* Si las tablas no están, se cae del lado de ANTES: admin y supervisor
     editan, el resto mira. Es lo que hacía es_editor() y evita que un
     proyecto a medio migrar quede inservible. Se avisa con falta:true
     para que la pantalla lo diga en vez de que alguien se pregunte por
     qué no ve el menú. */
  if (rolesR.error || permisosR.error) {
    const viejo = rol === "admin" || rol === "supervisor";
    const nivel = (): Nivel => (viejo ? "editar" : "ver");
    return {
      rol, nombreRol: rol, manda: rol === "admin",
      nivel, puedeVer: () => true, puedeEditar: () => viejo,
      modulos: MODULOS.filter((m) => m.activo && !m.oculto),
      falta: true,
    };
  }

  const suRol = (rolesR.data ?? []).find((r) => r.clave === rol);
  const manda = !!suRol?.manda;

  const mapa = new Map<string, Nivel>();
  for (const p of (permisosR.data ?? []) as { rol: string; seccion: string; nivel: Nivel }[]) {
    if (p.rol === rol) mapa.set(p.seccion, p.nivel);
  }

  const nivel = (ruta: string): Nivel => (manda ? "editar" : mapa.get(ruta) ?? "ninguno");
  const puedeVer = (ruta: string) => nivel(ruta) !== "ninguno";
  const puedeEditar = (ruta: string) => nivel(ruta) === "editar";

  /* Un módulo se ve si se puede ver ALGUNA de sus secciones. Mostrar un
     módulo cuyas cinco pantallas están cerradas es prometer una puerta
     que no abre. */
  const modulos = MODULOS.filter((m) => {
    if (!m.activo || m.oculto) return false;
    return m.secciones.some((s) => puedeVer(s.ruta)) || puedeVer(m.ruta);
  });

  return {
    rol, nombreRol: suRol?.nombre ?? rol, manda,
    nivel, puedeVer, puedeEditar, modulos, falta: false,
  };
}

/** Las secciones de un módulo que esta persona puede ver. */
export function seccionesVisibles(m: Modulo, p: Permisos) {
  return m.secciones.filter((s) => p.puedeVer(s.ruta));
}
