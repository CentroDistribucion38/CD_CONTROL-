
import { createRoot } from "react-dom/client";
import { Barra } from "../src/app/(app)/traspasos/control/Barra";
const w = window as any;
const TIPOS = [
  { clave: "casco", nombre: "Casco vidrio", orden: 1, activo: true },
  { clave: "canastas", nombre: "Canastas", orden: 2, activo: true },
  { clave: "estibas", nombre: "Estibas", orden: 3, activo: true },
];
const raiz = createRoot(document.getElementById("r")!);
w.pintar = () => raiz.render(
  <div className="tp" data-tema={w.TEMA || undefined}>
    <Barra tipos={TIPOS as any} soloBotones hoy={w.HOY} dia={w.DIA} desde={w.DESDE} hasta={w.HASTA} />
    <Barra tipos={TIPOS as any} soloFiltros hoy={w.HOY} dia={w.DIA} desde={w.DESDE} hasta={w.HASTA} />
  </div>);
w.pintar();
