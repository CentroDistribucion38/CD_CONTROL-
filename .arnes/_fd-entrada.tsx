
import { createRoot } from "react-dom/client";
import { Bandeja } from "../src/app/(app)/traspasos/facturacion/Bandeja";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Bandeja pendientes={w.P} salieron={w.S} nombres={{ u1: "Santiago Leal" }} puedeConfirmar puedeReabrir={w.D} puedeDepurar={w.D} />);
