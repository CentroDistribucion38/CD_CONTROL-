
import { createRoot } from "react-dom/client";
import { Operarios } from "../src/app/(app)/roturas/Operarios";
createRoot(document.getElementById("r")!).render(
  <Operarios lista={[]} puedeEditar />);
