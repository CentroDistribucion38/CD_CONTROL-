import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { maestroSider } from "@/modulos/sider/datos";
import "../sider.css";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

export default async function MaestroPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, maestro] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    maestroSider(),
  ]);
  const esEditor = perfil?.rol === "admin" || perfil?.rol === "supervisor";

  if (maestro.falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta <code>supabase/modulos/sider.sql</code>. Siembra
            los 16 orígenes y los 21 materiales de tu Excel — una sola vez: de ahí en
            adelante manda esta pantalla, y volver a correr el archivo no pisa lo que
            hayas corregido aquí.
          </p>
        </section>
      </div>
    );
  }

  const estibas = Number(
    maestro.parametros.find((p) => p.clave === "estibas_por_sider")?.valor ?? 36
  );

  return (
    <div className="sd">
      <section className="cabeza">
        <div>
          <h1>Maestro</h1>
          <p className="sub">
            Los orígenes y los factores no están quemados en el código: viven aquí y se
            agregan, editan y quitan. De esta tabla salen las listas desplegables del
            formulario de <Link href="/sider/certificar">certificar</Link>, así que lo que
            cambies aquí cambia allá.
          </p>
        </div>
      </section>

      <Maestro
        origenes={maestro.origenes}
        skus={maestro.skus}
        estibasPorSider={estibas}
        esEditor={esEditor}
      />

      <p className="nota-pie">
        Quitar no es borrar. Si un origen o un material ya lo usó un viaje, se{" "}
        <b>desactiva</b>: deja de salir en las listas y los viajes viejos siguen
        leyéndose. Solo se borra de verdad lo que nadie ha usado todavía, y la base es la
        que decide cuál de las dos cosas hacer.
      </p>
    </div>
  );
}
