import { useConfirmar } from "@/components/Confirmar";
import { createRoot } from "react-dom/client";

function Demo() {
  const [pedir, dialogo] = useConfirmar();
  return (
    <div style={{padding:20}}>
      {dialogo}
      <button id="peligro" onClick={() => pedir({
        titulo: "¿Borrar el rol «Supervisor de patio»?",
        dice: <>Esto <b>no se puede deshacer</b>. Quien tenga este rol se queda sin
              ninguno hasta que le asignes otro.</>,
        confirmar: "Borrar el rol", peligro: true,
      }).then(r => { (window as never as Record<string,unknown>).ultimo = r })}>peligro</button>
      <button id="normal" onClick={() => pedir({
        titulo: "Hay cambios sin guardar en este rol",
        dice: "Si cambias de rol ahora, lo que marcaste se pierde.",
        confirmar: "Cambiar y perderlos", cancelar: "Seguir aquí",
      }).then(r => { (window as never as Record<string,unknown>).ultimo = r })}>normal</button>
    </div>
  );
}
createRoot(document.getElementById("r")!).render(<Demo />);
