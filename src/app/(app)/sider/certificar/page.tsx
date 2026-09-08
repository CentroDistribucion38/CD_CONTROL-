import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { maestroSider } from "@/modulos/sider/datos";
import "../sider.css";
import { Certificar } from "./Certificar";

export const dynamic = "force-dynamic";

export default async function CertificarPage() {
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
            Ejecuta <code>supabase/modulos/sider.sql</code> en el SQL Editor. Sin eso no
            hay maestro del cual sacar las listas ni bucket donde guardar las fotos.
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
          <h1>Certificar salida</h1>
          <p className="sub">
            Un paso por pantalla. Se piden cinco cosas — ubicación, origen, material,
            estibas y placa — y las once columnas restantes se calculan solas.{" "}
            <Link href="/sider/transito">La llegada se certifica en tránsito</Link>
          </p>
        </div>
      </section>

      <Certificar
        origenes={maestro.origenes}
        skus={maestro.skus}
        estibasPorSider={estibas}
        esEditor={esEditor}
      />
    </div>
  );
}
