
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BuscarEnLista } from "../src/components/BuscarEnLista";

/* DEBAJO DEL BUSCADOR VA CONTENIDO A PROPÓSITO: es lo que la lista tapa
   cuando se abre, y lo que se veía atravesado cuando el fondo no
   resolvía. Sin esto, «la lista es opaca» no se podría comprobar
   mirando. */
function Caja() {
  const [v, setV] = useState("");
  return (
    <div style={{ padding: 16 }}>
      <BuscarEnLista id="p" valor={v} cambiar={setV}
        opciones={Array.from({ length: 40 }, (_, i) => ({
          clave: "SKU" + (1000 + i),
          nombre: i === 3 ? "AGUA ZALVA SIN GAS PET 1.5 L X 6" : "Producto " + i,
          codigo: String(13799 + i),
        }))} />
      <div id="debajo" style={{ background: "#111111", color: "#ffffff", padding: 40 }}>
        UNIDADES CONTAMINADAS · Atrás · Siguiente
      </div>
    </div>
  );
}
createRoot(document.getElementById("r")!).render(<Caja />);
