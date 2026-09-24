
import { createRoot } from "react-dom/client";
import { Indicadores } from "../src/app/(app)/acciones/analisis/Indicadores";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Indicadores acciones={w.ACC} nombres={w.NOM} zonas={w.ZON}
  metas={{ efectividad: 90, aTiempo: 95 }} fotos={w.FOT} ahora={w.AHORA} />);
