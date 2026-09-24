/* EL PASO DE FOTOS DE LA LLEGADA con la ranura de observación.
   Se monta la CajaObservacion junto a las tres ranuras reales, que es
   como sale en la pantalla, para medir si cabe en 360 y si el «+» llega
   al blanco de toque. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  RANURAS, RANURA_OBS, type Ranura, type RanuraCualquiera, type Foto,
  Ranurita, CajaObservacion,
} from "@/modulos/sider/evidencia";

/* Una foto falsa: un lienzo 4:3 de color, sellado como las de verdad. */
function fotoFalsa(txt: string): Foto {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 480;
  const x = c.getContext("2d")!;
  x.fillStyle = "#123"; x.fillRect(0, 0, 640, 480);
  x.fillStyle = "#8fd"; x.font = "bold 42px sans-serif"; x.fillText(txt, 24, 250);
  return { blob: new Blob(), url: c.toDataURL("image/jpeg"), ancho: 640, alto: 480 };
}

function Arnes() {
  const [fotos, setFotos] = useState<Partial<Record<RanuraCualquiera, Foto>>>({
    costado_izq: fotoFalsa("IZQ"),
    costado_der: fotoFalsa("DER"),
  });
  const [nota, setNota] = useState(
    "Llegó con el sello de la puerta izquierda roto y dos estibas del fondo golpeadas."
  );
  return (
    <div className="sd">
      <section className="tarjeta ct">
        <div className="ct-paso tr-llegada">
          <div className="tr-quien">
            <div>
              <h2>Tres fotos de SXX123</h2>
              <p className="ct-dice">
                Cada una queda sellada con la placa, la fecha, la hora y las
                coordenadas quemadas en la esquina. Si algo llegó mal, déjalo
                dicho abajo y, si se puede, fotografíalo.
              </p>
            </div>
            <button type="button" className="btn plano">← Volver al tránsito</button>
          </div>

          <div className="ct-fotos">
            {RANURAS.map((r) => (
              <Ranurita key={r.id} r={r} foto={fotos[r.id]}
                        tomar={(ran: Ranura) => setFotos((f) => ({ ...f, [ran]: fotoFalsa(ran) }))} />
            ))}
          </div>

          <CajaObservacion
            punta="llegada"
            nota={nota}
            setNota={setNota}
            foto={fotos[RANURA_OBS.id]}
            tomar={() => setFotos((f) => ({ ...f, observacion: fotoFalsa("OBS") }))}
            quitar={() => setFotos(({ observacion: _, ...r }) => r)}
          />

          <div className="ct-botones">
            <button type="button" className="btn">Falta 1 foto</button>
            <button type="button" className="btn plano">Volver</button>
          </div>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("r")!).render(<Arnes />);
