import { misPermisos } from "@/lib/permisos";
import { maestroInventario, miConteoFefo } from "@/modulos/inventario/fefo";
import "../fefo.css";
import { Contar } from "./Contar";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · LA PLANTILLA DE CONTEO.
 *
 * Es la hoja CONTEO del Excel, vacía, para caminar la bodega. De sus 25
 * columnas solo se teclean diez; las otras quince son VLOOKUP contra el
 * maestro o cuentas, y las hace la base.
 *
 * SE ABRE EN EL CELULAR, de pie frente a un módulo. Por eso el maestro
 * entero baja con la página: 494 materiales y 428 ubicaciones caben de
 * sobra en una consulta, y tenerlos en el navegador es lo que permite
 * reconocer el código MIENTRAS SE TECLEA y llenar el desplegable del
 * módulo sin ir al servidor — que es lo que se siente lento con señal de
 * bodega.
 */
export default async function ConteoFefoPage() {
  const [permisos, m] = await Promise.all([misPermisos(), maestroInventario()]);
  const puedeContar = permisos.puedeEditar("/inventario/conteo");

  if (m.falta) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>Falta preparar el conteo en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta{" "}
            <code>supabase/migraciones/2026-09-inventario-fefo.sql</code> y después{" "}
            <code>supabase/datos/inventario-maestro-cd38.sql</code>, en ese orden.
          </p>
        </section>
      </div>
    );
  }

  /* LA BODEGA DEL CD. Con una sola no se pregunta: preguntar algo que
     tiene una sola respuesta posible es un paso de más frente a una
     estiba. Con varias, manda la que tenga ubicaciones cargadas. */
  const conUbicaciones = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => conUbicaciones.has(b.id)) ?? m.bodegas[0] ?? null;

  if (!bodega) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>No hay bodega con ubicaciones</h2>
          <p>
            El conteo se camina por módulos, y los módulos cuelgan de una bodega. Corre{" "}
            <code>supabase/datos/inventario-maestro-cd38.sql</code>, que crea la bodega CD38
            con sus 428 ubicaciones, o agrégalas desde el maestro.
          </p>
        </section>
      </div>
    );
  }

  const { conteo, renglones } = await miConteoFefo(bodega.id);
  const ubis = m.ubicaciones.filter((u) => u.bodega_id === bodega.id);

  return (
    /* «contando» pliega la cabecera en el celular: ver arriba en
       fefo.css por qué. */
    <div className="fe contando">
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · CONTEO POR MÓDULO</p>
          <h1>Contar</h1>
          <p className="sub">
            Se camina módulo por módulo: escoges dónde estás una vez y vas anotando lo que
            hay. Cada renglón queda guardado al momento con tu nombre. El total de cajas, el
            vencimiento y los días para salir los calcula la base con las fórmulas de la
            hoja — aquí solo se anota lo que se ve.
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">{conteo ? "RECORRIDO ABIERTO" : "BODEGA"}</div>
          <div className="num">{conteo ? renglones.length : bodega.codigo}</div>
          <div className="pie">
            {conteo
              ? `renglones · ${new Set(renglones.map((r) => r.ubicacion)).size} módulos`
              : `${ubis.length} ubicaciones para caminar`}
          </div>
        </div>
      </section>

      {!puedeContar ? (
        <section className="fe-faltan">
          <p><b>Solo de lectura.</b> Para contar hace falta permiso de edición en esta
          pantalla — pídelo en Admin → Usuarios.</p>
        </section>
      ) : (
        <Contar
          bodegaId={bodega.id}
          conteoInicial={conteo}
          renglonesIniciales={renglones}
          materiales={m.materiales}
          ubicaciones={ubis}
          estados={m.estados}
        />
      )}
    </div>
  );
}
