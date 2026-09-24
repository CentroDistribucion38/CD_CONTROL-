
import { createRoot } from "react-dom/client";
import { Rejilla } from "../src/app/(app)/quiebra/rotura/Rejilla";
const L = (linea: number) => ({ linea, tren: "", centro_coste: "", activo: true, orden: linea });
const M = (item: number, nombre: string, orden: number) => ({ item, nombre, activo: true, orden });
const maquinas = [M(9,"DESEMPACADORA",1), M(12,"LAVADORA",2), M(13,"PASTEURIZADORA",3), M(10,"EMPACADORA",4)];
const envases = [{ material: "3500005", descripcion: "Envase Costeñita 175R", peso_kg: 0.2, activo: true, orden: 1 },
                 { material: "400733", descripcion: "Envase Marron 330NR", peso_kg: 0.25, activo: true, orden: 2 }];
const firmas = [{ linea: 6, turno: 2, firmado_nombre: "Ana", firmado_en: "2026-09-21T10:00:00Z",
                  firmadas: 100, unidades_hoy: 100, cambio_despues: false, nota: null }];
createRoot(document.getElementById("r")!).render(
  <div className="rl-marco">
    <Rejilla fecha="2026-09-21" lineas={[L(1),L(2),L(4),L(6)] as any} maquinas={maquinas as any}
             envases={envases as any} pesadas={[] as any} firmas={firmas as any} turnoAhora={2}
             puedeEditar={true} esAdmin={false} />
  </div>);
