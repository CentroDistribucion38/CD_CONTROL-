import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { maestros } from "@/modulos/rotlinea/datos";
import "../rotura.css";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

/**
 * EL MAESTRO DE ROTURA DE LÍNEA.
 *
 * Las cuatro listas de las que come el módulo: envases con su peso,
 * máquinas en el orden del tren, SKU con su envase, y las líneas. Son
 * datos de esta planta, no código: el día que entre un envase nuevo o
 * se instale una máquina, nadie debería esperar un despliegue.
 */
export default async function MaestroRoturaPage() {
  const [permisos, m] = await Promise.all([misPermisos(), maestros({ conUso: true })]);
  const puedeEditar = permisos.puedeEditar("/quiebra/rotura");

  if (m.falta) {
    return (
      <div className="rl">
        <section className="rl-sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Ejecuta <code>supabase/modulos/rotura-linea.sql</code> en el SQL Editor. Ese
            archivo crea las tablas y siembra estas cuatro listas con lo que traía la hoja
            MAESTRO del Excel.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="rl">
      <section className="rl-cabeza">
        <div>
          <p className="rl-ojo">QUIEBRA · ROTURA DE LÍNEA · MAESTRO</p>
          <h1>Maestro</h1>
          <p className="rl-sub">
            Los envases con su peso, las máquinas del tren, los SKU y las líneas. Es lo que se
            puede escoger al registrar, y salió de la hoja MAESTRO del archivo de Excel.{" "}
            <Link href="/quiebra/rotura">Volver a registrar</Link>
          </p>
        </div>
      </section>

      <Maestro lineas={m.lineas} maquinas={m.maquinas} envases={m.envases}
               skus={m.skus} uso={m.uso} puedeEditar={puedeEditar} />
    </div>
  );
}
