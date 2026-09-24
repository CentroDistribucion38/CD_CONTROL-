/* LA PANTALLA DE SALIDA, para comprobar que quitarle la clase "ct"
   —la utilidad de rótulo de globals.css que colisionaba— no le rompió
   nada: que la letra suba a tamaño de lectura y que siga cabiendo. */
import { createRoot } from "react-dom/client";
import { Certificar } from "@/app/(app)/sider/certificar/Certificar";

const origenes = ["CD Galapa","CD Santa Marta","CD Turbaco","CD Unión Montería"]
  .map((c) => ({ cd_origen: c, planta: c.replace("CD ","") }));
const skus = [
  { sku: "3500028", descripcion: "AGUILA 330 RET" },
  { sku: "3500207", descripcion: "PONY MALTA 330 RET" },
];

createRoot(document.getElementById("r")!).render(
  <div className="sd">
    <Certificar origenes={origenes as never[]} skus={skus as never[]}
                estibasPorSider={24} esEditor />
  </div>
);
