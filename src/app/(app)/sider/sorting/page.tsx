import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { nombresTodos, maestroSider } from "@/modulos/sider/datos";
import { maestrosAi, revisionesPendientes, revisionesHechas } from "@/modulos/sider/ai";
import type { Viaje } from "@/modulos/sider/comun";
import "../sider.css";
import "@/modulos/sider/ai.css";
import { Sorting } from "./Sorting";

export const dynamic = "force-dynamic";

/**
 * REVISIÓN AI — LO QUE ESPERA SU REVISIÓN, LAS DOS CLASES.
 *
 * «Lo que se llama Sorting que se llame Revisión AI, y allí dentro lo
 *  segregado: Revisión AI – normal y Revisión AI – certificada.»
 *
 * LA RUTA SIGUE SIENDO /sider/sorting. Los permisos de los roles están
 * guardados con esa ruta (`rol_permisos.seccion`); cambiarla dejaría
 * huérfanos los que ya se dieron y esta pantalla nacería cerrada para
 * todos. Lo que cambia es lo que se LEE: el nombre en el menú, el título
 * y los rótulos.
 *
 * Un camión llega a esta lista por UNA sola razón: se certificó su
 * llegada y tiene una revisión pedida —la certificada, que pide el
 * administrador a un camión de Sider; la normal, el Vh Interno, que
 * control crea AQUÍ MISMO con el «+» y nace ya recibido: no pide certificar
 * la llegada—. La lista la arma la
 * base (`v_sider_revision_pendientes`) y no esta página, para que la
 * pantalla y la función que guarda no puedan discrepar sobre qué es «ya
 * llegó».
 *
 * Y DE AQUÍ SE VA cuando alguien la cierra: pasa a «Hechas» y entra al
 * Informe AI con su marca. Las dos cobran.
 */
export default async function SortingPage() {
  /* Los permisos primero y solos: de ellos depende si hay que traer los
     maestros del formulario. Quien solo mira la lista no los necesita, y
     son cuatro consultas más. */
  const permisos = await misPermisos();
  const puedeEditar = permisos.puedeEditar("/sider/sorting");
  /* CREAR UN VH INTERNO tiene su propio permiso en Roles (Vh Interno (+)):
     quien puede cerrar revisiones no necesariamente puede crear camiones.
     Aquí solo se decide si se pinta el «+»; el candado está en la base. */
  const puedeCrear = permisos.puedeEditar("/sider/sorting/nuevo");

  const [pend, hechos, nombres, maestros, maestro] = await Promise.all([
    revisionesPendientes(),
    revisionesHechas(40),
    nombresTodos(),
    /* Los maestros de la AI también los necesita quien SOLO crea: el
       desplegable de socios del «+» sale de ahí. */
    puedeEditar || puedeCrear ? maestrosAi() : Promise.resolve(null),
    puedeCrear ? maestroSider() : Promise.resolve(null),
  ]);

  /* SIN LA MIGRACIÓN NO HAY DE DÓNDE LEER, y se dice cuál es. Una
     pantalla en blanco no le explica nada al que está en el muelle. */
  if (pend.falta || hechos.falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta preparar la Revisión AI en Supabase</h2>
          <p>
            Ejecuta, en este orden, <code>supabase/migraciones/2026-09-sider-sorting.sql</code> y{" "}
            <code>supabase/migraciones/2026-09-sider-revision-ai-interna.sql</code> en el SQL
            Editor. Sin eso no hay de dónde leer los camiones que esperan revisión.
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
        hechos={hechos.hechas}
        nombres={nombres}
        maestros={puedeEditar && maestros && !maestros.falta ? maestros : null}
        socios={puedeCrear && maestros && !maestros.falta
          ? maestros.socios.map((x) => ({ clave: x.clave, nombre: x.nombre })) : []}
        puedeEditar={puedeEditar}
        puedeCrear={puedeCrear}
        manda={permisos.manda}
        origenes={maestro?.origenes.filter((o) => o.activo)
          .map((o) => ({ planta: o.planta, cd_origen: o.cd_origen })) ?? []}
        skus={maestro?.skus.filter((k) => k.activo).map((k) => ({
          sku: k.sku, descripcion: k.descripcion, clase: k.clase,
          cajas_x_estiba: k.cajas_x_estiba, unidades_x_caja: k.unidades_x_caja,
          hl_x_unidad: k.hl_x_unidad,
        })) ?? []}
        estibasPorSider={Number(
          maestro?.parametros.find((q) => q.clave === "estibas_por_sider")?.valor ?? 36)}
      />
    </div>
  );
}
