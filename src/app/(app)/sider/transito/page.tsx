import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";
import { misPermisos } from "@/lib/permisos";
import { viajesEnTransito, maestroSider, nombresTodos } from "@/modulos/sider/datos";
import { maestrosAi } from "@/modulos/sider/ai";
import "../sider.css";
import "@/modulos/sider/ai.css";
import { Transito } from "./Transito";

export const dynamic = "force-dynamic";

const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** Horas que lleva en camino, del intervalo de Postgres. */
function horas(iv: string | null): number {
  if (!iv) return 0;
  const m = iv.match(/(?:(\d+) days? )?(\d+):(\d+):/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 24 + Number(m[2]) + Number(m[3]) / 60;
}

export default async function TransitoPage() {
  const supabase = await createClient();
  const user = await usuarioActual();
  /* LAS CUATRO DE UNA. Antes iban en tres tandas —los viajes, después
     los permisos, después los nombres—, y la pantalla tardaba lo que
     SUMAN las tres aunque ninguna dependa de la anterior. Los nombres se
     traen todos porque así no hay que esperar los viajes para saber por
     cuáles preguntar. */
  /* EL MAESTRO BAJA CON LA PANTALLA porque los desplegables de la
     corrección lo necesitan, y va en la MISMA tanda: son dos listas
     cortas —dieciséis orígenes y veintiún materiales— y esperar a que
     alguien toque «Corregir» para pedirlas dejaría el cuadro en blanco
     medio segundo, justo encima del formulario. */
  const [{ data: perfil }, { viajes, falta }, maestro, permisos, nombres] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    viajesEnTransito(),
    maestroSider(),
    /* Ver el tránsito lo puede todo el mundo: de eso se trata, que el que
       recibe sepa qué viene. Certificar la llegada, no. */
    /* El permiso es de ESTA pantalla, no un "es admin o supervisor"
       global: un rol puede certificar y no tocar el maestro. */
    misPermisos(),
    nombresTodos(),
  ]);
  const esEditor = permisos.puedeEditar("/sider/transito");
  /* PEDIR UNA REVISIÓN AI ES SOLO DEL ADMINISTRADOR: cuesta media hora
     de muelle y termina en un cobro al socio. Aquí solo se decide si se
     pinta el botón; el candado está en la base. */
  const esAdmin = perfil?.rol === "admin";

  if (falta) {
    return (
      <div className="sd">
        <section className="sin-tablas">
          <h2>Falta crear el módulo en Supabase</h2>
          <p>
            Ejecuta <code>supabase/modulos/sider.sql</code> en el SQL Editor. Sin eso no
            hay dónde leer los viajes.
          </p>
        </section>
      </div>
    );
  }

  /* LOS MAESTROS DE LA REVISIÓN AI, SOLO SI HAY A QUIÉN REVISAR.
     Son cuatro listas cortas —catorce defectos, dieciocho envases,
     sesenta y tres socios, cuatro canales— y bajan con la pantalla para
     que el formulario aparezca INSTANTÁNEO cuando alguien cierra la
     llegada de un vehículo marcado: en el muelle, con una barra de carga
     encima, el que está contando botellas se va a buscar el papel.

     Y no bajan nunca si ningún vehículo en tránsito está marcado, que es
     el caso normal: no se le cobra a todo el mundo el peso de una
     pantalla que casi nadie abre. */
  const hayAi = viajes.some((v) => v.requiere_ai);
  const maestros = hayAi ? await maestrosAi() : null;

  const totalSider = viajes.reduce((s, v) => s + Number(v.sider ?? 0), 0);
  const trabados = viajes.filter((v) => horas(v.en_camino) > 24).length;
  const sinEvidencia = viajes.filter((v) => v.fotos_salida < 3).length;

  return (
    <div className="sd tr-pantalla">
      {/* La cabeza y las alertas se le pasan al cliente en vez de dibujarse
          aquí, porque cuando alguien abre un vehículo para cerrar su
          llegada las esconde: el conteo de los otros doce y el "12
          vehículos en camino" son ruido cuando se está cerrando UNO, y en
          el celular ese ruido se lleva 195 px de los 844 que hay —medido—.
          Desde el servidor no hay forma de saber que lo abrió. */}
      <Transito esAdmin={esAdmin} viajes={viajes}
        nombres={nombres}
        /* CORREGIR Y ANULAR: el MISMO candado que en Fuente principal.
           `manda` es el rol marcado como tal en Administración → Roles,
           y es lo que comprueban por su cuenta `sider_viaje_editar` y
           `sider_viaje_anular`. Pintar el botón con otra condición que
           la de la base solo produce botones que dan error al tocarlos. */
        manda={permisos.manda}
        origenes={maestro.origenes.filter((o) => o.activo).map((o) => ({ planta: o.planta, cd_origen: o.cd_origen }))}
        skus={maestro.skus.filter((k) => k.activo).map((k) => ({ sku: k.sku, descripcion: k.descripcion }))}
        maestrosAi={maestros}
        esEditor={esEditor}
        trabados={trabados}
        sinEvidencia={sinEvidencia}
        cabeza={
      <section className="cabeza">
        <div>
          <h1>En tránsito</h1>
          <p className="sub">
            Qué viene en camino hacia Barranquilla: placa, de dónde sale, qué trae y hace
            cuánto salió. {esEditor
              ? "Cuando uno llegue, se certifica la llegada desde su tarjeta."
              : "Certificar la llegada requiere rol de supervisor."}{" "}
            <Link href="/sider">Ver la fuente principal</Link>
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">VEHÍCULOS EN CAMINO</div>
          <div className="num">{viajes.length}</div>
          <div className="pie">
            <span>{nf2.format(totalSider)} sider en tránsito</span>
            {esEditor && <Link href="/sider/certificar" className="chip">Certificar salida</Link>}
          </div>
        </div>
      </section>
        }
      />
    </div>
  );
}
