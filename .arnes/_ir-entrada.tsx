
import { createRoot } from "react-dom/client";
import { Riesgo } from "../src/app/(app)/inventario/Riesgo";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Riesgo r={w.RR} bodega="AG01" sinContar={w.SC} ultimo="INV-002" />);
