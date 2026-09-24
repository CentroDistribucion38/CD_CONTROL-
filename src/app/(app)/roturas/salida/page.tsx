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
  /* LAS QUE YA SON CÉDULA Y ESPERAN VH. Cerradas por quien pesó y sin
     despachar. Se llamaban «esperando firma» cuando después venía
     Validación; hoy lo que esperan es un camión, no una firma, y decir
     «esperando firma» manda a buscar una pantalla que ya no existe. */
  const esperandoVh = datos.salidas.filter((s) => s.estado === "cerrada" && !s.completa).length;
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
            mostrando la tara con la que de verdad se pesaron. Al cerrar, la salida se va de
            esta pantalla y queda como <b>cédula</b>, esperando el Vh: facturación la despacha
            al dar la salida al viaje de traspaso de esa misma placa.
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">PESÁNDOSE AHORA</div>
          <div className="num">{kilos(enPiso)}<span className="u">kg</span></div>
          <div className="pie">
            {abiertas.length} abierta{abiertas.length === 1 ? "" : "s"}
            {esperandoVh > 0 &&
              ` · ${esperandoVh} cédula${esperandoVh === 1 ? "" : "s"} esperando Vh`}
          </div>
        </div>
      </section>

      <Salidas salidas={datos.salidas} nombres={nombres}
               puedeAbrir={permisos.puedeEditar("/roturas/salida")}
               manda={permisos.manda} />
    </div>
  );
}
