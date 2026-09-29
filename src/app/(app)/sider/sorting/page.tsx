import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { maestrosAi, sortingPendientes, sortingHechos } from "@/modulos/sider/ai";
import type { Viaje } from "@/modulos/sider/comun";
import "../sider.css";
import "@/modulos/sider/ai.css";
import { Sorting } from "./Sorting";

export const dynamic = "force-dynamic";

/**
 * SORTING — LO QUE LOS MUCHACHOS TIENEN POR HACER.
 *
 * «Apenas certifiquen la llegada en tránsito, si esa tiene asignación de
 *  Sorting pues pase a Sorting para que allí los muchachos no se
 *  enreden y culminen de terminarlo.»
 *
 * Un camión llega a esta lista por UNA sola razón: el administrador pidió
 * Sorting y alguien certificó su llegada. La lista la arma la base
 * (`v_sider_sorting_pendientes`) y no esta página, para que la pantalla y
 * la función que guarda no puedan discrepar sobre qué es «ya llegó».
 *
 * Y DE AQUÍ SE VA cuando alguien cierra el Sorting: pasa a «Hechos» y se
 * guarda con su categoría, aparte de la AI. Nada de lo que se cuenta
 * aquí toca el cobro al socio.
 */
export default async function SortingPage() {
  /* Los permisos primero y solos: de ellos depende si hay que traer los
     maestros del formulario. Quien solo mira la lista no los necesita, y
     son cuatro consultas más. */
  const permisos = await misPermisos();
  const puedeEditar = permisos.puedeEditar("/sider/sorting");

  const [pend, hechos, nombres, maestros] = await Promise.all([
    sortingPendientes(),
    sortingHechos(40),
    nombresTodos(),
    puedeEditar ? maestrosAi() : Promise.resolve(null),
  ]);

  /* SIN LA MIGRACIÓN NO HAY DE DÓNDE LEER, y se dice cuál es. Una
     pantalla en blanco no le explica nada al que está en el muelle. */
  if (pend.falta || hechos.falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta crear Sorting en Supabase</h2>
          <p>
            Ejecuta <code>supabase/migraciones/2026-09-sider-sorting.sql</code> en el SQL
            Editor. Sin eso no hay de dónde leer los camiones que pasan a Sorting.
          </p>
        </section>
      </div>
    );
  }

  /* LO QUE HAY QUE SABER DE CADA CAMIÓN —qué trae y de dónde viene— no
     está en la vista de pendientes, que solo dice cuáles son. Se piden
     por sus ids a la vista grande, que ya trae la descripción y las
     cifras: son poquísimos —los que llegaron y nadie ha clasificado— y
     la mayoría de los días son cero, así que ni siquiera se pregunta. */
  let detalle: Viaje[] = [];
  if (pend.pendientes.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("v_sider_viajes").select("*")
      .in("id", pend.pendientes.map((p) => p.viaje_id));
    detalle = (data ?? []) as unknown as Viaje[];
  }

  return (
    <div className="sd so-pantalla">
      <Sorting
        /* La hora del servidor, no `Date.now()` en el navegador: con la del
           navegador el texto «hace 3 h» sale distinto en el servidor y en
           el cliente, y React se queja de la diferencia. */
        ahora={new Date().toISOString()}
        pendientes={pend.pendientes}
        detalle={detalle}
        hechos={hechos.hechos}
        nombres={nombres}
        maestros={maestros && !maestros.falta ? maestros : null}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
