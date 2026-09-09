import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { MODULOS } from "@/modulos/registro";
import "./roles.css";
import { Roles } from "./Roles";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const permisos = await misPermisos();

  if (permisos.falta) {
    return (
      <div className="rl">
        <section className="sin-tablas">
          <h2>Falta crear los roles en Supabase</h2>
          <p>
            Ejecuta <code>supabase/02-roles.sql</code> en el SQL Editor. Ese archivo
            convierte los roles de un enum escrito en el código a datos que se pueden
            crear y editar desde aquí. Se puede correr varias veces sin romper nada.
          </p>
        </section>
      </div>
    );
  }

  if (!permisos.manda) {
    return (
      <div className="rl">
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Solo lectura</h2>
              <p>
                Administrar roles requiere un rol que administre la plataforma. El tuyo,{" "}
                <b>{permisos.nombreRol}</b>, no lo hace. <Link href="/inicio">Volver</Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const supabase = await createClient();
  const [rolesR, permisosR, cuentaR] = await Promise.all([
    supabase.from("roles").select("clave, nombre, descripcion, manda, sistema, orden")
      .order("orden", { nullsFirst: false }).order("nombre"),
    supabase.from("rol_permisos").select("rol, seccion, nivel"),
    supabase.from("perfiles").select("rol"),
  ]);

  const cuantos: Record<string, number> = {};
  for (const p of (cuentaR.data ?? []) as { rol: string }[]) {
    cuantos[p.rol] = (cuantos[p.rol] ?? 0) + 1;
  }

  /* El catálogo de secciones sale del REGISTRO, no de la base: el
     registro es la única lista de pantallas que existe, y una sección
     nueva tiene que aparecer aquí sola el día que alguien la cree. */
  const catalogo = MODULOS.filter((m) => m.activo).map((m) => ({
    id: m.id,
    nombre: m.nombre,
    acento: m.acento,
    secciones: m.secciones,
  }));

  return (
    <div className="rl">
      <section className="cabeza">
        <div>
          <h1>Roles</h1>
          <p className="sub">
            Quién ve qué. Cada rol se marca pantalla por pantalla con tres niveles:{" "}
            <b>sin acceso</b>, <b>ver</b> y <b>editar</b>. Lo que no está marcado no se
            ve — ni siquiera aparece en el menú.
          </p>
        </div>
      </section>

      <Roles
        roles={rolesR.data ?? []}
        permisos={permisosR.data ?? []}
        catalogo={catalogo}
        cuantos={cuantos}
      />
    </div>
  );
}
