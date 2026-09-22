"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";
import type { Viaje } from "@/modulos/traspasos/datos";

/* =====================================================================
   DEPURAR — la barra de abajo cuando quien administra marca viajes.

   Tres cosas y una sola barra: ANULAR (queda a la vista con su motivo),
   NO SE FACTURA (igual, pero el motivo dice por qué no lleva documento)
   y ELIMINAR (se borra de verdad y queda escrito en Administración ›
   Inicio). Siempre con motivo; eliminar pregunta otra vez. El candado de
   verdad está en la base: traspaso_depurar solo responde a manda().
   ===================================================================== */
type Accion = "anular" | "sin_factura" | "eliminar";
const ACCIONES: { k: Accion; rot: string; dice: string }[] = [
  { k: "anular", rot: "Anular", dice: "Queda a la vista como anulado, con el motivo. Sale de la bandeja y del cumplido. Si ya estaba facturado, se le quita la salida y el documento queda en su rastro." },
  { k: "sin_factura", rot: "No se factura", dice: "Se anula con «No se factura: …». Para viajes que no llevan documento." },
  { k: "eliminar", rot: "Eliminar", dice: "Se borra de verdad, con sus tipos. Queda escrito quién, cuándo y por qué." },
];

export function Depurar({ ids, viajes, limpiar, listo, fallo }: {
  ids: string[]; viajes: Viaje[]; limpiar: () => void; listo: (m: string) => void; fallo: (m: string) => void;
}) {
  const router = useRouter();
  const [pedir, dialogo] = useConfirmar();
  const [accion, setAccion] = useState<Accion>("anular");
  const [motivo, setMotivo] = useState("");
  const [mandando, setMandando] = useState(false);
  const n = ids.length;
  const a = ACCIONES.find((x) => x.k === accion)!;

  async function hacer() {
    if (motivo.trim().length < 5 || mandando) return;
    if (accion === "eliminar" && !(await pedir({
      titulo: `¿Eliminar ${n} viaje${n === 1 ? "" : "s"}?`,
      dice: <>Se borra{n === 1 ? "" : "n"} de verdad: {viajes.slice(0, 6).map((v) => v.codigo ?? v.placa).join(", ")}{n > 6 ? "…" : ""}. No se puede deshacer.</>,
      confirmar: "Eliminar", peligro: true,
    }))) return;
    setMandando(true);
    const { data, error } = await createClient().rpc("traspaso_depurar", { p_ids: ids, p_accion: accion, p_motivo: motivo.trim() });
    setMandando(false);
    if (error) {
      fallo(/could not find the function|schema cache/i.test(error.message)
        ? "Falta correr 2026-09-traspasos-depurar.sql en Supabase." : error.message);
      return;
    }
    const k = Number(data ?? n);
    listo(`${k} viaje${k === 1 ? "" : "s"} ${accion === "eliminar" ? "eliminado" : "anulado"}${k === 1 ? "" : "s"}.`);
    setMotivo(""); limpiar(); router.refresh();
  }

  return (
    <div className="fc-dep" role="region" aria-label="Depurar viajes seleccionados">
      {dialogo}
      <div className="fc-dep-in">
        <p className="fc-dep-n"><b>{n}</b> seleccionado{n === 1 ? "" : "s"}</p>
        <div className="fc-dep-seg" role="radiogroup" aria-label="Qué hacer">
          {ACCIONES.map((x) => (
            <button key={x.k} type="button" role="radio" aria-checked={accion === x.k}
                    className={(accion === x.k ? "on" : "") + (x.k === "eliminar" ? " peligro" : "")}
                    onClick={() => setAccion(x.k)}>{x.rot}</button>
          ))}
        </div>
        <input className="fc-dep-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200}
               placeholder="Motivo (obligatorio): duplicado, prueba, viaje interno…" aria-label="Motivo" />
        <div className="fc-dep-bot">
          <button type="button" className="btn" onClick={limpiar}>Quitar selección</button>
          <button type="button" className={"btn si" + (accion === "eliminar" ? " peligro" : "")}
                  disabled={motivo.trim().length < 5 || mandando} onClick={hacer}>
            {mandando ? "Haciendo…" : `${a.rot} ${n}`}
          </button>
        </div>
        <p className="fc-dep-dice">{a.dice}</p>
      </div>
    </div>
  );
}
