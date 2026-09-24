
import { createRoot } from "react-dom/client";
import { Tablero } from "../src/app/(app)/acciones/tablero/Tablero";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Tablero acciones={w.ACC} areas={w.AR} nombres={w.NOM} meta={90} puedeReportar puedeEditar manda />);
