
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Buscador } from "../src/components/Buscador";

const MODULOS = Array.from({ length: 50 }, (_, i) =>
  ({ valor: "P|" + String(i + 1).padStart(2, "0"), texto: String(i + 1).padStart(2, "0") }));
const CALLES = ["A", "B", "C", "D", "E"].map((c) => ({ valor: c, texto: c }));

function Caja() {
  const [mod, setMod] = useState("P|40");
  const [calle, setCalle] = useState("B");
  const [suelto, setSuelto] = useState("");
  return (
    <div className="fe" style={{ padding: 20, display: "grid", gap: 16, width: 320 }}>
      <label id="caja-mod"><span>Módulo</span>
        <Buscador valor={mod} opciones={MODULOS} onEscoge={setMod} desdeElSiguiente /></label>
      <label id="caja-calle"><span>Calle</span>
        <Buscador valor={calle} opciones={CALLES} onEscoge={setCalle} desdeElSiguiente /></label>
      {/* SIN NADA PUESTO: tiene que abrir arriba, como siempre. */}
      <label id="caja-suelto"><span>Sin escoger</span>
        <Buscador valor={suelto} opciones={MODULOS} onEscoge={setSuelto} desdeElSiguiente /></label>
      {/* Y EL QUE NO LO PIDE NO CAMBIA. */}
      <label id="caja-viejo"><span>Como antes</span>
        <Buscador valor={"P|40"} opciones={MODULOS} onEscoge={() => {}} /></label>
    </div>
  );
}
createRoot(document.getElementById("r")!).render(<Caja />);
