
import { createRoot } from "react-dom/client";
import { FirmaDedo } from "../src/app/(app)/quiebra/rotura/FirmaDedo";
(window as any).firma = undefined; (window as any).avisos = 0;
createRoot(document.getElementById("r")!).render(
  <FirmaDedo alCambiar={(p) => { (window as any).firma = p; (window as any).avisos++; }} />);
