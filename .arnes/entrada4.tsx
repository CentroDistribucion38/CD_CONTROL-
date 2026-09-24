import { createRoot } from "react-dom/client";
import { Transito } from "@/app/(app)/sider/transito/Transito";
// @ts-expect-error datos del arnés
import { viajesFalsos } from "./datos.mjs";

const viajes = viajesFalsos(22, { transito: true });
createRoot(document.getElementById("r")!).render(
  <div className="sd">
    <Transito viajes={viajes} nombres={{u1:"Cristian Pavi"}} esEditor={true}
              trabados={3} sinEvidencia={2}
              cabeza={
                <section className="cabeza">
                  <div><h1>En tránsito</h1><p className="sub">Los que van en camino a Barranquilla.</p></div>
                  <div className="kpi"><div className="corte" /><div className="rot">EN CAMINO</div>
                    <div className="num">22</div><div className="pie"><span>de hoy</span></div></div>
                </section>} />
  </div>
);
