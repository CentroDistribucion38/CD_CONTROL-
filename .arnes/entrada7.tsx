/* LA REJILLA DEL DIARIO — la tabla más apretada de la aplicación.
   31 columnas de días + concepto + total, con casillas de escritura en
   cada una. Si el aire del celular rompe algo, se rompe aquí primero. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Rejilla, type ColumnaDia } from "@/app/(app)/quiebra/diario/Rejilla";
import { CAUSALES } from "@/modulos/quiebra/diario";

const dias = (n: number): ColumnaDia[] =>
  Array.from({ length: n }, (_, i) => {
    const f = `2026-08-${String(i + 1).padStart(2, "0")}`;
    const prod = 38000 + ((i * 7919) % 9000);
    const baja = 420 + ((i * 4133) % 700);
    const desglose = i % 5 === 0;
    const causalVale: Record<string, number | null> = {};
    const causalesEsc: Record<string, string> = {};
    CAUSALES.forEach((cc, j) => {
      const v = desglose ? 40 + ((i * (j + 3) * 131) % 180) : null;
      causalVale[cc] = v;
      if (desglose) causalesEsc[cc] = String(v);
    });
    const bajaEf = desglose
      ? CAUSALES.reduce((s, cc) => s + (causalVale[cc] ?? 0), 0)
      : baja;
    return {
      fecha: f, produccion: prod, baja: bajaEf, pct: bajaEf / prod, meta: 0.0135,
      sapProduccion: prod - 120, sapBaja: baja + 15,
      produccionEsc: String(prod), bajaEsc: desglose ? "" : String(baja),
      causalesEsc, hayDesglose: desglose, causalVale,
    };
  });

function Arnes() {
  const [abierto, setAbierto] = useState("2026-08-12");
  const [desglose, setDesglose] = useState(true);
  return (
    <div className="qb qd">
      <section className="tarjeta">
        <div className="cab"><div><h2>Quiebra diaria</h2><p>Agosto de 2026 — CD38</p></div></div>
        <Rejilla cols={dias(31)} editable abierto={abierto}
                 escribir={() => {}} abrir={setAbierto}
                 mostrarDesglose={desglose}
                 alternarDesglose={() => setDesglose((v) => !v)} />
      </section>
    </div>
  );
}

createRoot(document.getElementById("r")!).render(<Arnes />);
