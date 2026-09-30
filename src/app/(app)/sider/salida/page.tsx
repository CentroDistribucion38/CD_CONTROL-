import Link from "next/link";
import { usuarioActual } from "@/lib/sesion";
import { misPermisos } from "@/lib/permisos";
import { maestroSider, fichasPendientes, nombresTodos } from "@/modulos/sider/datos";
import "../sider.css";
import { DarSalida } from "./DarSalida";

export const dynamic = "force-dynamic";

/**
 * DAR SALIDA — LO QUE HACE EL FACTURADOR.
 *
 * En el patio se certifica el camión y queda una ficha pendiente. Aquí el
 * facturador ve las fichas, escribe el número de factura y le da salida:
 * ahí nacen los viajes en tránsito, uno por material.
 */
export default async function SalidaPage() {
  const user = await usuarioActual();
  const [maestro, pend, nombres] = await Promise.all([
    maestroSider(), fichasPendientes(), nombresTodos(),
  ]);
  const permisos = await misPermisos();
  const puedeDarSalida = permisos.puedeEditar("/sider/salida");

  if (maestro.falta || pend.falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta preparar «Dar salida» en Supabase</h2>
          <p>
            Ejecuta <code>supabase/migraciones/2026-09-sider-fichas-de-salida.sql</code> en
            el SQL Editor. Sin eso no existen las fichas.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="sd">
      <section className="cabeza">
        <div>
          <h1>Dar salida</h1>
          <p className="sub">
            Cada ficha es un camión que ya se certificó en el patio. Escribe el número de
            factura y dale salida: pasa a <Link href="/sider/transito">En tránsito</Link>,
            un viaje por material.
          </p>
        </div>
      </section>

      <DarSalida
        fichas={pend.fichas}
        origenes={maestro.origenes}
        skus={maestro.skus}
        estibasPorSider={Number(maestro.parametros.find((p) => p.clave === "estibas_por_sider")?.valor ?? 36)}
        nombres={nombres}
        yo={user!.id}
        ahora={new Date().toISOString()}
        puedeDarSalida={puedeDarSalida}
      />
    </div>
  );
}
