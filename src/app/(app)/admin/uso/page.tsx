import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { rango, type UsoDia, type UsoPantalla, type UsoUsuario } from "@/modulos/uso/uso";
import "../roles/roles.css";
import "./uso.css";
import { Uso } from "./Uso";

export const dynamic = "force-dynamic";

const hoyLocal = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/**
 * ADMINISTRACIÓN · USO DE LA APP.
 *
 * «La usabilidad por usuario»: quién entra, cuánto, a qué módulos y
 * pantallas, y quién no la usa. Solo quien administra.
 */
export default async function UsoPage() {
  const permisos = await misPermisos();
  if (!permisos.manda) {
    return (
      <div className="rl">
        <section className="tarjeta"><div className="cab"><div>
          <h2>Esta pantalla es de quien administra</h2>
          <p>El uso de la app lo ve un rol que administre la plataforma. El tuyo,{" "}
            <b>{permisos.nombreRol}</b>, no lo hace. <Link href="/inicio">Volver</Link></p>
        </div></div></section>
      </div>
    );
  }

  const hoy = hoyLocal();
  const { desde, hasta } = rango(30, hoy);
  const supabase = await createClient();
  const [u, d, p, r] = await Promise.all([
    supabase.rpc("uso_usuarios", { p_desde: desde, p_hasta: hasta }),
    supabase.rpc("uso_dias", { p_desde: desde, p_hasta: hasta }),
    supabase.rpc("uso_pantallas", { p_desde: desde, p_hasta: hasta }),
    supabase.from("roles").select("clave, nombre, manda").order("orden", { nullsFirst: false }).order("nombre"),
  ]);

  return (
    <div className="rl uso">
      <div className="cabeza">
        <div>
          <p className="ojo">PLATAFORMA · ADMINISTRACIÓN</p>
          <h1>Uso de la app</h1>
          <p className="sub">
            Quién entra a CONTROL, cuántas veces, a qué módulos y pantallas, y cuánto tiempo está de verdad
            ahí. Solo se anota <b>dónde</b> estuvo cada persona, nunca lo que escribió ni lo que vio.
          </p>
        </div>
      </div>
      {u.error ? (
        <section className="sin-tablas">
          <h2>Falta correr un archivo en Supabase</h2>
          <p>Ejecuta <code>supabase/migraciones/2026-10-uso-por-usuario.sql</code> en el SQL Editor.
            Crea el registro de visitas y las consultas de esta pantalla. El uso se cuenta desde el día en que se corre.</p>
        </section>
      ) : (
        <Uso hoy={hoy} inicial={{ desde, hasta, usuarios: (u.data ?? []) as UsoUsuario[], dias: (d.data ?? []) as UsoDia[], pantallas: (p.data ?? []) as UsoPantalla[] }}
             roles={(r.data ?? []) as { clave: string; nombre: string; manda: boolean }[]} />
      )}
    </div>
  );
}
