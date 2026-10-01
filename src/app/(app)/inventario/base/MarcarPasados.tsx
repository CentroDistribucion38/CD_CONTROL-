"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { Renglon } from "@/modulos/inventario/fefo";

/* ===================================================================
   MARCAR RENGLONES COMO «PASADOS» AL SISTEMA OFICIAL.

   La base es lo contado; el sistema oficial es donde hay que dejarlo. Alguien
   lo digita a mano y aquí se deja constancia, renglón por renglón, de lo que
   YA se pasó: la columna «Estado» dice PASADO o POR PASAR.

   NO PIDE CONFIRMAR, a diferencia de eliminar: es reversible con un toque
   («Volver a POR PASAR») y no toca el dato contado. Pedir confirmación en una
   acción que se repite cien veces al día es enseñar a apretar «Sí» sin leer.

   TODO O NADA. Va en una sola llamada; si alguno no se puede marcar la base
   rechaza todos y se dice, para que nadie crea que pasó la mitad.
   =================================================================== */
export function MarcarPasados({ elegidos, pasados, alCambiar }: {
  /** Los renglones marcados con la casilla que se ven ahora. */
  elegidos: Renglon[];
  pasados: ReadonlySet<string>;
  /** Se llama cuando la base ya cambió (para limpiar las casillas). */
  alCambiar: () => void;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const porPasar = elegidos.filter((r) => !pasados.has(r.id));
  const yaPasados = elegidos.filter((r) => pasados.has(r.id));

  async function cambiar(filas: Renglon[], pasado: boolean) {
    if (filas.length === 0) return;
    setMal(null); setAviso(null); setOcupado(true);
    const { error } = await createClient().rpc("conteo_fefo_marcar_pasado",
      { p_lineas: filas.map((r) => r.id), p_pasado: pasado });
    setOcupado(false);
    if (error) { setMal(`No se cambió ningún renglón: ${traducirError(error.message)}`); return }
    const n = filas.length;
    setAviso(pasado
      ? `${n === 1 ? "1 renglón quedó" : `${n} renglones quedaron`} como PASADO.`
      : `${n === 1 ? "1 renglón volvió" : `${n} renglones volvieron`} a POR PASAR.`);
    alCambiar();
    router.refresh();
  }

  return (
    <div className="ba-pasar" role="group" aria-label="Marcar renglones como pasados al sistema oficial">
      <span className="ba-pasar-cuenta" aria-live="polite">
        {elegidos.length === 0
          ? "Marca renglones con la casilla para dejarlos como PASADO al sistema oficial."
          : `${elegidos.length} ${elegidos.length === 1 ? "renglón marcado" : "renglones marcados"}`}
      </span>
      <button type="button" className="btn" disabled={ocupado || porPasar.length === 0}
              onClick={() => cambiar(porPasar, true)}>
        {ocupado ? "Guardando…" : porPasar.length ? `Marcar ${porPasar.length} como PASADO` : "Marcar como PASADO"}
      </button>
      <button type="button" className="btn plano" disabled={ocupado || yaPasados.length === 0}
              onClick={() => cambiar(yaPasados, false)}>
        {yaPasados.length ? `Volver ${yaPasados.length} a POR PASAR` : "Volver a POR PASAR"}
      </button>
      {aviso && <p className="ba-elim-ok" role="status">{aviso}</p>}
      {mal && <p className="ba-conso-mal" role="alert">{mal}</p>}
    </div>
  );
}
