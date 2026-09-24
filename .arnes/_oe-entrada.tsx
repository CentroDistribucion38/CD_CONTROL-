
import { createRoot } from "react-dom/client";
import { Maestro } from "../src/app/(app)/quiebra/rotura/maestro/Maestro";
const E = (material: string, descripcion: string, orden: number | null, activo = true) => ({ material, descripcion, peso_kg: 0.21, activo, orden });
const envases = [E("400733", "ENVASE MARRON 330NR CERVEZAS", 1), E("412644", "ENVASE MARRON 330NR NUEVO", 2),
                 E("3500005", "Envase Costeñita 175R", 3), E("3500162", "Envase Marron 330R", 4, false)];
const uso = [{ clase: "envase", clave: "400733", registros: 3, unidades: 1, ultima: "" }, { clase: "envase", clave: "412644", registros: 163, unidades: 1, ultima: "" },
             { clase: "envase", clave: "3500005", registros: 7717, unidades: 1, ultima: "" }, { clase: "envase", clave: "3500162", registros: 5390, unidades: 1, ultima: "" }];
createRoot(document.getElementById("r")!).render(<Maestro lineas={[]} maquinas={[]} envases={envases as any} skus={[]} uso={uso as any} puedeEditar={true} />);
