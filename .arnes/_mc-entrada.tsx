import { createRoot } from "react-dom/client";
import { Maestro } from "@/app/(app)/inventario/maestro/Maestro";
const bod = [{ id: "b1", codigo: "CD38", nombre: "CD38", direccion: null, activo: true }];
const mat = [{ id: "m1", sku: "11635", nombre: "Pony Malta EXP NR 330ccX30 CHI", activo: true, tipo_material: "PRODUCTO", familia: "Tw", cajas_por_estiba: 45, unidades_por_caja: 30, vida_util: 365, dias_minimo: 90 }];
createRoot(document.getElementById("raiz")!).render(<Maestro materiales={mat as any} ubicaciones={[]} bodegas={bod as any} esEditor={true} />);
