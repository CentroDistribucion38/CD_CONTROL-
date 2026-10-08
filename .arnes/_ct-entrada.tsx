import { createRoot } from "react-dom/client";
import { Casco } from "@/app/(app)/inventario/casco/Casco";
const sitios = [
  { clave: "BODEGA 38", nombre: "AG22 EER Barranquilla", baja_rotulo: "Extrasucio con baja", orden: 1, centro: "AG22" },
  { clave: "FABRICA", nombre: "AG18 EER Fábrica", baja_rotulo: "Lavado con baja", orden: 2, centro: "AG18" },
  { clave: "CARNAVAL", nombre: "AG07 Alm. Bodega Carnaval", baja_rotulo: null, orden: 3, centro: "AG07" },
  { clave: "CARNAVAL PALMAR", nombre: "CA22 ERR Atlántico", baja_rotulo: null, orden: 4, centro: "CA22" },
];
const M = (sku: string, nombre: string, hl: number) => ({ sku, nombre, corto: true, botellas_estiba: 1000, hl_estiba: hl });
const materiales = [M("3500005", "Envase Costeñita 175R", 1.75), M("3500162", "Envase Marron 330R", 3.3), M("3500446", "Envase Marron Club Col 330R", 3.3), M("3501430", "ENVASE COSTENA BACANA 320CC R", 3.2)];
createRoot(document.getElementById("raiz")!).render(<Casco sitios={sitios as any} materiales={materiales as any} hoy="2026-10-08" puestos={["P19", "P16/20"]} puedeEditar={true} />);
