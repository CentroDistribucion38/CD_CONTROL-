import { misPermisos } from "@/lib/permisos";
import { tipos as leerTipos, control, hoyLocal } from "@/modulos/traspasos/datos";
import { fecha as fechaLarga } from "@/modulos/traspasos/formato";
import "../traspasos.css";
import { SinTablas } from "../comunes";
import { Plan } from "./Plan";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const dia = hoyLocal();
  const [permisos, t, ctl] = await Promise.all([
    misPermisos(), leerTipos(), control(dia),
  ]);

  if (t.falta || ctl.falta) return <div className="tp"><SinTablas /></div>;

  return (
    <div className="tp">
      <section className="cabeza">
        <div>
          <p className="ojo">TRASPASOS · PLAN · CD38 AG01</p>
          <h1>Plan del día</h1>
          <p className="sub">
            {fechaLarga(dia)}. Cuántos viajes de cada tipo lleva cada turno. Lo cumplido no se
            escribe en ningún lado: lo cuenta la base sobre los viajes que se van registrando,
            así que el plan y la realidad nunca pueden decir cosas distintas.
          </p>
        </div>
      </section>

      <Plan filas={ctl.filas} tipos={t.tipos} fecha={dia}
            puedeEditar={permisos.puedeEditar("/traspasos/plan")} />
    </div>
  );
}
