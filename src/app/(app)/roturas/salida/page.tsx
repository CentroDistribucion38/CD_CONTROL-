import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { salidas as leerSalidas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "../roturas.css";
import { SinTablas } from "../comunes";
import { Salidas } from "./Salidas";

export const dynamic = "force-dynamic";

export default async function SalidasPage() {
  const [permisos, datos, nombres] = await Promise.all([
    misPermisos(), leerSalidas(), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  const abiertas = datos.salidas.filter((s) => s.estado === "abierta");
  const porFirmar = datos.salidas.filter((s) => s.estado === "cerrada" && !s.completa).length;
  const enPiso = abiertas.reduce((t, s) => t + s.neto_kg, 0);

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · SALIDA DE VIDRIO</p>
          <h1>Lo que sale por la puerta</h1>
          <p className="sub">
            Aquí se pesa: bruto menos la tara de la tolva. La tara vive en el maestro y se copia
            a la línea al pesar, así que el día que cambie una tolva las salidas viejas siguen
            mostrando la tara con la que de verdad se pesaron. Y son tres firmas de tres
            personas distintas: quien pesa no verifica, y quien verifica no factura.
          </p>
        </div>
        <div className="kpi">
          <div className="corte" aria-hidden />
          <div className="rot">EN SALIDAS ABIERTAS</div>
          <div className="num">{kilos(enPiso)}<span className="u">kg</span></div>
          <div className="pie">
            {abiertas.length} abierta{abiertas.length === 1 ? "" : "s"}
            {porFirmar > 0 && ` · ${porFirmar} esperando firma`}
          </div>
        </div>
      </section>

      <Salidas salidas={datos.salidas} nombres={nombres}
               puedeAbrir={permisos.puedeEditar("/roturas/salida")} />
    </div>
  );
}
