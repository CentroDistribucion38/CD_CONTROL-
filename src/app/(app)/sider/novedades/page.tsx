import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import {
  novedadesSider, motivosNovedad, viajesEnTransito, nombresDe, hiloNovedades,
} from "@/modulos/sider/datos";
import "../sider.css";
import { Novedades } from "./Novedades";

export const dynamic = "force-dynamic";

/**
 * NOVEDADES DE T1 / T2 — la bandeja de lo que sale mal.
 *
 * Las cuatro consultas van en paralelo: en serie, la pantalla tarda lo
 * que suman y aquí ninguna depende de la anterior.
 */
export default async function NovedadesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [permisos, novedades, motivos, viajes] = await Promise.all([
    misPermisos(),
    novedadesSider(),
    motivosNovedad(),
    /* Los que van en camino: son los que pueden tener una novedad HOY.
       Para uno ya recibido se escribe la placa a mano, que es el mismo
       camino de T2. */
    viajesEnTransito(),
  ]);

  const puedeEditar = permisos.puedeEditar("/sider/novedades");

  /* Los nombres de quien reportó y de quien cerró, de una sola vez: uno
     por fila serían cuatrocientas consultas para pintar una lista. */
  const hilo = await hiloNovedades(novedades.map((n) => n.id));

  const nombres = await nombresDe([
    ...novedades.map((n) => n.creada_por),
    ...novedades.map((n) => n.cerrada_por),
    ...hilo.map((h) => h.escrita_por),
  ]);

  /* Desde dónde contesta esta persona. Se propone del perfil y se puede
     corregir en el formulario: alguien de Galapa que entra a responder
     no debería tener que escribir "CD Galapa" cada vez. */
  const { data: p } = await supabase
    .from("perfiles").select("bodega").eq("id", user!.id).maybeSingle();

  return (
    <div className="sd">
      <section className="cabeza">
        <div className="texto">
          <p className="ojo">T1 / T2 · NOVEDADES</p>
          <h1>Lo que salió mal</h1>
          <p className="sub">
            Sello roto, faltante, cliente cerrado, vehículo varado. Se reporta con
            su motivo, se mira, y se cierra diciendo qué se hizo.
          </p>
        </div>
      </section>

      <Novedades
        novedades={novedades}
        motivos={motivos}
        viajes={viajes.viajes.map((v) => ({
          id: v.id, placa: v.placa, cd_origen: v.cd_origen, descripcion: v.descripcion,
        }))}
        hilo={hilo}
        nombres={nombres}
        puedeEditar={puedeEditar}
        miBodega={String(p?.bodega ?? "")}
      />
    </div>
  );
}
