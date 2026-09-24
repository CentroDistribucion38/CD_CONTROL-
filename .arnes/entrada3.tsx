import { createRoot } from "react-dom/client";
import { Viajes } from "@/app/(app)/sider/Viajes";
// @ts-expect-error datos del arnés
import { viajesFalsos } from "./datos.mjs";

const viajes = viajesFalsos(60);
const origenes = [...new Set(viajes.map(v => v.cd_origen))].map(c => ({ planta: c.replace("CD ",""), cd_origen: c }));
const skus = [...new Map(viajes.map(v => [v.sku, { sku: v.sku, descripcion: v.descripcion }])).values()];

createRoot(document.getElementById("r")!).render(
  <div className="sd">
    <section className="tarjeta">
      <div className="cab"><div><h2>Los viajes</h2><p>Las columnas en gris no se guardan.</p></div></div>
      <Viajes viajes={viajes} nombres={{u1:"Cristian Pavi"}} origenes={origenes} skus={skus}
              manda={true} esEditor={true} />
    </section>
  </div>
);
