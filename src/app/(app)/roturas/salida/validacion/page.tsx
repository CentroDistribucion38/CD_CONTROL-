import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { salidas as leerSalidas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "../../roturas.css";

export const dynamic = "force-dynamic";

/**
 * VALIDACIÓN SE MUDÓ A FACTURACIÓN.
 *
 * «Que facturación no haga doble trabajo validando allá en salida y en
 * traspaso. Que cuando hagan el registro se genere una cédula, un
 * número único, y cuando facturación vaya a dar salida a un Vh de
 * traspaso y ese Vh tenga tolvas, en un desplegable aparezcan los
 * registros únicos que tenemos.»
 *
 * LA PANTALLA NO SE BORRA, Y NO ES POR NOSTALGIA. Hay gente con este
 * enlace guardado y en la app instalada no hay barra de direcciones
 * donde corregirlo; borrarla los dejaría en un 404 que no explica nada.
 * Y su ruta sigue registrada —oculta— porque los permisos están
 * guardados EN LA BASE como el texto de la dirección: quitarla del
 * registro dejaría esas filas sin forma de verse ni de cambiarse.
 *
 * LO QUE HACE AHORA ES LLEVAR DE LA MANO: dice a dónde se mudó, cuántas
 * cédulas están esperando Vh en este momento, y el botón que lleva allá.
 * Un letrero que solo dice «esto se movió» obliga a adivinar a dónde.
 */
export default async function ValidacionPage() {
  const [permisos, datos] = await Promise.all([misPermisos(), leerSalidas(300)]);

  /* LAS QUE ESTÁN ESPERANDO VH. Si la migración del vidrio todavía no se
     ha corrido, `despachada_en` no existe y esto da undefined en todas:
     se cuentan igual las cerradas sin despachar, que es lo mismo que
     valía ayer. Nada se rompe por el orden en que se corran las cosas. */
  const esperando = (datos.falta ? [] : datos.salidas).filter(
    (s) => s.estado === "cerrada" && !!s.supervisora_en && !s.despachada_en);
  const kg = esperando.reduce((t, s) => t + Number(s.neto_kg), 0);
  const puedeFacturar = permisos.puedeVer("/traspasos/facturacion");

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · SALIDA</p>
          <h1>Validación se mudó a <em>Facturación</em></h1>
          <p className="sub">
            El aval del vidrio ya no se da aquí. Al cerrar el pesaje, la salida queda con su
            <b> cédula</b> —el mismo código con el que nace, <code>SR-0001</code>— y facturación
            la despacha en el momento de darle la salida al viaje: escoge la cédula de esa placa,
            cuenta las tolvas, y si cuadran el Vh sale con las dos cosas resueltas de una.
          </p>
        </div>
      </section>

      <section className="caja">
        <div className="cab">
          <div>
            <h2>
              {esperando.length === 0
                ? "No hay vidrio esperando Vh"
                : `${esperando.length} cédula${esperando.length === 1 ? "" : "s"} esperando Vh`}
            </h2>
            <p>
              {esperando.length === 0
                ? "Todo lo que se ha pesado ya salió con su viaje."
                : <>Son <b>{kilos(kg)}</b> de vidrio pesados y cerrados, esperando que el Vh de
                    su placa salga por Facturación.</>}
            </p>
          </div>
        </div>

        {esperando.length > 0 && (
          <ul className="firma-vieja">
            {esperando.slice(0, 12).map((s) => (
              <li key={s.id}>
                <b>{s.codigo}</b> · placa {s.placa ?? "—"} · {s.tolvas} tolva{s.tolvas === 1 ? "" : "s"} · {kilos(Number(s.neto_kg))}
              </li>
            ))}
            {esperando.length > 12 && <li>y {esperando.length - 12} más…</li>}
          </ul>
        )}

        <div className="pie-reg">
          {puedeFacturar
            ? <Link className="btn si" href="/traspasos/facturacion">Ir a Facturación</Link>
            : <p className="sub">
                Facturación la ve quien tenga el rol Facturación, o lo tenga asignado en
                Administración → Roles.
              </p>}
          <Link className="btn" href="/roturas/salida">Volver a Pesar</Link>
        </div>
      </section>
    </div>
  );
}
