import { createRoot } from "react-dom/client";
import { Registrar } from "@/app/(app)/inventario/casco/registrar/Registrar";
const sitios = [
  { clave: "BODEGA 38", nombre: "AG22 EER Barranquilla", baja_rotulo: "Extrasucio con baja", orden: 1, centro: "AG22" },
  { clave: "FABRICA", nombre: "AG18 EER Fábrica", baja_rotulo: "Lavado con baja", orden: 2, centro: "AG18" },
  { clave: "CARNAVAL", nombre: "AG07 Alm. Bodega Carnaval", baja_rotulo: null, orden: 3, centro: "AG07" },
  { clave: "CARNAVAL PALMAR", nombre: "CA22 ERR Atlántico", baja_rotulo: null, orden: 4, centro: "CA22" },
];
const M = (sku: string, nombre: string, bot: number | null, hl: number | null) => ({ sku, nombre, corto: true, botellas_estiba: bot, hl_estiba: bot && hl ? bot * hl : null });
const materiales = [
  M("3500005", "Envase Costeñita 175R", 2052, 0.00175), M("3500162", "Envase Marron 330R", 1350, 0.0033),
  M("3500213", "Envase Flint 330R", 1350, 0.0033), M("3500446", "Marron Club", 1350, 0.0033),
  M("3500888", "Botella Marron 1000CC", 468, 0.01), M("3500887", "Flint 1000", 468, 0.01),
  M("3501226", "250 marron", 1710, 0.0025), M("3501430", "Bacana", 1350, 0.0032),
  /* 3501225 SIN FACTOR a propósito: tiene que salir en rojo. */
  M("3501225", "Flint 250", null, null),
];
createRoot(document.getElementById("raiz")!).render(<Registrar sitios={sitios as any} materiales={materiales as any} puedeEditar={true} />);
