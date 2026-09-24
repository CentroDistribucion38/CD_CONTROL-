import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { usuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import {
  averias, causales, productosDeAverias, ubicacionesMaestro,
} from "@/modulos/averias/datos";
import "../fefo.css";
import "./averias.css";
import { Averias } from "./Averias";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · AVERÍAS · REGISTRAR.
 *
 * «Dentro del inventario pon un módulo de avería.»
 *
 * VA EN INVENTARIO Y NO EN ROTURAS, aunque se parezcan: una rotura es
 * vidrio que se rompió y sale del CD en una tolva, se pesa en kilos y
 * termina en una salida. Una avería es PRODUCTO que ya no se puede
 * vender pero que sigue en la estiba, en su ubicación, contando en el
 * inventario hasta que llegue el documento de baja de SAP.
 */
export default async function AveriasPage() {
  const [permisos, user, av, cau, prods, ubis] = await Promise.all([
    misPermisos(), usuarioActual(), averias(), causales(),
    productosDeAverias(), ubicacionesMaestro(),
  ]);

  if (av.sinTabla) {
    return (
      <div className="fe">
        <section className="cabeza">
          <div>
            <p className="ojo">INVENTARIO · AVERÍAS</p>
            <h1>Falta crear esta parte en Supabase</h1>
            <p className="sub">
              Abre el editor de SQL y corre <b>supabase/migraciones/2026-09-averias.sql</b>.
              Se puede correr varias veces sin romper nada. Después, esta pantalla arranca
              vacía y la primera avería se registra aquí.
            </p>
          </div>
        </section>
      </div>
    );
  }

  /* EL NOMBRE DE QUIEN ESTÁ MIRANDO SE PROPONE COMO «la reporta», y no
     se impone: casi siempre la reporta quien la está cargando, pero no
     siempre —quien anda en la bodega dicta y otro teclea—, y forzarlo
     escribiría el nombre equivocado en el papel que después se firma. */
  const supabase = await createClient();
  const { data: perfil } = user
    ? await supabase.from("perfiles").select("nombre").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <div className="fe avr">
      <Averias
        modo="registrar"
        lista={av.lista}
        causales={cau}
        productos={prods}
        ubicaciones={ubis}
        puedeEditar={permisos.puedeEditar("/inventario/averias")}
        manda={permisos.manda}
        quien={(perfil?.nombre as string) ?? ""}
      />

      <p className="avr-pie-link">
        <Link href="/inventario/averias/tablero">Ver el tablero completo →</Link>
        {"  ·  "}
        <Link href="/inventario/averias/analisis">Análisis e informe →</Link>
      </p>
    </div>
  );
}
