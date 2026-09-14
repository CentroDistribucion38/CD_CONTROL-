import { misPermisos } from "@/lib/permisos";
import {
  tipos as leerTipos, control, planDelDia, promedioDelDia, hoyLocal,
} from "@/modulos/traspasos/datos";
import { fecha as fechaLarga } from "@/modulos/traspasos/formato";
import "../traspasos.css";
import { SinTablas } from "../comunes";
import { Plan } from "./Plan";
import { Fechas } from "./Fechas";

export const dynamic = "force-dynamic";

export default async function PlanPage({ searchParams }: {
  searchParams: Promise<{ d?: string }>;
}) {
  const q = await searchParams;
  const hoy = hoyLocal();
  /* La fecha viaja en la dirección: así "el plan del martes" se puede
     mandar por WhatsApp y el botón de atrás deshace el salto de día. */
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.d ?? "") ? q.d! : hoy;
  const ayer = new Date(Date.parse(dia + "T12:00:00") - 86400_000)
    .toISOString().slice(0, 10);

  const [permisos, t, plan, ctl, prom, planAyer] = await Promise.all([
    misPermisos(), leerTipos(), planDelDia(dia), control(dia),
    promedioDelDia(dia), planDelDia(ayer),
  ]);

  if (t.falta || plan.falta) return <div className="tp"><SinTablas /></div>;

  const hayBorrador = plan.borrador.length > 0;

  return (
    <div className="tp">
      <section className="cabeza-ctl">
        <div>
          <Fechas dia={dia} esHoy={dia === hoy} hayBorrador={hayBorrador} />
          <h1>Plan del día</h1>
          <p className="sub" style={{ textTransform: "none" }}>
            <span style={{ textTransform: "capitalize" }}>{fechaLarga(dia)}</span>. Los tres
            turnos y los nueve tipos en una sola rejilla. Lo cumplido no se escribe aquí: lo
            cuenta la base sobre los viajes que se registran.
          </p>
        </div>
        <div className="der-ctl">
          <div className="panel-ojo">
            <div className="corte" aria-hidden />
            <div className="rot">VIAJES PLANEADOS</div>
            <div className="num">
              {plan.publicadas.reduce((a, l) => a + l.planeado, 0)}
            </div>
            <div className="pie">
              {hayBorrador
                ? "hay un borrador sin publicar"
                : `+${plan.vacios.reduce((a, v) => a + v.vacios, 0)} vacíos`}
            </div>
          </div>
        </div>
      </section>

      <Plan
        tipos={t.tipos}
        publicadas={plan.publicadas}
        borrador={plan.borrador}
        vaciosGuardados={plan.vacios}
        control={ctl.filas}
        promedio={prom}
        ayer={planAyer.publicadas}
        fecha={dia}
        esHoy={dia === hoy}
        puedeEditar={permisos.puedeEditar("/traspasos/plan")}
      />
    </div>
  );
}
