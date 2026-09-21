import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { hayLlaveDeServicio } from "@/lib/supabase/servicio";
import "../roles/roles.css";
import "./datos.css";
import { BorrarDatos, type Punto, type Borrado } from "./BorrarDatos";

export const dynamic = "force-dynamic";

const hoyLocal = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/**
 * ADMINISTRACIÓN · BORRAR DATOS.
 *
 * «Algo donde pueda elegir algo en específico y borrar la data con el fin
 * de empezar de cero. No módulos en general, sino puntos específicos.»
 *
 * Se elige UN punto (los viajes de Traspasos, las pesadas de Rotura de
 * línea…), un rango de fechas o todo, se ve cuánto se va, se baja la
 * copia en Excel y se escribe BORRAR. Solo quien administra.
 */
export default async function DatosPage() {
  const permisos = await misPermisos();
  if (!permisos.manda) {
    return (
      <div className="rl">
        <section className="tarjeta"><div className="cab"><div>
          <h2>Esta pantalla es de quien administra</h2>
          <p>Borrar datos requiere un rol que administre la plataforma. El tuyo,{" "}
            <b>{permisos.nombreRol}</b>, no lo hace. <Link href="/inicio">Volver</Link></p>
        </div></div></section>
      </div>
    );
  }

  const supabase = await createClient();
  const [cat, hist] = await Promise.all([
    supabase.rpc("admin_borrado_catalogo"),
    supabase.from("v_admin_borrados").select("id, nombre, desde, hasta, filas, archivos, borrado_nombre, borrado_en")
      .order("borrado_en", { ascending: false }).limit(15),
  ]);

  return (
    <div className="rl bd">
      <div className="cabeza">
        <div>
          <p className="ojo">PLATAFORMA · ADMINISTRACIÓN</p>
          <h1>Borrar datos</h1>
          <p className="sub">
            Para empezar de cero en un punto específico, sin tocar lo demás. Los maestros,
            los usuarios y los roles no se borran desde aquí.
          </p>
        </div>
      </div>
      {cat.error ? (
        <section className="sin-tablas">
          <h2>Falta correr un archivo en Supabase</h2>
          <p>Ejecuta <code>supabase/migraciones/2026-09-admin-borrar-datos.sql</code> en el SQL Editor.
            Crea la lista de lo que se puede borrar y el registro de quién borró qué.</p>
        </section>
      ) : (
        <BorrarDatos puntos={(cat.data ?? []) as Punto[]} historial={(hist.data ?? []) as Borrado[]}
                     hoy={hoyLocal()} hayLlave={hayLlaveDeServicio()} />
      )}
    </div>
  );
}
