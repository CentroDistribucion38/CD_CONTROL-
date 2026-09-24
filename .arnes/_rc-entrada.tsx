
import { createRoot } from "react-dom/client";
import { Rejilla } from "../src/app/(app)/quiebra/rotura/Rejilla";
import { Dias } from "../src/app/(app)/quiebra/rotura/Dias";
import { MasDelDia } from "../src/app/(app)/quiebra/rotura/MasDelDia";
const L = (linea: number) => ({ linea, tren: "", centro_coste: "", activo: true, orden: linea });
const M = (item: number, nombre: string, orden: number) => ({ item, nombre, activo: true, orden });
const maquinas = [M(9,"DESEMPACADORA",1), M(1,"DESEMPACADORA - LAVADORA",2), M(12,"LAVADORA",3),
  M(6,"SALIDA DE LAVADORA",4), M(2,"LAVADORA - LLENADORA",5), M(8,"OMNIVISION",6), M(11,"ENVASADORA",7),
  M(3,"LLENADORA - PASTEURITZADOR",8), M(13,"PASTEURIZADORA",9), M(4,"PASTEURIZADORA - ETIQUETADORA",10),
  M(7,"ETIQUETADORA",11), M(5,"ETIQUETADORA - EMPACADORA",12), M(10,"EMPACADORA",13), M(66,"CARGADOR",14), M(155,"PALE-DEPA",15)];
const envases = [{ material: "3500005", descripcion: "Envase Costeñita 175R", peso_kg: 0.21, activo: true, orden: 1 },
                 { material: "400733", descripcion: "ENVASE MARRON 330NR CERVEZAS", peso_kg: 0.177, activo: true, orden: 2 }];
const pesadas = [{ linea: 1, turno: 2, envase: "400733", envase_nombre: "", toma: 1, maquinas: 3, kg: 109, und: 619, baja: false },
                 { linea: 2, turno: 1, envase: "400733", envase_nombre: "", toma: 1, maquinas: 2, kg: 73, und: 412, baja: true },
                 { linea: 4, turno: 2, envase: "3500005", envase_nombre: "", toma: 1, maquinas: 4, kg: 300, und: 1339, baja: false }];
createRoot(document.getElementById("r")!).render(<>
  <Dias dia="2026-09-21" hoy="2026-09-21" esHoy={true} />
  <section className="rl-cabeza">
    <div><p className="rl-ojo">QUIEBRA · ROTURA DE LÍNEA · TURNO B · 08 · 16</p><h1>Rotura de línea</h1>
      <p className="rl-sub">El envase que se rompe mientras se envasa, máquina por máquina.</p></div>
    <div className="rl-panel"><div className="rl-corte" /><div className="rl-rot">ROTAS HOY</div>
      <div className="rl-num">2.370</div><div className="rl-pie">unidades · <b>482 kg</b> · 3 pesadas</div></div>
  </section>
  <div className="rl-marco">
    <Rejilla fecha="2026-09-21" lineas={[L(1),L(2),L(4),L(6)] as any} maquinas={maquinas as any}
             envases={envases as any} pesadas={pesadas as any} firmas={[]} turnoAhora={2}
             puedeEditar={true} esAdmin={false} />
    <MasDelDia pendientes={2}>
      <div className="rl-caja"><div className="rl-cab"><h2>El día, por línea</h2></div>
        <div className="rl-fila-linea"><span className="rl-etq">Línea 1</span><span className="rl-pista"><i style={{ width: "60%" }} /></span><span className="rl-v">1.031</span></div></div>
      <div className="rl-caja ojo"><div className="rl-cab"><h2>Sin dar de baja</h2></div><div className="rl-grande">2</div></div>
    </MasDelDia>
  </div>
  <div style={{ height: 900 }} />
</>);
