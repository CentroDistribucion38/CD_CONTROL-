
import { createRoot } from "react-dom/client";
import { Turnos } from "../src/app/(app)/traspasos/control/Turnos";
const w = window as any;
createRoot(document.getElementById("r")!).render(
  <div className="tp">
    <section className="medidor">
      <Turnos anillos={w.ANILLOS} filas={w.FILAS} desde={w.DESDE} hasta={w.HASTA}
              rotulo="Lunes, 21 de septiembre de 2026" adherencia={w.ADH}
              adheridos={w.ADHERIDOS} planeado={w.PLANEADO} />
    </section>
  </div>);
