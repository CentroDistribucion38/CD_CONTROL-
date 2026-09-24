
import { createRoot } from "react-dom/client";
createRoot(document.getElementById("r")!).render(
  <div className="rt">
    <section className="cabeza">
      <div>
        <p className="ojo">ROTURAS · SALIDA · ANÁLISIS</p>
        <h1>Cuánto vidrio salió</h1>
        <p className="sub">Kilos netos de lo que ya salió por la puerta.</p>
      </div>
      <div className="cabeza-der">
        <div className="inf-bajar"><button className="inf-bt">Informe PDF</button></div>
        <div className="kpi">
          <span className="corte" />
          <div className="rot">NETO DESPACHADO</div>
          <div className="num">189<span className="u">kg</span></div>
          <div className="pie">1 salida completa</div>
        </div>
      </div>
    </section>
  </div>);
