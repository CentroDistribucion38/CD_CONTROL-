
import { createRoot } from "react-dom/client";
import { Diferencias } from "../src/app/(app)/traspasos/control/Diferencias";
const w = window as any;
createRoot(document.getElementById("r")!).render(<div className="tp"><Diferencias lineas={[]} hayCorte={false} rotulo="martes, 22 de septiembre de 2026" desde="2026-09-16" hasta="2026-09-17"
  tope={false} sinDocumento={[]} conDocumento={w.F} nombres={{}} puedeDepurar={w.D} /></div>);
