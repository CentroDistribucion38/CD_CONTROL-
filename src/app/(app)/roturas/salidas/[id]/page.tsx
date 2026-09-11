import Link from "next/link";
import { notFound } from "next/navigation";
import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { unaSalida, tolvas as leerTolvas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Pesar } from "./Pesar";

export const dynamic = "force-dynamic";

/**
 * UNA SALIDA. Pantalla propia y no un panel dentro de la lista: quien
 * está pesando tiene la báscula al lado y va a estar aquí veinte
 * minutos. En un cajón de 300 px, con el resto de las salidas moviéndose
 * alrededor, se teclea el bruto en la línea equivocada.
 */
export default async function SalidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [permisos, datos, maestro, nombres] = await Promise.all([
    misPermisos(), unaSalida(id), leerTolvas(), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;
  if (!datos.salida) notFound();

  const s = datos.salida;

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">
            <Link href="/roturas/salidas" style={{ color: "inherit" }}>← SALIDAS</Link>
            {" · "}{s.codigo}
          </p>
          <h1>{s.estado === "abierta" ? "Pesando" : s.completa ? "Salida completa" : "Esperando firmas"}</h1>
          <p className="sub">
            {s.observacion
              ? s.observacion
              : "Bruto menos la tara de cada tolva. La tara viene del maestro y se copia a la línea al pesar, así que esta salida seguirá mostrando la tara con la que de verdad se pesó."}
          </p>
        </div>
        <div className="kpi">
          <div className="corte" aria-hidden />
          <div className="rot">NETO DE ESTA SALIDA</div>
          <div className="num">{kilos(s.neto_kg)}<span className="u">kg</span></div>
          <div className="pie">{s.firmas} de 3 firmas · {s.tolvas} tolva{s.tolvas === 1 ? "" : "s"}</div>
        </div>
      </section>

      <Pesar
        salida={s}
        tolvas={datos.tolvas}
        maestro={maestro}
        nombres={nombres}
        rol={permisos.rol}
        manda={permisos.manda}
      />
    </div>
  );
}
