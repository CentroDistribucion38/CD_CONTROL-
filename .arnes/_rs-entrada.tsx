
import { createRoot } from "react-dom/client";
import { Filtros } from "../src/app/(app)/roturas/Filtros";
createRoot(document.getElementById("r")!).render(
  <div className="rt" style={{ padding: 16 }}>
    <Filtros hoy="2026-09-23" cuenta="1 salida en el filtro" campos={[
      { clave: "placa", rotulo: "Placa", todas: "todas", opciones: Array.from({ length: 20 }, (_, i) => { const p = "PL" + String(i).padStart(4, "0");
       return { id: p, nombre: p } }) },
      { clave: "color", rotulo: "Color", todas: "todos", opciones: [
        { id: "ambar", nombre: "Ámbar" }, { id: "flint", nombre: "Flint" },
        { id: "green", nombre: "Green" }] },
      { clave: "tolva", rotulo: "Tolva", todas: "todas", opciones: [
        { id: "TOLVA-1", nombre: "TOLVA-1" }, { id: "TOLVA-2", nombre: "TOLVA-2" }] },
    ]} />
  </div>);
