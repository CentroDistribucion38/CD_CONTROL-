import { createRoot } from "react-dom/client";
import { TableroQuiebra } from "../src/components/TableroQuiebra";
const mp = [[1,84021165,1391020],[2,46916414,2220000],[3,82242176,888000],[4,78812732,2170000],[5,80500000,1470000],[6,79000000,1900000],[7,81000000,2600000],[8,77000000,2030000],[9,70000000,2790000]];
const bajas:any[] = [], produccion:any[] = [];
const causales = [["Sorting envase",.58],["Presorting",.215],["Rotura máquina",.113],["Lavado / extrasucio",.07],["Sorting distribución",.022]];
const alm = ["AG18","AG22","AG07"];
for (const [m,p,b] of mp) {
  const f = `2026-${String(m).padStart(2,"0")}-10`;
  produccion.push({ fecha: f, linea: 2, cantidad: p });
  causales.forEach(([c,s],i) => bajas.push({ fecha: f, causal: c, almacen: alm[i%3], material: "3500005", denominacion: "Envase Costeñita 175R", cantidad: Math.round((b as number)*(s as number)) }));
}
const metas = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => ({ anio: 2026, mes: m, meta: m===1?.0173:m===2?.0455:m===3?.0108:m===4?.0273:.0189 }));
createRoot(document.getElementById("r")!).render(<TableroQuiebra bajas={bajas} produccion={produccion} metas={metas} ultimaCarga={null} esEditor={false} />);
