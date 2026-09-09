import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { MODULOS } from "@/modulos/registro";
import { hayLlaveDeServicio } from "@/lib/supabase/servicio";
import "../roles/roles.css";
import "./usuarios.css";
import { Usuarios } from "./Usuarios";

export const dynamic = "force-dynamic";

/**
 * ADMINISTRACIÓN · USUARIOS.
 *
 * Crear la cuenta, ponerle el rol, y —si hace falta— darle una pantalla
 * suelta que su rol no incluye.
 *
 * La llave de servicio se comprueba AQUÍ, antes de dibujar el formulario:
 * si no está puesta, la pantalla lo dice con los pasos exactos en vez de
 * dejar llenar todo y fallar al guardar.
 */
export default async function UsuariosPage() {
  const permisos = await misPermisos();

  if (!permisos.manda) {
    return (
      <div className="rl">
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Solo lectura</h2>
              <p>
                Crear usuarios requiere un rol que administre la plataforma. El tuyo,{" "}
                <b>{permisos.nombreRol}</b>, no lo hace. <Link href="/inicio">Volver</Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [gente, roles] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, usuario, nombre, rol, activo, clave_provisional, permisos_extra")
      .order("nombre", { nullsFirst: false }),
    supabase.from("roles").select("clave, nombre, manda").order("orden", { nullsFirst: false }),
  ]);

  /* Si falta 03-usuarios.sql, las dos columnas nuevas no vienen. La
     pantalla lo dice y no se dibuja a medias. */
  const faltaSql = !!gente.error;

  /* El catálogo de pantallas sale del REGISTRO, que es la única lista
     que existe: una sección nueva aparece aquí sola el día que se cree. */
  const catalogo = MODULOS.filter((m) => m.activo).map((m) => ({
    id: m.id,
    nombre: m.nombre,
    acento: m.acento,
    secciones: m.secciones.map((s) => ({ nombre: s.nombre, ruta: s.ruta })),
  }));

  return (
    <div className="rl us">
      <div className="cabeza">
        <div>
          <p className="ojo">PLATAFORMA · ADMINISTRACIÓN</p>
          <h1>Usuarios</h1>
          <p className="sub">
            Crear la cuenta, ponerle el rol y, si hace falta, darle una pantalla
            que su rol no incluye. Los permisos de fondo se editan en{" "}
            <Link href="/admin/roles">Roles</Link>, que es donde se ve a quién más
            afectan.
          </p>
        </div>
      </div>

      {faltaSql ? (
        <section className="sin-tablas">
          <h2>Falta correr un archivo en Supabase</h2>
          <p>
            Ejecuta <code>supabase/03-usuarios.sql</code> en el SQL Editor. Agrega dos
            columnas al perfil: la marca de clave provisional y los permisos sueltos de
            una persona. Se puede correr varias veces sin romper nada.
          </p>
        </section>
      ) : (
        <Usuarios
          gente={(gente.data ?? []) as never[]}
          roles={(roles.data ?? []) as never[]}
          catalogo={catalogo}
          hayLlave={hayLlaveDeServicio()}
          yo={user?.id ?? ""}
        />
      )}
    </div>
  );
}
