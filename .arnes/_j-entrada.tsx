
import { createRoot } from "react-dom/client";
import { Informes } from "../src/app/(app)/quiebra/rotura/tablero/informes/Informes";
(window as any).montar = (hojas: any[]) => createRoot(document.getElementById("r")!).render(
  <Informes hojas={hojas} dias={[]} puedeAnular={false} desde="2026-09-01" hasta="2026-09-21" />);
