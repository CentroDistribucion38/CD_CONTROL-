import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import "../roles/roles.css";
import "./fiscal.css";
import { ModoFiscal, type PerfilFiscal, type RolFiscal } from "./ModoFiscal";

export const dynamic = "force-dynamic";

/**
 * ADMINISTRACIÓN · MODO FISCAL.
 *
 * Quien administra escoge a qué roles y a qué personas se les activa el «solo fiscal»: esa gente ve
 * únicamente Inventario → Conteos → Contar, y dentro solo el fiscal que le habilitaron. Para escoger
 * hay que escribir el PIN cada vez que se abre la pantalla. Solo quien administra la ve.
 */
export default async function ModoFiscalPage() {
  const permisos = await misPermisos();
  if (!permisos.manda) {
    return (
      <div className="rl">
        <section className="tarjeta"><div className="cab"><div>
          <h2>Esta pantalla es de quien administra</h2>
          <p>El modo FISCAL lo configura un rol que administre la plataforma. El tuyo,{" "}
            <b>{permisos.nombreRol}</b>, no lo hace. <Link href="/inicio">Volver</Link></p>
        </div></div></section>
      </div>
    );
  }

  const supabase = await createClient();
  const [r, p, d] = await Promise.all([
    supabase.from("roles").select("clave, nombre, manda").order("orden", { nullsFirst: false }).order("nombre"),
    supabase.from("perfiles").select("id, usuario, nombre, rol, activo").order("nombre"),
    supabase.from("modo_fiscal_destinos").select("tipo, clave"),
  ]);

  return (
    <div className="rl fis">
      <div className="cabeza">
        <div>
          <p className="ojo">PLATAFORMA · ADMINISTRACIÓN</p>
          <h1>Modo FISCAL</h1>
          <p className="sub">
            Para que en el día del inventario la gente no se enrede: a quien actives aquí la aplicación le
            muestra <b>solo Inventario → Contar</b>, y dentro de Contar <b>solo el fiscal que le habilitaron</b>
            {" "}(o «en espera» si todavía no). No ve FEFO ni ningún otro módulo. Quien administra la plataforma
            nunca queda en este modo.
          </p>
        </div>
      </div>
      {d.error ? (
        <section className="sin-tablas">
          <h2>Falta correr un archivo en Supabase</h2>
          <p>Ejecuta <code>supabase/migraciones/2026-11-modo-fiscal.sql</code> en el SQL Editor. Crea la lista
            de a quién se le activa y guarda el PIN cifrado.</p>
        </section>
      ) : (
        <ModoFiscal
          roles={(r.data ?? []) as RolFiscal[]}
          perfiles={(p.data ?? []) as PerfilFiscal[]}
          inicial={{
            roles: ((d.data ?? []) as { tipo: string; clave: string }[]).filter((x) => x.tipo === "rol").map((x) => x.clave),
            usuarios: ((d.data ?? []) as { tipo: string; clave: string }[]).filter((x) => x.tipo === "usuario").map((x) => x.clave),
          }}
        />
      )}
    </div>
  );
}
