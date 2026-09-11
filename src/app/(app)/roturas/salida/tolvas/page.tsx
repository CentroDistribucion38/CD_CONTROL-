import { misPermisos } from "@/lib/permisos";
import { tolvas, usoDeMaestros } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Maestro } from "../../Maestro";

export const dynamic = "force-dynamic";

/**
 * LAS TOLVAS Y SU TARA — el maestro de la salida.
 *
 * ES UNA SOLA CIFRA POR TOLVA Y ES LA MÁS DELICADA DEL MÓDULO. La tara
 * se teclea una vez aquí y después se copia sola a cada línea al pesar,
 * sin que nadie la vuelva a mirar. Un 111 escrito 11 hace que todas las
 * salidas de esa tolva salgan con cien kilos de más, y eso no lo ve
 * nadie hasta que la factura no cuadra.
 *
 * Y cambiarla no toca lo viejo: como se copia a la línea, una salida de
 * hace tres meses sigue mostrando la tara con la que de verdad se pesó.
 */
export default async function TolvasPage() {
  const [permisos, tols, uso] = await Promise.all([
    misPermisos(), tolvas(false), usoDeMaestros(),
  ]);

  if (!tols.length && !Object.keys(uso.tolvas).length) {
    return <div className="rt"><SinTablas /></div>;
  }

  const activas = tols.filter((t) => t.activo);
  const distintas = new Set(activas.map((t) => Number(t.tara_kg))).size;

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · SALIDA · TOLVAS</p>
          <h1>Las tolvas y su tara</h1>
          <p className="sub">
            Lo que pesa cada tolva vacía. Se teclea una vez aquí y después se copia sola a cada
            pesaje, así que es la cifra que más silenciosamente puede estar mal. Cambiarla no
            toca las salidas viejas: aquellas guardan la tara con la que de verdad se pesaron.
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">TOLVAS ACTIVAS</div>
          <div className="num">{activas.length}<span className="u">tolvas</span></div>
          <div className="pie">
            {distintas <= 1
              ? `todas con la misma tara${activas[0] ? ` de ${kilos(activas[0].tara_kg)} kg` : ""}`
              : `${distintas} taras distintas en uso`}
          </div>
        </div>
      </section>

      <Maestro
        hojas={["tolvas"]}
        materiales={[]} procesos={[]} causas={[]} tolvas={tols}
        uso={uso} puedeEditar={permisos.puedeEditar("/roturas/salida/tolvas")}
      />
    </div>
  );
}
