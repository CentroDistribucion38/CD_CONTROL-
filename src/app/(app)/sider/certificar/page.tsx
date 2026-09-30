import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";
import { misPermisos } from "@/lib/permisos";
import { maestroSider, fichasPendientes } from "@/modulos/sider/datos";
import "../sider.css";
import { Certificar } from "./Certificar";

export const dynamic = "force-dynamic";

export default async function CertificarPage() {
  const supabase = await createClient();
  const user = await usuarioActual();
  const [, maestro, mias] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    maestroSider(),
    /* MIS FICHAS: las que yo creé y esperan factura. El facturador ve las
       de todos en «Dar salida»; aquí solo las mías. */
    fichasPendientes(user!.id),
  ]);
  /* El permiso es de ESTA pantalla, no un "es admin o supervisor"
     global: un rol puede certificar y no tocar el maestro. */
  const esEditor = (await misPermisos()).puedeEditar("/sider/certificar");

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
            Un paso por pantalla: ubicación, origen, uno o varios materiales con sus
            estibas, placa y tres fotos. Al guardar queda una ficha pendiente; el
            facturador le pone la factura y le da salida en{" "}
            <Link href="/sider/salida">Dar salida</Link>. La llegada se certifica en{" "}
            <Link href="/sider/transito">tránsito</Link>.
          </p>
        </div>
      </section>

      <Certificar
        origenes={maestro.origenes}
        skus={maestro.skus}
        estibasPorSider={estibas}
        esEditor={esEditor}
        fichas={mias.fichas}
      />
    </div>
  );
}
