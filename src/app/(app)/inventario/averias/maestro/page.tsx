import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { averias, causales } from "@/modulos/averias/datos";
import "../../fefo.css";
import "../averias.css";
import { MaestroAverias } from "./MaestroAverias";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · AVERÍAS · MAESTRO.
 *
 * Lo que se puede escoger al registrar una avería. Hoy son las
 * causales y nada más: la ubicación no tiene maestro a propósito —uno
 * obligaría a dar de alta la calle antes de poder registrar, y así es
 * como se pierde el registro de algo que ya pasó— y el producto sale
 * del maestro de inventario, que ya existe.
 */
export default async function MaestroAveriasPage() {
  /* Aquí se piden TODAS, apagadas incluidas: el maestro es justamente
     donde se vuelve a encender lo que alguien apagó. */
  const [permisos, cau, av] = await Promise.all([
    misPermisos(), causales(false), averias(),
  ]);

  if (av.sinTabla) {
    return (
      <div className="fe">
        <section className="cabeza">
          <div>
            <p className="ojo">INVENTARIO · AVERÍAS · MAESTRO</p>
            <h1>Falta crear esta parte en Supabase</h1>
            <p className="sub">
              Corre <b>supabase/migraciones/2026-09-averias.sql</b> en el editor de SQL.
            </p>
          </div>
        </section>
      </div>
    );
  }

  /* CUÁNTAS VECES SE HA USADO CADA CAUSAL. Es lo que decide si tiene
     sentido ofrecer apagarla, y es el dato que evita la pregunta «¿y
     si la apago, qué pasa con las viejas?». */
  const uso: Record<string, number> = {};
  for (const a of av.lista) uso[a.causal] = (uso[a.causal] ?? 0) + 1;

  return (
    <div className="fe avr">
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · AVERÍAS · MAESTRO</p>
          <h1>Lo que se puede escoger</h1>
          <p className="sub">
            Las causales del registro de averías. Son datos y no código: el día que aparezca
            una causal que no estaba —«avería del proveedor», por decir— se agrega aquí y no
            esperando un despliegue. El <b>producto</b> sale del maestro de inventario y la{" "}
            <b>ubicación</b> no tiene maestro a propósito: uno obligaría a dar de alta la
            calle antes de poder registrar, y así se pierde el registro de algo que ya pasó.
          </p>
        </div>
      </section>

      <MaestroAverias causales={cau} uso={uso}
                      puedeEditar={permisos.puedeEditar("/inventario/averias/maestro")} />

      <p className="avr-pie-link">
        <Link href="/inventario/averias">← Registrar una avería</Link>
        {"  ·  "}
        <Link href="/inventario/averias/tablero">Tablero →</Link>
      </p>
    </div>
  );
}
